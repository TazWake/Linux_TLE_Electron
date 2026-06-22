import type {
  ColDef,
  GridOptions,
  ICellRendererComp,
  ICellRendererParams,
  RowClassParams,
  RowStyle
} from 'ag-grid-community'
import type { FileMetadata } from '../shared/types'

const MESSAGE_PREVIEW_LENGTH = 200

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

function fieldNameFromHeader(header: string): string {
  return header.replace(/[^\w]+/g, '_')
}

export function buildColumnDefs(
  metadata: FileMetadata,
  onTagToggle: (rowIndex: number, tagged: boolean) => void
): ColDef<GridRowRecord>[] {
  return metadata.headers.map((header) => {
    const field = fieldNameFromHeader(header)
    const colDef: ColDef<GridRowRecord> = {
      field,
      headerName: header,
      minWidth: 120
    }

    if (metadata.format === 'super' && header === 'tag') {
      colDef.headerName = 'Tag'
      colDef.field = 'tagged'
      colDef.width = 60
      colDef.pinned = 'right'
      colDef.cellRenderer = TagCheckboxRenderer
      colDef.cellRendererParams = { onToggle: onTagToggle }
      colDef.valueGetter = (params) => params.data?.tagged ?? false
    }

    if (metadata.format === 'super' && header === 'message') {
      colDef.cellRenderer = MessagePreviewRenderer
      colDef.minWidth = 300
      colDef.flex = 1
    }

    if (metadata.format === 'filesystem' && header === 'File Name') {
      colDef.minWidth = 300
      colDef.flex = 1
    }

    return colDef
  })
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

  headers.forEach((header, index) => {
    const field = fieldNameFromHeader(header)
    record[field] = cells[index] ?? ''
  })

  return record
}

export function getRowStyle(params: RowClassParams<GridRowRecord>): RowStyle | undefined {
  if (params.data?.tagged) {
    return { backgroundColor: '#fff3cd' }
  }
  if (params.data?.matched) {
    return { backgroundColor: '#d1ecf1' }
  }
  return undefined
}

export function createGridOptions(
  metadata: FileMetadata,
  onTagToggle: (rowIndex: number, tagged: boolean) => void,
  onCellDoubleClicked: GridOptions<GridRowRecord>['onCellDoubleClicked']
): GridOptions<GridRowRecord> {
  return {
    // v33 defaults to the new JS theme API; we import ag-theme-quartz.css (legacy CSS themes).
    theme: 'legacy',
    rowModelType: 'infinite',
    cacheBlockSize: 100,
    maxBlocksInCache: 20,
    infiniteInitialRowCount: metadata.rowCount,
    columnDefs: buildColumnDefs(metadata, onTagToggle),
    defaultColDef: {
      resizable: true,
      sortable: false,
      filter: false
    },
    rowHeight: 22,
    headerHeight: 28,
    suppressCellFocus: false,
    onCellDoubleClicked,
    getRowStyle
  }
}
