import { createClient } from '@libsql/client'
import type { Db } from '@tabletop-tools/db'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadFactionCodes, normalizeFactionId, resetFactionCodes } from './faction-codes'

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
]

const ALIASES = [
  ['SM', 'space-marines'],
  ['CSM', 'chaos-space-marines'],
  ['CD', 'chaos-daemons'],
  ['AM', 'astra-militarum'],
  ['GK', 'grey-knights'],
  ['NEC', 'necrons'],
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
})
