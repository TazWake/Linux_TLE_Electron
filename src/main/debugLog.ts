const PREFIX = '[ETV]'

export function isDebugEnabled(): boolean {
  if (process.env.ETV_DEBUG === '0') {
    return false
  }
  if (process.env.ETV_DEBUG === '1') {
    return true
  }
  return Boolean(process.env.ELECTRON_RENDERER_URL)
}

function formatDetail(detail: unknown): string {
  if (detail instanceof Error) {
    return detail.stack ?? detail.message
  }
  if (typeof detail === 'string') {
    return detail
  }
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

export function debugLog(scope: string, message: string, detail?: unknown): void {
  if (!isDebugEnabled() && detail === undefined) {
    return
  }
  if (detail === undefined) {
    console.log(`${PREFIX} ${scope}: ${message}`)
    return
  }
  console.log(`${PREFIX} ${scope}: ${message}`, formatDetail(detail))
}

export function errorLog(scope: string, message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.error(`${PREFIX} ${scope}: ${message}`)
    return
  }
  console.error(`${PREFIX} ${scope}: ${message}`, formatDetail(detail))
}
