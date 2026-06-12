import fs from 'fs'
import { parseCsvLine } from '../shared/csv'
import type { RowData } from '../shared/types'
import type { FileSession } from './fileSession'

function readLineAtOffset(fd: number, offset: bigint): string {
  const buffer = Buffer.alloc(65536)
  let position = offset
  let collected = ''

  while (true) {
    const { bytesRead } = fs.readSync(fd, buffer, 0, buffer.length, Number(position))
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

  for (let virtualRow = startRow; virtualRow < exclusiveEnd; virtualRow++) {
    const dataRowIndex = rowIndexMap ? rowIndexMap[virtualRow] : virtualRow
    if (dataRowIndex < 0 || dataRowIndex >= session.rowCount) {
      continue
    }

    const offset = session.offsets[dataRowIndex]
    const line = readLineAtOffset(session.fd, offset)
    const cells = parseCsvLine(line)

    rows.push({
      rowIndex: dataRowIndex,
      cells,
      tagged: session.taggedRows.has(dataRowIndex)
    })
  }

  return rows
}
