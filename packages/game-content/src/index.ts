// @tabletop-tools/game-content
// Architectural boundary between platform software and operator-supplied game content.
// No GW proprietary content is bundled here.

export type { BSDataAdapterOptions, ParseResult } from './adapters/bsdata/index.js'
export { BSDataAdapter, parseBSDataXml } from './adapters/bsdata/index.js'
export { NullAdapter } from './adapters/null/index.js'
export type {
  BcpCsvOptions,
  TabletopAdmiralCsvOptions,
} from './adapters/tournament-import/index.js'
export {
  parseBcpCsv,
  parseGenericCsv,
  parseTabletopAdmiralCsv,
  TournamentImportAdapter,
} from './adapters/tournament-import/index.js'
export type {
  GameContentAdapter,
  TournamentDataAdapter,
  TournamentImportFormat,
  TournamentPlayer,
  TournamentRecord,
  UnitProfile,
  UnitResult,
  WeaponAbility,
  WeaponProfile,
} from './types.js'
