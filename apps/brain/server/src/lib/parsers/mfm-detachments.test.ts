import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { _setFactionCodesForTesting, resetFactionCodes } from '../faction-codes'
import type { Node } from '../model'
import { parseMfmDetachments } from './mfm-detachments'

const RETRIEVED_AT = '2026-06-28T00:00:00Z'
const PUBLISHED_AT = '2026-06-15'

beforeAll(() => {
  _setFactionCodesForTesting(
    new Map<string, string>([
      ['space-marines', 'space-marines'],
      ['chaos-knights', 'chaos-knights'],
      ['tau-empire', 't-au-empire'],
      ['t-au-empire', 't-au-empire'],
      ['tyranids', 'tyranids'],
      ['aeldari', 'aeldari'],
    ]),
    new Set(['space-marines', 'chaos-knights', 't-au-empire', 'tyranids', 'aeldari']),
  )
})
afterAll(() => resetFactionCodes())

function findNode(nodes: Node[], id: string): Node {
  const node = nodes.find((n) => n.id === id)
  if (!node) throw new Error(`Expected node ${id} in result`)
  return node
}

describe('parseMfmDetachments', () => {
  it('emits a detachment node per row with dp and objective in content', () => {
    const sample = JSON.stringify([
      {
        factionSlug: 'space-marines',
        name: 'Gladius Task Force',
        dp: 2,
        objective: 'A versatile Codex-aligned strike force.',
        enhancements: [],
      },
    ])
    const result = parseMfmDetachments(sample, RETRIEVED_AT, PUBLISHED_AT)
    expect(result.totalDetachments).toBe(1)
    expect(result.nodes).toHaveLength(1)
    const det = findNode(result.nodes, 'mfm:det:space-marines:gladius-task-force')
    expect(det.category).toBe('detachment')
    expect(det.layer).toBe('faction')
    expect(det.edition).toBe('11th')
    expect(det.factionId).toBe('space-marines')
    expect(det.content).toContain('**Detachment Points:** 2')
    expect(det.content).toContain('A versatile Codex-aligned strike force.')
    expect(det.summary).toContain('(2 DP)')
  })

  it('preserves unique sub-faction restriction on the detachment node', () => {
    const sample = JSON.stringify([
      {
        factionSlug: 'space-marines',
        name: 'Unforgiven Task Force',
        dp: 3,
        objective: 'Strike the foes of the First Legion.',
        unique: 'Dark Angels',
        enhancements: [],
      },
    ])
    const result = parseMfmDetachments(sample, RETRIEVED_AT, PUBLISHED_AT)
    const det = findNode(result.nodes, 'mfm:det:space-marines:unforgiven-task-force')
    expect(det.subfaction).toBe('Dark Angels')
    expect(det.content).toContain('**Unique to:** Dark Angels')
    expect(det.summary).toContain('restricted to Dark Angels')
    expect(det.keywords).toContain('dark angels')
  })

  it('emits an enhancement node per enhancement with detachmentId and points in content', () => {
    const sample = JSON.stringify([
      {
        factionSlug: 'space-marines',
        name: 'Gladius Task Force',
        dp: 2,
        objective: 'Strike force.',
        enhancements: [
          { name: 'Bound by Honour', points: 25 },
          { name: 'Artificer Armour', points: 15 },
        ],
      },
    ])
    const result = parseMfmDetachments(sample, RETRIEVED_AT, PUBLISHED_AT)
    expect(result.totalEnhancements).toBe(2)
    const enh = findNode(result.nodes, 'mfm:enh:space-marines:gladius-task-force:bound-by-honour')
    expect(enh.category).toBe('enhancement')
    expect(enh.layer).toBe('faction')
    expect(enh.edition).toBe('11th')
    expect(enh.detachmentId).toBe('mfm:det:space-marines:gladius-task-force')
    expect(enh.content).toContain('(25 pts)')
    expect(enh.summary).toContain('25 pts')
  })

  it('surfaces leaderTo list in enhancement content and keywords', () => {
    const sample = JSON.stringify([
      {
        factionSlug: 'space-marines',
        name: 'Anvil Strike Force',
        dp: 2,
        objective: 'Defensive shooting force.',
        enhancements: [
          {
            name: 'Tome of Malcador',
            points: 25,
            leaderTo: ['Lieutenant', 'Captain'],
          },
        ],
      },
    ])
    const result = parseMfmDetachments(sample, RETRIEVED_AT, PUBLISHED_AT)
    const enh = findNode(result.nodes, 'mfm:enh:space-marines:anvil-strike-force:tome-of-malcador')
    expect(enh.content).toContain('**Leader to:** Lieutenant, Captain')
    expect(enh.summary).toContain('Grants Leader to: Lieutenant, Captain')
    expect(enh.keywords).toContain('lieutenant')
    expect(enh.keywords).toContain('captain')
  })

  it('emits a part_of ref from each enhancement → its parent detachment', () => {
    const sample = JSON.stringify([
      {
        factionSlug: 'chaos-knights',
        name: 'Traitoris Lance',
        dp: 1,
        objective: 'Lance of betrayal.',
        enhancements: [{ name: 'Mark of the Hound', points: 20 }],
      },
    ])
    const result = parseMfmDetachments(sample, RETRIEVED_AT, PUBLISHED_AT)
    expect(result.refs).toHaveLength(1)
    expect(result.refs[0]).toMatchObject({
      sourceId: 'mfm:enh:chaos-knights:traitoris-lance:mark-of-the-hound',
      targetId: 'mfm:det:chaos-knights:traitoris-lance',
      rel: 'part_of',
    })
  })

  it('normalizes faction slugs through normalizeFactionId (tau-empire → t-au-empire)', () => {
    const sample = JSON.stringify([
      {
        factionSlug: 'tau-empire',
        name: 'Mont’ka',
        dp: 2,
        objective: 'Killing Blow doctrine.',
        enhancements: [{ name: 'Puretide Engram Neurochip', points: 25 }],
      },
    ])
    const result = parseMfmDetachments(sample, RETRIEVED_AT, PUBLISHED_AT)
    const det = result.nodes.find((n) => n.category === 'detachment')
    expect(det).toBeDefined()
    expect(det!.factionId).toBe('t-au-empire')
    expect(det!.id.startsWith('mfm:det:t-au-empire:')).toBe(true)
    const enh = result.nodes.find((n) => n.category === 'enhancement')
    expect(enh!.factionId).toBe('t-au-empire')
    expect(enh!.detachmentId).toBe(det!.id)
  })

  it('skips rows that omit a name or factionSlug and counts only valid ones', () => {
    const sample = JSON.stringify([
      {
        factionSlug: 'tyranids',
        name: 'Vanguard Onslaught',
        dp: 2,
        objective: 'x',
        enhancements: [],
      },
      { factionSlug: 'tyranids', name: '', dp: 1, objective: 'y', enhancements: [] },
      { name: 'No Faction', dp: 1, objective: 'z', enhancements: [] },
    ])
    const result = parseMfmDetachments(sample, RETRIEVED_AT, PUBLISHED_AT)
    expect(result.totalDetachments).toBe(1)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]!.title).toBe('Vanguard Onslaught')
  })

  it('throws on a non-array JSON root', () => {
    expect(() => parseMfmDetachments('{}', RETRIEVED_AT)).toThrow(/expected a JSON array/i)
  })

  it('returns an empty result for an empty array', () => {
    const result = parseMfmDetachments('[]', RETRIEVED_AT)
    expect(result.nodes).toHaveLength(0)
    expect(result.refs).toHaveLength(0)
    expect(result.totalDetachments).toBe(0)
    expect(result.totalEnhancements).toBe(0)
  })

  it('omits a publishedAt source field when none is provided', () => {
    const sample = JSON.stringify([
      {
        factionSlug: 'aeldari',
        name: 'Windrider Host',
        dp: 1,
        objective: 'Fast cavalry strike.',
        enhancements: [],
      },
    ])
    const result = parseMfmDetachments(sample, RETRIEVED_AT)
    const det = result.nodes[0]!
    expect(det.sources[0]!.retrievedAt).toBe(RETRIEVED_AT)
    expect(det.sources[0]!.publishedAt).toBeUndefined()
  })
})
