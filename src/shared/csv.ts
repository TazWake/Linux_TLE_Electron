import { parse } from 'csv-parse/sync'

/**
 * Split a malformed CSV row around a single free-text column (e.g. the
 * Plaso `message` field, which may contain unescaped quotes and commas).
 * Columns before the flexible one are taken from the start of the line and
 * columns after it from the end; whatever is left is the flexible field.
 */
function parseLineAroundFlexColumn(
  line: string,
  columnCount: number,
  flexIndex: number
): string[] {
  let remainder = line.replace(/\r$/, '')
  const tailCount = columnCount - flexIndex - 1
  const headCount = flexIndex

  const tailFields: string[] = []
  for (let index = 0; index < tailCount; index++) {
    const commaAt = remainder.lastIndexOf(',')
    if (commaAt < 0) {
      break
    }
    tailFields.unshift(remainder.slice(commaAt + 1))
    remainder = remainder.slice(0, commaAt)
  }

  const headFields: string[] = []
  for (let index = 0; index < headCount; index++) {
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
 * Last-resort split when a row misparses and no flexible column is known:
 * naive comma split, overflow merged into the final column, short rows padded.
 */
function parseLineNaive(line: string, columnCount: number): string[] {
  const parts = line.replace(/\r$/, '').split(',')
  if (parts.length > columnCount) {
    const merged = parts.slice(columnCount - 1).join(',')
    return [...parts.slice(0, columnCount - 1), merged]
  }
  while (parts.length < columnCount) {
    parts.push('')
  }
  return parts
}

/**
 * Parse a single CSV record line.
 * relax_quotes allows rows where a free-text field contains XML attribute
 * quotes without RFC 4180 field quoting (e.g. Sysmon events in Plaso output).
 * When `expectedColumnCount` is provided and the parsed field count differs,
 * a fallback split is applied so a bad row degrades instead of failing.
 */
export function parseCsvLine(
  line: string,
  expectedColumnCount?: number,
  flexIndex?: number
): string[] {
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
    if (expectedColumnCount && fields.length !== expectedColumnCount) {
      if (fields.length < expectedColumnCount) {
        // Parse succeeded but the row is short — pad rather than re-split.
        return [...fields, ...Array(expectedColumnCount - fields.length).fill('')]
      }
      if (flexIndex !== undefined && flexIndex < expectedColumnCount) {
        return parseLineAroundFlexColumn(trimmed, expectedColumnCount, flexIndex)
      }
      // Too many fields, no flexible column known: merge overflow into last.
      const merged = fields.slice(expectedColumnCount - 1).join(',')
      return [...fields.slice(0, expectedColumnCount - 1), merged]
    }
    return fields
  } catch (error) {
    if (expectedColumnCount) {
      if (flexIndex !== undefined && flexIndex < expectedColumnCount) {
        return parseLineAroundFlexColumn(trimmed, expectedColumnCount, flexIndex)
      }
      return parseLineNaive(trimmed, expectedColumnCount)
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
