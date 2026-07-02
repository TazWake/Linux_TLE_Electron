import type { RowStyle } from 'ag-grid-community'
import { parseColorRulesXml, ruleMatchesRow, type ColorRule } from '../shared/colorRules'
import { logRenderer, logRendererError } from './rendererDebug'

let activeRules: ColorRule[] = []

/**
 * Load (or reload) colour rules from the user's colorrules.xml via the main
 * process. Invalid rules are skipped and logged; a broken file never crashes.
 */
export async function loadColorRules(): Promise<number> {
  try {
    const xml = await window.api.loadColorRules()
    if (!xml) {
      activeRules = []
      return 0
    }

    const { rules, errors } = parseColorRulesXml(xml)
    activeRules = rules
    for (const error of errors) {
      logRendererError('color-rules', error)
    }
    logRenderer('color-rules', `loaded ${rules.length} rule(s)`)
    return rules.length
  } catch (error) {
    logRendererError('color-rules', 'failed to load colour rules', error)
    activeRules = []
    return 0
  }
}

/**
 * First matching rule wins. Called from getRowStyle, after tag and search
 * highlighting have had their chance.
 */
export function evaluateColorRules(
  headers: string[],
  fields: string[],
  record: Record<string, unknown>
): RowStyle | undefined {
  for (const rule of activeRules) {
    if (ruleMatchesRow(rule, headers, fields, record)) {
      const style: RowStyle = {}
      if (rule.background) {
        style.backgroundColor = rule.background
      }
      if (rule.foreground) {
        style.color = rule.foreground
      }
      return style
    }
  }
  return undefined
}
