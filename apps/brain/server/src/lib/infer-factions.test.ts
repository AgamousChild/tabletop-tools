import { beforeEach, describe, expect, test } from 'vitest'

import { inferFactionsFromUnitNames, resetCubeCache } from './count'
import { buildCube } from './cube'
import type { Node } from './model'

const src = {
  type: 'wahapedia' as const,
  title: 'Wahapedia',
  retrievedAt: '2026-01-01T00:00:00Z',
}

function faction(id: string, name: string): Node {
  return {
    id: `faction-root:${id}`,
    layer: 'faction',
    category: 'faction',
    title: name,
    content: `${name} root.`,
    summary: name,
    factionId: id,
    factionName: name,
    edition: '11th',
    sources: [src],
    refs: [],
    version: 1,
    keywords: [id],
  }
}

function unit(id: string, factionId: string, title: string, edition = '11th'): Node {
  return {
    id,
    layer: 'unit',
    category: 'datasheet',
    title,
    content: `${title} datasheet.`,
    summary: title,
    factionId,
    edition,
    sources: [src],
    refs: [],
    version: 1,
    keywords: [factionId, title.toLowerCase()],
  }
}

const subfactions = [
  { id: 'dark-angels', name: 'Dark Angels', factionId: 'space-marines' },
  { id: 'blood-angels', name: 'Blood Angels', factionId: 'space-marines' },
]

function fakeBucket(nodes: Node[]) {
  const cube = buildCube(nodes, subfactions)
  const store = new Map<string, string>()
  store.set('cube/fact_node.jsonl', cube.factNodesJsonl)
  store.set('cube/dim_faction.json', JSON.stringify(cube.dimFaction))
  store.set('cube/dim_keyword.json', JSON.stringify(cube.dimKeyword))
  store.set('cube/rollup_faction_dp.json', JSON.stringify(cube.rollupFactionDp))
  store.set(
    'cube/rollup_faction_category_edition.json',
    JSON.stringify(cube.rollupFactionCategoryEdition),
  )
  store.set('manifest.json', JSON.stringify({ hash: 'test' }))
  return {
    get: async (key: string) => {
      const v = store.get(key)
      if (v === undefined) return null
      return {
        text: async () => v,
        json: async <T>() => JSON.parse(v) as T,
      }
    },
    put: async () => null,
  }
}

describe('inferFactionsFromUnitNames', () => {
  beforeEach(() => resetCubeCache())

  test('space-marines-only units → factions=[space-marines]', async () => {
    const bucket = fakeBucket([
      faction('space-marines', 'Space Marines'),
      faction('dark-angels', 'Dark Angels'),
      unit('u1', 'space-marines', 'Eradicators'),
      unit('u2', 'space-marines', 'Ballistus Dreadnought'),
    ])
    const r = await inferFactionsFromUnitNames(
      bucket,
      'Would Eradicators be a good addition with a Ballistus Dreadnought?',
    )
    expect(r.factions).toEqual(['space-marines'])
    expect(r.matches.map((m) => m.title).sort()).toEqual(['Ballistus Dreadnought', 'Eradicators'])
  })

  test('chapter-only unit → factions=[chapter], NOT space-marines', async () => {
    const bucket = fakeBucket([
      faction('space-marines', 'Space Marines'),
      faction('dark-angels', 'Dark Angels'),
      unit('u1', 'dark-angels', 'Deathwing Knights'),
    ])
    const r = await inferFactionsFromUnitNames(bucket, 'Are Deathwing Knights any good?')
    expect(r.factions).toEqual(['dark-angels'])
  })

  test('mix of SM-parent + chapter unit → chapter wins (parent dropped)', async () => {
    // Micah's rule: "if its space marines units its just space marines unless
    // another sub-faction (chapter) is also included."
    const bucket = fakeBucket([
      faction('space-marines', 'Space Marines'),
      faction('dark-angels', 'Dark Angels'),
      unit('u1', 'space-marines', 'Eradicators'),
      unit('u2', 'dark-angels', 'Deathwing Knights'),
    ])
    const r = await inferFactionsFromUnitNames(
      bucket,
      'Should I take Eradicators and Deathwing Knights together?',
    )
    expect(r.factions.sort()).toEqual(['dark-angels'])
  })

  test('multiple chapters + parent → all chapters, drop parent', async () => {
    const bucket = fakeBucket([
      faction('space-marines', 'Space Marines'),
      faction('dark-angels', 'Dark Angels'),
      faction('blood-angels', 'Blood Angels'),
      unit('u1', 'space-marines', 'Intercessor Squad'),
      unit('u2', 'dark-angels', 'Deathwing Knights'),
      unit('u3', 'blood-angels', 'Death Company'),
    ])
    const r = await inferFactionsFromUnitNames(
      bucket,
      'Intercessor Squad vs Deathwing Knights vs Death Company matchup?',
    )
    expect(r.factions.sort()).toEqual(['blood-angels', 'dark-angels'])
  })

  test('non-SM faction → single-faction inference', async () => {
    const bucket = fakeBucket([faction('orks', 'Orks'), unit('u1', 'orks', 'Killa Kans')])
    const r = await inferFactionsFromUnitNames(bucket, 'how many Killa Kans should I run?')
    expect(r.factions).toEqual(['orks'])
  })

  test('no matching unit names → empty result', async () => {
    const bucket = fakeBucket([faction('orks', 'Orks'), unit('u1', 'orks', 'Killa Kans')])
    const r = await inferFactionsFromUnitNames(bucket, 'what is the current meta?')
    expect(r.factions).toEqual([])
    expect(r.matches).toEqual([])
  })

  test('multi-word unit name is matched as one match, not split into shorter matches', async () => {
    const bucket = fakeBucket([
      faction('space-marines', 'Space Marines'),
      unit('u1', 'space-marines', 'Ballistus Dreadnought'),
      unit('u2', 'space-marines', 'Redemptor Dreadnought'),
    ])
    const r = await inferFactionsFromUnitNames(
      bucket,
      'I have a Ballistus Dreadnought — good pick?',
    )
    // Should match "Ballistus Dreadnought" as one match, NOT also match
    // "Dreadnought" against Redemptor Dreadnought.
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0]!.title).toBe('Ballistus Dreadnought')
  })
})
