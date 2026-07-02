/**
 * Injection point that keeps the command layer UI-agnostic. The Electron shell
 * wires sendEvent to the renderer's webContents and showError to a dialog; a
 * headless automation host can wire both to logging instead.
 */
export interface CommandContext {
  sendEvent(channel: string, payload: unknown): void
  showError(title: string, message: string): void
}

let context: CommandContext = {
  sendEvent: () => {},
  showError: () => {}
}

export function setCommandContext(next: CommandContext): void {
  context = next
}

export function emitEvent(channel: string, payload: unknown): void {
  context.sendEvent(channel, payload)
}

export function showErrorBox(title: string, message: string): void {
  context.showError(title, message)
}
