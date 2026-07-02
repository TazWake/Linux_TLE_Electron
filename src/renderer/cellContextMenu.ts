export interface ContextMenuItem {
  label: string
  action: () => void
}

let menuElement: HTMLDivElement | null = null

function hideMenu(): void {
  menuElement?.remove()
  menuElement = null
}

function ensureGlobalListeners(): void {
  document.addEventListener('mousedown', (event) => {
    if (menuElement && !menuElement.contains(event.target as Node)) {
      hideMenu()
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideMenu()
    }
  })
  window.addEventListener('blur', hideMenu)
  document.addEventListener('scroll', hideMenu, true)
}

ensureGlobalListeners()

/** Show a lightweight context menu at viewport coordinates. */
export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  hideMenu()
  if (items.length === 0) {
    return
  }

  const menu = document.createElement('div')
  menu.className = 'cell-context-menu'
  menu.setAttribute('role', 'menu')

  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.textContent = item.label
    button.addEventListener('click', () => {
      hideMenu()
      item.action()
    })
    menu.append(button)
  }

  document.body.append(menu)

  // Clamp to viewport after measuring.
  const rect = menu.getBoundingClientRect()
  const left = Math.min(x, window.innerWidth - rect.width - 4)
  const top = Math.min(y, window.innerHeight - rect.height - 4)
  menu.style.left = `${Math.max(0, left)}px`
  menu.style.top = `${Math.max(0, top)}px`

  menuElement = menu
  const first = menu.querySelector('button')
  first?.focus()
}
