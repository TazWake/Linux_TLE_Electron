import { Worker } from 'worker_threads'
import searchWorkerPath from '../searchWorker?modulePath'
import { flexColumnIndex } from '../../shared/formatDetection'
import type { SearchRequest, SearchResult } from '../../shared/types'
import type { FileSearchSummary } from '../../shared/commands'
import { getAllSessions, getSession } from '../fileSession'
import { emitEvent } from './context'

export async function searchFile(request: SearchRequest): Promise<SearchResult> {
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
        columnCount: session.headers.length,
        flexIndex: flexColumnIndex(session.headers)
      }
    })

    worker.on('message', (message: { type: string }) => {
      if (message.type === 'progress') {
        const progress = message as { fileId: string; linesIndexed: number }
        emitEvent('file:index-progress', {
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

/**
 * Search every open file for a term across all columns. Files still indexing
 * are reported with a match count of zero rather than delaying the search.
 */
export async function searchAll(term: string): Promise<FileSearchSummary[]> {
  const summaries: FileSearchSummary[] = []

  for (const session of getAllSessions()) {
    if (session.rowCount === 0 || session.offsets.length === 0) {
      summaries.push({
        fileId: session.fileId,
        fileName: session.fileName,
        matchCount: 0,
        matchingRowIndices: []
      })
      continue
    }

    const result = await searchFile({
      fileId: session.fileId,
      column: 'All Columns',
      term
    })

    summaries.push({
      fileId: session.fileId,
      fileName: session.fileName,
      matchCount: result.matchingRowIndices.length,
      matchingRowIndices: result.matchingRowIndices
    })
  }

  return summaries
}
