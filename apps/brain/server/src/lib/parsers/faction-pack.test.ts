import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { _setFactionCodesForTesting, resetFactionCodes } from '../faction-codes'
import { detectFactionPackEdition, parseFactionPack } from './faction-pack'

beforeAll(() => {
  _setFactionCodesForTesting(
    new Map<string, string>([
      ['space-marines', 'space-marines'],
      ['blood-angels', 'blood-angels'],
      ['aoi', 'imperial-agents'],
      ['imperial-agents', 'imperial-agents'],
      ['dru', 'drukhari'],
      ['drukhari', 'drukhari'],
      ['gc', 'genestealer-cults'],
      ['genestealer-cults', 'genestealer-cults'],
    ]),
    new Set(['space-marines', 'blood-angels', 'imperial-agents', 'drukhari', 'genestealer-cults']),
  )
})
afterAll(() => resetFactionCodes())

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
  // Lazy so top-level beforeAll primes faction codes before parsing runs.
  let result: ReturnType<typeof parseFactionPack>
  beforeAll(() => {
    result = parseFactionPack(SAMPLE_FACTION, 'space-marines', '2026-04-08')
  })

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

  it('does not set edition when none is supplied (caller defaults to 10th downstream)', () => {
    for (const node of result.nodes) {
      expect(node.edition).toBeUndefined()
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

// 11e UPDATES & ERRATA + FAQS structure, extracted from the real Feb 2026
// faction packs (eng_11-02_*). We keep the excerpt short but preserve the
// exact heading + body shape the parser dispatches on. We split the Page
// entries onto separate lines because the real PDF→markdown converter
// emits them line-broken when the source PDF wraps them; the splitter
// fires on entries that start a line.
const SAMPLE_11E_ERRATA = `
## SPACE MARINES


#### UPDATES & ERRATA

Page 107  —  Gladius Task Force, Storm of Fire Stratagem Change the Target to read: 'One Adeptus Astartes unit from your army that has not been selected to shoot this phase .'
Page 111  —  Ironstorm Spearhead, Ancient Fury Stratagem Change the Effect to read: 'Until the start of your next Command phase, improve your model's Move, Toughness, Leadership and Objective Control characteristics by 1 and each time your model makes an attack, add 1 to the Hit roll.'


#### FAQS

Q: Which Detachments are considered to be Codex: Space Marines Detachments? A: Every Detachment printed in Codex: Space Marines and every Detachment included in the Space Marines Faction Pack. Q: While using the Gladius Task Force Detachment, does a Combat Doctrine need to be active for my army in order to use the Adaptive Strategy Stratagem? A: No.
`.trim()

describe('parseFactionPack — 11th edition errata stamping', () => {
  let elevenResult: ReturnType<typeof parseFactionPack>
  beforeAll(() => {
    elevenResult = parseFactionPack(SAMPLE_11E_ERRATA, 'space-marines', '2026-06-27', '11th')
  })

  it('extracts errata nodes from UPDATES & ERRATA block', () => {
    const errata = elevenResult.nodes.filter(
      (n) => n.layer === 'errata' && n.category === 'commentary',
    )
    expect(errata.length).toBeGreaterThanOrEqual(2)
    // Each entry should retain its page reference in the id.
    expect(errata.some((n) => n.id.includes('p107'))).toBe(true)
    expect(errata.some((n) => n.id.includes('p111'))).toBe(true)
  })

  it('extracts FAQ nodes from FAQS block', () => {
    const faqs = elevenResult.nodes.filter((n) => n.layer === 'errata' && n.category === 'faq')
    expect(faqs.length).toBeGreaterThanOrEqual(2)
    // FAQ titles should derive from the Q: text, not the body.
    expect(faqs.some((n) => n.title.toLowerCase().includes('codex: space marines'))).toBe(true)
  })

  it('stamps edition=11th on every errata and FAQ node', () => {
    const errataLike = elevenResult.nodes.filter((n) => n.layer === 'errata')
    expect(errataLike.length).toBeGreaterThan(0)
    for (const node of errataLike) {
      expect(node.edition).toBe('11th')
    }
  })

  it('stamps factionId on every errata and FAQ node', () => {
    const errataLike = elevenResult.nodes.filter((n) => n.layer === 'errata')
    for (const node of errataLike) {
      expect(node.factionId).toBe('space-marines')
    }
  })

  it('omits edition when called without the parameter (legacy callers)', () => {
    const legacy = parseFactionPack(SAMPLE_11E_ERRATA, 'space-marines', '2026-06-27')
    const errataLike = legacy.nodes.filter((n) => n.layer === 'errata')
    expect(errataLike.length).toBeGreaterThan(0)
    for (const node of errataLike) {
      expect(node.edition).toBeUndefined()
    }
  })
})

describe('detectFactionPackEdition', () => {
  it('flags eng_11-02_* URLs (11e launch wave, Feb 2026) as 11th', () => {
    expect(
      detectFactionPackEdition(
        'https://assets.warhammer-community.com/eng_11-02_warhammer_40000_faction_pack_space_marines-t7ypi7ib36-b5jouxnw7u.pdf',
      ),
    ).toBe('11th')
  })

  it('flags eng_07-01_* URLs (11e second wave, Jul 2026) as 11th', () => {
    expect(
      detectFactionPackEdition(
        'https://assets.warhammer-community.com/eng_07-01_warhammer_40000_faction_pack_necrons-wgehvvo84t-ijjxadnsk6.pdf',
      ),
    ).toBe('11th')
  })

  it('falls back to 10th for legacy URL prefixes', () => {
    expect(
      detectFactionPackEdition(
        'https://assets.warhammer-community.com/eng_22-10_warhammer40000_faction_pack_adeptus_custodes-istx2ftigx-kpxm1aho6e.pdf',
      ),
    ).toBe('10th')
    expect(
      detectFactionPackEdition(
        'https://assets.warhammer-community.com/eng_08-10_warhammer40000_faction_pack_death_guard-q6ymklgmjr-qnqozce7k2.pdf',
      ),
    ).toBe('10th')
  })

  it('falls back to 10th when URL is unknown / empty', () => {
    expect(detectFactionPackEdition('')).toBe('10th')
    expect(detectFactionPackEdition('not-a-real-url')).toBe('10th')
  })
})
