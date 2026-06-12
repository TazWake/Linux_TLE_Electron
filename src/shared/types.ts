export type TimelineFormat = 'filesystem' | 'super'

export interface FileMetadata {
  fileId: string
  filePath: string
  fileName: string
  format: TimelineFormat
  headers: string[]
  rowCount: number
  indexing?: boolean
}

export interface IndexCompleteEvent {
  fileId: string
  rowCount: number
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

export interface TagsFile {
  sourceFile: string
  taggedRows: number[]
}
