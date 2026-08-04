import type { TTTPackage } from '@tabletop-tools/db'

import { parseBattleScribe } from './bs-parser'
import { detectFormat } from './format-detector'
import { parseGwApp } from './gw-parser'

export function parseList(text: string): TTTPackage {
  const format = detectFormat(text)

  if (format === 'gw-app') return parseGwApp(text)
  if (format === 'battlescribe') return parseBattleScribe(text)

  // HTML or unknown — return failed
  return {
    version: 1,
    parsedWith: format === 'html' ? 'html-detected' : 'unknown',
    parseStatus: 'failed',
    parseError: format === 'html' ? 'Input is HTML, not list text' : 'Unrecognized list format',
    meta: {
      name: '',
      totalPoints: 0,
      edition: '10th',
      battleSize: 'unknown',
      source: 'bcp-import',
    },
    list: {
      factionId: '',
      factionName: '',
      units: [],
    },
    exports: { rawSource: text },
  }
}
