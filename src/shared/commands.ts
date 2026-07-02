import type {
  FileMetadata,
  RowRange,
  RowData,
  SearchRequest,
  SearchResult,
  TagUpdate,
  SaveTagsRequest
} from './types'

/**
 * The command layer is the automation surface of the application. Every file
 * operation the UI performs goes through these commands; a future HTTP API or
 * MCP server attaches to the same registry. See docs/AUTOMATION.md.
 */

export interface OpenFileRequest {
  filePath: string
}

export interface CloseFileRequest {
  fileId: string
}

export interface SearchAllRequest {
  term: string
}

export interface FileSearchSummary {
  fileId: string
  fileName: string
  matchCount: number
  matchingRowIndices: number[]
}

export interface AppStatus {
  version: string
  openFiles: number
}

export interface CommandMap {
  'app.status': { request: Record<string, never>; response: AppStatus }
  'file.open': { request: OpenFileRequest; response: FileMetadata }
  'file.list': { request: Record<string, never>; response: FileMetadata[] }
  'file.getRows': { request: RowRange; response: RowData[] }
  'file.search': { request: SearchRequest; response: SearchResult }
  'search.all': { request: SearchAllRequest; response: FileSearchSummary[] }
  'tag.update': { request: TagUpdate; response: { ok: boolean } }
  'tag.save': { request: SaveTagsRequest; response: { saved: boolean } }
  'file.close': { request: CloseFileRequest; response: { closed: boolean } }
  'rules.load': { request: Record<string, never>; response: { xml: string | null } }
}

export type CommandName = keyof CommandMap

export interface CommandFailure {
  ok: false
  error: string
}

export interface CommandSuccess<T> {
  ok: true
  result: T
}

export type CommandResult<T> = CommandSuccess<T> | CommandFailure
