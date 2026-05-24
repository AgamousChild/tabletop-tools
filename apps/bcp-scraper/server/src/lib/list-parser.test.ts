import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadFactionMap, resetFactionMapCache } from './faction-map'
import { parseList } from './list-parser'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL);
    CREATE TABLE dim_faction_alias (alias TEXT PRIMARY KEY, faction_id TEXT NOT NULL);
    CREATE TABLE dim_subfaction (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT NOT NULL);
    INSERT INTO dim_faction VALUES ('tyranids', 'Tyranids', 'xenos');
    INSERT INTO dim_faction VALUES ('chaos-space-marines', 'Chaos Space Marines', 'chaos');
    INSERT INTO dim_faction_alias VALUES ('Tyranids', 'tyranids');
    INSERT INTO dim_faction_alias VALUES ('Chaos Space Marines', 'chaos-space-marines');
  `)
  await loadFactionMap(db)
})

afterAll(() => {
  resetFactionMapCache()
  client.close()
})

describe('parseList', () => {
  it('routes GW App format to gw parser', () => {
    const result = parseList(
      'My List (2000 Points)TyranidsSubterranean AssaultStrike Force (2,000 Points)CHARACTERSHive Tyrant (215 Points)  • Warlord',
    )
    expect(result.parsedWith).toBe('gw-app-v1')
    expect(result.list.factionId).toBe('tyranids')
    expect(result.list.units.length).toBeGreaterThan(0)
  })

  it('routes BattleScribe format to bs parser', () => {
    const result = parseList(
      '++++ FACTION KEYWORD: Chaos - Chaos Space Marines+ DETACHMENT: Pactbound Zealots+ TOTAL ARMY POINTS: 2000ptsChar1: 1x Abaddon the Despoiler (270 pts): Warlord',
    )
    expect(result.parsedWith).toBe('battlescribe-v1')
    expect(result.list.factionId).toBe('chaos-space-marines')
  })

  it('returns failed for HTML', () => {
    const result = parseList('You need to enable JavaScript to run this app.<div>content</div>')
    expect(result.parseStatus).toBe('failed')
    expect(result.parsedWith).toBe('html-detected')
    expect(result.exports?.rawSource).toContain('JavaScript')
  })

  it('returns failed for unknown format', () => {
    const result = parseList('just some random text about my army')
    expect(result.parseStatus).toBe('failed')
    expect(result.parsedWith).toBe('unknown')
    expect(result.exports?.rawSource).toBe('just some random text about my army')
  })

  it('returns failed for empty input', () => {
    const result = parseList('')
    expect(result.parseStatus).toBe('failed')
  })
})
