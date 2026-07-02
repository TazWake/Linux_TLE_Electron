import { app } from 'electron'
import type { CommandName, CommandMap } from '../../shared/commands'
import type { RowRange, SearchRequest, TagUpdate, SaveTagsRequest } from '../../shared/types'
import { getAllSessions } from '../fileSession'
import { openFile, listFiles, getRows, closeFile } from './files'
import { searchFile, searchAll } from './search'
import { updateTag, saveTagsForFile } from './tags'
import { loadColorRulesXml } from './rules'

export { setCommandContext } from './context'
export { openFile, listFiles, getRows, closeFile } from './files'
export { searchFile, searchAll } from './search'
export { updateTag, saveTagsForFile } from './tags'
export { ensureColorRulesFile, loadColorRulesXml } from './rules'

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

type Handlers = {
  [K in CommandName]: (payload: unknown) => Promise<CommandMap[K]['response']>
}

const handlers: Handlers = {
  'app.status': async () => ({
    version: app.getVersion(),
    openFiles: getAllSessions().length
  }),
  'file.open': async (payload) => {
    const request = requireObject(payload, 'file.open payload')
    return openFile(requireString(request.filePath, 'filePath'))
  },
  'file.list': async () => listFiles(),
  'file.getRows': async (payload) => {
    const range = requireObject(payload, 'file.getRows payload') as unknown as RowRange
    requireString(range.fileId, 'fileId')
    return getRows(range)
  },
  'file.search': async (payload) => {
    const request = requireObject(payload, 'file.search payload') as unknown as SearchRequest
    requireString(request.fileId, 'fileId')
    requireString(request.term, 'term')
    return searchFile(request)
  },
  'search.all': async (payload) => {
    const request = requireObject(payload, 'search.all payload')
    return searchAll(requireString(request.term, 'term'))
  },
  'tag.update': async (payload) => {
    const update = requireObject(payload, 'tag.update payload') as unknown as TagUpdate
    requireString(update.fileId, 'fileId')
    return { ok: updateTag(update) }
  },
  'tag.save': async (payload) => {
    const request = requireObject(payload, 'tag.save payload') as unknown as SaveTagsRequest
    requireString(request.fileId, 'fileId')
    return { saved: saveTagsForFile(request) }
  },
  'file.close': async (payload) => {
    const request = requireObject(payload, 'file.close payload')
    return { closed: closeFile(requireString(request.fileId, 'fileId')) }
  },
  'rules.load': async () => ({ xml: loadColorRulesXml() })
}

export function isCommandName(name: string): name is CommandName {
  return Object.prototype.hasOwnProperty.call(handlers, name)
}

/**
 * Single entry point for every command. The renderer's command:invoke IPC
 * channel and any future HTTP/MCP adapter dispatch through here.
 */
export async function dispatchCommand(name: string, payload: unknown): Promise<unknown> {
  if (!isCommandName(name)) {
    throw new Error(`Unknown command: ${name}`)
  }
  return handlers[name](payload)
}
