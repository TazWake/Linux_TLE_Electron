/* SPDX-License-Identifier: GPL-3.0-or-later */
import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface FileMetadata {
  fileId: string
  filePath: string
  fileName: string
  format: 'filesystem' | 'super'
  headers: string[]
  rowCount: number
  indexing?: boolean
}

export interface RowRange {
  fileId: string
  startRow: number
  endRow: number
  rowIndexMap?: number[]
}

export interface RowData {
  rowIndex: number
  cells: string[]
  tagged: boolean
}

export interface SearchRequest {
  fileId: string
  column: string
  term: string
}

export interface SearchResult {
  matchingRowIndices: number[]
}

export interface TagUpdate {
  fileId: string
  rowIndex: number
  tagged: boolean
}

export interface SaveTagsRequest {
  fileId: string
}

export interface IndexProgressEvent {
  fileId: string
  linesIndexed: number
  phase: 'indexing' | 'searching'
}

export interface IndexCompleteEvent {
  fileId: string
  rowCount: number
}

export interface ElectronApi {
  openFile: () => Promise<FileMetadata | null>
  openFilePath: (filePath: string) => Promise<FileMetadata | null>
  getRows: (range: RowRange) => Promise<RowData[]>
  search: (request: SearchRequest) => Promise<SearchResult>
  tagUpdate: (update: TagUpdate) => Promise<void>
  saveTags: (request: SaveTagsRequest) => Promise<boolean>
  closeFile: (fileId: string) => Promise<void>
  onIndexProgress: (callback: (event: IndexProgressEvent) => void) => () => void
  onIndexComplete: (callback: (event: IndexCompleteEvent) => void) => () => void
  onIndexFailed: (callback: (event: { fileId: string }) => void) => () => void
  onMenuAction: (callback: (action: string) => void) => () => void
  onFileOpened: (callback: (metadata: FileMetadata) => void) => () => void
  getPathForFile: (file: File) => string
  confirmClose: () => void
  onCloseRequest: (callback: () => void) => () => void
  setSaveTagsEnabled: (enabled: boolean) => void
}

const api: ElectronApi = {
  openFile: () => ipcRenderer.invoke('file:open'),
  openFilePath: (filePath: string) => ipcRenderer.invoke('file:open-path', filePath),
  getRows: (range: RowRange) => ipcRenderer.invoke('file:get-rows', range),
  search: (request: SearchRequest) => ipcRenderer.invoke('file:search', request),
  tagUpdate: (update: TagUpdate) => ipcRenderer.invoke('file:tag-update', update),
  saveTags: (request: SaveTagsRequest) => ipcRenderer.invoke('file:save-tags', request),
  closeFile: (fileId: string) => ipcRenderer.invoke('file:close', fileId),
  onIndexProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: IndexProgressEvent): void => {
      callback(data)
    }
    ipcRenderer.on('file:index-progress', handler)
    return () => {
      ipcRenderer.removeListener('file:index-progress', handler)
    }
  },
  onIndexComplete: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: IndexCompleteEvent): void => {
      callback(data)
    }
    ipcRenderer.on('file:index-complete', handler)
    return () => {
      ipcRenderer.removeListener('file:index-complete', handler)
    }
  },
  onIndexFailed: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { fileId: string }): void => {
      callback(data)
    }
    ipcRenderer.on('file:index-failed', handler)
    return () => {
      ipcRenderer.removeListener('file:index-failed', handler)
    }
  },
  getPathForFile: (file: File) => {
    if (!webUtils?.getPathForFile) {
      throw new Error('File paths are not available in this environment.')
    }
    return webUtils.getPathForFile(file)
  },
  confirmClose: () => ipcRenderer.send('app:confirm-close'),
  setSaveTagsEnabled: (enabled: boolean) =>
    ipcRenderer.send('app:set-save-tags-enabled', enabled),
  onCloseRequest: (callback) => {
    const handler = (): void => {
      callback()
    }
    ipcRenderer.on('app:request-close', handler)
    return () => {
      ipcRenderer.removeListener('app:request-close', handler)
    }
  },
  onFileOpened: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, metadata: FileMetadata): void => {
      callback(metadata)
    }
    ipcRenderer.on('file:opened', handler)
    return () => {
      ipcRenderer.removeListener('file:opened', handler)
    }
  },
  onMenuAction: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string): void => {
      callback(action)
    }
    const channels = [
      'menu:open-file',
      'menu:save-tags',
      'menu:close-tab',
      'menu:increase-font',
      'menu:decrease-font',
      'menu:reset-font',
      'menu:search-current',
      'menu:search-all',
      'menu:clear-search'
    ] as const

    for (const channel of channels) {
      ipcRenderer.on(channel, () => callback(channel.replace('menu:', '')))
    }

    return () => {
      for (const channel of channels) {
        ipcRenderer.removeAllListeners(channel)
      }
    }
  }
}

try {
  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('api', api)
  } else {
    // Fallback when context isolation is disabled (should not happen in production).
    ;(globalThis as unknown as { api: ElectronApi }).api = api
  }
} catch (error) {
  console.error('Failed to expose preload API:', error)
}
