import { describe, expect, it } from 'vitest'

import { parseFactionPack } from './faction-pack'

// Matches the actual structure produced by the gw-sync structured PDF parser:
// ## = detachment, ##### = rules/enhancements, *...STRATAGEM* = stratagem labels
const SAMPLE_FACTION = `
## CERAMITE SENTINELS

Some Space Marines are as lethal when defending a fortified position as when attacking.

##### DETACHMENT RULE

##### ADAPTIVE DEFENCE

These Space Marines are experts in fighting from rapidly prepared defensive positions. Each time an Adeptus Astartes model from your army makes an attack, if that model's unit is within a terrain feature, re-roll a Hit roll of 1 and re-roll a Wound roll of 1. ENHANCEMENTS

##### IRON RESOLVE

Space Marines model only. The bearer has a 4+ Feel No Pain.

##### MASTER-CRAFTED WEAPON

Space Marines model only. Improve the AP of the bearer's melee weapons by 1.

*CERAMITE SENTINELS — BATTLE TACTIC STRATAGEM*

Knowing that this position must hold, these warriors stand firm.

**WHEN:** Your Shooting phase.

**TARGET:** One Space Marines unit from your army.

**EFFECT:** Until the end of the phase, each time a model in that unit makes a ranged attack, improve the Armour Penetration of that attack by 1.

*CERAMITE SENTINELS — STRATEGIC PLOY STRATAGEM*

A hail of fire drives back the foe.

**WHEN:** Your opponent's Shooting phase, just after an enemy unit has resolved its attacks.

**TARGET:** One Space Marines unit from your army that was selected as the target.

**EFFECT:** Your unit can shoot as if it were your Shooting phase.
`.trim()

describe('parseFactionPack', () => {
  const result = parseFactionPack(SAMPLE_FACTION, 'space-marines', '2026-04-08')

  it('extracts detachment rule node', () => {
    const detRules = result.nodes.filter((n) => n.category === 'detachment-rule')
    expect(detRules.length).toBeGreaterThanOrEqual(1)
    expect(detRules[0]?.factionId).toBe('space-marines')
  })

  it('extracts detachment ability nodes', () => {
    const abilities = result.nodes.filter(
      (n) => n.category === 'faction-ability' && n.title === 'ADAPTIVE DEFENCE',
    )
    expect(abilities.length).toBe(1)
    expect(abilities[0]!.content).toContain('terrain feature')
  })

  it('extracts stratagem nodes', () => {
    const strats = result.nodes.filter((n) => n.category === 'stratagem')
    expect(strats.length).toBe(2)
  })

  it('stratagem nodes have phase annotation', () => {
    const strats = result.nodes.filter((n) => n.category === 'stratagem')
    const shootingStrat = strats.find((n) => n.phase === 'shooting')
    expect(shootingStrat).toBeDefined()
  })

  it('extracts enhancement nodes', () => {
    const enhancements = result.nodes.filter((n) => n.category === 'enhancement')
    expect(enhancements.length).toBe(2)
    const names = enhancements.map((n) => n.title)
    expect(names).toContain('IRON RESOLVE')
    expect(names).toContain('MASTER-CRAFTED WEAPON')
  })

  it('sets factionId on all nodes', () => {
    for (const node of result.nodes) {
      expect(node.factionId).toBe('space-marines')
    }
  })

  it('generates part_of refs from components to detachment', () => {
    const partOfRefs = result.refs.filter((r) => r.rel === 'part_of')
    expect(partOfRefs.length).toBeGreaterThan(0)
  })

  it('generates deterministic IDs', () => {
    const result2 = parseFactionPack(SAMPLE_FACTION, 'space-marines', '2026-04-08')
    expect(result2.nodes.map((n) => n.id)).toEqual(result.nodes.map((n) => n.id))
  })

  it('includes source attribution', () => {
    for (const node of result.nodes) {
      expect(node.sources[0]!.type).toBe('pdf')
      expect(node.sources[0]!.title).toContain('Space Marines')
    }
  })

  it('sets version to 1 on all nodes', () => {
    for (const node of result.nodes) {
      expect(node.version).toBe(1)
    }
  })

  it('detachment-rule node id has no doubled slug (regression: det:fac:slug:slug)', () => {
    // The detachment heading "## CERAMITE SENTINELS" should produce id
    // `det:space-marines:ceramite-sentinels`, NOT
    // `det:space-marines:ceramite-sentinels:ceramite-sentinels`.
    const det = result.nodes.find((n) => n.category === 'detachment-rule')
    expect(det).toBeDefined()
    expect(det!.id).toBe('det:space-marines:ceramite-sentinels')
    // Generic regression check: no doubled trailing slug on any detachment-rule.
    for (const n of result.nodes) {
      if (n.category !== 'detachment-rule') continue
      const m = n.id.match(/^det:[^:]+:([^:]+):(.+)$/)
      if (m) expect(m[1]).not.toBe(m[2])
    }
  })
})
