import fs from 'fs'
import { parseCsvLine } from '../shared/csv'
import { errorLog } from './debugLog'
import type { RowData } from '../shared/types'
import type { FileSession } from './fileSession'

function readLineAtOffset(fd: number, offset: bigint | undefined): string {
  if (offset === undefined) {
    return ''
  }

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

export function readRows(
  session: FileSession,
  startRow: number,
  endRow: number,
  rowIndexMap?: number[]
): RowData[] {
  const rows: RowData[] = []
  const exclusiveEnd = Math.min(endRow, rowIndexMap ? rowIndexMap.length : session.rowCount)
  const expectedColumnCount = session.headers.length

  for (let virtualRow = startRow; virtualRow < exclusiveEnd; virtualRow++) {
    const dataRowIndex = rowIndexMap ? rowIndexMap[virtualRow] : virtualRow
    if (dataRowIndex < 0 || dataRowIndex >= session.rowCount) {
      continue
    }

    const offset = session.offsets[dataRowIndex]
    if (offset === undefined) {
      errorLog('readRows', `missing offset for row ${dataRowIndex}`)
      continue
    }

    try {
      const line = readLineAtOffset(session.fd, offset)
      const cells = parseCsvLine(line, expectedColumnCount)

      rows.push({
        rowIndex: dataRowIndex,
        cells,
        tagged: session.taggedRows.has(dataRowIndex)
      })
    } catch (error) {
      errorLog('readRows', `failed to parse row ${dataRowIndex}`, error)
    }
  }

  return rows
}
