// @tabletop-tools/game-content
// Architectural boundary between platform software and operator-supplied game content.
// No GW proprietary content is bundled here.

export type {
  GameContentAdapter,
  TournamentDataAdapter,
  TournamentImportFormat,
  TournamentRecord,
  TournamentPlayer,
  UnitProfile,
  WeaponProfile,
  WeaponAbility,
  UnitResult,
} from './types.js'

export { NullAdapter } from './adapters/null/index.js'
export { BSDataAdapter, parseBSDataXml } from './adapters/bsdata/index.js'
export type { BSDataAdapterOptions, ParseResult } from './adapters/bsdata/index.js'

export {
  TournamentImportAdapter,
  parseBcpCsv,
  parseTabletopAdmiralCsv,
  parseGenericCsv,
} from './adapters/tournament-import/index.js'
export type {
  BcpCsvOptions,
  TabletopAdmiralCsvOptions,
} from './adapters/tournament-import/index.js'

export { createUnitRouter } from './routers/unit.js'
