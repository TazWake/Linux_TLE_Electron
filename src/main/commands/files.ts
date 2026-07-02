import { Worker } from 'worker_threads'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import fileIndexerPath from '../fileIndexer?modulePath'
import { MAX_FILE_BYTES } from '../../shared/constants'
import { detectFormat, parseHeaders } from '../../shared/formatDetection'
import type { FileMetadata, RowRange, RowData, IndexProgressEvent } from '../../shared/types'
import {
  deleteSession,
  getAllSessions,
  getSession,
  setSession
} from '../fileSession'
import { readRows } from '../fileReader'
import { loadTags } from '../tagStore'
import { debugLog, errorLog } from '../debugLog'
import { emitEvent, showErrorBox } from './context'

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

function sendProgress(event: IndexProgressEvent): void {
  emitEvent('file:index-progress', event)
}

type IndexerWorkerMessage =
  | { type: 'progress'; fileId: string; linesIndexed: number }
  | { type: 'complete'; offsets?: string[]; offsetsBuffer?: ArrayBuffer; rowCount: number }
  | { type: 'error'; message: string }

async function indexFile(
  filePath: string,
  fileId: string
): Promise<{ offsets: BigInt64Array; rowCount: number }> {
  debugLog('index', `starting worker for ${filePath}`, { fileId, worker: fileIndexerPath })

  return new Promise((resolve, reject) => {
    let settled = false
    const worker = new Worker(fileIndexerPath, {
      workerData: { filePath, fileId }
    })

    worker.on('message', (message: IndexerWorkerMessage) => {
      if (message.type === 'progress') {
        sendProgress({
          fileId: message.fileId,
          linesIndexed: message.linesIndexed,
          phase: 'indexing'
        })
      } else if (message.type === 'complete') {
        settled = true

        let offsets: BigInt64Array
        if (message.offsets) {
          offsets = offsetsFromStrings(message.offsets)
        } else if (message.offsetsBuffer) {
          offsets = new BigInt64Array(message.offsetsBuffer)
        } else {
          reject(new Error('Indexer returned no line offset data.'))
          return
        }

        resolve({ offsets, rowCount: message.rowCount })
        debugLog('index', `complete ${fileId}`, { rowCount: message.rowCount })
      } else if (message.type === 'error') {
        settled = true
        reject(new Error(message.message))
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

/**
 * Open a timeline CSV and start background indexing. Returns metadata
 * immediately (rowCount 0, indexing true); a file:index-complete event fires
 * when the file is ready. Throws on unreadable or unsupported files.
 */
export function openFile(filePath: string): FileMetadata {
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
      'Unsupported file. The first line must be a CSV header row with at least two columns.'
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

  void indexFile(filePath, fileId)
    .then(({ offsets, rowCount }) => {
      const session = getSession(fileId)
      if (!session) {
        return
      }
      session.offsets = offsets
      session.rowCount = rowCount
      debugLog('open', `indexed ${fileName}`, { fileId, rowCount })
      emitEvent('file:index-complete', { fileId, rowCount })
    })
    .catch((error) => {
      errorLog('open', `index failed for ${fileName}`, error)
      deleteSession(fileId)
      try {
        fs.closeSync(fd)
      } catch {
        // ignore close errors during failed open
      }
      showErrorBox(
        'Unable to Index File',
        error instanceof Error ? error.message : String(error)
      )
      emitEvent('file:index-failed', { fileId })
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

export function listFiles(): FileMetadata[] {
  return getAllSessions().map((session) => ({
    fileId: session.fileId,
    filePath: session.filePath,
    fileName: session.fileName,
    format: session.format,
    headers: session.headers,
    rowCount: session.rowCount,
    indexing: session.rowCount === 0 && session.offsets.length === 0
  }))
}

export function getRows(range: RowRange): RowData[] {
  const session = getSession(range.fileId)
  if (!session) {
    errorLog('rows', `no session for fileId ${range.fileId}`)
    return []
  }

  if (session.rowCount === 0 || session.offsets.length === 0) {
    debugLog('rows', `session not ready ${range.fileId}`, {
      start: range.startRow,
      end: range.endRow,
      rowCount: session.rowCount
    })
    return []
  }

  return readRows(session, range.startRow, range.endRow, range.rowIndexMap)
}

export function closeFile(fileId: string): boolean {
  const session = deleteSession(fileId)
  if (!session) {
    return false
  }

  try {
    fs.closeSync(session.fd)
  } catch (error) {
    errorLog('close', `failed to close fd for ${fileId}`, error)
  }
  return true
}
