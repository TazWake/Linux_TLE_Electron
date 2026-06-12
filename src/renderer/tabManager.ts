import type { FileMetadata } from '../shared/types'
import { TimelineTab } from './timelineTab'

interface TabEntry {
  id: string
  metadata: FileMetadata
  tab: TimelineTab
  tabButton: HTMLButtonElement
  closeButton: HTMLButtonElement
}

export class TabManager {
  private readonly tabBar: HTMLElement
  private readonly tabContent: HTMLElement
  private readonly addButton: HTMLButtonElement
  private readonly onTabsChange: () => void
  private readonly onStatusChange: (rows: number, matches: number | null) => void
  private tabs: TabEntry[] = []
  private activeTabId: string | null = null

  constructor(
    tabBar: HTMLElement,
    tabContent: HTMLElement,
    addButton: HTMLButtonElement,
    onTabsChange: () => void,
    onStatusChange: (rows: number, matches: number | null) => void
  ) {
    this.tabBar = tabBar
    this.tabContent = tabContent
    this.addButton = addButton
    this.onTabsChange = onTabsChange
    this.onStatusChange = onStatusChange

    this.addButton.addEventListener('click', () => void this.openFile())
  }

  getActiveTab(): TimelineTab | null {
    const entry = this.tabs.find((tab) => tab.id === this.activeTabId)
    return entry?.tab ?? null
  }

  getTabs(): TimelineTab[] {
    return this.tabs.map((entry) => entry.tab)
  }

  hasUnsavedTabs(): TimelineTab[] {
    return this.tabs.map((entry) => entry.tab).filter((tab) => tab.isTagsDirty())
  }

  async openFile(): Promise<void> {
    const metadata = await window.api.openFile()
    if (metadata) {
      await this.addTab(metadata)
    }
  }

  async openFilePath(filePath: string): Promise<void> {
    const metadata = await window.api.openFilePath(filePath)
    if (metadata) {
      await this.addTab(metadata)
    }
  }

  async addTab(metadata: FileMetadata): Promise<void> {
    const tab = new TimelineTab(metadata, this.tabContent, () => {
      this.updateTabTitles()
      this.onTabsChange()
    }, this.onStatusChange)

    const tabButton = document.createElement('button')
    tabButton.type = 'button'
    tabButton.className = 'tab-button'
    tabButton.dataset.tabId = metadata.fileId

    const label = document.createElement('span')
    label.className = 'tab-label'
    label.textContent = metadata.fileName

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'tab-close'
    closeButton.setAttribute('aria-label', `Close ${metadata.fileName}`)
    closeButton.textContent = '×'
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation()
      void this.closeTab(metadata.fileId)
    })

    tabButton.append(label, closeButton)
    tabButton.addEventListener('click', () => this.activateTab(metadata.fileId))

    this.tabBar.insertBefore(tabButton, this.addButton)

    const entry: TabEntry = {
      id: metadata.fileId,
      metadata,
      tab,
      tabButton,
      closeButton
    }

    this.tabs.push(entry)
    this.activateTab(metadata.fileId)
    this.onTabsChange()
  }

  activateTab(tabId: string): void {
    this.activeTabId = tabId

    for (const entry of this.tabs) {
      const active = entry.id === tabId
      if (active) {
        entry.tab.show()
      } else {
        entry.tab.hide()
      }
      entry.tabButton.classList.toggle('active', active)
      entry.tabButton.setAttribute('aria-selected', String(active))
    }

    const active = this.tabs.find((entry) => entry.id === tabId)
    if (active) {
      this.onStatusChange(active.metadata.rowCount, null)
    }
  }

  updateTabTitles(): void {
    for (const entry of this.tabs) {
      const label = entry.tabButton.querySelector('.tab-label')
      if (label) {
        label.textContent = entry.tab.isTagsDirty()
          ? `${entry.metadata.fileName} *`
          : entry.metadata.fileName
      }
    }
  }

  async closeActiveTab(): Promise<boolean> {
    if (!this.activeTabId) {
      return true
    }
    return this.closeTab(this.activeTabId)
  }

  async closeTab(tabId: string): Promise<boolean> {
    const entryIndex = this.tabs.findIndex((entry) => entry.id === tabId)
    if (entryIndex < 0) {
      return true
    }

    const entry = this.tabs[entryIndex]
    if (entry.tab.isTagsDirty()) {
      const choice = await this.promptUnsavedTags(entry.metadata.fileName)
      if (choice === 'cancel') {
        return false
      }
      if (choice === 'save') {
        const saved = await entry.tab.saveTags()
        if (!saved) {
          return false
        }
      }
    }

    await entry.tab.destroy()
    entry.tabButton.remove()
    this.tabs.splice(entryIndex, 1)

    if (this.activeTabId === tabId) {
      const next = this.tabs[entryIndex] ?? this.tabs[entryIndex - 1]
      this.activeTabId = next?.id ?? null
      if (next) {
        this.activateTab(next.id)
      }
    }

    this.onTabsChange()
    return true
  }

  async closeAllTabs(): Promise<boolean> {
    for (const entry of [...this.tabs]) {
      const closed = await this.closeTab(entry.id)
      if (!closed) {
        return false
      }
    }
    return true
  }

  handleIndexProgress(fileId: string, linesIndexed: number, phase: 'indexing' | 'searching'): void {
    const entry = this.tabs.find((tab) => tab.id === fileId)
    entry?.tab.updateIndexProgress(linesIndexed, phase)
  }

  finishIndexing(fileId: string, rowCount: number): void {
    const entry = this.tabs.find((tab) => tab.id === fileId)
    if (!entry) {
      return
    }
    entry.metadata.rowCount = rowCount
    entry.tab.metadata.rowCount = rowCount
    entry.tab.finishIndexing()
    if (this.activeTabId === fileId) {
      this.onStatusChange(rowCount, null)
    }
  }

  removeFailedTab(fileId: string): void {
    const entryIndex = this.tabs.findIndex((entry) => entry.id === fileId)
    if (entryIndex < 0) {
      return
    }
    const entry = this.tabs[entryIndex]
    entry.tab.element.remove()
    entry.tabButton.remove()
    this.tabs.splice(entryIndex, 1)
    if (this.activeTabId === fileId) {
      const next = this.tabs[entryIndex] ?? this.tabs[entryIndex - 1]
      this.activeTabId = next?.id ?? null
      if (next) {
        this.activateTab(next.id)
      }
    }
    this.onTabsChange()
  }

  private async promptUnsavedTags(fileName: string): Promise<'save' | 'discard' | 'cancel'> {
    const dialog = document.createElement('div')
    dialog.className = 'confirm-dialog-overlay'
    dialog.setAttribute('role', 'alertdialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', 'unsaved-tags-title')

    const panel = document.createElement('div')
    panel.className = 'confirm-dialog'

    const title = document.createElement('h2')
    title.id = 'unsaved-tags-title'
    title.textContent = 'Unsaved Tags'

    const message = document.createElement('p')
    message.textContent = `Save tag changes for ${fileName} before closing?`

    const actions = document.createElement('div')
    actions.className = 'confirm-dialog-actions'

    return new Promise((resolve) => {
      const saveButton = document.createElement('button')
      saveButton.type = 'button'
      saveButton.textContent = 'Save'
      saveButton.addEventListener('click', () => {
        dialog.remove()
        resolve('save')
      })

      const discardButton = document.createElement('button')
      discardButton.type = 'button'
      discardButton.textContent = 'Discard'
      discardButton.addEventListener('click', () => {
        dialog.remove()
        resolve('discard')
      })

      const cancelButton = document.createElement('button')
      cancelButton.type = 'button'
      cancelButton.textContent = 'Cancel'
      cancelButton.addEventListener('click', () => {
        dialog.remove()
        resolve('cancel')
      })

      actions.append(saveButton, discardButton, cancelButton)
      panel.append(title, message, actions)
      dialog.append(panel)
      document.body.append(dialog)
      saveButton.focus()
    })
  }
}
