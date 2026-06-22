import { Worker } from 'worker_threads'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { dialog, ipcMain, type BrowserWindow } from 'electron'
import fileIndexerPath from './fileIndexer?modulePath'
import searchWorkerPath from './searchWorker?modulePath'
import { MAX_FILE_BYTES } from '../shared/constants'
import { detectFormat, parseHeaders } from '../shared/formatDetection'
import type {
  FileMetadata,
  RowRange,
  RowData,
  SearchRequest,
  SearchResult,
  TagUpdate,
  SaveTagsRequest,
  IndexProgressEvent
} from '../shared/types'
import { closeAllSessions, deleteSession, getSession, setSession } from './fileSession'
import { readRows } from './fileReader'
import { loadTags, saveTags } from './tagStore'

function offsetsFromStrings(offsetStrings: string[]): BigInt64Array {
  const offsets = new BigInt64Array(offsetStrings.length)
  for (let index = 0; index < offsetStrings.length; index++) {
    offsets[index] = BigInt(offsetStrings[index])
  }
  return offsets
}

function sendProgress(mainWindow: BrowserWindow, event: IndexProgressEvent): void {
  mainWindow.webContents.send('file:index-progress', event)
}

function readFirstLine(filePath: string): string {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(65536)
    const { bytesRead } = fs.readSync(fd, buffer, 0, buffer.length, 0)
    const text = buffer.subarray(0, bytesRead).toString('utf8')
    const newlineIndex = text.indexOf('\n')
    if (newlineIndex < 0) {
      return text.replace(/\r$/, '')
    }
    return text.slice(0, newlineIndex)
  } finally {
    fs.closeSync(fd)
  }
}

async function indexFile(
  filePath: string,
  fileId: string,
  mainWindow: BrowserWindow
): Promise<{ offsets: BigInt64Array; rowCount: number }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const worker = new Worker(fileIndexerPath, {
      workerData: { filePath, fileId }
    })

    worker.on('message', (message: { type: string }) => {
      if (message.type === 'progress') {
        const progress = message as { fileId: string; linesIndexed: number }
        sendProgress(mainWindow, {
          fileId: progress.fileId,
          linesIndexed: progress.linesIndexed,
          phase: 'indexing'
        })
      } else if (message.type === 'complete') {
        settled = true
        const complete = message as {
          offsets: string[]
          rowCount: number
        }
        resolve({
          offsets: offsetsFromStrings(complete.offsets),
          rowCount: complete.rowCount
        })
      } else if (message.type === 'error') {
        settled = true
        reject(new Error((message as { message: string }).message))
      }
    })

    worker.on('error', (error) => {
      settled = true
      reject(error)
    })
    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`Indexer worker exited with code ${code}`))
      }
    })
  })
}

function beginOpenFile(
  filePath: string,
  mainWindow: BrowserWindow
): FileMetadata {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const stats = fs.statSync(filePath)
  if (stats.size > MAX_FILE_BYTES) {
    throw new Error(
      'File exceeds the 2 GB limit. Open a smaller file or split the timeline.'
    )
  }

  const headerLine = readFirstLine(filePath)
  const format = detectFormat(headerLine)
  if (!format) {
    throw new Error(
      'Unsupported timeline format. The header row must match a known Filesystem or Super timeline CSV layout.'
    )
  }

  const headers = parseHeaders(headerLine)
  const fileId = randomUUID()
  const fileName = path.basename(filePath)
  const taggedRows = loadTags(filePath, fileName)
  const fd = fs.openSync(filePath, 'r')

  setSession({
    fileId,
    filePath,
    fileName,
    format,
    headers,
    offsets: new BigInt64Array(0),
    rowCount: 0,
    taggedRows,
    tagsDirty: false,
    fd
  })

  void indexFile(filePath, fileId, mainWindow)
    .then(({ offsets, rowCount }) => {
      const session = getSession(fileId)
      if (!session) {
        return
      }
      session.offsets = offsets
      session.rowCount = rowCount
      mainWindow.webContents.send('file:index-complete', { fileId, rowCount })
    })
    .catch((error) => {
      deleteSession(fileId)
      try {
        fs.closeSync(fd)
      } catch {
        // ignore close errors during failed open
      }
      dialog.showErrorBox(
        'Unable to Index File',
        error instanceof Error ? error.message : String(error)
      )
      mainWindow.webContents.send('file:index-failed', { fileId })
    })

  return {
    fileId,
    filePath,
    fileName,
    format,
    headers,
    rowCount: 0,
    indexing: true
  }
}

async function runSearch(
  request: SearchRequest,
  mainWindow: BrowserWindow
): Promise<SearchResult> {
  const session = getSession(request.fileId)
  if (!session) {
    throw new Error('File session not found')
  }

  const termLower = request.term.toLowerCase()
  let columnIndex = -1
  if (request.column !== 'All Columns') {
    columnIndex = session.headers.indexOf(request.column)
    if (columnIndex < 0) {
      throw new Error(`Unknown column: ${request.column}`)
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const offsetStrings = Array.from(session.offsets, (offset) => offset.toString())
    const worker = new Worker(searchWorkerPath, {
      workerData: {
        filePath: session.filePath,
        fileId: session.fileId,
        offsets: offsetStrings,
        rowCount: session.rowCount,
        columnIndex,
        termLower
      }
    })

    worker.on('message', (message: { type: string }) => {
      if (message.type === 'progress') {
        const progress = message as { fileId: string; linesIndexed: number }
        sendProgress(mainWindow, {
          fileId: progress.fileId,
          linesIndexed: progress.linesIndexed,
          phase: 'searching'
        })
      } else if (message.type === 'complete') {
        settled = true
        resolve({
          matchingRowIndices: (message as { matchingRowIndices: number[] })
            .matchingRowIndices
        })
      } else if (message.type === 'error') {
        settled = true
        reject(new Error((message as { message: string }).message))
      }
    })

    worker.on('error', (error) => {
      settled = true
      reject(error)
    })
    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`Search worker exited with code ${code}`))
      }
    })
  })
}

export async function pickAndOpenFile(
  mainWindow: BrowserWindow
): Promise<FileMetadata | null> {
  mainWindow.focus()

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Timeline CSV',
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  try {
    return beginOpenFile(result.filePaths[0], mainWindow)
  } catch (error) {
    dialog.showErrorBox(
      'Unable to Open File',
      error instanceof Error ? error.message : String(error)
    )
    return null
  }
}

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  confirmClose: () => void
): void {
  ipcMain.on('app:confirm-close', () => {
    closeAllSessions()
    confirmClose()
  })

  ipcMain.handle('file:open', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      return null
    }

    return pickAndOpenFile(mainWindow)
  })

  ipcMain.handle('file:open-path', async (_event, filePath: string) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      throw new Error('Main window is not available')
    }

    try {
      return beginOpenFile(filePath, mainWindow)
    } catch (error) {
      dialog.showErrorBox(
        'Unable to Open File',
        error instanceof Error ? error.message : String(error)
      )
      return null
    }
  })

  ipcMain.handle('file:get-rows', async (_event, range: RowRange): Promise<RowData[]> => {
    const session = getSession(range.fileId)
    if (!session) {
      throw new Error('File session not found')
    }

    return readRows(session, range.startRow, range.endRow, range.rowIndexMap)
  })

  ipcMain.handle('file:search', async (_event, request: SearchRequest) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      throw new Error('Main window is not available')
    }

    if (!request.term.trim()) {
      return { matchingRowIndices: [] } satisfies SearchResult
    }

    return runSearch(request, mainWindow)
  })

  ipcMain.handle('file:tag-update', async (_event, update: TagUpdate) => {
    const session = getSession(update.fileId)
    if (!session) {
      throw new Error('File session not found')
    }

    if (update.tagged) {
      session.taggedRows.add(update.rowIndex)
    } else {
      session.taggedRows.delete(update.rowIndex)
    }
    session.tagsDirty = true
  })

  ipcMain.handle('file:save-tags', async (_event, request: SaveTagsRequest) => {
    const session = getSession(request.fileId)
    if (!session) {
      throw new Error('File session not found')
    }

    try {
      saveTags(session.filePath, session.fileName, session.taggedRows)
      session.tagsDirty = false
      return true
    } catch (error) {
      dialog.showErrorBox(
        'Unable to Save Tags',
        error instanceof Error ? error.message : String(error)
      )
      return false
    }
  })

  ipcMain.handle('file:close', async (_event, fileId: string) => {
    const session = deleteSession(fileId)
    if (session) {
      fs.closeSync(session.fd)
    }
  })

}
