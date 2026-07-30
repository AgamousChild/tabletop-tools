import { describe, expect, it } from 'vitest'

import {
  type BrainDetachment,
  type DimDetachmentRow,
  parseBrainDetachments,
  planDetachmentSync,
} from './meta-detachment-sync'

// Lines shaped exactly like the brain cube export.
const LINES = [
  '{"id":"11e:det:adeptus-custodes:shield-host","factionId":"adeptus-custodes","category":"detachment","edition":"11th","title":"Shield Host","dp":2}',
  '{"id":"11e:det:drukhari:reapers-wager","factionId":"drukhari","category":"detachment","edition":"11th","title":"Reaper’s Wager","dp":3}',
  '{"id":"11e:det:astra-militarum:steel-hammer","factionId":"astra-militarum","category":"detachment","edition":"11th","title":"Steel Hammer","dp":2}',
  // wrong edition — must be ignored
  '{"id":"10e:det:orks:war-horde","factionId":"orks","category":"detachment","edition":"10th","title":"War Horde","dp":2}',
  // wrong category — must be ignored
  '{"id":"11e:strat:orks:waaagh","factionId":"orks","category":"stratagem","edition":"11th","title":"Waaagh","dp":1}',
  // dp outside the legal 1-3 range — must be ignored rather than stored
  '{"id":"11e:det:orks:bad-dp","factionId":"orks","category":"detachment","edition":"11th","title":"Bad","dp":0}',
  'not json at all',
  '',
]

describe('parseBrainDetachments', () => {
  it('keeps only 11e detachments with a legal dp and strips the id prefix', () => {
    const parsed = parseBrainDetachments(LINES)
    expect(parsed.map((p) => p.id)).toEqual([
      'adeptus-custodes:shield-host',
      'drukhari:reapers-wager',
      'astra-militarum:steel-hammer',
    ])
    expect(parsed.find((p) => p.id === 'drukhari:reapers-wager')!.dp).toBe(3)
  })
})

describe('planDetachmentSync', () => {
  const brain: BrainDetachment[] = parseBrainDetachments(LINES)
  const factions = new Set(['adeptus-custodes', 'drukhari', 'astra-militarum'])

  it('matches across the two slug conventions instead of by raw id', () => {
    // dim writes the apostrophe as "-s-"; brain drops it entirely.
    const dims: DimDetachmentRow[] = [
      { id: 'drukhari:reaper-s-wager', name: 'Reaper’s Wager', factionId: 'drukhari', dp: null },
    ]
    const plan = planDetachmentSync(brain, dims, factions)

    // Matched on compact key -> a dp update, NOT an insert of a duplicate row.
    expect(plan.dpUpdates).toEqual([{ id: 'drukhari:reaper-s-wager', dp: 3, from: null }])
    expect(plan.inserts.map((i) => i.id)).not.toContain('drukhari:reapers-wager')
  })

  it('inserts 11e detachments the dim lacks', () => {
    const plan = planDetachmentSync(brain, [], factions)
    expect(plan.inserts.map((i) => i.id)).toEqual([
      'adeptus-custodes:shield-host',
      'drukhari:reapers-wager',
      'astra-militarum:steel-hammer',
    ])
  })

  it('does not re-update a dp that already matches', () => {
    const dims: DimDetachmentRow[] = [
      {
        id: 'adeptus-custodes:shield-host',
        name: 'Shield Host',
        factionId: 'adeptus-custodes',
        dp: 2,
      },
    ]
    const plan = planDetachmentSync(brain, dims, factions)
    expect(plan.dpUpdates.map((u) => u.id)).not.toContain('adeptus-custodes:shield-host')
  })

  it('blocks inserts for factions absent from dim_faction rather than failing the batch', () => {
    const plan = planDetachmentSync(brain, [], new Set(['drukhari']))
    expect(plan.inserts.map((i) => i.id)).toEqual(['drukhari:reapers-wager'])
    expect(plan.blockedByFaction.map((b) => b.factionId).sort()).toEqual([
      'adeptus-custodes',
      'astra-militarum',
    ])
  })

  it('reports dim rows with no brain counterpart without touching them', () => {
    const dims: DimDetachmentRow[] = [
      { id: 'aeldari:khaine-s-arrow', name: "Khaine's Arrow", factionId: 'aeldari', dp: null },
    ]
    const plan = planDetachmentSync(brain, dims, factions)
    expect(plan.dimOnly.map((d) => d.id)).toEqual(['aeldari:khaine-s-arrow'])
    expect(plan.dpUpdates).toEqual([])
  })
})
