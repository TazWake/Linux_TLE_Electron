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

export function formatFieldContent(raw: string): string {
  const trimmed = raw.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
      // not valid JSON
    }
  }

  if (trimmed.startsWith('<')) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(trimmed, 'application/xml')
      const error = doc.querySelector('parsererror')
      if (!error) {
        return prettyPrintXml(doc)
      }
    } catch {
      // not valid XML
    }
  }

  return raw
}
