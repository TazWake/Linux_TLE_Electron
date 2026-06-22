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
import { debugLog, errorLog } from './debugLog'
import { safeIpcHandle } from './safeIpc'

function offsetsFromStrings(offsetStrings: string[] | undefined): BigInt64Array {
  if (!offsetStrings) {
    throw new Error('Indexer returned no line offset data.')
  }

  const offsets = new BigInt64Array(offsetStrings.length)
  for (let index = 0; index < offsetStrings.length; index++) {
    const value = offsetStrings[index]
    if (value === undefined) {
      throw new Error(`Indexer returned an invalid offset at index ${index}.`)
    }
    offsets[index] = BigInt(value)
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
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
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
  debugLog('index', `starting worker for ${filePath}`, { fileId, worker: fileIndexerPath })

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
          offsets?: string[]
          offsetsBuffer?: ArrayBuffer
          rowCount: number
        }

        let offsets: BigInt64Array
        if (complete.offsets) {
          offsets = offsetsFromStrings(complete.offsets)
        } else if (complete.offsetsBuffer) {
          offsets = new BigInt64Array(complete.offsetsBuffer)
        } else {
          reject(new Error('Indexer returned no line offset data.'))
          return
        }

        resolve({ offsets, rowCount: complete.rowCount })
        debugLog('index', `complete ${fileId}`, { rowCount: complete.rowCount })
      } else if (message.type === 'error') {
        settled = true
        reject(new Error((message as { message: string }).message))
      }
    })

    worker.on('error', (error) => {
      settled = true
      errorLog('index', `worker error for ${fileId}`, error)
      reject(error)
    })
    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        errorLog('index', `worker exited with code ${code} for ${fileId}`)
        reject(new Error(`Indexer worker exited with code ${code}`))
      }
    })
  })
}

function beginOpenFile(
  filePath: string,
  mainWindow: BrowserWindow
): FileMetadata {
  debugLog('open', `begin ${filePath}`)

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
  debugLog('open', `detected format ${format}`, { fileName, columns: headers.length })

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
      debugLog('open', `indexed ${fileName}`, { fileId, rowCount })
      mainWindow.webContents.send('file:index-complete', { fileId, rowCount })
    })
    .catch((error) => {
      errorLog('open', `index failed for ${fileName}`, error)
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
        termLower,
        columnCount: session.headers.length
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
  debugLog('startup', 'registering IPC handlers', {
    fileIndexerPath,
    searchWorkerPath,
    debug: process.env.ETV_DEBUG ?? 'auto'
  })

  ipcMain.on('app:confirm-close', () => {
    closeAllSessions()
    confirmClose()
  })

  safeIpcHandle('file:open', null, async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      errorLog('open', 'file:open called with no main window')
      return null
    }

    return pickAndOpenFile(mainWindow)
  })

  safeIpcHandle('file:open-path', null, async (_event, filePath: unknown) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      errorLog('open', 'file:open-path called with no main window')
      return null
    }

    if (typeof filePath !== 'string' || filePath.length === 0) {
      errorLog('open', 'file:open-path received invalid path', filePath)
      return null
    }

    try {
      return beginOpenFile(filePath, mainWindow)
    } catch (error) {
      errorLog('open', `file:open-path failed for ${filePath}`, error)
      dialog.showErrorBox(
        'Unable to Open File',
        error instanceof Error ? error.message : String(error)
      )
      return null
    }
  })

  safeIpcHandle('file:get-rows', [], async (_event, range: unknown) => {
    if (!range || typeof range !== 'object') {
      errorLog('rows', 'file:get-rows received invalid range', range)
      return []
    }

    const rowRange = range as RowRange
    const session = getSession(rowRange.fileId)
    if (!session) {
      errorLog('rows', `no session for fileId ${rowRange.fileId}`)
      return []
    }

    if (session.rowCount === 0 || session.offsets.length === 0) {
      debugLog('rows', `session not ready ${rowRange.fileId}`, {
        start: rowRange.startRow,
        end: rowRange.endRow,
        rowCount: session.rowCount
      })
      return []
    }

    return readRows(session, rowRange.startRow, rowRange.endRow, rowRange.rowIndexMap)
  })

  safeIpcHandle('file:search', { matchingRowIndices: [] }, async (_event, request: unknown) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      errorLog('search', 'file:search called with no main window')
      return { matchingRowIndices: [] }
    }

    if (!request || typeof request !== 'object') {
      errorLog('search', 'file:search received invalid request', request)
      return { matchingRowIndices: [] }
    }

    const searchRequest = request as SearchRequest
    if (!searchRequest.term.trim()) {
      return { matchingRowIndices: [] }
    }

    return runSearch(searchRequest, mainWindow)
  })

  safeIpcHandle('file:tag-update', undefined, async (_event, update: unknown) => {
    if (!update || typeof update !== 'object') {
      errorLog('tags', 'file:tag-update received invalid payload', update)
      return
    }

    const tagUpdate = update as TagUpdate
    const session = getSession(tagUpdate.fileId)
    if (!session) {
      errorLog('tags', `no session for fileId ${tagUpdate.fileId}`)
      return
    }

    if (tagUpdate.tagged) {
      session.taggedRows.add(tagUpdate.rowIndex)
    } else {
      session.taggedRows.delete(tagUpdate.rowIndex)
    }
    session.tagsDirty = true
  })

  safeIpcHandle('file:save-tags', false, async (_event, request: unknown) => {
    if (!request || typeof request !== 'object') {
      errorLog('tags', 'file:save-tags received invalid request', request)
      return false
    }

    const saveRequest = request as SaveTagsRequest
    const session = getSession(saveRequest.fileId)
    if (!session) {
      errorLog('tags', `no session for fileId ${saveRequest.fileId}`)
      return false
    }

    try {
      saveTags(session.filePath, session.fileName, session.taggedRows)
      session.tagsDirty = false
      return true
    } catch (error) {
      errorLog('tags', 'save tags failed', error)
      dialog.showErrorBox(
        'Unable to Save Tags',
        error instanceof Error ? error.message : String(error)
      )
      return false
    }
  })

  safeIpcHandle('file:close', undefined, async (_event, fileId: unknown) => {
    if (typeof fileId !== 'string') {
      return
    }

    const session = deleteSession(fileId)
    if (session) {
      try {
        fs.closeSync(session.fd)
      } catch (error) {
        errorLog('close', `failed to close fd for ${fileId}`, error)
      }
    }
  })
}
