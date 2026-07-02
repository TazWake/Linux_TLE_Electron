/**
 * Locate structured payloads (JSON or XML) embedded inside a larger text
 * value, e.g. a Sysmon-for-Linux journal message that wraps an <Event> XML
 * document in prose. Extraction is span-based so callers can pretty-print the
 * payload while preserving the surrounding text.
 */

export interface EmbeddedSpan {
  start: number
  end: number
}

const XML_OPEN_TAG = /<([A-Za-z_][\w.-]*)[\s/>]/

/**
 * Find the outermost embedded XML element: the first opening tag and the last
 * matching close tag for that element name. Returns null when no plausible
 * element exists. Callers should still validate the slice with a real parser.
 */
export function findEmbeddedXml(text: string): EmbeddedSpan | null {
  const openMatch = XML_OPEN_TAG.exec(text)
  if (!openMatch) {
    return null
  }

  const name = openMatch[1]
  const start = openMatch.index

  const closeTag = `</${name}>`
  const closeIndex = text.lastIndexOf(closeTag)
  if (closeIndex > start) {
    return { start, end: closeIndex + closeTag.length }
  }

  // Self-closing single element (<Name ... />)
  const selfCloseEnd = text.indexOf('/>', start)
  const nextOpen = text.indexOf('<', start + 1)
  if (selfCloseEnd > start && (nextOpen < 0 || selfCloseEnd < nextOpen)) {
    return { start, end: selfCloseEnd + 2 }
  }

  return null
}

/**
 * Find a balanced JSON object or array embedded in text by brace matching
 * with string/escape awareness. Tries the first few candidate start points.
 */
export function findEmbeddedJson(text: string): EmbeddedSpan | null {
  const maxCandidates = 10
  let candidates = 0

  for (let index = 0; index < text.length && candidates < maxCandidates; index++) {
    const char = text[index]
    if (char !== '{' && char !== '[') {
      continue
    }
    candidates++

    const end = scanBalanced(text, index)
    if (end > index + 1) {
      return { start: index, end }
    }
  }

  return null
}

function scanBalanced(text: string, start: number): number {
  // Depth counts both bracket kinds; the caller validates the slice with
  // JSON.parse, so strict kind-matching here would be redundant.
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < text.length; index++) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      depth++
    } else if (char === '}' || char === ']') {
      depth--
      if (depth === 0) {
        return index + 1
      }
      if (depth < 0) {
        return -1
      }
    }
  }

  return -1
}
