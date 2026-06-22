#!/usr/bin/env node
/**
 * Post-install: download the Electron binary and print a short note about
 * expected npm warnings so developers do not mistake them for app defects.
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronInstall = path.join(root, 'node_modules', 'electron', 'install.js')

const result = spawnSync(process.execPath, [electronInstall], {
  cwd: root,
  stdio: 'inherit'
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log('')
console.log(
  'Install complete. npm "deprecated" messages for rimraf, glob, or boolean (if shown) ' +
    'come from Electron build tools used only during development and packaging — ' +
    'they are not included in the shipped timeline viewer.'
)
console.log('')
