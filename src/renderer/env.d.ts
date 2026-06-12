/// <reference types="electron-vite/node" />

import type { ElectronApi } from '../preload/index'

declare global {
  interface Window {
    api: ElectronApi
  }
}

export {}
