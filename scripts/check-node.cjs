#!/usr/bin/env node
/**
 * Fail fast before npm downloads packages when Node is too old.
 * Uses CommonJS so this runs on the distro Node 12 often found on SIFT/Ubuntu.
 */

'use strict'

const MIN_MAJOR = 20
const MIN_MINOR = 19
const MIN_PATCH = 0

function parseNodeVersion(versionString) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(versionString)
  if (!match) {
    return null
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}

function versionAtLeast(parsed, major, minor, patch) {
  if (parsed.major !== major) {
    return parsed.major > major
  }
  if (parsed.minor !== minor) {
    return parsed.minor > minor
  }
  return parsed.patch >= patch
}

const parsed = parseNodeVersion(process.versions.node)
if (!parsed) {
  console.error('Could not parse Node version:', process.versions.node)
  process.exit(1)
}

if (versionAtLeast(parsed, MIN_MAJOR, MIN_MINOR, MIN_PATCH)) {
  process.exit(0)
}

console.error('')
console.error('Electron Timeline Viewer requires Node.js >= 20.19.0 (22 LTS recommended).')
console.error('Current version:', process.versions.node)
console.error('Node executable:', process.execPath)
console.error('')
console.error('On SIFT Workstation and many Ubuntu systems, /usr/bin/node is Node 12 from apt.')
console.error('That version cannot build or run this project.')
console.error('')
console.error('If you continue anyway, Electron install often fails with:')
console.error("  SyntaxError: Unexpected token '?'")
console.error('')
console.error('Install a supported Node with nvm, then retry:')
console.error('  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash')
console.error('  source ~/.bashrc')
console.error('  nvm install 22')
console.error('  nvm use 22')
console.error('  node -v')
console.error('  rm -rf node_modules')
console.error('  npm install')
console.error('')
console.error('From this project directory you can also run: nvm install && nvm use')
console.error('')

process.exit(1)
