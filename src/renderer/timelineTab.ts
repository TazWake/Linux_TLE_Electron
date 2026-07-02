import {
  createGrid,
  type CellDoubleClickedEvent,
  type CellKeyDownEvent,
  type GridApi,
  type IDatasource,
  type IGetRowsParams
} from 'ag-grid-community'
import type { FileMetadata } from '../shared/types'
import { CLIENT_SIDE_ROW_THRESHOLD } from '../shared/constants'
import {
  createGridOptions,
  fieldsFromHeaders,
  headerHeightForFont,
  rowHeightForFont,
  rowToGridRecord,
  type GridRowRecord
} from './gridConfig'
import { getFieldDetailWindow } from './fieldDetailWindow'
import { copyTextToClipboard } from './clipboard'
import { showContextMenu } from './cellContextMenu'
import { logRenderer, logRendererError } from './rendererDebug'

export class TimelineTab {
  readonly metadata: FileMetadata
  private readonly container: HTMLElement
  private readonly loadingEl: HTMLElement
  private readonly gridBody: HTMLElement
  private readonly gridHost: HTMLElement
  private readonly columnSelect: HTMLSelectElement
  private readonly searchInput: HTMLInputElement
  private readonly searchButton: HTMLButtonElement
  private readonly clearButton: HTMLButtonElement
  private readonly onDirtyChange: () => void
  private readonly onStatusChange: (rows: number, matches: number | null) => void
  private readonly fieldDetail = getFieldDetailWindow()

  private gridApi: GridApi<GridRowRecord> | null = null
  private matchIndices: number[] | null = null
  private tagsDirty = false
  private indexing = true
  private fontSize = 13
  private rowHeight = rowHeightForFont(13)
  private useClientSideRowModel = true
  private gridMountedAt = 0
  /** Ignore double-clicks right after mount (file-dialog click often lands on the grid). */
  private static readonly FIELD_DETAIL_GRACE_MS = 800

  constructor(
    metadata: FileMetadata,
    parent: HTMLElement,
    onDirtyChange: () => void,
    onStatusChange: (rows: number, matches: number | null) => void
  ) {
    this.metadata = metadata
    this.onDirtyChange = onDirtyChange
    this.onStatusChange = onStatusChange

    this.container = document.createElement('section')
    this.container.className = 'timeline-tab'
    this.container.dataset.fileId = metadata.fileId
    this.container.hidden = true

    const toolbar = document.createElement('div')
    toolbar.className = 'search-toolbar'

    this.columnSelect = document.createElement('select')
    this.columnSelect.setAttribute('aria-label', 'Search column')
    const allOption = document.createElement('option')
    allOption.value = 'All Columns'
    allOption.textContent = 'All Columns'
    this.columnSelect.append(allOption)
    for (const header of metadata.headers) {
      const option = document.createElement('option')
      option.value = header
      option.textContent = header
      this.columnSelect.append(option)
    }

    this.searchInput = document.createElement('input')
    this.searchInput.type = 'search'
    this.searchInput.placeholder = 'Search term'
    this.searchInput.setAttribute('aria-label', 'Search term')

    this.searchButton = document.createElement('button')
    this.searchButton.type = 'button'
    this.searchButton.textContent = 'Search'
    this.searchButton.addEventListener('click', () => void this.runSearch())

    this.clearButton = document.createElement('button')
    this.clearButton.type = 'button'
    this.clearButton.textContent = 'Clear'
    this.clearButton.addEventListener('click', () => this.clearSearch())

    this.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        void this.runSearch()
      }
    })

    toolbar.append(this.columnSelect, this.searchInput, this.searchButton, this.clearButton)

    this.loadingEl = document.createElement('div')
    this.loadingEl.className = 'grid-loading'
    this.loadingEl.textContent = 'Indexing file… 0 lines indexed'

    this.gridBody = document.createElement('div')
    this.gridBody.className = 'grid-body'
    this.gridBody.hidden = true

    this.gridHost = document.createElement('div')
    this.gridHost.className = 'grid-host'
    this.gridHost.addEventListener('contextmenu', (event) => {
      this.handleCellContextMenu(event)
    })

    this.gridBody.append(this.gridHost)
    this.container.append(toolbar, this.loadingEl, this.gridBody)
    parent.append(this.container)

    this.onStatusChange(metadata.rowCount, null)
  }

  get element(): HTMLElement {
    return this.container
  }

  isTagsDirty(): boolean {
    return this.tagsDirty
  }

  getMatchCount(): number | null {
    return this.matchIndices ? this.matchIndices.length : null
  }

  setTagsDirty(dirty: boolean): void {
    this.tagsDirty = dirty
    this.onDirtyChange()
  }

  show(): void {
    this.container.hidden = false
  }

  hide(): void {
    this.container.hidden = true
  }

  focusSearch(): void {
    this.searchInput.focus()
    this.searchInput.select()
  }

  updateIndexProgress(linesIndexed: number, phase: 'indexing' | 'searching'): void {
    if (phase === 'indexing') {
      this.loadingEl.textContent = `Indexing file… ${linesIndexed.toLocaleString()} lines indexed`
    } else {
      this.loadingEl.textContent = `Searching… ${linesIndexed.toLocaleString()} rows scanned`
    }
  }

  finishIndexing(): void {
    this.indexing = false
    this.useClientSideRowModel = this.metadata.rowCount <= CLIENT_SIDE_ROW_THRESHOLD
    this.loadingEl.hidden = true
    this.loadingEl.style.display = 'none'
    this.gridBody.hidden = false
    this.fieldDetail.hide()
    void this.mountGrid()
  }

  setFontSize(size: number): void {
    this.fontSize = size
    this.rowHeight = rowHeightForFont(size)
    this.gridHost.style.fontSize = `${size}px`

    if (this.gridApi) {
      this.gridApi.setGridOption('headerHeight', headerHeightForFont(size))
      this.gridApi.resetRowHeights()
    }
  }

  /** Redraw rows so updated colour rules take effect. */
  redrawRows(): void {
    this.gridApi?.redrawRows()
  }

  /** Force cell refresh so a new datetime format is applied. */
  refreshFormatting(): void {
    this.gridApi?.refreshCells({ force: true })
  }

  async saveTags(): Promise<boolean> {
    const saved = await window.api.saveTags({ fileId: this.metadata.fileId })
    if (saved) {
      this.setTagsDirty(false)
    }
    return saved
  }

  clearSearch(): void {
    this.matchIndices = null
    this.searchInput.value = ''
    this.onStatusChange(this.metadata.rowCount, null)
    this.refreshDatasource()
  }

  private async mountGrid(): Promise<void> {
    if (this.gridApi) {
      return
    }

    logRenderer('grid', `mounting ${this.metadata.fileName}`, {
      rowCount: this.metadata.rowCount,
      columns: this.metadata.headers.length,
      rowModel: this.useClientSideRowModel ? 'clientSide' : 'infinite'
    })

    const onCellDoubleClicked = (event: CellDoubleClickedEvent<GridRowRecord>) => {
      if (Date.now() - this.gridMountedAt < TimelineTab.FIELD_DETAIL_GRACE_MS) {
        return
      }

      const columnName = event.colDef?.headerName?.trim()
      if (!columnName || !event.data) {
        return
      }

      const field = event.colDef?.field
      const rawValue =
        field && typeof event.data[field] !== 'undefined'
          ? String(event.data[field])
          : event.value == null
            ? ''
            : String(event.value)

      if (!rawValue.trim()) {
        return
      }

      this.fieldDetail.show(columnName, rawValue)
    }

    const options = createGridOptions(
      this.metadata,
      (rowIndex, tagged) => void this.handleTagToggle(rowIndex, tagged),
      onCellDoubleClicked,
      this.useClientSideRowModel ? 'clientSide' : 'infinite',
      this.fontSize
    )

    // Mutable row height so font changes only need resetRowHeights().
    options.getRowHeight = () => this.rowHeight
    options.onCellKeyDown = (event: CellKeyDownEvent<GridRowRecord>) => {
      const keyboardEvent = event.event as KeyboardEvent | null
      if (keyboardEvent && (keyboardEvent.ctrlKey || keyboardEvent.metaKey) && keyboardEvent.key === 'c') {
        const value = event.value == null ? '' : String(event.value)
        void copyTextToClipboard(value)
      }
    }

    try {
      if (this.useClientSideRowModel) {
        const rows = await window.api.getRows({
          fileId: this.metadata.fileId,
          startRow: 0,
          endRow: this.metadata.rowCount,
          rowIndexMap: this.matchIndices ?? undefined
        })
        options.rowData = rows.map((row) =>
          rowToGridRecord(
            this.metadata.headers,
            row.cells,
            row.rowIndex,
            row.tagged,
            this.matchIndices !== null
          )
        )
        logRenderer('grid', `loaded ${options.rowData.length} rows for client-side model`)
      } else {
        options.datasource = this.createDatasource()
      }

      this.gridApi = createGrid(this.gridHost, options)
      this.gridHost.style.fontSize = `${this.fontSize}px`
      this.gridMountedAt = Date.now()
      this.fieldDetail.hide()
      logRenderer('grid', `mounted ${this.metadata.fileName}`)
    } catch (error) {
      logRendererError('grid', `createGrid failed for ${this.metadata.fileName}`, error)
      this.loadingEl.hidden = false
      this.loadingEl.textContent = 'Unable to display grid. See terminal for [ETV renderer] errors.'
      this.gridBody.hidden = true
    }
  }

  private handleCellContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null
    const cell = target?.closest('.ag-cell') as HTMLElement | null
    const rowEl = cell?.closest('[row-index]') as HTMLElement | null
    if (!cell || !rowEl || !this.gridApi) {
      return
    }

    event.preventDefault()

    const rowIndex = Number(rowEl.getAttribute('row-index'))
    const colId = cell.getAttribute('col-id')
    if (!Number.isFinite(rowIndex) || !colId) {
      return
    }

    const rowNode = this.gridApi.getDisplayedRowAtIndex(rowIndex)
    const record = rowNode?.data
    if (!record) {
      return
    }

    const cellValue = colId in record ? String(record[colId] ?? '') : ''
    const fields = fieldsFromHeaders(this.metadata.headers)

    showContextMenu(event.clientX, event.clientY, [
      {
        label: 'Copy Cell',
        action: () => void copyTextToClipboard(cellValue)
      },
      {
        label: 'Copy Row',
        action: () => {
          const values = fields.map((field) => String(record[field] ?? ''))
          void copyTextToClipboard(values.join('\t'))
        }
      },
      {
        label: 'Copy Row with Headers',
        action: () => {
          const values = fields.map((field) => String(record[field] ?? ''))
          void copyTextToClipboard(`${this.metadata.headers.join('\t')}\n${values.join('\t')}`)
        }
      }
    ])
  }

  private createDatasource(): IDatasource {
    return {
      getRows: (params: IGetRowsParams) => {
        void this.fetchRows(params)
      }
    }
  }

  private async fetchRows(params: IGetRowsParams): Promise<void> {
    if (this.indexing) {
      params.failCallback()
      return
    }

    const totalRows = this.matchIndices ? this.matchIndices.length : this.metadata.rowCount
    const startRow = params.startRow
    const endRow = Math.min(params.endRow, totalRows)

    try {
      const rows = await window.api.getRows({
        fileId: this.metadata.fileId,
        startRow,
        endRow,
        rowIndexMap: this.matchIndices ?? undefined
      })

      const gridRows = rows.map((row) =>
        rowToGridRecord(
          this.metadata.headers,
          row.cells,
          row.rowIndex,
          row.tagged,
          this.matchIndices !== null
        )
      )

      let lastRow = totalRows
      if (totalRows === 0) {
        lastRow = 0
      }

      try {
        params.successCallback(gridRows, lastRow)
        logRenderer('grid', `rows ${startRow}-${endRow}`, { returned: gridRows.length, lastRow })
      } catch (error) {
        logRendererError('grid', 'successCallback failed', error)
        params.failCallback()
      }
    } catch (error) {
      logRendererError('grid', 'fetchRows failed', error)
      params.failCallback()
    }
  }

  private refreshDatasource(): void {
    if (!this.gridApi) {
      return
    }

    if (this.useClientSideRowModel) {
      void this.reloadClientSideRows()
      return
    }

    this.gridApi.setGridOption('datasource', this.createDatasource())
    this.gridApi.purgeInfiniteCache()
  }

  private async reloadClientSideRows(): Promise<void> {
    if (!this.gridApi) {
      return
    }

    const totalRows = this.matchIndices ? this.matchIndices.length : this.metadata.rowCount
    const rows = await window.api.getRows({
      fileId: this.metadata.fileId,
      startRow: 0,
      endRow: totalRows,
      rowIndexMap: this.matchIndices ?? undefined
    })

    const gridRows = rows.map((row) =>
      rowToGridRecord(
        this.metadata.headers,
        row.cells,
        row.rowIndex,
        row.tagged,
        this.matchIndices !== null
      )
    )

    this.gridApi.setGridOption('rowData', gridRows)
  }

  async runSearchWithTerm(term: string, column = 'All Columns'): Promise<void> {
    this.searchInput.value = term
    this.columnSelect.value = column
    await this.runSearch()
  }

  /**
   * Apply pre-computed search results (from Find in All Files) without
   * re-running the per-file search worker.
   */
  async applySearchResult(term: string, matchingRowIndices: number[]): Promise<void> {
    this.searchInput.value = term
    this.columnSelect.value = 'All Columns'
    this.matchIndices = matchingRowIndices
    this.onStatusChange(this.metadata.rowCount, matchingRowIndices.length)

    if (!this.gridApi) {
      await this.mountGrid()
    } else {
      this.refreshDatasource()
    }
  }

  private async runSearch(): Promise<void> {
    const term = this.searchInput.value.trim()
    if (!term) {
      this.clearSearch()
      return
    }

    this.loadingEl.hidden = false
    this.loadingEl.style.display = ''
    this.loadingEl.textContent = 'Searching… 0 rows scanned'
    this.gridBody.hidden = true

    const result = await window.api.search({
      fileId: this.metadata.fileId,
      column: this.columnSelect.value,
      term
    })

    this.matchIndices = result.matchingRowIndices
    this.onStatusChange(this.metadata.rowCount, this.matchIndices.length)
    this.loadingEl.hidden = true
    this.loadingEl.style.display = 'none'
    this.gridBody.hidden = false

    if (!this.gridApi) {
      await this.mountGrid()
    } else {
      this.refreshDatasource()
    }
  }

  private async handleTagToggle(rowIndex: number, tagged: boolean): Promise<void> {
    await window.api.tagUpdate({
      fileId: this.metadata.fileId,
      rowIndex,
      tagged
    })
    this.setTagsDirty(true)
  }

  async destroy(): Promise<void> {
    this.fieldDetail.hide()
    this.gridApi?.destroy()
    this.gridApi = null
    await window.api.closeFile(this.metadata.fileId)
    this.container.remove()
  }
}
