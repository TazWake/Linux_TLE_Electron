import { parentPort, workerData } from 'worker_threads'
import fs from 'fs'
import { parseCsvLine } from '../shared/csv'
import { SEARCH_PROGRESS_INTERVAL } from '../shared/constants'

interface SearchInput {
  filePath: string
  fileId: string
  offsets: string[]
  rowCount: number
  columnIndex: number
  termLower: string
  columnCount: number
}

interface SearchProgress {
  type: 'progress'
  fileId: string
  linesIndexed: number
}

interface SearchComplete {
  type: 'complete'
  matchingRowIndices: number[]
}

interface SearchError {
  type: 'error'
  message: string
}

const input = workerData as SearchInput

function readLineAtOffset(fd: number, offset: bigint): string {
  const buffer = Buffer.alloc(65536)
  let position = offset
  let collected = ''

  while (true) {
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, Number(position))
    if (bytesRead === 0) {
      break
    }

    const chunk = buffer.subarray(0, bytesRead).toString('utf8')
    const newlineIndex = chunk.indexOf('\n')

    if (newlineIndex >= 0) {
      collected += chunk.slice(0, newlineIndex)
      break
    }

    collected += chunk
    position += BigInt(bytesRead)

    if (bytesRead < buffer.length) {
      break
    }
  }

  return collected.replace(/\r$/, '')
}

function runSearch(): void {
  const offsets = new BigInt64Array(input.offsets.length)
  for (let index = 0; index < input.offsets.length; index++) {
    offsets[index] = BigInt(input.offsets[index])
  }
  const fd = fs.openSync(input.filePath, 'r')
  const matches: number[] = []

  try {
    for (let rowIndex = 0; rowIndex < input.rowCount; rowIndex++) {
      const line = readLineAtOffset(fd, offsets[rowIndex])
      const cells = parseCsvLine(line, input.columnCount)

      let found = false
      if (input.columnIndex < 0) {
        found = cells.some((cell) => cell.toLowerCase().includes(input.termLower))
      } else if (input.columnIndex < cells.length) {
        found = cells[input.columnIndex].toLowerCase().includes(input.termLower)
      }

      if (found) {
        matches.push(rowIndex)
      }

      if ((rowIndex + 1) % SEARCH_PROGRESS_INTERVAL === 0) {
        parentPort?.postMessage({
          type: 'progress',
          fileId: input.fileId,
          linesIndexed: rowIndex + 1
        } satisfies SearchProgress)
      }
    }

    parentPort?.postMessage({
      type: 'complete',
      matchingRowIndices: matches
    } satisfies SearchComplete)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    } satisfies SearchError)
  } finally {
    fs.closeSync(fd)
  }
}

runSearch()
