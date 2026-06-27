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
