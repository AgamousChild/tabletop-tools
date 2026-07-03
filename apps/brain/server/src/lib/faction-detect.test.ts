import { describe, expect, it } from 'vitest'

import {
  detectFactions,
  extractMechanicKeywords,
  FACTION_PATTERNS,
  MECHANIC_ALIASES,
  stripFactionFromQuery,
  SUBFACTION_TO_PARENT,
} from './faction-detect'

// ── FACTION_PATTERNS structure ──────────────────────────────────────────────

describe('FACTION_PATTERNS', () => {
  it('has at least 25 entries', () => {
    expect(FACTION_PATTERNS.length).toBeGreaterThanOrEqual(25)
  })

  it('has chaos space marine before space marine (substring safety)', () => {
    const csmIdx = FACTION_PATTERNS.findIndex((p) => p.pattern === 'chaos space marine')
    const smIdx = FACTION_PATTERNS.findIndex((p) => p.pattern === 'space marine')
    expect(csmIdx).toBeGreaterThanOrEqual(0)
    expect(smIdx).toBeGreaterThanOrEqual(0)
    expect(csmIdx).toBeLessThan(smIdx)
  })

  it('does NOT contain SM chapter entries (those belong in SUBFACTION_TO_PARENT)', () => {
    const chapterSlugs = [
      'blood-angels',
      'dark-angels',
      'space-wolves',
      'black-templars',
      'deathwatch',
      'iron-hands',
      'ultramarines',
      'salamanders',
      'raven-guard',
      'imperial-fists',
      'white-scars',
      'crimson-fists',
    ]
    for (const slug of chapterSlugs) {
      const found = FACTION_PATTERNS.find((p) => p.slug === slug)
      expect(found, `${slug} should not be in FACTION_PATTERNS`).toBeUndefined()
    }
  })

  it('has no duplicate slugs (except aliases like eldar→aeldari)', () => {
    const slugs = FACTION_PATTERNS.map((p) => p.slug)
    const allowedDupes = new Set([
      'aeldari',
      't-au-empire',
      'adepta-sororitas',
      'astra-militarum',
      'drukhari',
      'chaos-space-marines',
      'grey-knights',
      'death-guard',
      'thousand-sons',
      'world-eaters',
      'genestealer-cults',
      'adeptus-mechanicus',
    ])
    const seen = new Map<string, number>()
    for (const s of slugs) {
      seen.set(s, (seen.get(s) ?? 0) + 1)
    }
    for (const [slug, count] of seen) {
      if (count > 1 && !allowedDupes.has(slug)) {
        expect.fail(`Duplicate slug in FACTION_PATTERNS: ${slug} (${count} times)`)
      }
    }
  })
})

// ── SUBFACTION_TO_PARENT structure ──────────────────────────────────────────

describe('SUBFACTION_TO_PARENT', () => {
  it('maps all SM chapters to space-marines', () => {
    const chapters = [
      'blood angels',
      'dark angels',
      'space wolves',
      'black templars',
      'deathwatch',
      'iron hands',
      'ultramarines',
      'salamanders',
      'raven guard',
      'imperial fists',
      'white scars',
      'crimson fists',
      'blood ravens',
    ]
    for (const ch of chapters) {
      expect(SUBFACTION_TO_PARENT[ch], `${ch} should map to space-marines`).toBe('space-marines')
    }
  })

  it('maps aeldari subfactions to aeldari', () => {
    expect(SUBFACTION_TO_PARENT['ynnari']).toBe('aeldari')
    expect(SUBFACTION_TO_PARENT['harlequins']).toBe('aeldari')
    expect(SUBFACTION_TO_PARENT['asuryani']).toBe('aeldari')
  })

  it('maps chaos daemon legions to chaos-daemons', () => {
    expect(SUBFACTION_TO_PARENT['plague legions']).toBe('chaos-daemons')
    expect(SUBFACTION_TO_PARENT['scintillating legions']).toBe('chaos-daemons')
    expect(SUBFACTION_TO_PARENT['legions of excess']).toBe('chaos-daemons')
    expect(SUBFACTION_TO_PARENT['blood legions']).toBe('chaos-daemons')
  })

  it('maps CSM subfaction to chaos-space-marines', () => {
    expect(SUBFACTION_TO_PARENT['damned']).toBe('chaos-space-marines')
  })
})

// ── detectFactions — every top-level faction ────────────────────────────────

describe('detectFactions — top-level factions', () => {
  const cases: Array<[string, string[]]> = [
    ['chaos space marine stratagems', ['chaos-space-marines']],
    ['space marine detachments', ['space-marines']],
    ['grey knights terminators', ['grey-knights']],
    ['death guard plague marines', ['death-guard']],
    ['thousand sons rubric marines', ['thousand-sons']],
    ['world eaters berzerkers', ['world-eaters']],
    ['imperial agents operatives', ['imperial-agents']],
    ['imperial knights lance', ['imperial-knights']],
    ['chaos knights war dogs', ['chaos-knights']],
    ['imperial guard infantry', ['astra-militarum']],
    ['astra militarum regiments', ['astra-militarum']],
    ['sisters of battle miracle dice', ['adepta-sororitas']],
    ['dark eldar raiders', ['drukhari']],
    ['ork boyz waaagh', ['orks']],
    ['necron reanimation', ['necrons']],
    ['tyranid synapse', ['tyranids']],
    ['aeldari fate dice', ['aeldari']],
    ['eldar wraithlord', ['aeldari']],
    ['tau crisis suits', ['t-au-empire']],
    ["t'au broadside", ['t-au-empire']],
    ['custodes golden light', ['adeptus-custodes']],
    ['sororitas repentia', ['adepta-sororitas']],
    ['mechanicus skitarii', ['adeptus-mechanicus']],
    ['genestealer cults ambush', ['genestealer-cults']],
    ['drukhari kabalites', ['drukhari']],
    ['votann hearthkyn', ['leagues-of-votann']],
    ['chaos daemon units', ['chaos-daemons']],
  ]

  for (const [query, expected] of cases) {
    it(`"${query}" → ${expected.join(', ')}`, () => {
      const result = detectFactions(query)
      for (const faction of expected) {
        expect(result.factions, `Expected ${faction} in results for "${query}"`).toContain(faction)
      }
      expect(result.subfaction).toBeUndefined()
    })
  }
})

// ── detectFactions — every subfaction ───────────────────────────────────────

describe('detectFactions — subfactions', () => {
  // SM chapters
  const smChapters: Array<[string, string]> = [
    ['blood angels death company', 'blood angels'],
    ['dark angels deathwing', 'dark angels'],
    ['space wolves thunderwolf cavalry', 'space wolves'],
    ['black templars crusade', 'black templars'],
    ['deathwatch kill team', 'deathwatch'],
    ['iron hands bionics', 'iron hands'],
    ['ultramarines tactical doctrine', 'ultramarines'],
    ['salamanders flamecraft', 'salamanders'],
    ['raven guard shadow step', 'raven guard'],
    ['imperial fists fortify', 'imperial fists'],
    ['white scars advance and charge', 'white scars'],
    ['crimson fists bolter drill', 'crimson fists'],
    ['blood ravens librarian', 'blood ravens'],
  ]

  for (const [query, expectedSf] of smChapters) {
    it(`"${query}" → space-marines + chapter slug + subfaction="${expectedSf}"`, () => {
      const result = detectFactions(query)
      expect(result.factions).toContain('space-marines')
      // Chapter slug is now also included so retrieve can walk dim_subfaction
      // and union chapter-specific datasheets (Lemartes lives under
      // factionId=blood-angels post-PR-B of the scalar-to-ref refactor).
      expect(result.factions).toContain(expectedSf.replace(/ /g, '-'))
      expect(result.subfaction).toBe(expectedSf)
    })
  }

  // Aeldari subfactions
  const aeldariSubs: Array<[string, string]> = [
    ['ynnari abilities', 'ynnari'],
    ['harlequins troupe', 'harlequins'],
    ['asuryani craftworld', 'asuryani'],
  ]

  for (const [query, expectedSf] of aeldariSubs) {
    it(`"${query}" → aeldari + subfaction="${expectedSf}"`, () => {
      const result = detectFactions(query)
      expect(result.factions).toContain('aeldari')
      expect(result.subfaction).toBe(expectedSf)
    })
  }

  // Chaos daemon legions
  const daemonLegions: Array<[string, string]> = [
    ['plague legions abilities', 'plague legions'],
    ['scintillating legions stratagems', 'scintillating legions'],
    ['legions of excess enhancements', 'legions of excess'],
    ['blood legions detachment', 'blood legions'],
  ]

  for (const [query, expectedSf] of daemonLegions) {
    it(`"${query}" → chaos-daemons + subfaction="${expectedSf}"`, () => {
      const result = detectFactions(query)
      expect(result.factions).toContain('chaos-daemons')
      expect(result.subfaction).toBe(expectedSf)
    })
  }
})

// ── detectFactions — disambiguation and edge cases ─────────────────────────

describe('detectFactions — edge cases', () => {
  it('returns empty for generic question with no faction', () => {
    const result = detectFactions('how does cover work in 10th edition')
    expect(result.factions).toEqual([])
    expect(result.subfaction).toBeUndefined()
  })

  it('detects multiple factions', () => {
    const result = detectFactions('necrons vs orks melee comparison')
    expect(result.factions).toContain('necrons')
    expect(result.factions).toContain('orks')
  })

  it('chaos space marines does NOT also match space marines', () => {
    const result = detectFactions('chaos space marines stratagems')
    expect(result.factions).toContain('chaos-space-marines')
    expect(result.factions).not.toContain('space-marines')
  })

  it('blood angels produces BOTH blood-angels chapter slug AND space-marines parent', () => {
    // Post-PR-B chapter datasheets live under factionId=<chapter-slug>. detectFactions
    // returns both slugs so retrieve unions the chapter's own units and the SM
    // shared pool. dim_subfaction is the source of truth for the parent walk;
    // this array just seeds the expander.
    const result = detectFactions('blood angels units')
    expect(result.factions).toContain('blood-angels')
    expect(result.factions).toContain('space-marines')
  })

  it('case insensitive', () => {
    const result = detectFactions('NECRONS reanimation')
    expect(result.factions).toContain('necrons')
  })

  it('"in blood angels" phrasing works', () => {
    const result = detectFactions('who has sustained hits in blood angels')
    expect(result.factions).toContain('space-marines')
    expect(result.subfaction).toBe('blood angels')
  })

  it('ork does not match in "work" or "cork"', () => {
    const result = detectFactions('how does overwatch work')
    expect(result.factions).not.toContain('orks')
  })
})

// ── stripFactionFromQuery ───────────────────────────────────────────────────

describe('stripFactionFromQuery', () => {
  it('removes faction name from query', () => {
    const result = stripFactionFromQuery('necrons reanimation protocols', ['necrons'])
    expect(result.toLowerCase()).not.toContain('necron')
    expect(result).toContain('reanimation protocols')
  })

  it('removes "in faction" phrasing', () => {
    const result = stripFactionFromQuery('who has sustained hits in necrons', ['necrons'])
    expect(result.toLowerCase()).not.toContain('necron')
    expect(result).toContain('who has sustained hits')
  })

  it('removes subfaction name when parent faction detected', () => {
    const result = stripFactionFromQuery('blood angels death company', ['space-marines'])
    expect(result.toLowerCase()).not.toContain('blood angel')
    expect(result).toContain('death company')
  })

  it('removes "in blood angels" completely', () => {
    const result = stripFactionFromQuery('in blood angels who has sustained hits', [
      'space-marines',
    ])
    expect(result.toLowerCase()).not.toContain('blood angel')
    expect(result).toContain('who has sustained hits')
  })

  it('does not leave trailing "s" from plural stripping', () => {
    const result = stripFactionFromQuery('blood angels sustained hits', ['space-marines'])
    expect(result).not.toMatch(/^\s*s\s/)
    expect(result).toBe('sustained hits')
  })

  it('removes multiple factions', () => {
    const result = stripFactionFromQuery('necrons vs orks melee', ['necrons', 'orks'])
    expect(result.toLowerCase()).not.toContain('necron')
    expect(result.toLowerCase()).not.toContain('ork')
    expect(result).toContain('melee')
  })

  it('returns original when no factions to strip', () => {
    expect(stripFactionFromQuery('how does cover work', [])).toBe('how does cover work')
  })

  it('returns original when faction not found in text', () => {
    expect(stripFactionFromQuery('how does cover work', ['necrons'])).toBe('how does cover work')
  })

  it('handles query that is ONLY the faction name → empty or near-empty', () => {
    const result = stripFactionFromQuery('blood angels', ['space-marines'])
    expect(result.trim().length).toBeLessThanOrEqual(3)
  })

  it('handles chaos space marines stripping', () => {
    const result = stripFactionFromQuery('chaos space marines stratagems', ['chaos-space-marines'])
    expect(result.toLowerCase()).not.toContain('chaos space marine')
    expect(result).toContain('stratagems')
  })
})

// ── extractMechanicKeywords ─────────────────────────────────────────────────

describe('extractMechanicKeywords', () => {
  it('extracts sustained hits', () => {
    expect(extractMechanicKeywords('who has sustained hits')).toContain('sustained hits')
  })

  it('extracts multiple mechanics', () => {
    const result = extractMechanicKeywords('units with lethal hits and devastating wounds')
    expect(result).toContain('lethal hits')
    expect(result).toContain('devastating wounds')
  })

  it('expands fnp → feel no pain', () => {
    expect(extractMechanicKeywords('who has fnp')).toContain('feel no pain')
  })

  it('expands dev wounds → devastating wounds', () => {
    expect(extractMechanicKeywords('dev wounds triggers')).toContain('devastating wounds')
  })

  it('expands sus hits → sustained hits', () => {
    expect(extractMechanicKeywords('sus hits fishing')).toContain('sustained hits')
  })

  it('expands obsec → objective control', () => {
    expect(extractMechanicKeywords('units with obsec')).toContain('objective control')
  })

  it('expands invuln → invulnerable', () => {
    expect(extractMechanicKeywords('best invuln saves')).toContain('invulnerable')
  })

  it('returns empty for no mechanics', () => {
    expect(extractMechanicKeywords('what colour are necrons')).toEqual([])
  })

  it('extracts deep strike', () => {
    expect(extractMechanicKeywords('which units can deep strike')).toContain('deep strike')
  })

  it('extracts feel no pain without alias', () => {
    expect(extractMechanicKeywords('feel no pain 5+')).toContain('feel no pain')
  })

  it('extracts overwatch', () => {
    expect(extractMechanicKeywords('can I fire overwatch')).toContain('overwatch')
  })
})

// ── MECHANIC_ALIASES structure ──────────────────────────────────────────────

describe('MECHANIC_ALIASES', () => {
  it('has at least 15 aliases', () => {
    expect(MECHANIC_ALIASES.length).toBeGreaterThanOrEqual(15)
  })

  it('every alias has a canonical that exists in the mechanics list', () => {
    // We can't import MECHANIC_TERMS directly, but we can verify via extractMechanicKeywords
    for (const { alias, canonical } of MECHANIC_ALIASES) {
      const result = extractMechanicKeywords(canonical)
      expect(
        result.length,
        `canonical "${canonical}" for alias "${alias}" should be in mechanics list`,
      ).toBeGreaterThan(0)
    }
  })
})
