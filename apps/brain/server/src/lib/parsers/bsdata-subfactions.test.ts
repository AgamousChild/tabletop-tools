import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadFactionCodes, resetFactionCodes } from '../faction-codes'
import {
  bsdataSubfactionKey,
  type BsdataUnitRow,
  chapterSpecificHome,
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

  it('indexes rows with subfaction by (factionSlug, normalizedName) → catalog set', () => {
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
    const interSet = result.byKey.get(bsdataSubfactionKey('space-marines', 'Intercessor Squad'))
    expect(interSet).toBeDefined()
    expect([...interSet!]).toEqual(['ultramarines'])
    const tacSet = result.byKey.get(bsdataSubfactionKey('space-marines', 'Tactical Squad'))
    expect(tacSet).toBeDefined()
    expect([...tacSet!]).toEqual(['imperial-fists'])
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
    const set = result.byKey.get(bsdataSubfactionKey('space-marines', 'Intercessor Squad'))
    expect([...set!]).toEqual(['ultramarines'])
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
    const set = result.byKey.get(
      bsdataSubfactionKey('space-marines', 'MARNEUS CALGAR in armour of antilochus'),
    )
    expect(set).toBeDefined()
    expect([...set!]).toEqual(['ultramarines'])
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

  it('accumulates every catalog a unit appears in (shared unit case)', () => {
    // Intercessor Squad appears in every chapter catalog — BSData ships the
    // full generic list in every chapter's XML. The parser must record ALL of
    // them so the caller can tell shared units from chapter-locked ones.
    const rows: BsdataUnitRow[] = [
      { id: 'u1', name: 'Intercessor Squad', faction: 'Space Marines', subfaction: 'ultramarines' },
      { id: 'u2', name: 'Intercessor Squad', faction: 'Space Marines', subfaction: 'blood-angels' },
      { id: 'u3', name: 'Intercessor Squad', faction: 'Space Marines', subfaction: 'dark-angels' },
      {
        id: 'u4',
        name: 'Intercessor Squad',
        faction: 'Space Marines',
        subfaction: 'black-templars',
      },
    ]
    const result = parseBsdataSubfactions(JSON.stringify(rows))
    const set = result.byKey.get(bsdataSubfactionKey('space-marines', 'Intercessor Squad'))
    expect(set).toBeDefined()
    expect(set!.size).toBe(4)
  })
})

describe('chapterSpecificHome', () => {
  it('returns the sole chapter for a chapter-specific unit', () => {
    expect(chapterSpecificHome(new Set(['blood-angels']))).toBe('blood-angels')
  })

  it('returns a deterministic chapter for a two-catalog set', () => {
    // Legends variants sometimes appear in the main catalog plus a shared
    // Legends bucket. Two catalogs still counts as chapter-specific.
    expect(chapterSpecificHome(new Set(['blood-angels', 'space-wolves']))).toBe('blood-angels')
  })

  it('returns undefined when the unit appears in 3+ catalogs (shared pool)', () => {
    const shared = new Set(['blood-angels', 'dark-angels', 'ultramarines', 'black-templars'])
    expect(chapterSpecificHome(shared)).toBeUndefined()
  })

  it('returns undefined for an empty or missing set', () => {
    expect(chapterSpecificHome(undefined)).toBeUndefined()
    expect(chapterSpecificHome(new Set())).toBeUndefined()
  })
})
