import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { _setFactionCodesForTesting, resetFactionCodes } from '../faction-codes'
import { parseBalanceDataslate } from './balance-dataslate'

beforeAll(() => {
  _setFactionCodesForTesting(
    new Map<string, string>([
      ['space-marines', 'space-marines'],
      ['blood-angels', 'blood-angels'],
      ['aoi', 'imperial-agents'],
      ['imperial-agents', 'imperial-agents'],
    ]),
    new Set(['space-marines', 'blood-angels', 'imperial-agents']),
  )
})
afterAll(() => resetFactionCodes())

const SAMPLE_DATASLATE = `
## BALANCE DATASLATE

#### VERSION 3.4

Welcome to the Balance Dataslate.

#### CORE RULES

##### STRATAGEMS THAT ALLOW A CLOSER SET UP RANGE

Some Stratagems allow units to be set up closer to enemy models than normal. Units set up using such Stratagems can be set up as close as 3" to enemy units.

##### MODIFYING A STRATAGEM'S CP COST

When a rule modifies the CP cost of a Stratagem, the modified cost is the cost you pay.

#### ADEPTA SORORITAS

##### ARMY RULE

Miracle dice: Change the second bullet point to read as follows. Once per phase, instead of rolling a D6, you can use one or more Miracle dice.

##### BRINGERS OF FLAME DETACHMENT

Cleansing Flames Enhancement: Change to read: The bearer has the Torrent ability on all ranged weapons.

#### ADEPTUS CUSTODES

No further changes at this time.

#### AELDARI

##### ARMY RULE

Strands of Fate: Change to read: At the start of each turn, roll 4 D6.
`.trim()

describe('parseBalanceDataslate', () => {
  // Parse lazily so the top-level beforeAll primes faction codes first.
  // Top-of-describe expressions run during vitest's collection phase,
  // before any beforeAll fires.
  let result: ReturnType<typeof parseBalanceDataslate>
  beforeAll(() => {
    result = parseBalanceDataslate(SAMPLE_DATASLATE, '2026-04-08')
  })

  it('creates balance-change nodes for core rules entries', () => {
    const core = result.nodes.filter((n) => !n.factionId)
    expect(core.length).toBe(2)
  })

  it('creates balance-change nodes for faction entries', () => {
    const sororitas = result.nodes.filter((n) => n.factionId === 'adepta-sororitas')
    expect(sororitas.length).toBe(2)
  })

  it('skips factions with no changes', () => {
    const custodes = result.nodes.filter((n) => n.factionId === 'adeptus-custodes')
    expect(custodes.length).toBe(0)
  })

  it('creates aeldari entry', () => {
    const aeldari = result.nodes.filter((n) => n.factionId === 'aeldari')
    expect(aeldari.length).toBe(1)
    expect(aeldari[0]!.content).toContain('Strands of Fate')
  })

  it('sets layer to balance on all nodes', () => {
    for (const node of result.nodes) {
      expect(node.layer).toBe('balance')
    }
  })

  it('generates modifies refs', () => {
    const modRefs = result.refs.filter((r) => r.rel === 'modifies')
    expect(modRefs.length).toBeGreaterThan(0)
  })

  it('skips version meta headings', () => {
    const version = result.nodes.find((n) => n.title.includes('VERSION'))
    expect(version).toBeUndefined()
  })

  it('is idempotent', () => {
    const result2 = parseBalanceDataslate(SAMPLE_DATASLATE, '2026-04-08')
    expect(result2.nodes.map((n) => n.id)).toEqual(result.nodes.map((n) => n.id))
  })
})

/**
 * gw-sync's PDF→markdown conversion sometimes splits a visual heading across
 * consecutive ##### lines with no body between them. The July 2026 Universal
 * Rules Updates exposes this: "STRATAGEMS THAT PREVENT UNITS FROM BEING
 * TARGETED" ends up as two headings, and before this fix the parser dropped
 * the first (empty body) and emitted the second alone with a truncated
 * title.
 */
describe('parseBalanceDataslate — split-heading recovery', () => {
  const SPLIT_HEADING_DATASLATE = `
## UNIVERSAL RULES UPDATES

#### VERSION 1.0

Legal for matched play from 22nd July 2026.

##### MODIFYING A STRATAGEM'S CP COST

Rules that enable you to target a friendly unit with a stratagem for 0CP reduce the CP cost by 1CP.

##### STRATAGEMS THAT CAN BE USED

##### MORE THAN ONCE PER PHASE/TURN

Parts of a rule that allow reuse of a stratagem require the stratagem's name to be specified.

##### STRATAGEMS THAT PREVENT UNITS FROM

##### BEING TARGETED

If a stratagem targets a unit, the range changes from 12" to 18".

##### STRATAGEMS THAT ADD NEW UNITS TO YOUR ARMY

Add the restriction: once per battle only.
`.trim()

  it('merges consecutive h5s when the first has no body', () => {
    const result = parseBalanceDataslate(SPLIT_HEADING_DATASLATE, '2026-07-24')
    const titles = result.nodes.map((n) => n.title.toUpperCase())
    expect(titles).toContain("MODIFYING A STRATAGEM'S CP COST")
    expect(titles).toContain('STRATAGEMS THAT CAN BE USED MORE THAN ONCE PER PHASE/TURN')
    expect(titles).toContain('STRATAGEMS THAT PREVENT UNITS FROM BEING TARGETED')
    expect(titles).toContain('STRATAGEMS THAT ADD NEW UNITS TO YOUR ARMY')
  })

  it('emits one node per merged heading (no orphan fragments)', () => {
    const result = parseBalanceDataslate(SPLIT_HEADING_DATASLATE, '2026-07-24')
    // 4 rules changes, all core (no faction section). Nothing else.
    expect(result.nodes.length).toBe(4)
    expect(result.nodes.every((n) => !n.factionId)).toBe(true)
    // No orphan title like "BEING TARGETED" alone.
    expect(result.nodes.find((n) => n.title.toUpperCase() === 'BEING TARGETED')).toBeUndefined()
    expect(
      result.nodes.find((n) => n.title.toUpperCase() === 'MORE THAN ONCE PER PHASE/TURN'),
    ).toBeUndefined()
  })

  it('treats meta H4s (VERSION, CONTENTS) as meta, not as faction headers', () => {
    const result = parseBalanceDataslate(SPLIT_HEADING_DATASLATE, '2026-07-24')
    // VERSION 1.0 was an H4 in the sample. If it were treated as a faction,
    // nodes would end up tagged factionId=version-1-0 with titles prefixed
    // "VERSION 1.0: ...". None of those should exist.
    for (const n of result.nodes) {
      expect(n.factionId).toBeFalsy()
      expect(n.title.toUpperCase()).not.toContain('VERSION')
      expect(n.id).not.toContain('version-1-0')
      expect(n.id.startsWith('balance:core:')).toBe(true)
    }
  })
})

/**
 * The July 2026 Universal Rules Updates carries different rule text under
 * some of the same titles as the June 2025 Balance Dataslate (e.g. both
 * have a "MODIFYING A STRATAGEM'S CP COST" section, meaning different
 * things). merge-sources dedupes on exact node ID, so distinct IDs are
 * required to keep both historical records. Non-default source titles
 * append a slug suffix to the base ID for this reason.
 */
describe('parseBalanceDataslate — sourceTitle differentiation', () => {
  const SAMPLE = `
## BALANCE DATASLATE
#### CORE RULES
##### MODIFYING A STRATAGEM'S CP COST
When a rule modifies the CP cost of a Stratagem, the modified cost is the cost you pay.
`.trim()

  it('default sourceTitle produces backwards-compatible IDs (no suffix)', () => {
    const r = parseBalanceDataslate(SAMPLE, '2026-07-24')
    expect(r.nodes[0]!.id).toBe('balance:core:modifying-a-stratagems-cp-cost')
    expect(r.nodes[0]!.sources[0]!.title).toBe('Balance Dataslate')
  })

  it('non-default sourceTitle suffixes the ID so it does not collide', () => {
    const r = parseBalanceDataslate(SAMPLE, '2026-07-24', 'Universal Rules Updates')
    expect(r.nodes[0]!.id).toBe(
      'balance:core:modifying-a-stratagems-cp-cost:universal-rules-updates',
    )
    expect(r.nodes[0]!.sources[0]!.title).toBe('Universal Rules Updates')
  })

  it('same title from two sources yields two distinct nodes with different IDs', () => {
    const june = parseBalanceDataslate(SAMPLE, '2026-07-24')
    const july = parseBalanceDataslate(SAMPLE, '2026-07-24', 'Universal Rules Updates')
    expect(june.nodes[0]!.id).not.toBe(july.nodes[0]!.id)
  })
})
