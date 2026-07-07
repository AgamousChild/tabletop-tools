/**
 * Tests for the v2 faction-pack parser.
 *
 * Per the project's data boundary rule (CLAUDE.md), these tests use only
 * SYNTHETIC fixtures — no GW IP is committed. The synthetic markdown below
 * mirrors the structural shapes we've observed in real packs (column-
 * scrambled stats, ALL-CAPS strat names trailing into the next entry,
 * `##### 1CP` strat headers, the bare `WA R HA M M E R L E G E N D S`
 * Legends prefix, etc.) without reproducing any actual rules text.
 */

import { describe, expect, it } from 'vitest'

import { parseFactionPackV2 } from './parser'

describe('parseFactionPackV2', () => {
  it('extracts pack version + effective date from preamble', () => {
    const md = `# Faction Pack: Greenskins

## GREENSKINS


##### FACTION PACK: VERSION 1.3

Legal for matched play from 22nd April 2026. CONTENTS Section A ...
`
    const r = parseFactionPackV2(md, { faction: 'greenskins' })
    expect(r.packVersion).toBe('1.3')
    expect(r.effectiveDate).toMatch(/22nd April 2026/)
  })

  it('captures whatsNew bullets', () => {
    const md = `## GREENSKINS


##### WHAT'S NEW?

- New Frob datasheet.
- New Bonk Brigade detachment.
`
    const r = parseFactionPackV2(md, { faction: 'greenskins' })
    expect(r.whatsNew).toEqual(['New Frob datasheet.', 'New Bonk Brigade detachment.'])
  })

  it('extracts a classic-format detachment with rule + enhancement + stratagem', () => {
    const md = `## BONK BRIGADE

Bonk Brigades are mobs of Bonkers.


##### DETACHMENT RULE

##### TURBO BONKS

Bonkers go fast. Each time a Bonker unit moves, add 2" to its Move. ENHANCEMENTS


##### LOUD HORN

A horn for shouting. Bonker model only. Each time this model declares a charge, add 1 to the Hit roll.

WALLOPING START

*BONK BRIGADE  —  BATTLE TACTIC STRATAGEM*

Bonkers wallop on arrival.

**WHEN:** Your Movement phase.

**TARGET:** One Bonker unit.

**EFFECT:** Until end of phase, add 1 to attacks. 1CP
`
    const r = parseFactionPackV2(md, { faction: 'greenskins' })
    expect(r.detachments).toHaveLength(1)
    const d = r.detachments[0]!
    expect(d.name).toBe('Bonk Brigade')
    expect(d.detachmentRule?.name).toBe('TURBO BONKS')
    expect(d.detachmentRule?.body).toContain('add 2"')
    expect(d.enhancements).toHaveLength(1)
    expect(d.enhancements[0]!.name).toBe('LOUD HORN')
    expect(d.stratagems).toHaveLength(1)
    expect(d.stratagems[0]!.name).toBe('WALLOPING START')
    expect(d.stratagems[0]!.type).toBe('BATTLE TACTIC')
    expect(d.stratagems[0]!.when).toContain('Movement phase')
    expect(d.stratagems[0]!.target).toContain('One Bonker unit')
    expect(d.stratagems[0]!.effect).toContain('add 1 to attacks')
    expect(d.stratagems[0]!.cpCost).toBe(1)
  })

  it('handles the new-format detachment (DETACHMENT RULES inline + ##### NCP strats)', () => {
    const md = `## BIG BONK SQUAD

DETACHMENT RULES


##### SUPER BONKS

Friendly BONKER units have +1 OC.


##### ANGRY GIT

UPGRADE Bonker model only. This unit has +1 attacks. FIRST STRAT


##### 1CP

*BIG BONK SQUAD STRATAGEM*

Bonkers strike first.

**WHEN:** Fight phase.

**TARGET:** That unit.

**EFFECT:** Until end of phase. SECOND STRAT

##### 2CP

*BIG BONK SQUAD STRATAGEM*

Bigger bonk.

**WHEN:** Charge phase.

**TARGET:** That unit.

**EFFECT:** Wallop happens.
`
    const r = parseFactionPackV2(md, { faction: 'greenskins' })
    expect(r.detachments).toHaveLength(1)
    const d = r.detachments[0]!
    expect(d.detachmentRule?.body).toContain('Friendly BONKER units')
    expect(d.enhancements).toHaveLength(1)
    expect(d.enhancements[0]!.name).toBe('ANGRY GIT')
    expect(d.stratagems).toHaveLength(2)
    expect(d.stratagems[0]!.name).toBe('FIRST STRAT')
    expect(d.stratagems[0]!.cpCost).toBe(1)
    expect(d.stratagems[1]!.name).toBe('SECOND STRAT')
    expect(d.stratagems[1]!.cpCost).toBe(2)
  })

  it('parses a datasheet with stats / weapons / abilities / keywords', () => {
    const md = `## FROBLAND

Frobs are tall.

## FROBS

##### FROB

KEYWORDS: Infantry, Frob RANGED WEAPONS RANGE A BS S AP D Slugthrower [PISTOL] 12" 2 5+ 4 -1 1 MELEE WEAPONS RANGE A WS S AP D Cleaver Melee 3 3+ 5 -2 2 ABILITIES CORE: Leader FACTION: Bonk Loud Voice: This model bonks loudly. KEYWORDS: Infantry, Frob FACTION KEYWORDS: Greenskins M T SV W LD OC


##### 5" 4+ 6+
`
    const r = parseFactionPackV2(md, { faction: 'frobland' })
    const ds = r.datasheets.find((x) => x.name === 'FROB')
    expect(ds).toBeDefined()
    expect(ds!.rangedWeapons.length).toBeGreaterThanOrEqual(1)
    const sl = ds!.rangedWeapons.find((w) => w.name.includes('Slugthrower'))
    expect(sl).toBeDefined()
    expect(sl!.keywords).toContain('PISTOL')
    expect(sl!.S).toBe('4')
    expect(sl!.AP).toBe('-1')
    expect(sl!.D).toBe('1')
    expect(ds!.meleeWeapons.length).toBeGreaterThanOrEqual(1)
    const cl = ds!.meleeWeapons.find((w) => w.name.includes('Cleaver'))
    expect(cl).toBeDefined()
    expect(cl!.S).toBe('5')
    expect(cl!.AP).toBe('-2')
    expect(cl!.D).toBe('2')
    expect(ds!.rangedWeapons.every((w) => !w.name.startsWith('-'))).toBe(true)
    expect(ds!.meleeWeapons.every((w) => !w.name.startsWith('-'))).toBe(true)
    expect(ds!.abilities.find((a) => a.kind === 'core' && a.name === 'Leader')).toBeDefined()
    expect(ds!.factionKeywords).toContain('Greenskins')
  })

  it('detects Legends datasheets via the Legends-prefix heading', () => {
    const md = `## FACTION


##### WA R HA M M E R L E G E N D S OLD UNIT

KEYWORDS: Infantry, Old Unit RANGED WEAPONS RANGE A BS S AP D Stub [PISTOL] 6" 1 5+ 3 0 1 MELEE WEAPONS RANGE A WS S AP D Fist Melee 2 4+ 4 0 1 ABILITIES FACTION: Bonk KEYWORDS: Infantry, Old Unit FACTION KEYWORDS: Faction M T SV W LD OC


##### 6" 4+ 7+
`
    const r = parseFactionPackV2(md, { faction: 'faction' })
    expect(r.legendsDatasheets).toHaveLength(1)
    expect(r.legendsDatasheets[0]!.name).toBe('OLD UNIT')
    expect(r.legendsDatasheets[0]!.isLegends).toBe(true)
  })

  it('joins a heading name continuation glued to the KEYWORDS line', () => {
    // PDF headings break mid-name: the tail lands at the start of the first
    // body line, glued to "KEYWORDS:". Real cases from the Orks pack:
    // "PAINBOY" + "ON WARBIKE", "BIG MEK" + "WITH KUSTOM FORCE FIELD",
    // "DEFFKOPTAS" + "WITH BIG SHOOTAS". Without the join, the Legends
    // variant collides with the live unit of the truncated name.
    const md = `## FACTION


##### WA R HA M M E R L E G E N D S PAINBOY

ON WARBIKE KEYWORDS: Mounted, Speed Freeks, Character, Painboy on Warbike RANGED WEAPONS RANGE A BS S AP D Twin dakkagun [ASSAULT] 18" 3 5+ 5 0 1 MELEE WEAPONS RANGE A WS S AP D Power klaw Melee 3 4+ 9 -2 2 ABILITIES CORE: Leader FACTION: Waaagh! KEYWORDS: Mounted, Speed Freeks, Character, Painboy on Warbike FACTION KEYWORDS: Orks M T SV W LD OC


##### 12" 6 4+ 4 7+ 2


##### WA R HA M M E R L E G E N D S SQUIGGOTH

KEYWORDS: Monster, Transport, Squiggoth RANGED WEAPONS RANGE A BS S AP D Kannon [BLAST] 36" D6 5+ 5 0 1 MELEE WEAPONS RANGE A WS S AP D Gorin' horns Melee 4 3+ 12 -2 D6 ABILITIES FACTION: Waaagh! KEYWORDS: Monster, Transport, Squiggoth FACTION KEYWORDS: Orks M T SV W LD OC
`
    const r = parseFactionPackV2(md, { faction: 'orks' })
    const names = r.legendsDatasheets.map((d) => d.name)
    expect(names).toContain('PAINBOY ON WARBIKE')
    // No continuation — name stays as-is, KEYWORDS line untouched.
    expect(names).toContain('SQUIGGOTH')
    const painboy = r.legendsDatasheets.find((d) => d.name === 'PAINBOY ON WARBIKE')!
    expect(painboy.variant).toBe('ON WARBIKE')
  })

  it('parses Page-based errata into structured entries', () => {
    const md = `## ORKS


#### UPDATES & ERRATA

Page 94  —  Frob Boss, Abilities, Bonking ability Change to: 'Bonking: do bonk.' Page 95  —  Frob Squad, Keywords Add: 'BONKER'.
`
    const r = parseFactionPackV2(md, { faction: 'orks' })
    expect(r.errata.length).toBeGreaterThanOrEqual(2)
    const first = r.errata[0]!
    expect(first.pages).toContain(94)
    expect(first.target.name).toContain('Frob Boss')
    expect(first.changeKind).toBe('replace')
    expect(first.replacementText).toContain('Bonking: do bonk.')
  })

  it('parses FAQ Q/A pairs', () => {
    const md = `## ORKS


#### FAQS

Q: Does the Frob bonk twice? A: Yes. Q: Can the Bonker run? A: Only at half speed.
`
    const r = parseFactionPackV2(md, { faction: 'orks' })
    expect(r.faqs.length).toBe(2)
    expect(r.faqs[0]!.question).toMatch(/Does the Frob bonk/)
    expect(r.faqs[0]!.answer).toBe('Yes.')
    expect(r.faqs[1]!.question).toMatch(/Can the Bonker run/)
  })

  it('computes coverage with residuePercent low on a structured synthetic pack', () => {
    const md = `# Faction Pack: Synthetic

## SYN


##### FACTION PACK: VERSION 1.0

Legal for matched play from 1st January 2026 On the following pages you will find rules and clarifications that supplement your Codex. The lengthy preamble lives here so we have enough text density that 100% capture matters.


## DEC ONE

DETACHMENT RULES


##### ALPHA RULE

Alpha rule body explaining the detachment-wide effect in enough sentences to count. Friendly units gain a bonus while a condition is met. ENHANCEMENTS


##### ENHANCEMENT ONE

UPGRADE Body text describing the upgrade effect at adequate length. Bonker model only. This unit has a particular ability. SYNAPSE STRIKE


##### 1CP

*DEC ONE STRATAGEM*

Flavor text explains the in-fiction motivation behind the play.

**WHEN:** Your phase, when something happens.

**TARGET:** Unit that meets the conditions.

**EFFECT:** Do thing for a duration with a quantified effect.
`
    const r = parseFactionPackV2(md, { faction: 'syn' })
    // Synthetic pack is small (~700 chars) so the per-line markers weigh
    // heavily. We assert <10% here; against real packs (3-30k chars) the
    // parser hits <0.5% — see the coverage report committed at
    // docs/reports/2026-06-29-faction-pack-extract-coverage.md.
    expect(r.coverage.residuePercent).toBeLessThan(10)
  })

  it('reports unparsed chunks with context + reason', () => {
    const md = `## SYN


Some unexplained loose prose that lives outside any heading.
`
    const r = parseFactionPackV2(md, { faction: 'syn' })
    // Loose prose with no heading should land in extras OR unparsed.
    const unparsedOrExtra =
      r.unparsed.some((u) => u.text.includes('unexplained')) ||
      r.extras.some((e) => e.content.includes('unexplained'))
    expect(unparsedOrExtra).toBe(true)
    if (r.unparsed.length > 0) {
      expect(r.unparsed[0]!.context).toBeTypeOf('string')
      expect(r.unparsed[0]!.reason).toBeTypeOf('string')
    }
  })

  it('tags every ability with a kind (core / faction / unit-specific / aura / wargear)', () => {
    const md = `## FACTION


## DEC

Detachment prose.

DETACHMENT RULES


##### A RULE

Body of rule.


## FACTION


##### ONLY UNIT

KEYWORDS: Infantry, OnlyUnit RANGED WEAPONS RANGE A BS S AP D Pop [PISTOL] 12" 1 5+ 3 0 1 MELEE WEAPONS RANGE A WS S AP D Bat Melee 2 4+ 3 0 1 ABILITIES CORE: Leader FACTION: Bonk Unique Skill: do thing. Aura Skill (Aura): nearby gain thing. WARGEAR ABILITIES Glow Stick: emits glow. KEYWORDS: Infantry, OnlyUnit FACTION KEYWORDS: Faction M T SV W LD OC


##### 6" 4+ 7+
`
    const r = parseFactionPackV2(md, { faction: 'faction' })
    const ds = [...r.datasheets, ...r.legendsDatasheets].find((x) =>
      x.name.toUpperCase().includes('ONLY UNIT'),
    )
    expect(ds).toBeDefined()
    // Every ability has a non-empty kind
    expect(ds!.abilities.length).toBeGreaterThan(0)
    for (const a of ds!.abilities) expect(a.kind).toBeTruthy()
    const kinds = ds!.abilities.map((a) => a.kind)
    expect(kinds).toContain('core')
    expect(kinds).toContain('faction')
    expect(kinds.includes('aura') || kinds.includes('unit-specific')).toBe(true)
    expect(kinds).toContain('wargear')
  })

  it('title-cases ALL-CAPS detachment names', () => {
    const md = `## BLOOD RAVENS STRIKE FORCE

DETACHMENT RULES


##### OMNIS ARCANUM

The ravens know all. Friendly units add 1 to hit.
`
    const r = parseFactionPackV2(md, { faction: 'space-marines' })
    expect(r.detachments).toHaveLength(1)
    // ALL-CAPS h2 name should be converted to Title Case
    expect(r.detachments[0]!.name).toBe('Blood Ravens Strike Force')
  })

  it('merges consecutive ALL-CAPS h2 headings split by PDF column break', () => {
    // Simulates "VEILED BLADE" on one line, "ELIMINATION FORCE" on the next
    // due to PDF text-flow column break — should produce one detachment.
    // The faction root h2 (INQUISITION) always has body text before the first
    // detachment, which prevents it from being merged with the detachment h2.
    const md = `## INQUISITION


##### FACTION PACK: VERSION 1.0

Legal for matched play from 1st January 2026.


## VEILED BLADE

## ELIMINATION FORCE

DETACHMENT RULES


##### VEILED OPERATIVES

Operatives strike unseen. ENHANCEMENTS


##### SHADOW CLOAK

UPGRADE Operative model only. This model is always in cover.
`
    const r = parseFactionPackV2(md, { faction: 'inquisition' })
    // Two consecutive ALL-CAPS h2s should merge into one detachment
    expect(r.detachments).toHaveLength(1)
    expect(r.detachments[0]!.name).toBe('Veiled Blade Elimination Force')
    expect(r.detachments[0]!.detachmentRule?.body).toContain('Operatives strike unseen')
    expect(r.detachments[0]!.enhancements).toHaveLength(1)
  })

  it('ignores noise h2 headings (DETACHMENT RULES, BATTLE TACTIC, etc.) as detachment names', () => {
    // The faction root h2 (GREENSKINS) has body text (preamble) before the
    // first detachment h2 — that body prevents the two h2s from being merged.
    const md = `## GREENSKINS


##### FACTION PACK: VERSION 2.0

Legal for matched play from 1st January 2026.


## STOMP BOYS

DETACHMENT RULES


##### WAAAGH BONUS

Friendly units add 1 to charge.

BATTLE TACTIC

STRATEGIC PLOY
`
    const r = parseFactionPackV2(md, { faction: 'greenskins' })
    // Only "STOMP BOYS" should become a detachment — not BATTLE TACTIC, STRATEGIC PLOY, or DETACHMENT RULES
    const detachmentNames = r.detachments.map((d) => d.name)
    expect(detachmentNames).toContain('Stomp Boys')
    expect(detachmentNames.every((n) => !['Battle Tactic', 'Strategic Ploy'].includes(n))).toBe(
      true,
    )
  })

  it('creates a stub detachment from an errata-only ##### NAME DETACHMENT heading', () => {
    // Some detachments appear only in the errata section (e.g. Bringers of Flame,
    // Hallowed Martyrs) with a ##### HEADING DETACHMENT entry and rule text.
    const md = `## FACTION


#### UPDATES & ERRATA

##### BRINGERS OF FLAME DETACHMENT

Immolation bonus: friendly units within 6" of a burning model add 1 to hit.

Page 12  —  Immolator, Abilities Change to: 'Burn it all: do thing.'
`
    const r = parseFactionPackV2(md, { faction: 'adepta-sororitas' })
    // A stub detachment should be created for the errata-section heading
    const bof = r.detachments.find(
      (d) => d.name.toLowerCase().replace(/\s+/g, '') === 'bringersofflame',
    )
    expect(bof).toBeDefined()
    // The errata body should be attached as detachmentRule
    expect(bof!.detachmentRule?.body).toContain('Immolation bonus')
  })
})
