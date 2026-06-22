import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function isUsablePreloadFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false
  }

  // With "type": "module", plain .js preload is loaded as ESM and breaks CJS bundles.
  if (filePath.endsWith('.js') && !filePath.endsWith('.cjs')) {
    return false
  }

  return true
}

/**
 * Resolve the preload bundle path for dev and production builds.
 */
export function resolvePreloadPath(): string {
  const preloadDir = path.join(__dirname, '../preload')
  const candidates = [
    process.env.ELECTRON_PRELOAD,
    path.join(preloadDir, 'index.mjs'),
    path.join(preloadDir, 'index.cjs')
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (isUsablePreloadFile(candidate)) {
      return candidate
    }
  }

  return path.join(preloadDir, 'index.mjs')
}
