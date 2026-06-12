import { FILESYSTEM_HEADER, SUPER_HEADER } from './constants'
import type { TimelineFormat } from './types'
import { normalizeHeaderLine, parseCsvLine } from './csv'

export function detectFormat(headerLine: string): TimelineFormat | null {
  const normalized = normalizeHeaderLine(headerLine)

  if (normalized === FILESYSTEM_HEADER) {
    return 'filesystem'
  }

  if (normalized === SUPER_HEADER) {
    return 'super'
  }

  return null
}

export function parseHeaders(headerLine: string): string[] {
  return parseCsvLine(normalizeHeaderLine(headerLine))
}
