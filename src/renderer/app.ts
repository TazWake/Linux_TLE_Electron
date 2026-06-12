import { TabManager } from './tabManager'

const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 24

export class App {
  private readonly tabBar!: HTMLElement
  private readonly tabContent!: HTMLElement
  private readonly addTabButton!: HTMLButtonElement
  private readonly statusRows!: HTMLElement
  private readonly statusMatches!: HTMLElement
  private readonly windowTitleBase = 'ElectronTimelineViewer'
  private readonly tabManager!: TabManager
  private fontSize = DEFAULT_FONT_SIZE

  constructor() {
    if (!window.api) {
      document.body.innerHTML =
        '<p class="startup-error">Application API failed to load. Restart the app.</p>'
      return
    }

    this.tabBar = document.getElementById('tab-bar') as HTMLElement
    this.tabContent = document.getElementById('tab-content') as HTMLElement
    this.addTabButton = document.getElementById('add-tab') as HTMLButtonElement
    this.statusRows = document.getElementById('status-rows') as HTMLElement
    this.statusMatches = document.getElementById('status-matches') as HTMLElement

    this.tabManager = new TabManager(
      this.tabBar,
      this.tabContent,
      this.addTabButton,
      () => this.updateChrome(),
      (rows, matches) => this.updateStatus(rows, matches)
    )

    this.registerIpcListeners()
    this.registerMenuListeners()
    this.registerDragAndDrop()
    this.updateChrome()

    window.api.onCloseRequest(() => {
      void this.handleCloseRequest()
    })

    window.api.onFileOpened((metadata) => {
      void this.tabManager.addTab(metadata)
    })
  }

  private registerIpcListeners(): void {
    window.api.onIndexProgress((event) => {
      this.tabManager.handleIndexProgress(event.fileId, event.linesIndexed, event.phase)
    })

    window.api.onIndexComplete((event) => {
      this.tabManager.finishIndexing(event.fileId, event.rowCount)
    })

    window.api.onIndexFailed((event) => {
      this.tabManager.removeFailedTab(event.fileId)
    })
  }

  private registerMenuListeners(): void {
    window.api.onMenuAction((action) => {
      switch (action) {
        case 'open-file':
          void this.tabManager.openFile()
          break
        case 'save-tags':
          void this.saveActiveTags()
          break
        case 'close-tab':
          void this.tabManager.closeActiveTab()
          break
        case 'increase-font':
          this.changeFontSize(1)
          break
        case 'decrease-font':
          this.changeFontSize(-1)
          break
        case 'reset-font':
          this.setFontSize(DEFAULT_FONT_SIZE)
          break
        case 'search-current':
          this.tabManager.getActiveTab()?.focusSearch()
          break
        case 'search-all':
          void this.searchAllTabs()
          break
        case 'clear-search':
          this.tabManager.getActiveTab()?.clearSearch()
          break
      }
    })
  }

  private registerDragAndDrop(): void {
    document.body.addEventListener('dragover', (event) => {
      event.preventDefault()
    })

    document.body.addEventListener('drop', (event) => {
      event.preventDefault()
      const file = event.dataTransfer?.files.item(0)
      if (file) {
        const filePath = window.api.getPathForFile(file)
        void this.tabManager.openFilePath(filePath)
      }
    })
  }

  private async saveActiveTags(): Promise<void> {
    const tab = this.tabManager.getActiveTab()
    if (!tab?.isTagsDirty()) {
      return
    }
    await tab.saveTags()
    this.updateChrome()
  }

  private async searchAllTabs(): Promise<void> {
    const term = window.prompt('Search all open tabs for:')
    if (!term?.trim()) {
      return
    }

    for (const tab of this.tabManager.getTabs()) {
      await tab.runSearchWithTerm(term, 'All Columns')
    }
  }

  private changeFontSize(delta: number): void {
    this.setFontSize(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, this.fontSize + delta)))
  }

  private setFontSize(size: number): void {
    this.fontSize = size
    for (const tab of this.tabManager.getTabs()) {
      tab.setFontSize(size)
    }
  }

  private updateStatus(rows: number, matches: number | null): void {
    this.statusRows.textContent = `Rows: ${rows.toLocaleString()}`
    this.statusMatches.textContent =
      matches == null ? 'Matches: —' : `Matches: ${matches.toLocaleString()}`
  }

  private updateChrome(): void {
    const dirtyTabs = this.tabManager.hasUnsavedTabs()
    const dirtySuffix = dirtyTabs.length > 0 ? ' *' : ''
    document.title = `${this.windowTitleBase}${dirtySuffix}`
    this.tabManager.updateTabTitles()
  }

  async handleCloseRequest(): Promise<void> {
    const canClose = await this.tabManager.closeAllTabs()
    if (canClose) {
      window.api.confirmClose()
    }
  }
}
