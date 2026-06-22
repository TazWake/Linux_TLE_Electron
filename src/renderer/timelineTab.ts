import {
  createGrid,
  type GridApi,
  type IDatasource,
  type IGetRowsParams
} from 'ag-grid-community'
import type { FileMetadata } from '../shared/types'
import { createGridOptions, rowToGridRecord } from './gridConfig'
import { FieldDetailWindow } from './fieldDetailWindow'
import { logRenderer, logRendererError } from './rendererDebug'

export class TimelineTab {
  readonly metadata: FileMetadata
  private readonly container: HTMLElement
  private readonly loadingEl: HTMLElement
  private readonly gridHost: HTMLElement
  private readonly columnSelect: HTMLSelectElement
  private readonly searchInput: HTMLInputElement
  private readonly searchButton: HTMLButtonElement
  private readonly clearButton: HTMLButtonElement
  private readonly onDirtyChange: () => void
  private readonly onStatusChange: (rows: number, matches: number | null) => void
  private readonly fieldDetail = new FieldDetailWindow()

  private gridApi: GridApi | null = null
  private matchIndices: number[] | null = null
  private tagsDirty = false
  private indexing = true
  private fontSize = 13

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

    this.gridHost = document.createElement('div')
    this.gridHost.className = 'ag-theme-quartz grid-host'
    this.gridHost.hidden = true

    this.container.append(toolbar, this.loadingEl, this.gridHost)
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
    this.loadingEl.hidden = true
    this.gridHost.hidden = false
    // Defer grid creation until layout has settled (avoids zero-height container on Linux).
    requestAnimationFrame(() => {
      this.mountGrid()
    })
  }

  setFontSize(size: number): void {
    this.fontSize = size
    this.gridHost.style.fontSize = `${size}px`
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
    this.onStatusChange(this.metadata.rowCount, null)
    this.refreshDatasource()
  }

  private mountGrid(): void {
    if (this.gridApi) {
      return
    }

    logRenderer('grid', `mounting ${this.metadata.fileName}`, {
      rowCount: this.metadata.rowCount,
      columns: this.metadata.headers.length
    })

    const options = createGridOptions(
      this.metadata,
      (rowIndex, tagged) => void this.handleTagToggle(rowIndex, tagged),
      (event) => {
        if (!event.colDef?.headerName || event.value == null) {
          return
        }
        this.fieldDetail.show(event.colDef.headerName, String(event.value))
      }
    )

    options.datasource = this.createDatasource()

    try {
      this.gridApi = createGrid(this.gridHost, options)
      this.gridHost.style.fontSize = `${this.fontSize}px`
      logRenderer('grid', `mounted ${this.metadata.fileName}`)
    } catch (error) {
      logRendererError('grid', `createGrid failed for ${this.metadata.fileName}`, error)
      this.loadingEl.hidden = false
      this.loadingEl.textContent = 'Unable to display grid. See terminal for [ETV renderer] errors.'
      this.gridHost.hidden = true
    }
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

      params.successCallback(gridRows, lastRow)
      logRenderer('grid', `rows ${startRow}-${endRow}`, { returned: gridRows.length, lastRow })
    } catch (error) {
      logRendererError('grid', 'fetchRows failed', error)
      params.failCallback()
    }
  }

  private refreshDatasource(): void {
    if (!this.gridApi) {
      return
    }
    this.gridApi.setGridOption('infiniteInitialRowCount', this.matchIndices?.length ?? this.metadata.rowCount)
    this.gridApi.setGridOption('datasource', this.createDatasource())
    this.gridApi.purgeInfiniteCache()
  }

  async runSearchWithTerm(term: string, column = 'All Columns'): Promise<void> {
    this.searchInput.value = term
    this.columnSelect.value = column
    await this.runSearch()
  }

  private async runSearch(): Promise<void> {
    const term = this.searchInput.value.trim()
    if (!term) {
      this.clearSearch()
      return
    }

    this.loadingEl.hidden = false
    this.loadingEl.textContent = 'Searching… 0 rows scanned'
    this.gridHost.hidden = true

    const result = await window.api.search({
      fileId: this.metadata.fileId,
      column: this.columnSelect.value,
      term
    })

    this.matchIndices = result.matchingRowIndices
    this.onStatusChange(this.metadata.rowCount, this.matchIndices.length)
    this.loadingEl.hidden = true
    this.gridHost.hidden = false

    if (!this.gridApi) {
      this.mountGrid()
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
    this.gridApi?.destroy()
    this.gridApi = null
    await window.api.closeFile(this.metadata.fileId)
    this.container.remove()
  }
}
