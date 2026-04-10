import { describe, it, expect } from 'vitest'
import { parseBalanceDataslate } from './balance-dataslate'

const SAMPLE_BALANCE = `
## CORE RULES

Amend the Devastating Wounds ability as follows:
Weapons with this ability that score a Critical Wound inflict mortal wounds.

## AELDARI

### Fate Dice

Change the Strands of Fate faction rule so that players generate Fate dice at the start of each battle round, not the Command phase.

### Points Changes

Wraithguard: Was 170 pts, now 180 pts.
Wraithblades: Was 170 pts, now 175 pts.

## SPACE MARINES

No changes at this time.
`.trim()

describe('parseBalanceDataslate', () => {
  const result = parseBalanceDataslate(SAMPLE_BALANCE, '2026-04-08')

  it('creates balance-change nodes', () => {
    const changes = result.nodes.filter(n => n.layer === 'balance')
    expect(changes.length).toBeGreaterThanOrEqual(2)
  })

  it('sets factionId on faction-specific nodes', () => {
    const aeldari = result.nodes.find(n => n.factionId === 'aeldari')
    expect(aeldari).toBeTruthy()
  })

  it('core changes have no factionId', () => {
    const coreChange = result.nodes.find(n => n.title === 'CORE RULES')
    expect(coreChange?.factionId).toBeUndefined()
  })

  it('generates modifies refs', () => {
    const modifies = result.refs.filter(r => r.rel === 'modifies')
    expect(modifies.length).toBeGreaterThan(0)
  })

  it('skips "no changes" factions', () => {
    const smNodes = result.nodes.filter(n => n.factionId === 'space-marines')
    expect(smNodes.length).toBe(0)
  })

  it('is idempotent', () => {
    const result2 = parseBalanceDataslate(SAMPLE_BALANCE, '2026-04-08')
    expect(result2.nodes.map(n => n.id)).toEqual(result.nodes.map(n => n.id))
  })

  it('sets version to 1 on all nodes', () => {
    for (const node of result.nodes) {
      expect(node.version).toBe(1)
    }
  })
})
