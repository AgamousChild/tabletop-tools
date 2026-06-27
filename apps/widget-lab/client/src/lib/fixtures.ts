// Synthetic data for the widget lab. Pure local fixtures — no network calls,
// no Turso, no brain. Names are intentionally synthetic so the lab is honest
// about being eval/demo data and not GW content.

export type Faction = {
  id: string
  name: string
  allegiance: 'imperium' | 'chaos' | 'xenos'
}

export type Unit = {
  id: string
  name: string
  factionId: string
  role: 'troops' | 'elites' | 'heavy' | 'fast' | 'character'
  points: number
  models: number
  wounds: number
}

export type Player = {
  id: string
  name: string
  faction: string
  rating: number
  wins: number
  losses: number
  draws: number
}

const ALLEGIANCES: Faction['allegiance'][] = ['imperium', 'chaos', 'xenos']

export const FACTIONS: Faction[] = Array.from({ length: 30 }, (_, i) => ({
  id: `f${i + 1}`,
  name: `Faction ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`,
  allegiance: ALLEGIANCES[i % 3]!,
}))

const ROLES: Unit['role'][] = ['troops', 'elites', 'heavy', 'fast', 'character']

export const UNITS: Unit[] = Array.from({ length: 100 }, (_, i) => {
  const faction = FACTIONS[i % FACTIONS.length]!
  return {
    id: `u${i + 1}`,
    name: `Unit ${String.fromCharCode(65 + (i % 26))}-${Math.floor(i / 26) + 1}`,
    factionId: faction.id,
    role: ROLES[i % ROLES.length]!,
    points: 50 + ((i * 17) % 250),
    models: 1 + (i % 10),
    wounds: 1 + (i % 8),
  }
})

export const PLAYERS: Player[] = Array.from({ length: 20 }, (_, i) => {
  const wins = 5 + ((i * 3) % 12)
  const losses = 2 + ((i * 5) % 8)
  const draws = i % 3
  return {
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    faction: FACTIONS[i % FACTIONS.length]!.name,
    rating: 1400 + ((i * 37) % 400),
    wins,
    losses,
    draws,
  }
})

// Derived: flat table-friendly faction stats (10+ columns) for the DataTable
// page, modeled on apps/new-meta/client/src/components/FactionTable.tsx.
export type FactionStat = {
  factionId: string
  faction: string
  allegiance: string
  winRate: number
  wins: number
  losses: number
  draws: number
  games: number
  players: number
  playerPopPct: number
  eventWins: number
  eventTop4: number
}

export const FACTION_STATS: FactionStat[] = FACTIONS.map((f, i) => {
  const wins = 40 + ((i * 11) % 60)
  const losses = 30 + ((i * 7) % 50)
  const draws = (i * 3) % 8
  const games = wins + losses + draws
  return {
    factionId: f.id,
    faction: f.name,
    allegiance: f.allegiance,
    winRate: wins / games,
    wins,
    losses,
    draws,
    games,
    players: 5 + ((i * 13) % 25),
    playerPopPct: 0.01 + ((i * 0.007) % 0.12),
    eventWins: (i * 2) % 7,
    eventTop4: (i * 3) % 11,
  }
})
