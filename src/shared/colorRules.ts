/**
 * User colour rules, loaded from colorrules.xml in the user data directory.
 *
 * The schema is a flat list of <Rule/> elements:
 *
 *   <ColorRules>
 *     <Rule name="Failed logons" column="message" match="contains"
 *           value="authentication failure" background="#ffd7d7" foreground="#5c0000"/>
 *   </ColorRules>
 *
 * match: contains (default, case-insensitive) | equals | regex
 * column: a header name (case-insensitive) or * for any column.
 *
 * Parsing is a small hand-rolled attribute scanner rather than a DOM parser so
 * it runs identically in the renderer and in Node-based tests, and so malformed
 * XML degrades to "no rules" instead of throwing.
 */

export type ColorRuleMatch = 'contains' | 'equals' | 'regex'

export interface ColorRule {
  name: string
  column: string
  match: ColorRuleMatch
  value: string
  background?: string
  foreground?: string
  regex?: RegExp
}

export interface ColorRulesParseResult {
  rules: ColorRule[]
  errors: string[]
}

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/
const NAMED_COLOR = /^[a-zA-Z]{3,30}$/

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseAttributes(attrText: string): Map<string, string> {
  const attributes = new Map<string, string>()
  const attrPattern = /([\w-]+)\s*=\s*"([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = attrPattern.exec(attrText)) !== null) {
    attributes.set(match[1].toLowerCase(), decodeXmlEntities(match[2]))
  }
  return attributes
}

function validColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  const trimmed = value.trim()
  // Restrict to hex or simple named colours: rule values end up in inline
  // styles, so arbitrary CSS must not pass through.
  if (HEX_COLOR.test(trimmed) || NAMED_COLOR.test(trimmed)) {
    return trimmed
  }
  return undefined
}

export function parseColorRulesXml(xml: string): ColorRulesParseResult {
  const rules: ColorRule[] = []
  const errors: string[] = []

  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '')
  const rulePattern = /<Rule\b([^>]*?)\/?>/gi
  let match: RegExpExecArray | null
  let ruleIndex = 0

  while ((match = rulePattern.exec(withoutComments)) !== null) {
    ruleIndex++
    const attrs = parseAttributes(match[1])

    const value = attrs.get('value')
    if (!value) {
      errors.push(`Rule ${ruleIndex}: missing value attribute — skipped`)
      continue
    }

    const matchMode = (attrs.get('match') ?? 'contains').toLowerCase()
    if (matchMode !== 'contains' && matchMode !== 'equals' && matchMode !== 'regex') {
      errors.push(`Rule ${ruleIndex}: unknown match mode "${matchMode}" — skipped`)
      continue
    }

    const background = validColor(attrs.get('background'))
    const foreground = validColor(attrs.get('foreground'))
    if (!background && !foreground) {
      errors.push(`Rule ${ruleIndex}: no valid background or foreground colour — skipped`)
      continue
    }

    const rule: ColorRule = {
      name: attrs.get('name') ?? `Rule ${ruleIndex}`,
      column: (attrs.get('column') ?? '*').trim(),
      match: matchMode,
      value,
      background,
      foreground
    }

    if (rule.match === 'regex') {
      try {
        rule.regex = new RegExp(value, 'i')
      } catch (error) {
        errors.push(
          `Rule ${ruleIndex} (${rule.name}): invalid regex — ${error instanceof Error ? error.message : String(error)}`
        )
        continue
      }
    }

    rules.push(rule)
  }

  return { rules, errors }
}

function cellMatches(rule: ColorRule, cellValue: string): boolean {
  if (rule.match === 'regex') {
    return rule.regex ? rule.regex.test(cellValue) : false
  }
  const cellLower = cellValue.toLowerCase()
  const valueLower = rule.value.toLowerCase()
  if (rule.match === 'equals') {
    return cellLower === valueLower.trim() || cellValue === rule.value
  }
  return cellLower.includes(valueLower)
}

/**
 * Test one rule against a row. `record` maps sanitised field names to values;
 * `headers` and `fields` are parallel arrays for header-name lookup.
 */
export function ruleMatchesRow(
  rule: ColorRule,
  headers: string[],
  fields: string[],
  record: Record<string, unknown>
): boolean {
  if (rule.column === '*') {
    return fields.some((field) => {
      const value = record[field]
      return typeof value === 'string' && value.length > 0 && cellMatches(rule, value)
    })
  }

  const columnLower = rule.column.toLowerCase()
  const headerIndex = headers.findIndex((header) => header.trim().toLowerCase() === columnLower)
  if (headerIndex < 0) {
    return false
  }

  const value = record[fields[headerIndex]]
  return typeof value === 'string' && cellMatches(rule, value)
}

/** Example file written to the user data directory on first run. */
export const EXAMPLE_COLOR_RULES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  ElectronTimelineViewer colour rules.

  Each <Rule/> colours matching rows in every open timeline.
  Attributes:
    name        A label for your own reference (optional).
    column      Header name to test (case-insensitive), or * for any column.
    match       contains (default) | equals | regex  (all case-insensitive)
    value       The text or regular expression to match.
    background  Row background colour (#hex or a simple colour name).
    foreground  Row text colour (optional).

  Rules are applied in file order; the first matching rule wins.
  Tagged rows and search matches take precedence over colour rules.
  Reload without restarting via View -> Reload Colour Rules.
-->
<ColorRules>
  <!-- Example: highlight deleted files in a filesystem timeline -->
  <!-- <Rule name="Deleted files" column="File Name" match="contains"
        value="(deleted)" background="#ffe0e0"/> -->

  <!-- Example: highlight failed authentication anywhere in the row -->
  <!-- <Rule name="Auth failures" column="*" match="contains"
        value="authentication failure" background="#ffd7d7" foreground="#5c0000"/> -->
</ColorRules>
`
