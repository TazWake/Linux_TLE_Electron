import fs from 'fs'
import type { TimelineFormat } from '../shared/types'

export interface FileSession {
  fileId: string
  filePath: string
  fileName: string
  format: TimelineFormat
  headers: string[]
  offsets: BigInt64Array
  rowCount: number
  taggedRows: Set<number>
  tagsDirty: boolean
  fd: number
}

const sessions = new Map<string, FileSession>()

export function getSession(fileId: string): FileSession | undefined {
  return sessions.get(fileId)
}

export function setSession(session: FileSession): void {
  sessions.set(session.fileId, session)
}

export function getAllSessions(): FileSession[] {
  return [...sessions.values()]
}

export function deleteSession(fileId: string): FileSession | undefined {
  const session = sessions.get(fileId)
  if (session) {
    sessions.delete(fileId)
  }
  return session
}

export function hasUnsavedTags(): boolean {
  for (const session of sessions.values()) {
    if (session.tagsDirty) {
      return true
    }
  }
  return false
}

export function closeAllSessions(): void {
  for (const session of [...sessions.values()]) {
    try {
      fs.closeSync(session.fd)
    } catch {
      // file descriptor may already be closed
    }
    sessions.delete(session.fileId)
  }
}