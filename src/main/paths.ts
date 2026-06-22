import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Resolve the preload bundle path for dev and production builds.
 * electron-vite may emit .js, .mjs, or .cjs depending on config and mode.
 */
export function resolvePreloadPath(): string {
  const candidates = [
    process.env.ELECTRON_PRELOAD,
    path.join(__dirname, '../preload/index.js'),
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, '../preload/index.cjs')
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return path.join(__dirname, '../preload/index.js')
}
