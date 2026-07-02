import type { TagUpdate, SaveTagsRequest } from '../../shared/types'
import { getSession } from '../fileSession'
import { saveTags } from '../tagStore'
import { errorLog } from '../debugLog'
import { showErrorBox } from './context'

export function updateTag(update: TagUpdate): boolean {
  const session = getSession(update.fileId)
  if (!session) {
    errorLog('tags', `no session for fileId ${update.fileId}`)
    return false
  }

  if (update.tagged) {
    session.taggedRows.add(update.rowIndex)
  } else {
    session.taggedRows.delete(update.rowIndex)
  }
  session.tagsDirty = true
  return true
}

export function saveTagsForFile(request: SaveTagsRequest): boolean {
  const session = getSession(request.fileId)
  if (!session) {
    errorLog('tags', `no session for fileId ${request.fileId}`)
    return false
  }

  try {
    saveTags(session.filePath, session.fileName, session.taggedRows)
    session.tagsDirty = false
    return true
  } catch (error) {
    errorLog('tags', 'save tags failed', error)
    showErrorBox(
      'Unable to Save Tags',
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}
