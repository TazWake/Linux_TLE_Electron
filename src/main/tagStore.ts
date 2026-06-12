import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { TagsFile } from '../shared/types'

export function sanitizeTagFilename(fileName: string): string {
  const base = path.basename(fileName)
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_')
  return sanitized.slice(0, 200)
}

function tagsDirectory(): string {
  const dir = path.join(app.getPath('userData'), 'tags')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function tagsFilePath(fileName: string): string {
  return path.join(tagsDirectory(), `${sanitizeTagFilename(fileName)}.tags.json`)
}

export function loadTags(filePath: string, fileName: string): Set<number> {
  const tagPath = tagsFilePath(fileName)
  if (!fs.existsSync(tagPath)) {
    return new Set()
  }

  try {
    const raw = fs.readFileSync(tagPath, 'utf8')
    const data = JSON.parse(raw) as TagsFile
    if (data.sourceFile !== filePath) {
      return new Set()
    }
    return new Set(data.taggedRows)
  } catch {
    return new Set()
  }
}

export function saveTags(
  filePath: string,
  fileName: string,
  taggedRows: Set<number>
): void {
  const tagPath = tagsFilePath(fileName)
  const payload: TagsFile = {
    sourceFile: filePath,
    taggedRows: [...taggedRows].sort((a, b) => a - b)
  }

  const tempPath = `${tagPath}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8')
  fs.renameSync(tempPath, tagPath)
}
