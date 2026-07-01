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
import { convertPackExtractToNodes, detectFactionPackEdition } from './faction-pack-v2-to-nodes'

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

describe('convertPackExtractToNodes', () => {
  // Lazy: beforeAll primes faction codes before we hit normalizeFactionId.
  let result: ReturnType<typeof convertPackExtractToNodes>
  beforeAll(() => {
    const extract = parseFactionPackV2(SAMPLE_PACK, { faction: 'orks' })
    result = convertPackExtractToNodes(extract, 'orks', '2026-07-01T00:00:00Z', '11th')
  })

  it('emits a detachment node with the v1 ID scheme', () => {
    const det = result.nodes.find((n) => n.id === 'det:orks:speed-freeks')
    expect(det).toBeDefined()
    expect(det?.category).toBe('detachment-rule')
    expect(det?.factionId).toBe('orks')
    expect(det?.edition).toBe('11th')
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
