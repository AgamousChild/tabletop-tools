/**
 * Tests for the PackExtract → brain-node converter.
 *
 * Same synthetic-fixture rule as `parseFactionPackV2` — no GW content is
 * committed. Fixtures reconstruct only the structural shapes the v1 parser
 * used to emit so we can verify ID + category continuity.
 */
import { parseFactionPackV2 } from '@tabletop-tools/game-content/src/adapters/faction-pack/parser'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { _setFactionCodesForTesting, resetFactionCodes } from '../faction-codes'
import type { Node } from '../model'
import {
  applyFactionPackPatches,
  convertPackExtractToNodes,
  type DatasheetPatch,
  detectFactionPackEdition,
} from './faction-pack-v2-to-nodes'

beforeAll(() => {
  _setFactionCodesForTesting(
    new Map<string, string>([
      ['space-marines', 'space-marines'],
      ['orks', 'orks'],
    ]),
    new Set(['space-marines', 'orks']),
  )
})
afterAll(() => resetFactionCodes())

// Structural shape lifted from what the gw-sync structured parser emits. No
// GW rules text — the strings are neutral fixtures.
const SAMPLE_PACK = `
## SPEED FREEKS

Fast bikers go zoom.


##### DETACHMENT RULE

##### TURBO BONKS

Bikers get +2 Move. ENHANCEMENTS


##### LOUD HORN

Speed Freeks model only. Improves charge rolls. (15 pts)


*SPEED FREEKS — BATTLE TACTIC STRATAGEM*

Bike goes brrrr.

**WHEN:** Your Charge phase.

**TARGET:** One Speed Freeks unit.

**EFFECT:** That unit re-rolls charge rolls.
`.trim()

describe('convertPackExtractToNodes — 10e full-emission mode', () => {
  // The 10e (and default) path emits every shape as a node at its v1 id.
  let result: ReturnType<typeof convertPackExtractToNodes>
  beforeAll(() => {
    const extract = parseFactionPackV2(SAMPLE_PACK, { faction: 'orks' })
    result = convertPackExtractToNodes(extract, 'orks', '2026-07-01T00:00:00Z', '10th')
  })

  it('emits a detachment node with the v1 ID scheme', () => {
    const det = result.nodes.find((n) => n.id === 'det:orks:speed-freeks')
    expect(det).toBeDefined()
    expect(det?.category).toBe('detachment-rule')
    expect(det?.factionId).toBe('orks')
    expect(det?.edition).toBe('10th')
    expect(det?.detachmentId).toBe('speed-freeks')
  })

  it('emits a detachment rule as a faction-ability child of the detachment', () => {
    const rule = result.nodes.find((n) => n.id === 'det:orks:speed-freeks:turbo-bonks')
    expect(rule).toBeDefined()
    expect(rule?.category).toBe('faction-ability')
    expect(rule?.title).toBe('TURBO BONKS')
  })

  it('emits an enhancement node with the v1 nested id + cost', () => {
    const enh = result.nodes.find((n) => n.id === 'det:orks:speed-freeks:loud-horn')
    expect(enh).toBeDefined()
    expect(enh?.category).toBe('enhancement')
    expect(enh?.cost).toBe(15)
  })

  it('emits a stratagem with when/target/effect promoted onto structured fields', () => {
    const strat = result.nodes.find((n) => n.category === 'stratagem' && n.factionId === 'orks')
    expect(strat).toBeDefined()
    expect(strat?.id.startsWith('det:orks:speed-freeks:')).toBe(true)
    expect(strat?.when).toMatch(/Charge phase/i)
    expect(strat?.effect).toMatch(/re-rolls charge/i)
    expect(strat?.phase).toBe('charge')
  })

  it('emits a part_of ref from each child to its detachment', () => {
    const detId = 'det:orks:speed-freeks'
    const refs = result.refs.filter((r) => r.rel === 'part_of' && r.targetId === detId)
    // detachment rule + enhancement + stratagem
    expect(refs.length).toBeGreaterThanOrEqual(3)
  })

  it('returns an empty patches array in 10e mode', () => {
    expect(result.patches).toEqual([])
  })
})

describe('convertPackExtractToNodes — 11e split-emission mode', () => {
  // In 11e mode overlapping shapes come back as `patches`, NOT nodes. The
  // v1 slug nodes (`det:orks:speed-freeks`) MUST NOT appear.
  let result: ReturnType<typeof convertPackExtractToNodes>
  beforeAll(() => {
    const extract = parseFactionPackV2(SAMPLE_PACK, { faction: 'orks' })
    result = convertPackExtractToNodes(extract, 'orks', '2026-07-01T00:00:00Z', '11th')
  })

  it('emits ZERO unprefixed slug nodes for overlapping shapes', () => {
    const badIds = result.nodes.filter(
      (n) => n.id.startsWith('det:orks:') || n.id.startsWith('datasheet:orks:'),
    )
    expect(badIds).toEqual([])
  })

  it('emits a detachment-rule patch keyed by (factionId, category, targetSlug)', () => {
    const det = result.patches.find(
      (p) => p.category === 'detachment-rule' && p.targetSlug === 'speed-freeks',
    )
    expect(det).toBeDefined()
    expect(det?.factionId).toBe('orks')
    expect(det?.parentSlug).toBeUndefined()
    expect(det?.contentFields.title).toBe('Speed Freeks')
  })

  it('emits a faction-ability patch for the detachment rule keyed by parent slug', () => {
    const rule = result.patches.find(
      (p) =>
        p.category === 'faction-ability' &&
        p.targetSlug === 'turbo-bonks' &&
        p.parentSlug === 'speed-freeks',
    )
    expect(rule).toBeDefined()
    expect(rule?.contentFields.title).toBe('TURBO BONKS')
  })

  it('emits an enhancement patch with cost carried on contentFields', () => {
    const enh = result.patches.find(
      (p) =>
        p.category === 'enhancement' &&
        p.targetSlug === 'loud-horn' &&
        p.parentSlug === 'speed-freeks',
    )
    expect(enh).toBeDefined()
    expect(enh?.contentFields.cost).toBe(15)
  })

  it('emits a stratagem patch with when/target/effect/phase carried on contentFields', () => {
    const strat = result.patches.find(
      (p) => p.category === 'stratagem' && p.parentSlug === 'speed-freeks',
    )
    expect(strat).toBeDefined()
    expect(strat?.contentFields.when).toMatch(/Charge phase/i)
    expect(strat?.contentFields.effect).toMatch(/re-rolls charge/i)
    expect(strat?.contentFields.phase).toBe('charge')
  })

  it('every patch carries a fallbackNode at an `11e:*`-prefixed id', () => {
    expect(result.patches.length).toBeGreaterThan(0)
    for (const p of result.patches) {
      expect(p.fallbackNode).toBeDefined()
      expect(p.fallbackNode.id.startsWith('11e:')).toBe(true)
      expect(p.fallbackNode.edition).toBe('11th')
    }
  })
})

describe('applyFactionPackPatches', () => {
  function tankbustasTwin(overrides: Partial<Node> = {}): Node {
    return {
      id: '11e:000000020',
      layer: 'unit',
      category: 'datasheet',
      title: 'Tankbustas',
      content: 'stale 10e Tankbustas text',
      summary: 'Tankbustas — 10e.',
      factionId: 'orks',
      datasheetId: '11e:000000020',
      edition: '11th',
      sources: [
        {
          type: 'wahapedia',
          title: 'Wahapedia',
          retrievedAt: '2026-04-08T00:00:00.000Z',
          publishedAt: '2025-04-20',
        },
      ],
      refs: [],
      version: 1,
      keywords: ['infantry'],
      ...overrides,
    }
  }

  function fakeFallbackNode(id = '11e:fake', category: Node['category'] = 'datasheet'): Node {
    return {
      id,
      layer: 'unit',
      category,
      title: 'x',
      content: 'x',
      summary: 'x',
      factionId: 'orks',
      edition: '11th',
      sources: [{ type: 'pdf', title: 'x', retrievedAt: 'x' }],
      refs: [],
      version: 1,
      keywords: [],
    }
  }

  function tankbustasBombSquigsTwin(): Node {
    return {
      id: '11e:ability:000000020:bomb-squigs',
      layer: 'unit',
      category: 'unit-ability',
      title: 'Bomb Squigs',
      content: 'stale 10e Bomb Squigs body',
      summary: 'Bomb Squigs — 10e.',
      factionId: 'orks',
      datasheetId: '11e:000000020',
      edition: '11th',
      sources: [
        {
          type: 'wahapedia',
          title: 'Wahapedia',
          retrievedAt: '2026-04-08T00:00:00.000Z',
          publishedAt: '2025-04-20',
        },
      ],
      refs: [],
      version: 1,
      keywords: ['ability'],
    }
  }

  it('overlays a datasheet patch onto the matching twin by (factionId, category, targetSlug)', () => {
    const twins = [tankbustasTwin()]
    const patch: DatasheetPatch = {
      factionId: 'orks',
      category: 'datasheet',
      targetSlug: 'tankbustas',
      extraRefs: [],
      contentFields: {
        content: 'NEW 11e Tankbustas body',
        summary: 'NEW summary',
        keywords: ['infantry', 'tankbustas'],
      },
      fallbackNode: {
        id: '11e:datasheet:orks:tankbustas',
        layer: 'unit',
        category: 'datasheet',
        title: 'Tankbustas',
        content: 'fallback body',
        summary: 'fallback',
        factionId: 'orks',
        edition: '11th',
        sources: [{ type: 'pdf', title: 'x', retrievedAt: 'x' }],
        refs: [],
        version: 1,
        keywords: [],
      },
      fallbackRefs: [],
    }
    const result = applyFactionPackPatches(twins, [patch], '2026-02-11')
    expect(result.applied).toBe(1)
    expect(result.unmatched).toEqual([])
    expect(twins[0]!.content).toBe('NEW 11e Tankbustas body')
    expect(twins[0]!.summary).toBe('NEW summary')
    expect(twins[0]!.updatedInEleventh).toBe(true)
    expect(twins[0]!.sources[0]!.publishedAt).toBe('2026-02-11')
  })

  it('preserves the twin id, edition, factionId, layer, category, datasheetId', () => {
    const twins = [tankbustasTwin()]
    const patch: DatasheetPatch = {
      factionId: 'orks',
      category: 'datasheet',
      targetSlug: 'tankbustas',
      extraRefs: [],
      contentFields: {
        // Identity fields the patch pass MUST ignore.
        id: 'wrong-id',
        edition: '10th',
        factionId: 'space-marines',
        layer: 'core',
        category: 'stratagem',
        datasheetId: 'wrong-id',
        // Actual overlay:
        content: 'NEW body',
      } as Partial<Node>,
      fallbackNode: fakeFallbackNode(),
      fallbackRefs: [],
    }
    applyFactionPackPatches(twins, [patch])
    expect(twins[0]!.id).toBe('11e:000000020')
    expect(twins[0]!.edition).toBe('11th')
    expect(twins[0]!.factionId).toBe('orks')
    expect(twins[0]!.layer).toBe('unit')
    expect(twins[0]!.category).toBe('datasheet')
    expect(twins[0]!.datasheetId).toBe('11e:000000020')
    expect(twins[0]!.content).toBe('NEW body')
  })

  it('overlays a unit-ability patch keyed by (factionId, category, parentSlug, targetSlug)', () => {
    // The 11e Bomb Squigs body appears on THREE Ork units in the pack
    // (Tankbustas, Breaka Boyz, Meganobz). The patch pass must land the
    // Tankbustas patch on the Tankbustas twin's ability, NOT on Breaka
    // Boyz's ability. Slug matching on ability name alone is not enough.
    const twins = [tankbustasTwin(), tankbustasBombSquigsTwin()]
    const patch: DatasheetPatch = {
      factionId: 'orks',
      category: 'unit-ability',
      targetSlug: 'bomb-squigs',
      parentSlug: 'tankbustas',
      extraRefs: [],
      contentFields: {
        content:
          'Twice per battle, after this unit ends a Normal move, you can select one enemy unit within 12" of it and roll one D6: on a 2+, that enemy unit suffers D3 mortal wounds.',
        summary: 'NEW summary',
      },
      fallbackNode: fakeFallbackNode('11e:ability:orks:tankbustas:bomb-squigs', 'unit-ability'),
      fallbackRefs: [],
    }
    const result = applyFactionPackPatches(twins, [patch])
    expect(result.applied).toBe(1)
    expect(twins[1]!.content).toMatch(/Twice per battle/)
    expect(twins[1]!.updatedInEleventh).toBe(true)
  })

  it('reports unmatched patches without failing', () => {
    const twins = [tankbustasTwin()]
    const patch: DatasheetPatch = {
      factionId: 'orks',
      category: 'datasheet',
      targetSlug: 'nonexistent-unit',
      extraRefs: [],
      contentFields: { content: 'nowhere to land' },
      fallbackNode: fakeFallbackNode(),
      fallbackRefs: [],
    }
    const result = applyFactionPackPatches(twins, [patch])
    expect(result.applied).toBe(0)
    expect(result.unmatched).toEqual(['datasheet::orks::_::nonexistent-unit'])
  })

  it('emits fallback node + refs when a patch is unmatched (brand-new 11e entity)', () => {
    // Simulates a brand-new 11e detachment Wahapedia does not have — the
    // patch has no twin to overlay onto, so the fallback lands as a fresh
    // node at `11e:*`.
    const twins = [tankbustasTwin()]
    const fallback = fakeFallbackNode(
      '11e:det:adepta-sororitas:chorus-of-condemnation',
      'detachment-rule',
    )
    const fallbackRef = {
      sourceId: '11e:det:adepta-sororitas:chorus-of-condemnation:x',
      targetId: '11e:det:adepta-sororitas:chorus-of-condemnation',
      rel: 'part_of' as const,
      context: 'x',
      bidirectional: true,
    }
    const patch: DatasheetPatch = {
      factionId: 'adepta-sororitas',
      category: 'detachment-rule',
      targetSlug: 'chorus-of-condemnation',
      extraRefs: [],
      contentFields: { content: 'brand-new detachment' },
      fallbackNode: fallback,
      fallbackRefs: [fallbackRef],
    }
    const result = applyFactionPackPatches(twins, [patch])
    expect(result.applied).toBe(0)
    expect(result.fallbackNodes).toHaveLength(1)
    expect(result.fallbackNodes[0]!.id).toBe('11e:det:adepta-sororitas:chorus-of-condemnation')
    expect(result.fallbackRefs).toHaveLength(1)
  })

  it('re-emits extraRefs from patches (LEADER/SUPPORT edges)', () => {
    const twins = [tankbustasTwin()]
    const patch: DatasheetPatch = {
      factionId: 'orks',
      category: 'datasheet',
      targetSlug: 'tankbustas',
      extraRefs: [
        {
          sourceId: '11e:datasheet:orks:tankbustas',
          targetId: '11e:datasheet:orks:some-character',
          rel: 'can_lead',
          context: 'test',
          bidirectional: true,
        },
      ],
      contentFields: { content: 'body' },
      fallbackNode: fakeFallbackNode(),
      fallbackRefs: [],
    }
    const result = applyFactionPackPatches(twins, [patch])
    expect(result.extraRefs).toHaveLength(1)
    expect(result.extraRefs[0]!.rel).toBe('can_lead')
  })
})

describe('detectFactionPackEdition', () => {
  it('recognises 11e URL prefixes', () => {
    expect(detectFactionPackEdition('https://gw.example/eng_11-02_orks.pdf')).toBe('11th')
    expect(detectFactionPackEdition('https://gw.example/eng_07-01_tau.pdf')).toBe('11th')
  })
  it('defaults to 10th for anything else', () => {
    expect(detectFactionPackEdition('https://gw.example/eng_10-01_orks.pdf')).toBe('10th')
    expect(detectFactionPackEdition('')).toBe('10th')
  })
})

// ─── datasheet content shape (no ability/weapon body duplication) ───────────
//
// The pack v2 converter used to embed each ability's full body AND each
// weapon's full row inside the datasheet's `content` field. Ability bodies
// then existed in two places — the datasheet content rollup AND the
// separate `unit-ability` node emitted via a patch. `/browse/unit/:id`
// paid for both on every request.
//
// The fix strips both from `content` and lets ability + weapon child nodes
// carry the bodies. The datasheet `content` is now structural / summary
// only. `buildDatasheetCorpus` in `../vectorize-corpus.ts` re-attaches the
// bodies at index time so semantic search still surfaces the datasheet for
// ability-text queries.
describe('convertPackExtractToNodes — datasheet content does NOT embed ability/weapon bodies', () => {
  // Construct a fake PackExtract with a datasheet + inline abilities +
  // ranged/melee weapons. The v2 parser is not called here — we're testing
  // the converter's `buildDatasheetContent` directly through the emit path.
  function makeExtract(): Parameters<typeof convertPackExtractToNodes>[0] {
    return {
      faction: 'orks',
      source: { sourceCharCount: 0 },
      coverage: { extractedChars: 0, residueChars: 0, residuePercent: 0 },
      detachments: [],
      datasheets: [
        {
          name: 'TANKBUSTAS',
          isLegends: false,
          stats: { M: '6"', T: '4', SV: '5+', W: '1', LD: '7+', OC: '2' },
          rangedWeapons: [
            {
              name: 'Tankbusta bomb',
              range: '12"',
              A: '1',
              BS: '5+',
              S: '8',
              AP: '-1',
              D: 'D6',
              keywords: ['ANTI-VEHICLE 3+', 'ONE SHOT'],
              raw: 'Tankbusta bomb [ANTI-VEHICLE 3+, ONE SHOT] 12" 1 5+ 8 -1 D6',
            },
          ],
          meleeWeapons: [
            {
              name: 'Choppa',
              A: '2',
              WS: '4+',
              S: '4',
              AP: '0',
              D: '1',
              keywords: [],
              raw: 'Choppa Melee 2 4+ 4 0 1',
            },
          ],
          abilities: [
            {
              name: 'Bomb Squigs',
              kind: 'unit-specific',
              body: 'Twice per battle, after this unit ends a Normal move, you can select one enemy unit within 12" of it and roll one D6: on a 2+, that enemy unit suffers D3 mortal wounds.',
            },
          ],
          wargearOptions: [],
          unitComposition: { raw: '5 Tankbustas' },
          keywords: ['Infantry', 'Tankbustas'],
          factionKeywords: ['Orks'],
          attachableLeaders: [],
          leads: [],
          supports: [],
          designerNotes: [],
          raw: 'TANKBUSTAS raw block',
        },
      ],
      legendsDatasheets: [],
      armyRules: [],
      errata: [],
      faqs: [],
      extras: [],
      unparsed: [],
    }
  }

  it('10e: datasheet content contains NO ability body ("Twice per battle...")', () => {
    const result = convertPackExtractToNodes(makeExtract(), 'orks', '2026-07-01T00:00:00Z', '10th')
    const ds = result.nodes.find((n) => n.category === 'datasheet' && n.title === 'TANKBUSTAS')
    expect(ds).toBeDefined()
    expect(ds!.content).not.toMatch(/Twice per battle/)
    expect(ds!.content).not.toMatch(/suffers D3 mortal wounds/)
  })

  it('10e: datasheet content contains NO full weapon rows (no `[ANTI-VEHICLE 3+, ONE SHOT] 12" 1 5+ 8 -1 D6`)', () => {
    const result = convertPackExtractToNodes(makeExtract(), 'orks', '2026-07-01T00:00:00Z', '10th')
    const ds = result.nodes.find((n) => n.category === 'datasheet' && n.title === 'TANKBUSTAS')
    expect(ds).toBeDefined()
    expect(ds!.content).not.toMatch(/\[ANTI-VEHICLE 3\+/)
    expect(ds!.content).not.toMatch(/5\+ 8 -1 D6/)
  })

  it('10e: datasheet content STILL contains structural markers with names', () => {
    const result = convertPackExtractToNodes(makeExtract(), 'orks', '2026-07-01T00:00:00Z', '10th')
    const ds = result.nodes.find((n) => n.category === 'datasheet' && n.title === 'TANKBUSTAS')
    expect(ds).toBeDefined()
    // Section markers + names stay — they help retrieval without duplicating bodies.
    expect(ds!.content).toMatch(/RANGED WEAPONS: Tankbusta bomb/)
    expect(ds!.content).toMatch(/MELEE WEAPONS: Choppa/)
    expect(ds!.content).toMatch(/ABILITIES: Bomb Squigs/)
    // Structural / summary fields also stay.
    expect(ds!.content).toMatch(/KEYWORDS: Infantry, Tankbustas/)
    expect(ds!.content).toMatch(/FACTION KEYWORDS: Orks/)
    expect(ds!.content).toMatch(/UNIT COMPOSITION/)
  })

  it('10e: emits a separate unit-ability node that DOES carry the full body', () => {
    // Datasheet is emitted as a node in 10e mode. Wahapedia is the 10e source
    // of truth for ability child nodes, so v2 doesn't emit unit-ability nodes
    // in 10e mode either — it emits the datasheet with structural content.
    // The important invariant: bodies aren't duplicated in the datasheet
    // content. The Wahapedia parser (game-data.ts) is the sole storage of
    // 10e ability bodies as separate nodes.
    const result = convertPackExtractToNodes(makeExtract(), 'orks', '2026-07-01T00:00:00Z', '10th')
    const ds = result.nodes.find((n) => n.category === 'datasheet' && n.title === 'TANKBUSTAS')
    expect(ds!.content.length).toBeLessThan(500) // structural only, no bodies
  })

  it('11e: datasheet PATCH contentFields.content contains NO ability body', () => {
    const result = convertPackExtractToNodes(makeExtract(), 'orks', '2026-07-01T00:00:00Z', '11th')
    const dsPatch = result.patches.find(
      (p) => p.category === 'datasheet' && p.targetSlug === 'tankbustas',
    )
    expect(dsPatch).toBeDefined()
    expect(dsPatch!.contentFields.content).not.toMatch(/Twice per battle/)
    expect(dsPatch!.contentFields.content).not.toMatch(/suffers D3 mortal wounds/)
  })

  it('11e: ability PATCH contentFields.content DOES carry the full body', () => {
    // The full 11e ability body still lands — but on the unit-ability patch,
    // NOT on the datasheet patch. This is the storage layer's single source
    // of truth for the Bomb Squigs body.
    const result = convertPackExtractToNodes(makeExtract(), 'orks', '2026-07-01T00:00:00Z', '11th')
    const abPatch = result.patches.find(
      (p) =>
        p.category === 'unit-ability' &&
        p.targetSlug === 'bomb-squigs' &&
        p.parentSlug === 'tankbustas',
    )
    expect(abPatch).toBeDefined()
    expect(abPatch!.contentFields.content).toMatch(/Twice per battle/)
    expect(abPatch!.contentFields.content).toMatch(/suffers D3 mortal wounds/)
  })
})
