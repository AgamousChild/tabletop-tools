import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  getSubfactionParent,
  loadFactionMap,
  normalizeFaction,
  resetFactionMapCache,
} from './faction-map'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL);
    CREATE TABLE dim_faction_alias (alias TEXT PRIMARY KEY, faction_id TEXT NOT NULL REFERENCES dim_faction(id));
    CREATE TABLE dim_subfaction (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT NOT NULL REFERENCES dim_faction(id));

    INSERT INTO dim_faction VALUES ('adepta-sororitas', 'Adepta Sororitas', 'imperium');
    INSERT INTO dim_faction VALUES ('adeptus-custodes', 'Adeptus Custodes', 'imperium');
    INSERT INTO dim_faction VALUES ('adeptus-mechanicus', 'Adeptus Mechanicus', 'imperium');
    INSERT INTO dim_faction VALUES ('aeldari', 'Aeldari', 'xenos');
    INSERT INTO dim_faction VALUES ('astra-militarum', 'Astra Militarum', 'imperium');
    INSERT INTO dim_faction VALUES ('blood-angels', 'Blood Angels', 'imperium');
    INSERT INTO dim_faction VALUES ('black-templars', 'Black Templars', 'imperium');
    INSERT INTO dim_faction VALUES ('chaos-daemons', 'Chaos Daemons', 'chaos');
    INSERT INTO dim_faction VALUES ('chaos-knights', 'Chaos Knights', 'chaos');
    INSERT INTO dim_faction VALUES ('chaos-space-marines', 'Chaos Space Marines', 'chaos');
    INSERT INTO dim_faction VALUES ('dark-angels', 'Dark Angels', 'imperium');
    INSERT INTO dim_faction VALUES ('death-guard', 'Death Guard', 'chaos');
    INSERT INTO dim_faction VALUES ('deathwatch', 'Deathwatch', 'imperium');
    INSERT INTO dim_faction VALUES ('drukhari', 'Drukhari', 'xenos');
    INSERT INTO dim_faction VALUES ('emperors-children', 'Emperors Children', 'chaos');
    INSERT INTO dim_faction VALUES ('genestealer-cults', 'Genestealer Cults', 'xenos');
    INSERT INTO dim_faction VALUES ('grey-knights', 'Grey Knights', 'imperium');
    INSERT INTO dim_faction VALUES ('imperial-agents', 'Imperial Agents', 'imperium');
    INSERT INTO dim_faction VALUES ('imperial-knights', 'Imperial Knights', 'imperium');
    INSERT INTO dim_faction VALUES ('leagues-of-votann', 'Leagues of Votann', 'xenos');
    INSERT INTO dim_faction VALUES ('necrons', 'Necrons', 'xenos');
    INSERT INTO dim_faction VALUES ('orks', 'Orks', 'xenos');
    INSERT INTO dim_faction VALUES ('space-marines', 'Space Marines', 'imperium');
    INSERT INTO dim_faction VALUES ('space-wolves', 'Space Wolves', 'imperium');
    INSERT INTO dim_faction VALUES ('tau-empire', 'Tau Empire', 'xenos');
    INSERT INTO dim_faction VALUES ('thousand-sons', 'Thousand Sons', 'chaos');
    INSERT INTO dim_faction VALUES ('tyranids', 'Tyranids', 'xenos');
    INSERT INTO dim_faction VALUES ('world-eaters', 'World Eaters', 'chaos');

    INSERT INTO dim_subfaction VALUES ('blood-angels', 'Blood Angels', 'space-marines');
    INSERT INTO dim_subfaction VALUES ('dark-angels', 'Dark Angels', 'space-marines');
    INSERT INTO dim_subfaction VALUES ('space-wolves', 'Space Wolves', 'space-marines');
    INSERT INTO dim_subfaction VALUES ('black-templars', 'Black Templars', 'space-marines');
    INSERT INTO dim_subfaction VALUES ('deathwatch', 'Deathwatch', 'space-marines');

    -- Aliases (subset covering test cases)
    INSERT INTO dim_faction_alias VALUES ('Orks', 'orks');
    INSERT INTO dim_faction_alias VALUES ('Necrons', 'necrons');
    INSERT INTO dim_faction_alias VALUES ('Tyranids', 'tyranids');
    INSERT INTO dim_faction_alias VALUES ('T''au Empire', 'tau-empire');
    INSERT INTO dim_faction_alias VALUES ('Emperor''s Children', 'emperors-children');
    INSERT INTO dim_faction_alias VALUES ('Space Marines (Astartes)', 'space-marines');
    INSERT INTO dim_faction_alias VALUES ('Adepta Sororitas', 'adepta-sororitas');
    INSERT INTO dim_faction_alias VALUES ('Chaos Space Marines', 'chaos-space-marines');
    INSERT INTO dim_faction_alias VALUES ('Ultramarines', 'space-marines');
    INSERT INTO dim_faction_alias VALUES ('Salamanders', 'space-marines');
    INSERT INTO dim_faction_alias VALUES ('Imperial Fists', 'space-marines');
    INSERT INTO dim_faction_alias VALUES ('Iron Hands', 'space-marines');
    INSERT INTO dim_faction_alias VALUES ('Raven Guard', 'space-marines');
    INSERT INTO dim_faction_alias VALUES ('White Scars', 'space-marines');
    INSERT INTO dim_faction_alias VALUES ('Crimson Fists', 'space-marines');
    INSERT INTO dim_faction_alias VALUES ('Carcharadons', 'space-marines');
    INSERT INTO dim_faction_alias VALUES ('Black Legion', 'chaos-space-marines');
    INSERT INTO dim_faction_alias VALUES ('Alpha Legion', 'chaos-space-marines');
    INSERT INTO dim_faction_alias VALUES ('Night Lords', 'chaos-space-marines');
    INSERT INTO dim_faction_alias VALUES ('Iron Warriors', 'chaos-space-marines');
    INSERT INTO dim_faction_alias VALUES ('Word Bearers', 'chaos-space-marines');
    INSERT INTO dim_faction_alias VALUES ('Red Corsairs', 'chaos-space-marines');
    INSERT INTO dim_faction_alias VALUES ('Forces of the Hive Mind', 'tyranids');
    INSERT INTO dim_faction_alias VALUES ('Hive Fleet Kronos', 'tyranids');
    INSERT INTO dim_faction_alias VALUES ('Hive Fleet Hyrda', 'tyranids');
    INSERT INTO dim_faction_alias VALUES ('Flesh Tearers', 'blood-angels');
    INSERT INTO dim_faction_alias VALUES ('Deathwing', 'dark-angels');
    INSERT INTO dim_faction_alias VALUES ('Farsight Enclaves', 'tau-empire');
    INSERT INTO dim_faction_alias VALUES ('Imperium', 'imperial-agents');
    INSERT INTO dim_faction_alias VALUES ('Chaos', 'chaos-space-marines');
    INSERT INTO dim_faction_alias VALUES ('Xenos', 'aeldari');
    INSERT INTO dim_faction_alias VALUES ('Genestealer Cult', 'genestealer-cults');
    INSERT INTO dim_faction_alias VALUES ('Genestealer Cults', 'genestealer-cults');
  `)

  await loadFactionMap(db)
})

afterAll(() => {
  resetFactionMapCache()
  client.close()
})

describe('normalizeFaction', () => {
  it('maps standard factions', () => {
    expect(normalizeFaction('Orks')).toBe('orks')
    expect(normalizeFaction('Necrons')).toBe('necrons')
    expect(normalizeFaction('Tyranids')).toBe('tyranids')
  })

  it('maps factions with special characters', () => {
    expect(normalizeFaction("T'au Empire")).toBe('tau-empire')
    expect(normalizeFaction("Emperor's Children")).toBe('emperors-children')
  })

  it('maps multi-word factions', () => {
    expect(normalizeFaction('Space Marines (Astartes)')).toBe('space-marines')
    expect(normalizeFaction('Adepta Sororitas')).toBe('adepta-sororitas')
    expect(normalizeFaction('Chaos Space Marines')).toBe('chaos-space-marines')
  })

  it('maps chapter aliases to space-marines', () => {
    expect(normalizeFaction('Ultramarines')).toBe('space-marines')
    expect(normalizeFaction('Salamanders')).toBe('space-marines')
    expect(normalizeFaction('Imperial Fists')).toBe('space-marines')
    expect(normalizeFaction('Iron Hands')).toBe('space-marines')
    expect(normalizeFaction('Raven Guard')).toBe('space-marines')
    expect(normalizeFaction('White Scars')).toBe('space-marines')
    expect(normalizeFaction('Crimson Fists')).toBe('space-marines')
    expect(normalizeFaction('Carcharadons')).toBe('space-marines')
  })

  it('maps CSM warband aliases to chaos-space-marines', () => {
    expect(normalizeFaction('Black Legion')).toBe('chaos-space-marines')
    expect(normalizeFaction('Alpha Legion')).toBe('chaos-space-marines')
    expect(normalizeFaction('Night Lords')).toBe('chaos-space-marines')
    expect(normalizeFaction('Iron Warriors')).toBe('chaos-space-marines')
    expect(normalizeFaction('Word Bearers')).toBe('chaos-space-marines')
    expect(normalizeFaction('Red Corsairs')).toBe('chaos-space-marines')
  })

  it('maps tyranid aliases to tyranids', () => {
    expect(normalizeFaction('Forces of the Hive Mind')).toBe('tyranids')
    expect(normalizeFaction('Hive Fleet Kronos')).toBe('tyranids')
    expect(normalizeFaction('Hive Fleet Hyrda')).toBe('tyranids')
  })

  it('maps other aliases correctly', () => {
    expect(normalizeFaction('Flesh Tearers')).toBe('blood-angels')
    expect(normalizeFaction('Deathwing')).toBe('dark-angels')
    expect(normalizeFaction('Farsight Enclaves')).toBe('tau-empire')
    expect(normalizeFaction('Imperium')).toBe('imperial-agents')
    expect(normalizeFaction('Chaos')).toBe('chaos-space-marines')
    expect(normalizeFaction('Xenos')).toBe('aeldari')
  })

  it('handles both Genestealer spellings', () => {
    expect(normalizeFaction('Genestealer Cult')).toBe('genestealer-cults')
    expect(normalizeFaction('Genestealer Cults')).toBe('genestealer-cults')
  })

  it("returns '' for unknown factions", () => {
    expect(normalizeFaction('Not A Faction')).toBe('')
    expect(normalizeFaction('')).toBe('')
    expect(normalizeFaction('Squats')).toBe('')
  })
})

describe('getSubfactionParent', () => {
  it('returns parent for subfactions', () => {
    expect(getSubfactionParent('blood-angels')).toBe('space-marines')
    expect(getSubfactionParent('dark-angels')).toBe('space-marines')
    expect(getSubfactionParent('space-wolves')).toBe('space-marines')
    expect(getSubfactionParent('black-templars')).toBe('space-marines')
    expect(getSubfactionParent('deathwatch')).toBe('space-marines')
  })

  it('returns undefined for non-subfactions', () => {
    expect(getSubfactionParent('orks')).toBeUndefined()
    expect(getSubfactionParent('space-marines')).toBeUndefined()
    expect(getSubfactionParent('chaos-space-marines')).toBeUndefined()
    expect(getSubfactionParent('unknown')).toBeUndefined()
  })
})
