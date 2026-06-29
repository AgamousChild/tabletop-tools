import { describe, expect, it } from 'vitest'

import { duplicateEleventh, rekeyByEleventhSurfaceId } from './duplicate-eleventh'
import type { Node, NodeRef } from './model'

function tenthDatasheet(overrides: Partial<Node> = {}): Node {
  return {
    id: '000000135',
    layer: 'unit',
    category: 'datasheet',
    title: 'Captain in Terminator Armour',
    content: 'stat block + abilities',
    summary: 'Captain in Terminator Armour — Character.',
    factionId: 'space-marines',
    datasheetId: '000000135',
    edition: '10th',
    sources: [
      {
        type: 'wahapedia',
        title: 'Wahapedia 10th Edition',
        retrievedAt: '2026-04-08T00:00:00.000Z',
      },
    ],
    refs: [],
    version: 1,
    keywords: ['character', 'infantry'],
    ...overrides,
  }
}

function tenthWeapon(parentId: string, overrides: Partial<Node> = {}): Node {
  return {
    id: `weapon:${parentId}:storm-bolter`,
    layer: 'unit',
    category: 'weapon',
    title: 'Storm Bolter',
    content: '24" rapid fire',
    summary: 'Storm Bolter.',
    factionId: 'space-marines',
    datasheetId: parentId,
    edition: '10th',
    sources: [
      {
        type: 'wahapedia',
        title: 'Wahapedia 10th Edition',
        retrievedAt: '2026-04-08T00:00:00.000Z',
      },
    ],
    refs: [],
    version: 1,
    keywords: ['weapon'],
    ...overrides,
  }
}

describe('duplicateEleventh', () => {
  it('emits one 11e node per input node with 11e: prefix and 11th edition', () => {
    const captain = tenthDatasheet()
    const weapon = tenthWeapon('000000135')
    const { nodes } = duplicateEleventh([captain, weapon], [])

    expect(nodes).toHaveLength(2)
    const dupCaptain = nodes.find((n) => n.title === 'Captain in Terminator Armour')!
    expect(dupCaptain.id).toBe('11e:000000135')
    expect(dupCaptain.edition).toBe('11th')
    // 10e original is untouched (input array is shared but the function
    // shallow-clones what it mutates — verify by checking the captain we
    // passed in).
    expect(captain.id).toBe('000000135')
    expect(captain.edition).toBe('10th')

    const dupWeapon = nodes.find((n) => n.category === 'weapon')!
    expect(dupWeapon.id).toBe('11e:weapon:000000135:storm-bolter')
    expect(dupWeapon.edition).toBe('11th')
  })

  it('translates the datasheetId field on weapon/ability children so they point at the 11e parent', () => {
    const captain = tenthDatasheet()
    const weapon = tenthWeapon('000000135')
    const { nodes } = duplicateEleventh([captain, weapon], [])
    const dupWeapon = nodes.find((n) => n.category === 'weapon')!
    expect(dupWeapon.datasheetId).toBe('11e:000000135')
  })

  it('translates the datasheetId on the datasheet node itself so it equals its own surface id', () => {
    const captain = tenthDatasheet()
    const { nodes } = duplicateEleventh([captain], [])
    const dup = nodes[0]!
    expect(dup.id).toBe('11e:000000135')
    expect(dup.datasheetId).toBe('11e:000000135')
  })

  it('translates ref endpoints that point at duplicated nodes', () => {
    const captain = tenthDatasheet()
    const weapon = tenthWeapon('000000135')
    const ref: NodeRef = {
      sourceId: weapon.id,
      targetId: captain.id,
      rel: 'part_of',
      context: 'Storm Bolter is equipped by Captain in Terminator Armour.',
      bidirectional: true,
    }
    const { refs } = duplicateEleventh([captain, weapon], [ref])

    expect(refs).toHaveLength(1)
    expect(refs[0]!.sourceId).toBe('11e:weapon:000000135:storm-bolter')
    expect(refs[0]!.targetId).toBe('11e:000000135')
    expect(refs[0]!.rel).toBe('part_of')
  })

  it('leaves ref endpoints alone when they point outside the duplicated slice', () => {
    // Core mechanic targets live outside the Wahapedia duplicate (core-rules
    // are emitted by a separate parser). The 11e copy should still point at
    // `core:sustained-hits`, not `11e:core:sustained-hits`.
    const weapon = tenthWeapon('000000135')
    const ref: NodeRef = {
      sourceId: weapon.id,
      targetId: 'core:sustained-hits',
      rel: 'requires',
      context: 'Storm Bolter has Sustained Hits.',
    }
    const { refs } = duplicateEleventh([weapon], [ref])

    expect(refs).toHaveLength(1)
    expect(refs[0]!.sourceId).toBe('11e:weapon:000000135:storm-bolter')
    expect(refs[0]!.targetId).toBe('core:sustained-hits')
  })

  it('translates detachmentId on stratagems/enhancements when the parent detachment is in the slice', () => {
    const detachment: Node = {
      id: 'det:space-marines:gladius',
      layer: 'faction',
      category: 'detachment-rule',
      title: 'Gladius Task Force',
      content: 'rules text',
      summary: 'Gladius.',
      factionId: 'space-marines',
      detachmentId: 'det:space-marines:gladius',
      edition: '10th',
      sources: [
        {
          type: 'wahapedia',
          title: 'Wahapedia 10th Edition',
          retrievedAt: '2026-04-08T00:00:00.000Z',
        },
      ],
      refs: [],
      version: 1,
      keywords: [],
    }
    const stratagem: Node = {
      id: 'det:space-marines:gladius:armour-of-contempt',
      layer: 'faction',
      category: 'stratagem',
      title: 'Armour of Contempt',
      content: 'EFFECT: ...',
      summary: 'Armour of Contempt.',
      factionId: 'space-marines',
      detachmentId: 'det:space-marines:gladius',
      edition: '10th',
      sources: [
        {
          type: 'wahapedia',
          title: 'Wahapedia 10th Edition',
          retrievedAt: '2026-04-08T00:00:00.000Z',
        },
      ],
      refs: [],
      version: 1,
      keywords: ['stratagem'],
    }
    const { nodes } = duplicateEleventh([detachment, stratagem], [])
    const dupStrat = nodes.find((n) => n.category === 'stratagem')!
    expect(dupStrat.id).toBe('11e:det:space-marines:gladius:armour-of-contempt')
    expect(dupStrat.detachmentId).toBe('11e:det:space-marines:gladius')
  })

  it('preserves structured fields (points, stats, cpCost) on the 11e copy', () => {
    const ds = tenthDatasheet({
      points: [{ models: '1 model', cost: 100 }],
      stats: { M: '5"', T: 5, SV: '2+', W: 5, LD: '6+', OC: 1 },
    })
    const { nodes } = duplicateEleventh([ds], [])
    expect(nodes[0]!.points).toEqual([{ models: '1 model', cost: 100 }])
    expect(nodes[0]!.stats).toEqual({ M: '5"', T: 5, SV: '2+', W: 5, LD: '6+', OC: 1 })
  })

  it('builds a usable 10e→11e id map', () => {
    const captain = tenthDatasheet()
    const weapon = tenthWeapon('000000135')
    const { idMap } = duplicateEleventh([captain, weapon], [])

    expect(idMap.get('000000135')).toBe('11e:000000135')
    expect(idMap.get('weapon:000000135:storm-bolter')).toBe('11e:weapon:000000135:storm-bolter')
  })

  it('10e and 11e nodes coexist when both are in the same output array', () => {
    const captain = tenthDatasheet()
    const { nodes: elevenNodes } = duplicateEleventh([captain], [])
    const all = [captain, ...elevenNodes]

    const tenth = all.find((n) => n.edition === '10th')!
    const eleventh = all.find((n) => n.edition === '11th')!
    expect(tenth.id).toBe('000000135')
    expect(eleventh.id).toBe('11e:000000135')
    expect(tenth.title).toBe(eleventh.title) // same content
  })
})

describe('rekeyByEleventhSurfaceId', () => {
  it('translates a BSData-hash-keyed map onto the 11e surface keyspace', () => {
    // MFM costing arrives keyed by BSData hash. The brain's surface ids are
    // Wahapedia numerics. The 11e copies prepend `11e:` to the surface id.
    const mfm = new Map<string, { points: number }>([
      ['5e35-ae82-23e4-bcef', { points: 95 }],
      ['ca59-3760-5efc-9846', { points: 65 }],
    ])
    const bsdataIdToSurfaceId = new Map<string, string>([
      ['5e35-ae82-23e4-bcef', '000000135'],
      ['ca59-3760-5efc-9846', '000001500'],
    ])
    const rekeyed = rekeyByEleventhSurfaceId(mfm, bsdataIdToSurfaceId)

    expect(rekeyed.get('11e:000000135')).toEqual({ points: 95 })
    expect(rekeyed.get('11e:000001500')).toEqual({ points: 65 })
    // 10e ids should never appear — that's the whole point.
    expect(rekeyed.has('5e35-ae82-23e4-bcef')).toBe(false)
    expect(rekeyed.has('000000135')).toBe(false)
  })

  it('drops rows whose BSData id has no surface mapping', () => {
    const mfm = new Map<string, { points: number }>([['orphan-hash', { points: 50 }]])
    const rekeyed = rekeyByEleventhSurfaceId(mfm, new Map())
    expect(rekeyed.size).toBe(0)
  })
})
