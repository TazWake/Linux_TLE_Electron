import { contextBridge, ipcRenderer } from 'electron'
import type {
  FileMetadata,
  RowRange,
  RowData,
  SearchRequest,
  SearchResult,
  TagUpdate,
  SaveTagsRequest,
  IndexProgressEvent
} from '../shared/types'

export interface ElectronApi {
  openFile: () => Promise<FileMetadata | null>
  openFilePath: (filePath: string) => Promise<FileMetadata | null>
  getRows: (range: RowRange) => Promise<RowData[]>
  search: (request: SearchRequest) => Promise<SearchResult>
  tagUpdate: (update: TagUpdate) => Promise<void>
  saveTags: (request: SaveTagsRequest) => Promise<boolean>
  closeFile: (fileId: string) => Promise<void>
  hasUnsavedTags: (fileId: string) => Promise<boolean>
  onIndexProgress: (callback: (event: IndexProgressEvent) => void) => () => void
  onMenuAction: (callback: (action: string) => void) => () => void
}

const api: ElectronApi = {
  openFile: () => ipcRenderer.invoke('file:open'),
  openFilePath: (filePath: string) => ipcRenderer.invoke('file:open-path', filePath),
  getRows: (range: RowRange) => ipcRenderer.invoke('file:get-rows', range),
  search: (request: SearchRequest) => ipcRenderer.invoke('file:search', request),
  tagUpdate: (update: TagUpdate) => ipcRenderer.invoke('file:tag-update', update),
  saveTags: (request: SaveTagsRequest) => ipcRenderer.invoke('file:save-tags', request),
  closeFile: (fileId: string) => ipcRenderer.invoke('file:close', fileId),
  hasUnsavedTags: (fileId: string) => ipcRenderer.invoke('file:has-unsaved-tags', fileId),
  onIndexProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: IndexProgressEvent): void => {
      callback(data)
    }
    ipcRenderer.on('file:index-progress', handler)
    return () => {
      ipcRenderer.removeListener('file:index-progress', handler)
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

contextBridge.exposeInMainWorld('api', api)
