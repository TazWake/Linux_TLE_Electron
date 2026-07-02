import type { FileSearchSummary } from '../shared/commands'
import { logRendererError } from './rendererDebug'

/**
 * TLE-style Find window: search every open file, list per-file hit counts,
 * click a result to warp to that tab with the term applied as its filter.
 */
export class FindAllDialog {
  private readonly overlay: HTMLDivElement
  private readonly input: HTMLInputElement
  private readonly searchButton: HTMLButtonElement
  private readonly results: HTMLUListElement
  private readonly status: HTMLParagraphElement
  private searching = false

  constructor(
    private readonly runSearch: (term: string) => Promise<FileSearchSummary[]>,
    private readonly onSelect: (summary: FileSearchSummary, term: string) => void
  ) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'find-all-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')

    const panel = document.createElement('div')
    panel.className = 'find-all-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.setAttribute('aria-label', 'Find in all files')

    const header = document.createElement('div')
    header.className = 'find-all-header'

    const title = document.createElement('h2')
    title.textContent = 'Find in All Files'

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.textContent = 'Close'
    closeButton.setAttribute('aria-label', 'Close find window')
    closeButton.addEventListener('click', () => this.hide())

    header.append(title, closeButton)

    const controls = document.createElement('div')
    controls.className = 'find-all-controls'

    this.input = document.createElement('input')
    this.input.type = 'search'
    this.input.placeholder = 'Search term'
    this.input.setAttribute('aria-label', 'Search term for all files')
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        void this.search()
      }
    })

    this.searchButton = document.createElement('button')
    this.searchButton.type = 'button'
    this.searchButton.textContent = 'Search'
    this.searchButton.addEventListener('click', () => void this.search())

    controls.append(this.input, this.searchButton)

    this.status = document.createElement('p')
    this.status.className = 'find-all-status'
    this.status.setAttribute('aria-live', 'polite')

    this.results = document.createElement('ul')
    this.results.className = 'find-all-results'
    this.results.setAttribute('role', 'listbox')

    panel.append(header, controls, this.status, this.results)
    this.overlay.append(panel)
    document.body.append(this.overlay)

    this.overlay.addEventListener('mousedown', (event) => {
      if (event.target === this.overlay) {
        this.hide()
      }
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) {
        this.hide()
      }
    })
  }

  isOpen(): boolean {
    return this.overlay.classList.contains('is-open')
  }

  open(): void {
    this.overlay.classList.add('is-open')
    this.overlay.setAttribute('aria-hidden', 'false')
    this.input.focus()
    this.input.select()
  }

  hide(): void {
    this.overlay.classList.remove('is-open')
    this.overlay.setAttribute('aria-hidden', 'true')
  }

  private async search(): Promise<void> {
    const term = this.input.value.trim()
    if (!term || this.searching) {
      return
    }

    this.searching = true
    this.searchButton.disabled = true
    this.status.textContent = 'Searching all open files…'
    this.results.replaceChildren()

    try {
      const summaries = await this.runSearch(term)
      this.renderResults(summaries, term)
    } catch (error) {
      logRendererError('find-all', 'search failed', error)
      this.status.textContent = 'Search failed. See terminal for details.'
    } finally {
      this.searching = false
      this.searchButton.disabled = false
    }
  }

  private renderResults(summaries: FileSearchSummary[], term: string): void {
    this.results.replaceChildren()

    if (summaries.length === 0) {
      this.status.textContent = 'No files are open.'
      return
    }

    const totalMatches = summaries.reduce((sum, item) => sum + item.matchCount, 0)
    this.status.textContent = `${totalMatches.toLocaleString()} match(es) across ${summaries.length} file(s). Click a file to filter it.`

    for (const summary of summaries) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'option')
      button.disabled = summary.matchCount === 0

      const name = document.createElement('span')
      name.className = 'find-all-file'
      name.textContent = summary.fileName

      const count = document.createElement('span')
      count.className = 'find-all-count'
      count.textContent = `${summary.matchCount.toLocaleString()} match(es)`

      button.append(name, count)
      button.addEventListener('click', () => {
        this.hide()
        this.onSelect(summary, term)
      })

      item.append(button)
      this.results.append(item)
    }
  }
}
