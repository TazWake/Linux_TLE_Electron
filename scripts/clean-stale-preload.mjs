#!/usr/bin/env node
/**
 * Remove stale preload/index.js left from older builds.
 * With "type": "module", Electron treats .js as ESM and a CJS preload bundle fails to load.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const stalePreload = path.join(root, '..', 'out', 'preload', 'index.js')

if (fs.existsSync(stalePreload)) {
  fs.unlinkSync(stalePreload)
  console.log('Removed stale out/preload/index.js')
}
