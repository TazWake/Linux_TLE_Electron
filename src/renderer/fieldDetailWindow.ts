import { formatFieldContent } from './formatter'

let sharedInstance: FieldDetailWindow | null = null

/** One overlay for the whole app — avoids duplicate overlays when multiple tabs exist. */
export function getFieldDetailWindow(): FieldDetailWindow {
  if (!sharedInstance) {
    sharedInstance = new FieldDetailWindow()
  }
  return sharedInstance
}

export class FieldDetailWindow {
  private readonly overlay: HTMLDivElement
  private readonly panel: HTMLDivElement
  private readonly title: HTMLHeadingElement
  private readonly content: HTMLPreElement
  private readonly onKeyDown: (event: KeyboardEvent) => void

  constructor() {
    this.overlay = document.createElement('div')
    this.overlay.className = 'field-detail-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')

    this.panel = document.createElement('div')
    this.panel.className = 'field-detail-panel'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'true')
    this.panel.setAttribute('aria-label', 'Field detail')

    const header = document.createElement('div')
    header.className = 'field-detail-header'

    this.title = document.createElement('h2')
    this.title.className = 'field-detail-title'

    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.textContent = 'Copy to Clipboard'
    copyButton.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    copyButton.addEventListener('click', (event) => {
      event.stopPropagation()
      void this.copyToClipboard()
    })

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.textContent = 'Close'
    closeButton.setAttribute('aria-label', 'Close field detail')
    closeButton.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation()
      this.hide()
    })

    header.append(this.title, copyButton, closeButton)

    this.content = document.createElement('pre')
    this.content.className = 'field-detail-content'

    this.panel.append(header, this.content)
    this.overlay.append(this.panel)
    document.body.append(this.overlay)

    // Close when clicking the dimmed backdrop (not the panel).
    this.overlay.addEventListener('mousedown', (event) => {
      if (event.target === this.overlay) {
        event.preventDefault()
        this.hide()
      }
    })

    this.panel.addEventListener('mousedown', (event) => {
      event.stopPropagation()
    })

    this.onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.isOpen()) {
        event.preventDefault()
        this.hide()
      }
    }
    document.addEventListener('keydown', this.onKeyDown)
  }

  isOpen(): boolean {
    return this.overlay.classList.contains('is-open')
  }

  show(columnName: string, rawValue: string): void {
    const trimmedName = columnName.trim()
    const trimmedValue = rawValue.trim()
    if (!trimmedName || !trimmedValue) {
      return
    }

    this.title.textContent = trimmedName
    this.content.textContent = formatFieldContent(rawValue)
    this.overlay.classList.add('is-open')
    this.overlay.setAttribute('aria-hidden', 'false')
  }

  hide(): void {
    this.overlay.classList.remove('is-open')
    this.overlay.setAttribute('aria-hidden', 'true')
  }

  private async copyToClipboard(): Promise<void> {
    const text = this.content.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback when clipboard API is blocked in the renderer.
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(this.content)
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.execCommand('copy')
      selection?.removeAllRanges()
    }
  }
}
