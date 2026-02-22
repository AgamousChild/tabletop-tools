import type { TournamentDataAdapter, TournamentImportFormat, TournamentRecord } from '../../types.js'
import { parseBcpCsv } from './bcp-csv/parser.js'
import { parseTabletopAdmiralCsv } from './tabletop-admiral-csv/parser.js'
import { parseGenericCsv } from './generic-csv/parser.js'

export { parseBcpCsv } from './bcp-csv/parser.js'
export { parseTabletopAdmiralCsv } from './tabletop-admiral-csv/parser.js'
export { parseGenericCsv } from './generic-csv/parser.js'
export type { BcpCsvOptions } from './bcp-csv/parser.js'
export type { TabletopAdmiralCsvOptions } from './tabletop-admiral-csv/parser.js'

/**
 * TournamentImportAdapter
 *
 * A single entry point for parsing tournament result CSVs in any
 * supported format. The operator calls this with the raw CSV text
 * and the format identifier.
 *
 * For BCP and TA formats, the adapter uses generic metadata since
 * those formats don't include event name/date in the CSV itself.
 * Callers should wrap this with an options object to supply those.
 */
export class TournamentImportAdapter implements TournamentDataAdapter {
  parse(raw: string, format: TournamentImportFormat): TournamentRecord[] {
    switch (format) {
      case 'bcp-csv':
        // BCP CSV doesn't embed event metadata — returns a single record
        // with placeholder metadata. Callers should post-process to set
        // event name/date from user input.
        return [
          parseBcpCsv(raw, {
            eventName: 'Imported Event',
            eventDate: new Date().toISOString().slice(0, 10),
          }),
        ]

      case 'tabletop-admiral-csv':
        return [
          parseTabletopAdmiralCsv(raw, {
            eventName: 'Imported Event',
            eventDate: new Date().toISOString().slice(0, 10),
          }),
        ]

      case 'generic-csv':
        return parseGenericCsv(raw)
    }
  }
}
