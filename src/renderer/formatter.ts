import { findEmbeddedJson, findEmbeddedXml } from '../shared/embedded'

function prettyPrintXml(doc: Document): string {
  const serializer = new XMLSerializer()
  const raw = serializer.serializeToString(doc)

  let formatted = ''
  let indent = 0
  const parts = raw.replace(/>\s*</g, '><').split(/(?=<)/)

  for (const part of parts) {
    if (part.match(/^<\/\w/)) {
      indent = Math.max(indent - 1, 0)
    }

    formatted += `${'  '.repeat(indent)}${part.trim()}\n`

    if (part.match(/^<\w[^>]*[^/]>.*$/) && !part.endsWith('/>')) {
      indent++
    }
  }

  return formatted.trimEnd()
}

function tryFormatXml(candidate: string): string | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(candidate, 'application/xml')
    if (!doc.querySelector('parsererror')) {
      return prettyPrintXml(doc)
    }
  } catch {
    // not valid XML
  }
  return null
}

function tryFormatJson(candidate: string): string | null {
  try {
    return JSON.stringify(JSON.parse(candidate), null, 2)
  } catch {
    return null
  }
}

/**
 * Pretty-print a field value for the detail panel.
 *
 * Order of attempts:
 * 1. The whole value is JSON or XML.
 * 2. A JSON or XML payload is embedded inside surrounding text (e.g. a
 *    Sysmon-for-Linux journal message wrapping an <Event> document) — the
 *    payload is pretty-printed in place, surrounding text preserved.
 * 3. Otherwise the raw value is returned unchanged.
 */
export function formatFieldContent(raw: string): string {
  const trimmed = raw.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const whole = tryFormatJson(trimmed)
    if (whole) {
      return whole
    }
  }

  if (trimmed.startsWith('<')) {
    const whole = tryFormatXml(trimmed)
    if (whole) {
      return whole
    }
  }

  const xmlSpan = findEmbeddedXml(raw)
  if (xmlSpan) {
    const formatted = tryFormatXml(raw.slice(xmlSpan.start, xmlSpan.end))
    if (formatted) {
      const prefix = raw.slice(0, xmlSpan.start).trimEnd()
      const suffix = raw.slice(xmlSpan.end).trimStart()
      return [prefix, formatted, suffix].filter((part) => part.length > 0).join('\n\n')
    }
  }

  const jsonSpan = findEmbeddedJson(raw)
  if (jsonSpan) {
    const formatted = tryFormatJson(raw.slice(jsonSpan.start, jsonSpan.end))
    if (formatted) {
      const prefix = raw.slice(0, jsonSpan.start).trimEnd()
      const suffix = raw.slice(jsonSpan.end).trimStart()
      return [prefix, formatted, suffix].filter((part) => part.length > 0).join('\n\n')
    }
  }

  return raw
}
