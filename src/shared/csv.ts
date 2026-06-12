import { parse } from 'csv-parse/sync'

/**
 * Parse a single CSV record line using RFC 4180 rules.
 */
export function parseCsvLine(line: string): string[] {
  const trimmed = line.replace(/\r$/, '')
  if (trimmed.length === 0) {
    return []
  }

  const records = parse(trimmed, {
    relax_column_count: true,
    skip_empty_lines: false,
    bom: true
  }) as string[][]

  return records[0] ?? []
}

/**
 * Strip UTF-8 BOM and trim for header comparison.
 */
export function normalizeHeaderLine(line: string): string {
  return line.replace(/^\uFEFF/, '').replace(/\r$/, '').trim()
}
