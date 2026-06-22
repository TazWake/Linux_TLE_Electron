/* SPDX-License-Identifier: GPL-3.0-or-later */

function formatError(detail: unknown): string {
  if (detail instanceof Error) {
    return detail.stack ?? detail.message
  }
  return String(detail)
}

/**
 * Forward renderer errors to the terminal via preload so Linux freezes are diagnosable.
 */
export function installRendererDebugHandlers(): void {
  window.addEventListener('error', (event) => {
    const detail = event.error ?? event.message
    console.error('[ETV renderer] uncaught error:', formatError(detail))
    window.api?.reportRendererError('error', formatError(detail))
  })

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[ETV renderer] unhandled rejection:', formatError(event.reason))
    window.api?.reportRendererError('rejection', formatError(event.reason))
  })
}

export function logRenderer(scope: string, message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.log(`[ETV renderer] ${scope}: ${message}`)
    return
  }
  console.log(`[ETV renderer] ${scope}: ${message}`, detail)
}

export function logRendererError(scope: string, message: string, detail?: unknown): void {
  const text = detail === undefined ? message : `${message}: ${formatError(detail)}`
  console.error(`[ETV renderer] ${scope}: ${text}`)
  window.api?.reportRendererError(scope, text)
}
