import { app, BrowserWindow, Menu, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerIpcHandlers } from './ipcHandlers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
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
          click: () => mainWindow?.webContents.send('menu:open-file')
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
          click: () => app.quit()
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

app.whenReady().then(() => {
  registerIpcHandlers(() => mainWindow)
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
