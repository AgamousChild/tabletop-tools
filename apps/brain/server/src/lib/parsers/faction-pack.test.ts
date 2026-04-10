import { describe, it, expect } from 'vitest'
import { parseFactionPack } from './faction-pack'

const SAMPLE_FACTION = `
## CERAMITE SENTINELS

Detachment rule for Space Marines.

### ARMOUR OF CONTEMPT

Each time an attack is allocated to a model in this unit, subtract 1 from the Damage characteristic of that attack.

### STRATAGEMS

#### FIRE DISCIPLINE

**COST:** 1CP
**WHEN:** Your Shooting phase.
**TARGET:** One Space Marines unit from your army.
**EFFECT:** Until the end of the phase, each time a model in that unit makes a ranged attack, improve the Armour Penetration of that attack by 1.

#### STOIC RETALIATION

**COST:** 1CP
**WHEN:** Your opponent's Shooting phase, just after an enemy unit has resolved its attacks.
**TARGET:** One Space Marines unit from your army that was selected as the target.
**EFFECT:** Your unit can shoot as if it were your Shooting phase.

### ENHANCEMENTS

#### IRON RESOLVE

Space Marines model only. The bearer has a 4+ Feel No Pain.

#### MASTER-CRAFTED WEAPON

Space Marines model only. Improve the AP of the bearer's melee weapons by 1.
`.trim()

describe('parseFactionPack', () => {
  const result = parseFactionPack(SAMPLE_FACTION, 'space-marines', '2026-04-08')

  it('extracts detachment rule nodes', () => {
    const detRules = result.nodes.filter(n => n.category === 'detachment-rule')
    expect(detRules.length).toBeGreaterThanOrEqual(1)
    expect(detRules[0]?.factionId).toBe('space-marines')
  })

  it('extracts stratagem nodes', () => {
    const strats = result.nodes.filter(n => n.category === 'stratagem')
    expect(strats.length).toBe(2)
  })

  it('stratagem nodes have phase annotation', () => {
    const fireDiscipline = result.nodes.find(n => n.title === 'FIRE DISCIPLINE')
    expect(fireDiscipline?.phase).toBe('shooting')
  })

  it('extracts enhancement nodes', () => {
    const enhancements = result.nodes.filter(n => n.category === 'enhancement')
    expect(enhancements.length).toBe(2)
  })

  it('sets factionId on all nodes', () => {
    for (const node of result.nodes) {
      expect(node.factionId).toBe('space-marines')
    }
  })

  it('generates part_of refs from components to detachment', () => {
    const partOfRefs = result.refs.filter(r => r.rel === 'part_of')
    expect(partOfRefs.length).toBeGreaterThan(0)
  })

  it('generates deterministic IDs', () => {
    const result2 = parseFactionPack(SAMPLE_FACTION, 'space-marines', '2026-04-08')
    expect(result2.nodes.map(n => n.id)).toEqual(result.nodes.map(n => n.id))
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

  it('sets layer to faction on all nodes', () => {
    for (const node of result.nodes) {
      expect(node.layer).toBe('faction')
    }
  })
})
