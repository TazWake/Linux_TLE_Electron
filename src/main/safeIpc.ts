import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { debugLog, errorLog } from './debugLog'

type IpcHandler<T> = (event: IpcMainInvokeEvent, ...args: unknown[]) => T | Promise<T>

/**
 * Register an IPC handler that never throws. Electron shows a broken modal
 * (empty body, Copy/Close only) on Linux when invoke handlers reject.
 */
export function safeIpcHandle<T>(
  channel: string,
  fallback: T,
  handler: IpcHandler<T>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    debugLog('ipc', `→ ${channel}`, args)
    try {
      const result = await handler(event, ...args)
      debugLog('ipc', `← ${channel} ok`)
      return result
    } catch (error) {
      errorLog('ipc', `← ${channel} FAILED`, error)
      return fallback
    }
  })
}
