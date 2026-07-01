// @tabletop-tools/game-content
// Architectural boundary between platform software and operator-supplied game content.
// No GW proprietary content is bundled here.

export type { BSDataAdapterOptions, ParseResult } from './adapters/bsdata/index.js'
export { BSDataAdapter, parseBSDataXml } from './adapters/bsdata/index.js'
export type {
  AbilityKind,
  ArmyRule,
  Datasheet,
  DatasheetAbility,
  DatasheetStats,
  Detachment,
  Enhancement,
  ErrataEntry,
  ErrataTarget,
  ExtraChunk,
  FaqEntry,
  MeleeWeapon,
  PackExtract,
  ParseOptions,
  RangedWeapon,
  Stratagem,
  UnparsedChunk,
} from './adapters/faction-pack/index.js'
export { parseFactionPackV2 } from './adapters/faction-pack/index.js'
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
