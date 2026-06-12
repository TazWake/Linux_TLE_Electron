import { parentPort, workerData } from 'worker_threads'
import fs from 'fs'
import { INDEX_PROGRESS_INTERVAL, MAX_ROW_COUNT } from '../shared/constants'

interface IndexerInput {
  filePath: string
  fileId: string
}

interface IndexerComplete {
  type: 'complete'
  offsetsBuffer: ArrayBuffer
  rowCount: number
}

interface IndexerProgress {
  type: 'progress'
  fileId: string
  linesIndexed: number
}

interface IndexerError {
  type: 'error'
  message: string
}

const { filePath, fileId } = workerData as IndexerInput

function runIndexer(): void {
  const fd = fs.openSync(filePath, 'r')
  try {
    const stats = fs.fstatSync(fd)
    const fileSize = stats.size
    const chunkSize = 1024 * 1024
    const buffer = Buffer.alloc(chunkSize)

    const offsets: bigint[] = []
    let position = 0n
    let headerSkipped = false
    let lineCount = 0

    while (position < BigInt(fileSize)) {
      const { bytesRead } = fs.readSync(fd, buffer, 0, chunkSize, Number(position))
      if (bytesRead === 0) {
        break
      }

      let chunkStart = 0
      while (chunkStart < bytesRead) {
        let newlineAt = -1
        for (let i = chunkStart; i < bytesRead; i++) {
          if (buffer[i] === 0x0a) {
            newlineAt = i
            break
          }
        }

        if (newlineAt < 0) {
          break
        }

        const lineStart = position + BigInt(chunkStart)

        if (!headerSkipped) {
          headerSkipped = true
        } else {
          offsets.push(lineStart)
          lineCount++

          if (lineCount > MAX_ROW_COUNT) {
            parentPort?.postMessage({
              type: 'error',
              message: `File exceeds the maximum of ${MAX_ROW_COUNT.toLocaleString()} data rows.`
            } satisfies IndexerError)
            return
          }

          if (lineCount % INDEX_PROGRESS_INTERVAL === 0) {
            parentPort?.postMessage({
              type: 'progress',
              fileId,
              linesIndexed: lineCount
            } satisfies IndexerProgress)
          }
        }

        chunkStart = newlineAt + 1
      }

      if (chunkStart < bytesRead) {
        position += BigInt(chunkStart)
      } else {
        position += BigInt(bytesRead)
      }
    }

    if (headerSkipped && chunkSize > 0) {
      const tailStart = position
      if (tailStart < BigInt(fileSize)) {
        const tailLength = Number(BigInt(fileSize) - tailStart)
        if (tailLength > 0) {
          const tail = Buffer.alloc(tailLength)
          fs.readSync(fd, tail, 0, tailLength, Number(tailStart))
          const tailText = tail.toString('utf8').trimEnd()
          if (tailText.length > 0 && !tailText.includes('\n')) {
            offsets.push(tailStart)
            lineCount++
          }
        }
      }
    }

    const offsetArray = new BigInt64Array(offsets.length)
    for (let i = 0; i < offsets.length; i++) {
      offsetArray[i] = offsets[i]
    }

    parentPort?.postMessage(
      {
        type: 'complete',
        offsetsBuffer: offsetArray.buffer,
        rowCount: lineCount
      } satisfies IndexerComplete,
      [offsetArray.buffer]
    )
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    } satisfies IndexerError)
  } finally {
    fs.closeSync(fd)
  }
}

runIndexer()
