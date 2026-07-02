import { FILESYSTEM_HEADER, SUPER_CORE_COLUMNS } from './constants'
import type { TimelineFormat } from './types'
import { normalizeHeaderLine, parseCsvLine } from './csv'

/**
 * Classify a CSV by its header row.
 *
 * - `filesystem`: exact mactime bodyfile export header.
 * - `super`: contains all Plaso core columns (order and extra dynamic
 *   columns do not matter — psort output headers are user-configurable).
 * - `generic`: any other parseable CSV header with at least two columns.
 * - `null`: not usable as a table (empty or single-column header).
 */
export function detectFormat(headerLine: string): TimelineFormat | null {
  const normalized = normalizeHeaderLine(headerLine)
  if (normalized.length === 0) {
    return null
  }

  if (normalized === FILESYSTEM_HEADER) {
    return 'filesystem'
  }

  let headers: string[]
  try {
    headers = parseCsvLine(normalized)
  } catch {
    return null
  }

  const lowered = headers.map((header) => header.trim().toLowerCase())
  if (SUPER_CORE_COLUMNS.every((column) => lowered.includes(column))) {
    return 'super'
  }

  const nonEmpty = lowered.filter((header) => header.length > 0)
  if (headers.length >= 2 && nonEmpty.length >= 2) {
    return 'generic'
  }

  return null
}

export function parseHeaders(headerLine: string): string[] {
  return parseCsvLine(normalizeHeaderLine(headerLine))
}

/**
 * Index of the free-text column (message/description) used by the fallback
 * CSV parser when a malformed row has to be split around one flexible field.
 * Returns undefined when the format has no obvious free-text column.
 */
export function flexColumnIndex(headers: string[]): number | undefined {
  const lowered = headers.map((header) => header.trim().toLowerCase())
  for (const candidate of ['message', 'desc', 'description', 'short']) {
    const index = lowered.indexOf(candidate)
    if (index >= 0) {
      return index
    }
  }
  return undefined
}
