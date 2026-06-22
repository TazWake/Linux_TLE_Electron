/* SPDX-License-Identifier: GPL-3.0-or-later */
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { hasUnsavedTags, closeAllSessions } from './fileSession'
import { pickAndOpenFile, registerIpcHandlers } from './ipcHandlers'
import { applyLinuxGpuCompat } from './linuxGpuCompat'
import { resolvePreloadPath } from './paths'
import { debugLog, errorLog } from './debugLog'

applyLinuxGpuCompat()

process.on('uncaughtException', (error) => {
  errorLog('main', 'uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  errorLog('main', 'unhandledRejection', reason)
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let allowClose = false

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function requestApplicationClose(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (allowClose) {
    mainWindow.close()
    return
  }

  if (!hasUnsavedTags()) {
    allowClose = true
    closeAllSessions()
    setImmediate(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close()
      }
    })
    return
  }

  mainWindow.webContents.send('app:request-close')
}

function createWindow(): void {
  const preloadPath = resolvePreloadPath()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false
    }
  })

  mainWindow.webContents.on('preload-error', (_event, failedPath, error) => {
    console.error(`Preload failed (${failedPath}):`, error)
  })

  console.log(`Using preload script: ${preloadPath}`)

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url) => {
    console.error(`Failed to load ${url}: ${errorCode} ${errorDescription}`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    errorLog('renderer', 'process gone', details)
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2 && message.includes('[ETV')) {
      console.error(`[renderer] ${message} (${sourceId}:${line})`)
    }
  })

  if (process.env.ETV_DEBUG === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Some Linux VMs never emit ready-to-show when GPU compositing fails.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('Forcing window visible after GPU/ready-to-show timeout')
      mainWindow.show()
    }
  }, 3000)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', (event) => {
    if (allowClose) {
      return
    }
    event.preventDefault()
    requestApplicationClose()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    allowClose = false
  })
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open…',
          accelerator: 'Ctrl+O',
          click: () => {
            void (async () => {
              const window = getMainWindow()
              if (!window) {
                return
              }
              const metadata = await pickAndOpenFile(window)
              if (metadata) {
                window.webContents.send('file:opened', metadata)
              }
            })()
          }
        },
        {
          label: 'Save Tags',
          accelerator: 'Ctrl+S',
          id: 'save-tags',
          enabled: false,
          click: () => mainWindow?.webContents.send('menu:save-tags')
        },
        {
          label: 'Close Tab',
          accelerator: 'Ctrl+W',
          click: () => mainWindow?.webContents.send('menu:close-tab')
        },
        { type: 'separator' },
        {
          label: 'Exit',
          click: () => requestApplicationClose()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Increase Font Size',
          accelerator: 'Ctrl+=',
          click: () => mainWindow?.webContents.send('menu:increase-font')
        },
        {
          label: 'Decrease Font Size',
          accelerator: 'Ctrl+-',
          click: () => mainWindow?.webContents.send('menu:decrease-font')
        },
        {
          label: 'Reset Font Size',
          accelerator: 'Ctrl+0',
          click: () => mainWindow?.webContents.send('menu:reset-font')
        }
      ]
    },
    {
      label: 'Search',
      submenu: [
        {
          label: 'Search in Current Tab…',
          accelerator: 'Ctrl+F',
          click: () => mainWindow?.webContents.send('menu:search-current')
        },
        {
          label: 'Search in All Tabs…',
          click: () => mainWindow?.webContents.send('menu:search-all')
        },
        {
          label: 'Clear Search',
          click: () => mainWindow?.webContents.send('menu:clear-search')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function setSaveTagsMenuEnabled(enabled: boolean): void {
  const menu = Menu.getApplicationMenu()
  const item = menu?.getMenuItemById('save-tags')
  if (item) {
    item.enabled = enabled
  }
}

app.whenReady().then(() => {
  debugLog('startup', 'app ready', {
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    display: process.env.DISPLAY,
    userData: app.getPath('userData')
  })

  registerIpcHandlers(getMainWindow, () => {
    allowClose = true
    mainWindow?.close()
  })

  ipcMain.on('app:set-save-tags-enabled', (_event, enabled: boolean) => {
    setSaveTagsMenuEnabled(Boolean(enabled))
  })

  ipcMain.on('renderer:error', (_event, scope: unknown, message: unknown) => {
    errorLog('renderer', String(scope), String(message))
  })

  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('child-process-gone', (_event, details) => {
  console.error('Child process exited:', details)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
