// ============================================================
// Core game content types
// ============================================================
// These are platform-defined interfaces. No GW content lives
// here — only shape definitions.
// ============================================================

export interface WeaponProfile {
  name: string
  range: number | 'melee'
  attacks: number | string   // string for dice notation e.g. "D6"
  skill: number              // BS or WS — hit on this value or better
  strength: number
  ap: number                 // negative modifier to armor save
  damage: number | string    // string for dice notation e.g. "D3"
  abilities: WeaponAbility[]
}

export type WeaponAbility =
  | { type: 'SUSTAINED_HITS'; value: number }
  | { type: 'LETHAL_HITS' }
  | { type: 'DEVASTATING_WOUNDS' }
  | { type: 'TORRENT' }
  | { type: 'TWIN_LINKED' }
  | { type: 'BLAST' }
  | { type: 'REROLL_HITS_OF_1' }
  | { type: 'REROLL_HITS' }
  | { type: 'REROLL_WOUNDS' }
  | { type: 'HIT_MOD'; value: number }
  | { type: 'WOUND_MOD'; value: number }

export interface UnitProfile {
  id: string           // stable content ID (e.g. BSData entry ID)
  faction: string      // operator-defined faction string
  name: string         // unit name
  move: number
  toughness: number
  save: number         // armor save value (e.g. 3 means 3+)
  wounds: number
  leadership: number
  oc: number           // objective control
  weapons: WeaponProfile[]
  abilities: string[]  // free-text ability names; mapped to typed rules separately
  points: number
}

// ============================================================
// GameContentAdapter — the boundary interface
// ============================================================
// Routers never query a 'units' table. They call ctx.gameContent.
// The adapter implementation (BSData, Null, etc.) is injected
// at server startup by the operator's configuration.
// ============================================================

export interface GameContentAdapter {
  load(): Promise<void>
  getUnit(id: string): Promise<UnitProfile | null>
  searchUnits(query: { faction?: string; name?: string }): Promise<UnitProfile[]>
  listFactions(): Promise<string[]>
}

// ============================================================
// Tournament data types
// ============================================================

export interface UnitResult {
  unitName: string
  contentId?: string    // resolved against content adapter if available
  gamesPlayed: number
  averagePoints: number
}

export interface TournamentPlayer {
  placement: number
  playerName?: string   // player's display name from the import source
  faction: string       // user-entered string — NOT validated against GW
  detachment?: string   // user-entered detachment name — NOT validated against GW
  listText?: string     // optional army list as pasted text
  wins: number
  losses: number
  draws: number
  points: number
  unitResults?: UnitResult[]
}

export interface TournamentRecord {
  eventName: string
  eventDate: string     // ISO date string e.g. "2025-06-14"
  format: string        // e.g. "GT", "RTT", "local"
  players: TournamentPlayer[]
}

export type TournamentImportFormat =
  | 'bcp-csv'
  | 'tabletop-admiral-csv'
  | 'generic-csv'

export interface TournamentDataAdapter {
  parse(raw: string, format: TournamentImportFormat): TournamentRecord[]
}
