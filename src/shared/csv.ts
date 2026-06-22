import { parse } from 'csv-parse/sync'

const SUPER_DATA_COLUMN_COUNT = 8
const SUPER_FIXED_HEAD_COLUMNS = 4
const SUPER_FIXED_TAIL_COLUMNS = 3

/**
 * Plaso Super rows: fixed columns at start/end, message may contain commas and quotes.
 */
function parseSuperLineFallback(line: string, columnCount: number): string[] {
  let remainder = line.replace(/\r$/, '')
  const tailFields: string[] = []

  for (let index = 0; index < SUPER_FIXED_TAIL_COLUMNS; index++) {
    const commaAt = remainder.lastIndexOf(',')
    if (commaAt < 0) {
      break
    }
    tailFields.unshift(remainder.slice(commaAt + 1))
    remainder = remainder.slice(0, commaAt)
  }

  const headFields: string[] = []
  for (let index = 0; index < SUPER_FIXED_HEAD_COLUMNS; index++) {
    const commaAt = remainder.indexOf(',')
    if (commaAt < 0) {
      headFields.push(remainder)
      remainder = ''
      break
    }
    headFields.push(remainder.slice(0, commaAt))
    remainder = remainder.slice(commaAt + 1)
  }

  const fields = [...headFields, remainder, ...tailFields]
  while (fields.length < columnCount) {
    fields.push('')
  }
  return fields.slice(0, columnCount)
}

/**
 * Parse a single CSV record line.
 * relax_quotes allows Plaso Super rows where the message field contains XML
 * attribute quotes without RFC 4180 field quoting.
 */
export function parseCsvLine(line: string, expectedColumnCount?: number): string[] {
  const trimmed = line.replace(/\r$/, '')
  if (trimmed.length === 0) {
    return []
  }

  try {
    const records = parse(trimmed, {
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
      bom: true
    }) as string[][]

    const fields = records[0] ?? []
    if (
      expectedColumnCount &&
      fields.length !== expectedColumnCount &&
      expectedColumnCount === SUPER_DATA_COLUMN_COUNT
    ) {
      return parseSuperLineFallback(trimmed, expectedColumnCount)
    }
    return fields
  } catch (error) {
    if (expectedColumnCount === SUPER_DATA_COLUMN_COUNT) {
      return parseSuperLineFallback(trimmed, expectedColumnCount)
    }
    throw error
  }
}

/**
 * Strip UTF-8 BOM and trim for header comparison.
 */
export function normalizeHeaderLine(line: string): string {
  return line.replace(/^\uFEFF/, '').replace(/\r$/, '').trim()
}
