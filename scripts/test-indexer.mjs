#!/usr/bin/env node
import { Worker } from 'worker_threads'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainDir = path.join(root, 'out/main')
const workerFile = fs.readdirSync(mainDir).find((name) => name.startsWith('fileIndexer-'))
if (!workerFile) {
  console.error('No fileIndexer worker in out/main — run npm run build:app first')
  process.exit(1)
}

const workerPath = path.join(mainDir, workerFile)
const csv = process.argv[2] ?? path.join(root, 'test_files/FILESYSTEM.csv')

const worker = new Worker(workerPath, {
  workerData: { filePath: csv, fileId: 'test' }
})

worker.on('message', (message) => {
  if (message.type === 'complete') {
    const bad = message.offsets?.findIndex((value) => value === undefined)
    console.log('complete', {
      rowCount: message.rowCount,
      offsetsLength: message.offsets?.length,
      firstOffset: message.offsets?.[0],
      badIndex: bad
    })
    process.exit(0)
  }
  if (message.type === 'error') {
    console.error('error', message.message)
    process.exit(1)
  }
  console.log('progress', message.linesIndexed)
})

worker.on('error', (error) => {
  console.error('worker error', error)
  process.exit(1)
})
