#!/usr/bin/env node
/**
 * Smoke test for ElectronTimelineViewer.
 * Validates CSV fixtures, compiles the app, and briefly launches Electron.
 *
 * Usage: node scripts/smoke-test.mjs
 * Changelog: 1.0 — initial smoke test
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const FILESYSTEM_HEADER = 'Date,Size,Type,Mode,UID,GID,Meta,File Name'
const SUPER_HEADER =
  'datetime,timestamp_desc,source,source_long,message,parser,display_name,tag'

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exitCode = 1
}

function pass(message) {
  console.log(`PASS: ${message}`)
}

function readFirstLine(filePath) {
  const buffer = fs.readFileSync(filePath)
  const text = buffer.toString('utf8')
  const newlineIndex = text.indexOf('\n')
  const line = newlineIndex < 0 ? text : text.slice(0, newlineIndex)
  return line.replace(/^\uFEFF/, '').replace(/\r$/, '').trim()
}

function parseCsvLine(line) {
  const records = parse(line.replace(/\r$/, ''), {
    relax_column_count: true,
    skip_empty_lines: false,
    bom: true
  })
  return records[0] ?? []
}

function detectFormat(headerLine) {
  if (headerLine === FILESYSTEM_HEADER) {
    return 'filesystem'
  }
  if (headerLine === SUPER_HEADER) {
    return 'super'
  }
  return null
}

function runBuildApp() {
  console.log('\nBuilding application (npm run build:app)...')
  const result = spawnSync('npm', ['run', 'build:app'], {
    cwd: root,
    stdio: 'inherit',
    shell: true
  })
  if (result.status !== 0) {
    fail('npm run build:app exited with a non-zero status')
    return false
  }
  pass('npm run build:app completed')
  return true
}

function verifyBuildOutput() {
  const required = ['out/main/index.js', 'out/renderer/index.html']
  const preloadCandidates = [
    'out/preload/index.js',
    'out/preload/index.mjs',
    'out/preload/index.cjs'
  ]

  for (const relativePath of required) {
    const fullPath = path.join(root, relativePath)
    if (!fs.existsSync(fullPath)) {
      fail(`Missing build artifact: ${relativePath}`)
      return false
    }
  }

  const preloadFound = preloadCandidates.some((relativePath) =>
    fs.existsSync(path.join(root, relativePath))
  )
  if (!preloadFound) {
    fail(`Missing preload bundle (expected one of: ${preloadCandidates.join(', ')})`)
    return false
  }

  pass('Build artifacts present in out/')
  return true
}

function verifyCsvFixtures() {
  console.log('\nValidating test CSV fixtures...')

  const filesystemPath = path.join(root, 'test_files', 'FILESYSTEM.csv')
  const superPath = path.join(root, 'test_files', 'SUPER.csv')

  for (const filePath of [filesystemPath, superPath]) {
    if (!fs.existsSync(filePath)) {
      fail(`Missing fixture: ${filePath}`)
      return false
    }
  }

  const filesystemHeader = readFirstLine(filesystemPath)
  const superHeader = readFirstLine(superPath)

  if (detectFormat(filesystemHeader) !== 'filesystem') {
    fail('FILESYSTEM.csv header does not match expected layout')
    return false
  }
  pass('FILESYSTEM.csv format detected')

  if (detectFormat(superHeader) !== 'super') {
    fail('SUPER.csv header does not match expected layout')
    return false
  }
  pass('SUPER.csv format detected')

  const filesystemRows = fs
    .readFileSync(filesystemPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const sampleFilesystem = parseCsvLine(filesystemRows[1])
  if (sampleFilesystem.length < 8) {
    fail('FILESYSTEM.csv data row did not parse into expected columns')
    return false
  }
  if (!sampleFilesystem[7].includes('OrphanFile')) {
    fail('FILESYSTEM.csv quoted field parsing failed')
    return false
  }
  pass('FILESYSTEM.csv quoted comma parsing works')

  const superRows = fs
    .readFileSync(superPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const sampleSuper = parseCsvLine(superRows[1])
  if (sampleSuper.length < 8) {
    fail('SUPER.csv data row did not parse into expected columns')
    return false
  }
  pass('SUPER.csv row parsing works')

  return true
}

function findPackagedExecutable() {
  for (const folder of ['release', 'dist']) {
    const distDir = path.join(root, folder)
    if (!fs.existsSync(distDir)) {
      continue
    }

    const entries = fs.readdirSync(distDir)
    const portableExe = entries.find(
      (name) => name.endsWith('.exe') && name.includes('ElectronTimelineViewer')
    )
    if (portableExe) {
      return path.join(distDir, portableExe)
    }

    const unpackedExe = path.join(distDir, 'win-unpacked', 'ElectronTimelineViewer.exe')
    if (fs.existsSync(unpackedExe)) {
      return unpackedExe
    }
  }

  return null
}

function resolveElectronLaunch() {
  try {
    const electronPath = path.join(
      root,
      'node_modules',
      'electron',
      'dist',
      process.platform === 'win32' ? 'electron.exe' : 'electron'
    )
    if (fs.existsSync(electronPath)) {
      return {
        command: electronPath,
        args: [path.join(root, 'out', 'main', 'index.js')],
        label: 'development Electron binary'
      }
    }
  } catch {
    // fall through to packaged build
  }

  const packaged = findPackagedExecutable()
  if (packaged) {
    return { command: packaged, args: [], label: 'packaged executable' }
  }

  return null
}

function launchElectronBriefly() {
  return new Promise((resolve) => {
    console.log('\nLaunching application briefly to verify startup...')

    const launch = resolveElectronLaunch()
    if (!launch) {
      console.log(
        'SKIP: No Electron binary or packaged build found. Run npm run build first, or reinstall electron.'
      )
      resolve(true)
      return
    }

    console.log(`Using ${launch.label}: ${launch.command}`)

    const child = spawn(launch.command, launch.args, {
      cwd: root,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: false
    })

    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      pass('Electron process started and ran for 4 seconds')
      resolve(true)
    }, 4000)

    child.on('error', (error) => {
      clearTimeout(timeout)
      fail(`Unable to launch Electron: ${error.message}`)
      resolve(false)
    })

    child.on('exit', (code, signal) => {
      clearTimeout(timeout)
      if (signal === 'SIGTERM') {
        resolve(true)
        return
      }
      if (code !== 0 && code !== null) {
        fail(`Electron exited early with code ${code}: ${stderr.trim()}`)
        resolve(false)
        return
      }
      pass('Electron exited cleanly')
      resolve(true)
    })
  })
}

async function main() {
  console.log('ElectronTimelineViewer smoke test\n')

  let ok = verifyCsvFixtures()
  if (!ok) {
    process.exit(process.exitCode ?? 1)
  }

  ok = runBuildApp()
  if (!ok) {
    process.exit(process.exitCode ?? 1)
  }

  ok = verifyBuildOutput()
  if (!ok) {
    process.exit(process.exitCode ?? 1)
  }

  ok = await launchElectronBriefly()
  if (!ok) {
    process.exit(process.exitCode ?? 1)
  }

  console.log('\nSmoke test finished successfully.')
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
