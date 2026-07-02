import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { EXAMPLE_COLOR_RULES_XML } from '../../shared/colorRules'
import { debugLog, errorLog } from '../debugLog'

export function colorRulesPath(): string {
  return path.join(app.getPath('userData'), 'colorrules.xml')
}

/** Write a commented example rules file on first run so users can edit it. */
export function ensureColorRulesFile(): void {
  const rulesPath = colorRulesPath()
  try {
    if (!fs.existsSync(rulesPath)) {
      fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
      fs.writeFileSync(rulesPath, EXAMPLE_COLOR_RULES_XML, 'utf8')
      debugLog('color-rules', `created example rules file at ${rulesPath}`)
    }
  } catch (error) {
    errorLog('color-rules', 'unable to create example rules file', error)
  }
}

export function loadColorRulesXml(): string | null {
  const rulesPath = colorRulesPath()
  try {
    if (!fs.existsSync(rulesPath)) {
      return null
    }
    return fs.readFileSync(rulesPath, 'utf8')
  } catch (error) {
    errorLog('color-rules', 'unable to read rules file', error)
    return null
  }
}
