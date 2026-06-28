import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadFactionCodes, resetFactionCodes } from '../faction-codes'
import {
  bsdataSubfactionKey,
  type BsdataUnitRow,
  parseBsdataSubfactions,
} from './bsdata-subfactions'

describe('parseBsdataSubfactions', () => {
  beforeAll(async () => {
    const client = createClient({ url: ':memory:' })
    const db = createDbFromClient(client)
    await client.execute(
      'CREATE TABLE dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL)',
    )
    await client.execute(
      'CREATE TABLE dim_faction_alias (alias TEXT PRIMARY KEY, faction_id TEXT NOT NULL)',
    )
    const factions = [
      ['space-marines', 'Space Marines', 'imperium'],
      ['aeldari', 'Aeldari', 'aeldari'],
    ]
    for (const [id, name, alleg] of factions) {
      await client.execute({
        sql: 'INSERT INTO dim_faction VALUES (?, ?, ?)',
        args: [id!, name!, alleg!],
      })
    }
    const aliases = [['Space Marines', 'space-marines']]
    for (const [alias, fid] of aliases) {
      await client.execute({
        sql: 'INSERT INTO dim_faction_alias VALUES (?, ?)',
        args: [alias!, fid!],
      })
    }
    await loadFactionCodes(db)
  })

  afterAll(() => {
    resetFactionCodes()
  })

  it('indexes rows with subfaction by (factionSlug, normalizedName)', () => {
    const rows: BsdataUnitRow[] = [
      {
        id: 'u1',
        name: 'Intercessor Squad',
        faction: 'Space Marines',
        subfaction: 'ultramarines',
      },
      {
        id: 'u2',
        name: 'Tactical Squad',
        faction: 'Space Marines',
        subfaction: 'imperial-fists',
      },
    ]
    const result = parseBsdataSubfactions(JSON.stringify(rows))
    expect(result.totalRows).toBe(2)
    expect(result.taggedRows).toBe(2)
    expect(result.byKey.get(bsdataSubfactionKey('space-marines', 'Intercessor Squad'))).toBe(
      'ultramarines',
    )
    expect(result.byKey.get(bsdataSubfactionKey('space-marines', 'Tactical Squad'))).toBe(
      'imperial-fists',
    )
  })

  it('skips rows without subfaction (non-chapter catalogs)', () => {
    const rows: BsdataUnitRow[] = [
      { id: 'u1', name: 'Hive Tyrant', faction: 'Tyranids' },
      {
        id: 'u2',
        name: 'Intercessor Squad',
        faction: 'Space Marines',
        subfaction: 'ultramarines',
      },
    ]
    const result = parseBsdataSubfactions(JSON.stringify(rows))
    expect(result.totalRows).toBe(2)
    expect(result.taggedRows).toBe(1)
    expect(result.byKey.size).toBe(1)
    expect(result.byKey.get(bsdataSubfactionKey('space-marines', 'Intercessor Squad'))).toBe(
      'ultramarines',
    )
  })

  it('normalizes names case-insensitively and folds punctuation', () => {
    const rows: BsdataUnitRow[] = [
      {
        id: 'u1',
        name: 'Marneus Calgar in Armour of Antilochus',
        faction: 'Space Marines',
        subfaction: 'ultramarines',
      },
    ]
    const result = parseBsdataSubfactions(JSON.stringify(rows))
    // Lookups by an alternate casing must hit the same key.
    expect(
      result.byKey.get(
        bsdataSubfactionKey('space-marines', 'MARNEUS CALGAR in armour of antilochus'),
      ),
    ).toBe('ultramarines')
  })

  it('throws on non-array root', () => {
    expect(() => parseBsdataSubfactions('{}')).toThrow(/expected a JSON array/i)
  })

  it('returns empty result for empty array', () => {
    const result = parseBsdataSubfactions('[]')
    expect(result.totalRows).toBe(0)
    expect(result.taggedRows).toBe(0)
    expect(result.byKey.size).toBe(0)
  })

  it('first-write wins on duplicate (factionSlug, name) entries', () => {
    const rows: BsdataUnitRow[] = [
      {
        id: 'u1',
        name: 'Intercessor Squad',
        faction: 'Space Marines',
        subfaction: 'ultramarines',
      },
      {
        id: 'u2',
        name: 'Intercessor Squad',
        faction: 'Space Marines',
        subfaction: 'imperial-fists',
      },
    ]
    const result = parseBsdataSubfactions(JSON.stringify(rows))
    expect(result.byKey.get(bsdataSubfactionKey('space-marines', 'Intercessor Squad'))).toBe(
      'ultramarines',
    )
  })
})
