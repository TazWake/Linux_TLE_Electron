/* SPDX-License-Identifier: GPL-3.0-or-later */

function formatError(detail: unknown): string {
  if (detail instanceof Error) {
    return detail.stack ?? detail.message
  }
  if (typeof detail === 'object' && detail !== null) {
    try {
      return JSON.stringify(detail)
    } catch {
      return String(detail)
    }
  }
  return String(detail)
}

function forwardToMain(level: 'log' | 'error', scope: string, message: string): void {
  if (level === 'error') {
    window.api?.reportRendererError(scope, message)
  } else {
    window.api?.reportRendererLog(scope, message)
  }
}

/**
 * Forward renderer errors to the terminal via preload so Linux freezes are diagnosable.
 */
export function installRendererDebugHandlers(): void {
  window.addEventListener('error', (event) => {
    const detail = event.error ?? event.message
    const text = formatError(detail)
    console.error('[ETV renderer] uncaught error:', text)
    forwardToMain('error', 'error', text)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const text = formatError(event.reason)
    console.error('[ETV renderer] unhandled rejection:', text)
    forwardToMain('error', 'rejection', text)
  })
}

export function logRenderer(scope: string, message: string, detail?: unknown): void {
  const text = detail === undefined ? message : `${message} ${formatError(detail)}`
  console.log(`[ETV renderer] ${scope}: ${text}`)
  forwardToMain('log', scope, text)
}

export function logRendererError(scope: string, message: string, detail?: unknown): void {
  const text = detail === undefined ? message : `${message}: ${formatError(detail)}`
  console.error(`[ETV renderer] ${scope}: ${text}`)
  forwardToMain('error', scope, text)
}
