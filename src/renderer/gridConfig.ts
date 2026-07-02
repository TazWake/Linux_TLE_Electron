import type {
  ColDef,
  GridOptions,
  ICellRendererComp,
  ICellRendererParams,
  RowClassParams,
  RowStyle
} from 'ag-grid-community'
import { themeQuartz } from 'ag-grid-community'
import type { FileMetadata } from '../shared/types'
import { evaluateColorRules } from './colorRules'
import { getDatetimeFormatter, isDatetimeHeader } from './datetimeFormat'

const MESSAGE_PREVIEW_LENGTH = 200

/** Column names treated as free text: preview renderer + flexible width. */
const MESSAGE_LIKE_HEADERS = new Set([
  'message',
  'desc',
  'description',
  'short',
  'extra',
  'payload',
  'data',
  'xml'
])

/** Column names treated as wide path/name columns. */
const WIDE_HEADERS = new Set(['file name', 'filename', 'display_name', 'path', 'full path'])

export interface GridRowRecord {
  rowIndex: number
  tagged: boolean
  matched: boolean
  [field: string]: string | number | boolean
}

class TagCheckboxRenderer implements ICellRendererComp {
  private eGui!: HTMLInputElement

  init(params: ICellRendererParams<GridRowRecord>): void {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = Boolean(params.data?.tagged)
    checkbox.setAttribute('aria-label', 'Tag row')
    checkbox.addEventListener('change', () => {
      const onToggle = params.colDef?.cellRendererParams?.onToggle as
        | ((rowIndex: number, tagged: boolean) => void)
        | undefined
      if (params.data && onToggle) {
        onToggle(params.data.rowIndex, checkbox.checked)
      }
    })
    this.eGui = checkbox
  }

  getGui(): HTMLElement {
    return this.eGui
  }

  refresh(params: ICellRendererParams<GridRowRecord>): boolean {
    this.eGui.checked = Boolean(params.data?.tagged)
    return true
  }
}

class MessagePreviewRenderer implements ICellRendererComp {
  private eGui!: HTMLSpanElement

  init(params: ICellRendererParams<GridRowRecord>): void {
    const span = document.createElement('span')
    const value = String(params.value ?? '')
    span.textContent =
      value.length > MESSAGE_PREVIEW_LENGTH
        ? `${value.slice(0, MESSAGE_PREVIEW_LENGTH)}…`
        : value
    span.title = value
    this.eGui = span
  }

  getGui(): HTMLElement {
    return this.eGui
  }

  refresh(): boolean {
    return false
  }
}

function sanitizeFieldName(header: string): string {
  return header.replace(/[^\w]+/g, '_')
}

/**
 * Map CSV headers to unique AG Grid field names. Handles blank headers and
 * collisions after sanitisation (e.g. "A B" and "A-B" both become A_B).
 */
export function fieldsFromHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map((header, index) => {
    let field = sanitizeFieldName(header.trim())
    if (field.length === 0) {
      field = `column_${index + 1}`
    }
    const count = seen.get(field) ?? 0
    seen.set(field, count + 1)
    return count === 0 ? field : `${field}_${count + 1}`
  })
}

export function buildColumnDefs(
  metadata: FileMetadata,
  onTagToggle: (rowIndex: number, tagged: boolean) => void
): ColDef<GridRowRecord>[] {
  const fields = fieldsFromHeaders(metadata.headers)
  let hasTagColumn = false

  const defs: ColDef<GridRowRecord>[] = metadata.headers.map((header, index) => {
    const lowered = header.trim().toLowerCase()
    const colDef: ColDef<GridRowRecord> = {
      field: fields[index],
      headerName: header,
      minWidth: 120
    }

    if (lowered === 'tag' && !hasTagColumn) {
      hasTagColumn = true
      colDef.headerName = 'Tag'
      colDef.field = 'tagged'
      colDef.width = 60
      colDef.minWidth = 60
      colDef.pinned = 'right'
      colDef.cellRenderer = TagCheckboxRenderer
      colDef.cellRendererParams = { onToggle: onTagToggle }
      colDef.valueGetter = (params) => params.data?.tagged ?? false
      return colDef
    }

    if (MESSAGE_LIKE_HEADERS.has(lowered)) {
      colDef.cellRenderer = MessagePreviewRenderer
      colDef.minWidth = 300
      colDef.flex = 1
    } else if (WIDE_HEADERS.has(lowered)) {
      colDef.minWidth = 300
      colDef.flex = 1
    }

    if (isDatetimeHeader(header)) {
      colDef.valueFormatter = (params) => getDatetimeFormatter()(String(params.value ?? ''))
    }

    return colDef
  })

  if (!hasTagColumn) {
    // TLE-style synthetic Tag column so every file supports tagging.
    defs.push({
      headerName: 'Tag',
      field: 'tagged',
      width: 60,
      minWidth: 60,
      pinned: 'right',
      cellRenderer: TagCheckboxRenderer,
      cellRendererParams: { onToggle: onTagToggle },
      valueGetter: (params) => params.data?.tagged ?? false
    })
  }

  return defs
}

export function rowToGridRecord(
  headers: string[],
  cells: string[],
  rowIndex: number,
  tagged: boolean,
  matched: boolean
): GridRowRecord {
  const record: GridRowRecord = {
    rowIndex,
    tagged,
    matched
  }

  const fields = fieldsFromHeaders(headers)
  fields.forEach((field, index) => {
    record[field] = cells[index] ?? ''
  })

  return record
}

export function createRowStyleFn(
  metadata: FileMetadata
): (params: RowClassParams<GridRowRecord>) => RowStyle | undefined {
  const fields = fieldsFromHeaders(metadata.headers)

  return (params) => {
    if (params.data?.tagged) {
      return { backgroundColor: '#fff3cd' }
    }
    if (params.data?.matched) {
      return { backgroundColor: '#d1ecf1' }
    }
    if (params.data) {
      return evaluateColorRules(metadata.headers, fields, params.data)
    }
    return undefined
  }
}

export function createGridOptions(
  metadata: FileMetadata,
  onTagToggle: (rowIndex: number, tagged: boolean) => void,
  onCellDoubleClicked: GridOptions<GridRowRecord>['onCellDoubleClicked'],
  rowModelType: 'clientSide' | 'infinite' = 'infinite',
  fontSize = 13
): GridOptions<GridRowRecord> {
  const base: GridOptions<GridRowRecord> = {
    theme: themeQuartz,
    rowModelType,
    columnDefs: buildColumnDefs(metadata, onTagToggle),
    defaultColDef: {
      resizable: true,
      sortable: false,
      filter: false
    },
    rowHeight: rowHeightForFont(fontSize),
    headerHeight: headerHeightForFont(fontSize),
    suppressCellFocus: false,
    onCellDoubleClicked,
    getRowStyle: createRowStyleFn(metadata)
  }

  if (rowModelType === 'infinite') {
    return {
      ...base,
      cacheBlockSize: 100,
      maxBlocksInCache: 20,
      infiniteInitialRowCount: metadata.rowCount
    }
  }

  return base
}

export function rowHeightForFont(fontSize: number): number {
  return Math.max(18, Math.round(fontSize * 1.7))
}

export function headerHeightForFont(fontSize: number): number {
  return Math.max(24, Math.round(fontSize * 2.1))
}
