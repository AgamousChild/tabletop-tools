import { createClient } from '@libsql/client'
import type { Db } from '@tabletop-tools/db'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DROPPED_FACTION_IDS,
  getCanonicalFactionIds,
  loadFactionCodes,
  normalizeFactionId,
  resetFactionCodes,
} from './faction-codes'

const CREATE_TABLES = `
CREATE TABLE dim_faction (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  allegiance TEXT NOT NULL
);
CREATE TABLE dim_faction_alias (
  alias TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL REFERENCES dim_faction(id)
);
`

const FACTIONS = [
  ['space-marines', 'Space Marines', 'imperium'],
  ['chaos-space-marines', 'Chaos Space Marines', 'chaos'],
  ['chaos-daemons', 'Chaos Daemons', 'chaos'],
  ['astra-militarum', 'Astra Militarum', 'imperium'],
  ['grey-knights', 'Grey Knights', 'imperium'],
  ['necrons', 'Necrons', 'xenos'],
  ['imperial-knights', 'Imperial Knights', 'imperium'],
  ['chaos-knights', 'Chaos Knights', 'chaos'],
  ['emperors-children', "Emperor's Children", 'chaos'],
  ['tau-empire', "T'au Empire", 'xenos'],
  // Legacy row that LEGACY_FACTION_REWRITES retires on load. Kept in the
  // seed so we exercise the "DB still has the old row" case explicitly.
  ['adeptus-titanicus', 'Adeptus Titanicus', 'imperium'],
  // Retired factions the code drops from the canonical set (they exist in
  // prod dim_faction snapshots that pre-date this PR).
  ['unaligned-forces', 'Unaligned Forces', 'imperium'],
]

const ALIASES = [
  ['SM', 'space-marines'],
  ['CSM', 'chaos-space-marines'],
  ['CD', 'chaos-daemons'],
  ['AM', 'astra-militarum'],
  ['GK', 'grey-knights'],
  ['NEC', 'necrons'],
  // Shadow-id aliases added 2026-06-27 to collapse the remaining
  // qi/qt/emperor-s-children shadows at merge time.
  ['qi', 'imperial-knights'],
  ['QI', 'imperial-knights'],
  ['qt', 'chaos-knights'],
  ['QT', 'chaos-knights'],
  ['emperor-s-children', 'emperors-children'],
  ['t-au-empire', 'tau-empire'],
]

async function createTestDb(): Promise<Db> {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)

  for (const stmt of CREATE_TABLES.split(';').filter((s) => s.trim())) {
    await client.execute(stmt)
  }

  for (const [id, name, allegiance] of FACTIONS) {
    await client.execute({
      sql: 'INSERT INTO dim_faction (id, name, allegiance) VALUES (?, ?, ?)',
      args: [id!, name!, allegiance!],
    })
  }

  for (const [alias, factionId] of ALIASES) {
    await client.execute({
      sql: 'INSERT INTO dim_faction_alias (alias, faction_id) VALUES (?, ?)',
      args: [alias!, factionId!],
    })
  }

  return db
}

describe('normalizeFactionId', () => {
  beforeEach(async () => {
    const db = await createTestDb()
    await loadFactionCodes(db)
  })

  afterEach(() => {
    resetFactionCodes()
  })

  it('maps short codes to canonical slugs', () => {
    expect(normalizeFactionId('SM')).toBe('space-marines')
    expect(normalizeFactionId('CSM')).toBe('chaos-space-marines')
    expect(normalizeFactionId('CD')).toBe('chaos-daemons')
    expect(normalizeFactionId('AM')).toBe('astra-militarum')
    expect(normalizeFactionId('GK')).toBe('grey-knights')
  })

  it('returns canonical slugs unchanged', () => {
    expect(normalizeFactionId('space-marines')).toBe('space-marines')
    expect(normalizeFactionId('necrons')).toBe('necrons')
  })

  it('slugifies unknown codes', () => {
    expect(normalizeFactionId('NewFaction')).toBe('newfaction')
  })

  it('throws if loadFactionCodes was not called', () => {
    resetFactionCodes()
    expect(() => normalizeFactionId('SM')).toThrow('Faction codes not loaded')
  })

  // Shadow-id regression: census/deep-dive 2026-06-27 found qi/qt/
  // emperor-s-children leaking through to brain nodes. Aliases now collapse
  // these at merge-sources step 1. The factionSlug emitted by parsers may be
  // upper- or lower-case (Wahapedia ships codes as `QI`/`QT`; gw-sync writes
  // filename slugs in lowercase) — both must resolve.
  it('collapses Wahapedia QI/QT short codes to knight canonicals', () => {
    expect(normalizeFactionId('QI')).toBe('imperial-knights')
    expect(normalizeFactionId('qi')).toBe('imperial-knights')
    expect(normalizeFactionId('QT')).toBe('chaos-knights')
    expect(normalizeFactionId('qt')).toBe('chaos-knights')
  })

  it("collapses apostrophe-stripped Emperor's Children filename slug", () => {
    expect(normalizeFactionId('emperor-s-children')).toBe('emperors-children')
    // The existing t-au-empire alias should still work — pin its behaviour.
    expect(normalizeFactionId('t-au-empire')).toBe('tau-empire')
  })

  // Faction-model cleanup 2026-07-05: Adeptus Titanicus IS Titan Legions.
  // The DB may still carry the retired slug; the code retires it at
  // loadFactionCodes time and normalizeFactionId maps both the retired
  // slug and Wahapedia's short code straight onto `titan-legions`.
  it('merges adeptus-titanicus into titan-legions', () => {
    expect(normalizeFactionId('adeptus-titanicus')).toBe('titan-legions')
    expect(normalizeFactionId('titan-legions')).toBe('titan-legions')
    // The retired slug is no longer in the canonical set — the merge
    // factionId gate depends on this so shadow nodes with the old slug
    // get caught + rewritten.
    expect(getCanonicalFactionIds().has('adeptus-titanicus')).toBe(false)
    expect(getCanonicalFactionIds().has('titan-legions')).toBe(true)
  })

  it('drops retired factions from the canonical set', () => {
    // The DB row survives — but the canonical set does not include it, so
    // any node that lands on this slug fails the merge factionId gate.
    for (const dropped of DROPPED_FACTION_IDS) {
      expect(getCanonicalFactionIds().has(dropped)).toBe(false)
    }
    // Wahapedia numeric datasheets whose factionId is "Unaligned Forces"
    // slugify to `unaligned-forces` — that path still returns the value
    // (so build-graph can spot it), but the gate rejects it as orphan.
    expect(normalizeFactionId('unaligned-forces')).toBe('unaligned-forces')
    expect(getCanonicalFactionIds().has('unaligned-forces')).toBe(false)
  })
})
