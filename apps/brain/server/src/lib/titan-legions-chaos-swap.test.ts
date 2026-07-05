import { describe, expect, it } from 'vitest'

import type { Node, NodeRef } from './model'
import { emitChaosTitanLegionsVariants, swapKeywords } from './titan-legions-chaos-swap'

// Test fixtures reconstruct only the structural shapes we need — no GW
// text is committed. The two keyword-swap strings are the ones GW publishes
// as a public rule, not private content.

describe('swapKeywords', () => {
  it('replaces Adeptus Titanicus with Titanicus Traitoris (preserving Title Case)', () => {
    expect(swapKeywords('FACTION KEYWORDS: Adeptus Titanicus')).toBe(
      'FACTION KEYWORDS: Titanicus Traitoris',
    )
  })

  it('replaces ADEPTUS TITANICUS with TITANICUS TRAITORIS (preserving ALL CAPS)', () => {
    expect(swapKeywords('ADEPTUS TITANICUS')).toBe('TITANICUS TRAITORIS')
  })

  it('replaces Imperium with Chaos (Title Case)', () => {
    expect(swapKeywords('KEYWORDS: Vehicle, Walker, Imperium, Warhound Titan')).toBe(
      'KEYWORDS: Vehicle, Walker, Chaos, Warhound Titan',
    )
  })

  it('replaces IMPERIUM with CHAOS (ALL CAPS)', () => {
    expect(swapKeywords('IMPERIUM')).toBe('CHAOS')
  })

  it('replaces imperium with chaos (lower)', () => {
    expect(swapKeywords('every model in your army has the imperium keyword')).toBe(
      'every model in your army has the chaos keyword',
    )
  })

  it('handles both swaps in one string', () => {
    expect(
      swapKeywords(
        'If your Army Faction is Adeptus Titanicus and every model has the Imperium keyword...',
      ),
    ).toBe('If your Army Faction is Titanicus Traitoris and every model has the Chaos keyword...')
  })

  it('does not replace unrelated words that contain "Imperium" as a substring', () => {
    // Contrived — the regex uses \b so word-boundary is enforced.
    expect(swapKeywords('the Imperiums (plural)')).toBe('the Imperiums (plural)')
  })

  it('is idempotent — running twice produces the same output', () => {
    const once = swapKeywords('Adeptus Titanicus Imperium Warhound')
    const twice = swapKeywords(once)
    expect(twice).toBe(once)
  })

  it('handles empty/undefined input', () => {
    expect(swapKeywords('')).toBe('')
  })

  it('leaves unrelated text untouched', () => {
    expect(swapKeywords('Space Marines')).toBe('Space Marines')
    expect(swapKeywords('Chaos Space Marines')).toBe('Chaos Space Marines')
  })
})

// ── emitChaosTitanLegionsVariants ────────────────────────────────────────

function makeDatasheet(id: string, title: string, extra: Partial<Node> = {}): Node {
  return {
    id,
    layer: 'unit',
    category: 'datasheet',
    factionId: 'adeptus-titanicus',
    factionName: 'ADEPTUS TITANICUS',
    title,
    content: `KEYWORDS: Vehicle, Imperium, ${title}\n\nFACTION KEYWORDS: Adeptus Titanicus`,
    summary: `${title} — Imperium Titan`,
    keywords: ['imperium', 'adeptus titanicus', 'titan'],
    sources: [{ type: 'pdf', title: 'Test Source', retrievedAt: '2026-07-01T00:00:00Z' }],
    refs: [],
    version: 1,
    edition: '10th',
    datasheetId: id,
    ...extra,
  }
}

describe('emitChaosTitanLegionsVariants', () => {
  it('emits a chaos variant for every adeptus-titanicus node', () => {
    const nodes: Node[] = [
      makeDatasheet('datasheet:adeptus-titanicus:warhound-titan', 'WARHOUND TITAN'),
      makeDatasheet('datasheet:adeptus-titanicus:reaver-titan', 'REAVER TITAN'),
    ]
    const result = emitChaosTitanLegionsVariants(nodes, [])
    expect(result.nodes).toHaveLength(2)
    for (const n of result.nodes) {
      expect(n.factionId).toBe('chaos-titan-legions')
      expect(n.id.startsWith('chaos-titan-legions:')).toBe(true)
    }
  })

  it('applies keyword swap to title, content, summary, keywords, factionName', () => {
    const nodes: Node[] = [
      makeDatasheet('datasheet:adeptus-titanicus:warhound-titan', 'WARHOUND TITAN'),
    ]
    const result = emitChaosTitanLegionsVariants(nodes, [])
    const chaos = result.nodes[0]!
    expect(chaos.content).toContain('Chaos')
    expect(chaos.content).not.toMatch(/\bImperium\b/)
    expect(chaos.content).toContain('Titanicus Traitoris')
    expect(chaos.content).not.toContain('Adeptus Titanicus')
    expect(chaos.factionName).toBe('TITANICUS TRAITORIS')
    expect(chaos.keywords).toContain('chaos')
    expect(chaos.keywords).toContain('titanicus traitoris')
  })

  it('preserves the edition (10e stays 10e, 11e twin stays 11e)', () => {
    const nodes: Node[] = [
      makeDatasheet('datasheet:adeptus-titanicus:warhound-titan', 'WARHOUND TITAN', {
        edition: '10th',
      }),
      makeDatasheet('11e:000000867', 'Warhound Titan', { edition: '11th' }),
    ]
    const result = emitChaosTitanLegionsVariants(nodes, [])
    const tenth = result.nodes.find((n) => n.edition === '10th')
    const eleventh = result.nodes.find((n) => n.edition === '11th')
    expect(tenth).toBeDefined()
    expect(eleventh).toBeDefined()
    expect(tenth!.id).toBe('chaos-titan-legions:datasheet:adeptus-titanicus:warhound-titan')
    expect(eleventh!.id).toBe('chaos-titan-legions:11e:000000867')
  })

  it('rewrites datasheetId + detachmentId to the chaos variant id', () => {
    const nodes: Node[] = [
      makeDatasheet('datasheet:adeptus-titanicus:warhound-titan', 'WARHOUND TITAN', {
        datasheetId: 'datasheet:adeptus-titanicus:warhound-titan',
      }),
      {
        id: 'weapon:datasheet:adeptus-titanicus:warhound-titan:vulcan',
        layer: 'unit',
        category: 'weapon',
        factionId: 'adeptus-titanicus',
        datasheetId: 'datasheet:adeptus-titanicus:warhound-titan',
        title: 'Vulcan Mega-Bolter',
        content: 'A big gun.',
        summary: 'gun',
        keywords: [],
        sources: [{ type: 'pdf', title: 'Test Source', retrievedAt: '2026-07-01T00:00:00Z' }],
        refs: [],
        version: 1,
        edition: '10th',
      },
    ]
    const result = emitChaosTitanLegionsVariants(nodes, [])
    const chaosWeapon = result.nodes.find((n) => n.category === 'weapon')!
    expect(chaosWeapon.datasheetId).toBe(
      'chaos-titan-legions:datasheet:adeptus-titanicus:warhound-titan',
    )
  })

  it('translates ref endpoints through the id-map when they hit the swap set', () => {
    const datasheet = makeDatasheet('datasheet:adeptus-titanicus:warhound-titan', 'WARHOUND TITAN')
    const ability: Node = {
      id: 'ability:adeptus-titanicus:flank-speed',
      layer: 'unit',
      category: 'unit-ability',
      factionId: 'adeptus-titanicus',
      datasheetId: 'datasheet:adeptus-titanicus:warhound-titan',
      title: 'Flank Speed',
      content: 'go fast',
      summary: 'go fast',
      keywords: [],
      sources: [{ type: 'pdf', title: 'Test Source', retrievedAt: '2026-07-01T00:00:00Z' }],
      refs: [],
      version: 1,
      edition: '10th',
    }
    const refs: NodeRef[] = [
      {
        sourceId: 'ability:adeptus-titanicus:flank-speed',
        targetId: 'datasheet:adeptus-titanicus:warhound-titan',
        rel: 'part_of',
        context: 'Flank Speed is an Adeptus Titanicus Imperium ability.',
        bidirectional: true,
      },
    ]
    const result = emitChaosTitanLegionsVariants([datasheet, ability], refs)
    const chaosRef = result.refs[0]!
    expect(chaosRef.sourceId).toBe('chaos-titan-legions:ability:adeptus-titanicus:flank-speed')
    expect(chaosRef.targetId).toBe('chaos-titan-legions:datasheet:adeptus-titanicus:warhound-titan')
    expect(chaosRef.context).toContain('Titanicus Traitoris')
    expect(chaosRef.context).toContain('Chaos')
  })

  it('skips nodes whose factionId is not adeptus-titanicus', () => {
    const nodes: Node[] = [
      makeDatasheet('datasheet:adeptus-titanicus:warhound-titan', 'WARHOUND TITAN'),
      {
        ...makeDatasheet('datasheet:orks:tankbustas', 'TANKBUSTAS'),
        factionId: 'orks',
      },
    ]
    const result = emitChaosTitanLegionsVariants(nodes, [])
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]!.title).toBe('WARHOUND TITAN'.replace('WARHOUND', 'WARHOUND')) // Unchanged
  })

  it('is idempotent when the input already contains chaos-titan-legions nodes', () => {
    const nodes: Node[] = [
      makeDatasheet('datasheet:adeptus-titanicus:warhound-titan', 'WARHOUND TITAN'),
    ]
    const first = emitChaosTitanLegionsVariants(nodes, [])
    // Feed the union (loyalist + chaos) back in. The chaos nodes have
    // factionId='chaos-titan-legions', so they should be skipped on the
    // second pass — output equals the first pass's output.
    const combined = [...nodes, ...first.nodes]
    const second = emitChaosTitanLegionsVariants(combined, [])
    expect(second.nodes).toHaveLength(1)
    expect(second.nodes[0]!.id).toBe(first.nodes[0]!.id)
    expect(second.nodes[0]!.content).toBe(first.nodes[0]!.content)
  })

  it('produces a chaos variant that renders the Titanicus Traitoris keyword swap end-to-end', () => {
    // End-to-end smoke: build a loyalist datasheet that mirrors the shape
    // build-graph emits, run the swap, verify the chaos counterpart is
    // internally consistent (matched-shape id + swapped keywords).
    const loyalist: Node = {
      id: 'datasheet:adeptus-titanicus:warhound-titan',
      layer: 'unit',
      category: 'datasheet',
      factionId: 'adeptus-titanicus',
      factionName: 'ADEPTUS TITANICUS',
      title: 'WARHOUND TITAN',
      content:
        'KEYWORDS: Vehicle, Walker, Titanic, Towering, Imperium, Warhound Titan\n\n' +
        'FACTION KEYWORDS: Adeptus Titanicus',
      summary: 'WARHOUND TITAN — Adeptus Titanicus Titan',
      keywords: ['vehicle', 'imperium', 'titan', 'adeptus titanicus'],
      sources: [
        {
          type: 'pdf',
          title: 'Faction Pack: Adeptus Titanicus',
          retrievedAt: '2026-07-01T00:00:00Z',
        },
      ],
      refs: [],
      version: 1,
      edition: '10th',
      datasheetId: 'datasheet:adeptus-titanicus:warhound-titan',
    }
    const result = emitChaosTitanLegionsVariants([loyalist], [])
    expect(result.nodes).toHaveLength(1)
    const chaos = result.nodes[0]!
    expect(chaos.id).toBe('chaos-titan-legions:datasheet:adeptus-titanicus:warhound-titan')
    expect(chaos.factionId).toBe('chaos-titan-legions')
    expect(chaos.factionName).toBe('TITANICUS TRAITORIS')
    expect(chaos.title).toBe('WARHOUND TITAN') // Title has no swap targets
    expect(chaos.content).toContain('Chaos, Warhound Titan')
    expect(chaos.content).toContain('FACTION KEYWORDS: Titanicus Traitoris')
    expect(chaos.content).not.toContain('Adeptus Titanicus')
    expect(chaos.content).not.toMatch(/\bImperium\b/)
    expect(chaos.keywords).toContain('chaos')
    expect(chaos.keywords).toContain('titanicus traitoris')
    expect(chaos.datasheetId).toBe(chaos.id)
  })
})
