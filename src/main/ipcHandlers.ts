import { dialog, ipcMain, type BrowserWindow } from 'electron'
import type { FileMetadata, RowRange, SearchRequest, TagUpdate, SaveTagsRequest } from '../shared/types'
import type { CommandResult } from '../shared/commands'
import { closeAllSessions } from './fileSession'
import { debugLog, errorLog } from './debugLog'
import { safeIpcHandle } from './safeIpc'
import {
  dispatchCommand,
  openFile,
  getRows,
  searchFile,
  searchAll,
  updateTag,
  saveTagsForFile,
  closeFile,
  loadColorRulesXml
} from './commands'

export async function pickAndOpenFile(
  mainWindow: BrowserWindow
): Promise<FileMetadata | null> {
  mainWindow.focus()

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Timeline CSV',
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  try {
    return openFile(result.filePaths[0])
  } catch (error) {
    dialog.showErrorBox(
      'Unable to Open File',
      error instanceof Error ? error.message : String(error)
    )
    return null
  }
}

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  confirmClose: () => void
): void {
  debugLog('startup', 'registering IPC handlers')

  ipcMain.on('app:confirm-close', () => {
    closeAllSessions()
    confirmClose()
  })

  safeIpcHandle('file:open', null, async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      errorLog('open', 'file:open called with no main window')
      return null
    }

    return pickAndOpenFile(mainWindow)
  })

  safeIpcHandle('file:open-path', null, async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      errorLog('open', 'file:open-path received invalid path', filePath)
      return null
    }

    try {
      return openFile(filePath)
    } catch (error) {
      errorLog('open', `file:open-path failed for ${filePath}`, error)
      dialog.showErrorBox(
        'Unable to Open File',
        error instanceof Error ? error.message : String(error)
      )
      return null
    }
  })

  safeIpcHandle('file:get-rows', [], async (_event, range: unknown) => {
    if (!range || typeof range !== 'object') {
      errorLog('rows', 'file:get-rows received invalid range', range)
      return []
    }
    return getRows(range as RowRange)
  })

  safeIpcHandle('file:search', { matchingRowIndices: [] }, async (_event, request: unknown) => {
    if (!request || typeof request !== 'object') {
      errorLog('search', 'file:search received invalid request', request)
      return { matchingRowIndices: [] }
    }

    const searchRequest = request as SearchRequest
    if (!searchRequest.term.trim()) {
      return { matchingRowIndices: [] }
    }

    return searchFile(searchRequest)
  })

  safeIpcHandle('search:all', [], async (_event, term: unknown) => {
    if (typeof term !== 'string' || !term.trim()) {
      return []
    }
    return searchAll(term)
  })

  safeIpcHandle('file:tag-update', undefined, async (_event, update: unknown) => {
    if (!update || typeof update !== 'object') {
      errorLog('tags', 'file:tag-update received invalid payload', update)
      return
    }
    updateTag(update as TagUpdate)
  })

  safeIpcHandle('file:save-tags', false, async (_event, request: unknown) => {
    if (!request || typeof request !== 'object') {
      errorLog('tags', 'file:save-tags received invalid request', request)
      return false
    }
    return saveTagsForFile(request as SaveTagsRequest)
  })

  safeIpcHandle('file:close', undefined, async (_event, fileId: unknown) => {
    if (typeof fileId !== 'string') {
      return
    }
    closeFile(fileId)
  })

  safeIpcHandle('rules:load', null, async () => loadColorRulesXml())

  // Generic command dispatch: same registry the UI channels above use.
  // This is the seam a future HTTP API or MCP server attaches to.
  ipcMain.handle(
    'command:invoke',
    async (_event, name: unknown, payload: unknown): Promise<CommandResult<unknown>> => {
      if (typeof name !== 'string') {
        return { ok: false, error: 'Command name must be a string' }
      }

      debugLog('command', `invoke ${name}`)
      try {
        const result = await dispatchCommand(name, payload ?? {})
        return { ok: true, result }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errorLog('command', `${name} failed`, error)
        return { ok: false, error: message }
      }
    }
  )
}
