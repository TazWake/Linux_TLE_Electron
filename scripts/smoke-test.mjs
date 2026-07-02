#!/usr/bin/env node
/**
 * Smoke test for ElectronTimelineViewer.
 *
 * What it does and why:
 * 1. Compiles the shared modules (format detection, CSV parsing, colour
 *    rules, embedded-payload extraction) to a temp folder and tests the REAL
 *    code, so the test cannot drift from the implementation.
 * 2. Validates the CSV fixtures against those modules.
 * 3. Builds the app, checks the build artifacts, runs the line indexer
 *    worker, and briefly launches Electron to verify startup.
 *
 * Usage: node scripts/smoke-test.mjs
 * Changelog:
 *   2.0 — test real shared modules; generic/super-dynamic fixtures; colour
 *         rule and embedded JSON/XML extraction coverage
 *   1.0 — initial smoke test
 */

import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const sharedOutDir = path.join(root, '.smoke-shared')
const require = createRequire(import.meta.url)

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exitCode = 1
}

function pass(message) {
  console.log(`PASS: ${message}`)
}

function readFirstLine(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const newlineIndex = text.indexOf('\n')
  const line = newlineIndex < 0 ? text : text.slice(0, newlineIndex)
  return line.replace(/^\uFEFF/, '').replace(/\r$/, '').trim()
}

/**
 * Compile src/shared to CommonJS in a temp folder so this Node script can
 * exercise the same code the app ships, instead of a hand-copied replica.
 */
function compileSharedModules() {
  console.log('Compiling src/shared for testing...')
  fs.rmSync(sharedOutDir, { recursive: true, force: true })

  const result = spawnSync(
    'npx',
    [
      'tsc',
      'src/shared/constants.ts',
      'src/shared/types.ts',
      'src/shared/csv.ts',
      'src/shared/formatDetection.ts',
      'src/shared/colorRules.ts',
      'src/shared/embedded.ts',
      '--module', 'commonjs',
      '--moduleResolution', 'node',
      '--target', 'es2022',
      '--esModuleInterop',
      '--skipLibCheck',
      '--outDir', sharedOutDir
    ],
    { cwd: root, shell: true, encoding: 'utf8' }
  )

  if (result.status !== 0) {
    fail(`Unable to compile shared modules:\n${result.stdout}\n${result.stderr}`)
    return null
  }

  // The repo root package.json declares "type": "module", so plain .js output
  // would be treated as ESM. Mark the temp folder as CommonJS to match tsc's
  // --module commonjs output.
  fs.writeFileSync(
    path.join(sharedOutDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }),
    'utf8'
  )

  pass('Shared modules compiled')
  return {
    formatDetection: require(path.join(sharedOutDir, 'formatDetection.js')),
    csv: require(path.join(sharedOutDir, 'csv.js')),
    colorRules: require(path.join(sharedOutDir, 'colorRules.js')),
    embedded: require(path.join(sharedOutDir, 'embedded.js'))
  }
}

function verifyFormatDetection(shared) {
  console.log('\nValidating format detection...')
  const { detectFormat } = shared.formatDetection

  const cases = [
    ['Date,Size,Type,Mode,UID,GID,Meta,File Name', 'filesystem'],
    ['datetime,timestamp_desc,source,source_long,message,parser,display_name,tag', 'super'],
    // Super timelines have user-configurable (dynamic) headers: extra
    // columns and different order must still classify as super.
    ['datetime,timestamp_desc,source,source_long,message,parser,display_name,tag,hostname,username', 'super'],
    ['message,source,datetime,timestamp_desc', 'super'],
    ['Timestamp,Host,EventID,Message', 'generic'],
    ['just_one_column', null],
    ['', null]
  ]

  for (const [header, expected] of cases) {
    const actual = detectFormat(header)
    if (actual !== expected) {
      fail(`detectFormat(${JSON.stringify(header)}) returned ${actual}, expected ${expected}`)
      return false
    }
  }

  pass('Format detection (filesystem / super / super-dynamic / generic / rejects)')
  return true
}

function verifyCsvParsing(shared) {
  console.log('\nValidating CSV parsing and fallback...')
  const { parseCsvLine } = shared.csv
  const { flexColumnIndex } = shared.formatDetection

  const headers = 'datetime,timestamp_desc,source,source_long,message,parser,display_name,tag'.split(',')
  const flexIndex = flexColumnIndex(headers)
  if (flexIndex !== 4) {
    fail(`flexColumnIndex should locate the message column (got ${flexIndex})`)
    return false
  }

  // Unquoted embedded quotes and commas in the message field: the strict
  // parser cannot split this row, so the flexible-column fallback must.
  const badRow =
    '2023-03-15T00:02:44+00:00,Event Time,EVT,Sysmon,Process <Data Name="Image">/usr/bin/nc, extra</Data>,sysmon,journal,'
  const cells = parseCsvLine(badRow, headers.length, flexIndex)
  if (cells.length !== headers.length) {
    fail(`Fallback parse returned ${cells.length} fields, expected ${headers.length}`)
    return false
  }
  if (!cells[4].includes('Image') || !cells[4].includes(', extra')) {
    fail('Fallback parse did not keep the malformed message field intact')
    return false
  }

  pass('Flexible-column fallback parsing works')
  return true
}

function verifyColorRules(shared) {
  console.log('\nValidating colour rule parsing...')
  const { parseColorRulesXml, ruleMatchesRow, EXAMPLE_COLOR_RULES_XML } = shared.colorRules

  const xml = `<?xml version="1.0"?>
<ColorRules>
  <Rule name="Deleted" column="File Name" match="contains" value="(deleted)" background="#ffe0e0"/>
  <Rule name="Regex" column="*" match="regex" value="nc -l\\S*p \\d+" background="#fff0c0" foreground="#5c3d00"/>
  <Rule name="Bad regex" column="*" match="regex" value="([" background="#ffffff"/>
  <Rule name="No colours" column="*" value="x"/>
</ColorRules>`

  const { rules, errors } = parseColorRulesXml(xml)
  if (rules.length !== 2) {
    fail(`Expected 2 valid rules, got ${rules.length}`)
    return false
  }
  if (errors.length !== 2) {
    fail(`Expected 2 rejected rules (bad regex, no colours), got ${errors.length}`)
    return false
  }

  const headers = ['File Name', 'Message']
  const fields = ['File_Name', 'Message']
  const matchDeleted = ruleMatchesRow(rules[0], headers, fields, {
    File_Name: '/home/user/evil.sh (deleted)',
    Message: ''
  })
  const matchRegex = ruleMatchesRow(rules[1], headers, fields, {
    File_Name: '/bin/nc',
    Message: 'spawned nc -lvp 4444 on host'
  })
  if (!matchDeleted || !matchRegex) {
    fail('Colour rules did not match expected rows')
    return false
  }

  const example = parseColorRulesXml(EXAMPLE_COLOR_RULES_XML)
  if (example.errors.length > 0) {
    fail(`Example colorrules.xml produced parse errors: ${example.errors.join('; ')}`)
    return false
  }

  pass('Colour rule parsing, validation, and matching work')
  return true
}

function verifyEmbeddedExtraction(shared) {
  console.log('\nValidating embedded JSON/XML extraction...')
  const { findEmbeddedXml, findEmbeddedJson } = shared.embedded

  const xmlText =
    'Process created <Event><System><EventID>1</EventID></System></Event> on host web01'
  const xmlSpan = findEmbeddedXml(xmlText)
  if (!xmlSpan || xmlText.slice(xmlSpan.start, xmlSpan.end) !== '<Event><System><EventID>1</EventID></System></Event>') {
    fail('findEmbeddedXml did not locate the <Event> payload')
    return false
  }

  const jsonText = 'A service was installed: {"name":"updater","args":["-q, -s"]} by admin'
  const jsonSpan = findEmbeddedJson(jsonText)
  if (!jsonSpan) {
    fail('findEmbeddedJson did not locate the JSON payload')
    return false
  }
  const jsonSlice = jsonText.slice(jsonSpan.start, jsonSpan.end)
  try {
    const parsed = JSON.parse(jsonSlice)
    if (parsed.name !== 'updater') {
      fail('Extracted JSON payload did not parse to expected object')
      return false
    }
  } catch {
    fail(`Extracted JSON slice is not valid JSON: ${jsonSlice}`)
    return false
  }

  pass('Embedded XML and JSON payload extraction works')
  return true
}

function verifyCsvFixtures(shared) {
  console.log('\nValidating test CSV fixtures...')
  const { detectFormat } = shared.formatDetection
  const { parseCsvLine } = shared.csv

  const fixtures = [
    ['FILESYSTEM.csv', 'filesystem'],
    ['SUPER.csv', 'super'],
    ['SUPER_DYNAMIC.csv', 'super'],
    ['GENERIC.csv', 'generic']
  ]

  for (const [name, expectedFormat] of fixtures) {
    const filePath = path.join(root, 'test_files', name)
    if (!fs.existsSync(filePath)) {
      fail(`Missing fixture: ${filePath}`)
      return false
    }
    const format = detectFormat(readFirstLine(filePath))
    if (format !== expectedFormat) {
      fail(`${name} detected as ${format}, expected ${expectedFormat}`)
      return false
    }
  }
  pass('All fixtures detected with expected formats')

  const filesystemRows = fs
    .readFileSync(path.join(root, 'test_files', 'FILESYSTEM.csv'), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const sampleFilesystem = parseCsvLine(filesystemRows[1])
  if (sampleFilesystem.length < 8 || !sampleFilesystem[7].includes('OrphanFile')) {
    fail('FILESYSTEM.csv quoted field parsing failed')
    return false
  }
  pass('FILESYSTEM.csv quoted comma parsing works')

  const superRows = fs
    .readFileSync(path.join(root, 'test_files', 'SUPER.csv'), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const sysmonRow = parseCsvLine(superRows[3], 8, 4)
  if (sysmonRow.length < 8 || !sysmonRow[4].includes('<Event>')) {
    fail('SUPER.csv Sysmon/XML message row was truncated or misparsed')
    return false
  }
  pass('SUPER.csv Sysmon/XML message row parsing works')

  const dynamicRows = fs
    .readFileSync(path.join(root, 'test_files', 'SUPER_DYNAMIC.csv'), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const dynamicHeader = parseCsvLine(dynamicRows[0])
  const dynamicSample = parseCsvLine(dynamicRows[3], dynamicHeader.length, 4)
  if (dynamicSample.length !== dynamicHeader.length) {
    fail('SUPER_DYNAMIC.csv row did not parse to the dynamic column count')
    return false
  }
  pass('SUPER_DYNAMIC.csv dynamic-column row parsing works')

  return true
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
  const preloadCandidates = ['out/preload/index.mjs', 'out/preload/index.cjs']

  for (const relativePath of required) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      fail(`Missing build artifact: ${relativePath}`)
      return false
    }
  }

  if (!preloadCandidates.some((p) => fs.existsSync(path.join(root, p)))) {
    fail(`Missing preload bundle (expected one of: ${preloadCandidates.join(', ')})`)
    return false
  }

  pass('Build artifacts present in out/')
  return true
}

function verifyIndexerWorker() {
  console.log('\nValidating line indexer worker...')

  const mainDir = path.join(root, 'out', 'main')
  if (!fs.existsSync(mainDir)) {
    fail('out/main missing — cannot test indexer')
    return false
  }

  const workerFile = fs.readdirSync(mainDir).find((name) => name.startsWith('fileIndexer-'))
  if (!workerFile) {
    fail('fileIndexer worker bundle missing from out/main')
    return false
  }

  const csvPath = path.join(root, 'test_files', 'FILESYSTEM.csv')
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'test-indexer.mjs'), csvPath],
    { cwd: root, encoding: 'utf8' }
  )

  if (result.status !== 0) {
    fail(`Indexer worker failed: ${(result.stdout + result.stderr).trim()}`)
    return false
  }

  pass('Line indexer worker indexes FILESYSTEM.csv')
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

function cleanup() {
  fs.rmSync(sharedOutDir, { recursive: true, force: true })
}

async function main() {
  console.log('ElectronTimelineViewer smoke test\n')

  const shared = compileSharedModules()
  if (!shared) {
    process.exit(process.exitCode ?? 1)
  }

  const unitChecks = [
    () => verifyFormatDetection(shared),
    () => verifyCsvParsing(shared),
    () => verifyColorRules(shared),
    () => verifyEmbeddedExtraction(shared),
    () => verifyCsvFixtures(shared)
  ]

  for (const check of unitChecks) {
    if (!check()) {
      cleanup()
      process.exit(process.exitCode ?? 1)
    }
  }

  for (const step of [runBuildApp, verifyBuildOutput, verifyIndexerWorker]) {
    if (!step()) {
      cleanup()
      process.exit(process.exitCode ?? 1)
    }
  }

  const launched = await launchElectronBriefly()
  cleanup()
  if (!launched) {
    process.exit(process.exitCode ?? 1)
  }

  console.log('\nSmoke test finished successfully.')
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
  cleanup()
  process.exit(1)
})
