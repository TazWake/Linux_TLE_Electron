import { formatFieldContent } from './formatter'

export class FieldDetailWindow {
  private readonly overlay: HTMLDivElement
  private readonly title: HTMLHeadingElement
  private readonly content: HTMLPreElement

  constructor() {
    this.overlay = document.createElement('div')
    this.overlay.className = 'field-detail-overlay'
    this.overlay.hidden = true

    const panel = document.createElement('div')
    panel.className = 'field-detail-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'false')
    panel.setAttribute('aria-label', 'Field detail')

    const header = document.createElement('div')
    header.className = 'field-detail-header'

    this.title = document.createElement('h2')
    this.title.className = 'field-detail-title'

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.textContent = 'Close'
    closeButton.setAttribute('aria-label', 'Close field detail')
    closeButton.addEventListener('click', () => this.hide())

    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.textContent = 'Copy to Clipboard'
    copyButton.addEventListener('click', async () => {
      await navigator.clipboard.writeText(this.content.textContent ?? '')
    })

    header.append(this.title, copyButton, closeButton)

    this.content = document.createElement('pre')
    this.content.className = 'field-detail-content'

    panel.append(header, this.content)
    this.overlay.append(panel)
    document.body.append(this.overlay)
  }

  show(columnName: string, rawValue: string): void {
    this.title.textContent = columnName
    this.content.textContent = formatFieldContent(rawValue)
    this.overlay.hidden = false
  }

  hide(): void {
    this.overlay.hidden = true
  }
}
