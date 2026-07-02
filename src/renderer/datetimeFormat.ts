/**
 * Display-only datetime formatting. Values are reformatted by string
 * manipulation, never by Date arithmetic, so timezones are never shifted —
 * important for forensic accuracy. The raw value is always available via the
 * field detail panel and cell copy.
 */

export type DatetimeMode = 'iso-seconds' | 'iso-subseconds' | 'original'

let currentMode: DatetimeMode = 'iso-seconds'

export function setDatetimeMode(mode: DatetimeMode): void {
  currentMode = mode
}

export function getDatetimeMode(): DatetimeMode {
  return currentMode
}

const DATETIME_HEADER_EXACT = new Set(['datetime', 'date', 'time', 'timestamp'])
const DATETIME_HEADER_SUFFIX = /(^|[ _])(date|time|timestamp)$/

export function isDatetimeHeader(header: string): boolean {
  const lowered = header.trim().toLowerCase()
  return DATETIME_HEADER_EXACT.has(lowered) || DATETIME_HEADER_SUFFIX.test(lowered)
}

// ISO-ish: 2023-03-15T00:00:20.123456789+00:00 / 2023-03-15 00:00:20Z / ...
const ISO_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/

// mactime: Wed Mar 15 2023 00:00:20
const MACTIME_PATTERN = /^\w{3} (\w{3}) {1,2}(\d{1,2}) (\d{4}) (\d{2}:\d{2}:\d{2})$/

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
}

function formatIsoParts(
  date: string,
  time: string,
  fraction: string | undefined,
  zone: string | undefined,
  mode: DatetimeMode
): string {
  if (mode === 'iso-seconds') {
    return `${date}T${time}`
  }
  // iso-subseconds: keep fractional digits padded to nanoseconds, keep zone.
  const digits = (fraction ?? '.').slice(1)
  const nanos = digits.padEnd(9, '0').slice(0, 9)
  return `${date}T${time}.${nanos}${zone ?? ''}`
}

export function formatDatetimeValue(raw: string, mode: DatetimeMode = currentMode): string {
  if (mode === 'original') {
    return raw
  }

  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return raw
  }

  const iso = ISO_PATTERN.exec(trimmed)
  if (iso) {
    return formatIsoParts(iso[1], iso[2], iso[3], iso[4], mode)
  }

  const mactime = MACTIME_PATTERN.exec(trimmed)
  if (mactime) {
    const month = MONTHS[mactime[1].toLowerCase()]
    if (month) {
      const day = mactime[2].padStart(2, '0')
      return formatIsoParts(`${mactime[3]}-${month}-${day}`, mactime[4], undefined, undefined, mode)
    }
  }

  return raw
}

export function getDatetimeFormatter(): (raw: string) => string {
  return (raw) => formatDatetimeValue(raw)
}
