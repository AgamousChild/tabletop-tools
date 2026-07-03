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

// ── SUBFACTION_TO_PARENT (chapter → parent-faction map) structure ──────────

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

  it('maps aeldari chapters to aeldari', () => {
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

  it('maps CSM legion to chaos-space-marines', () => {
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
      // No `subfaction` field is emitted post-PR-D; presence of the chapter
      // slug in `result.factions` is the discriminator.
    })
  }
})

// ── detectFactions — chapters/legions ───────────────────────────────────────

describe('detectFactions — chapters', () => {
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
    it(`"${query}" → space-marines + chapter slug (${expectedSf})`, () => {
      const result = detectFactions(query)
      expect(result.factions).toContain('space-marines')
      // Chapter slug is now also included so retrieve can walk dim_subfaction
      // and union chapter-specific datasheets (Lemartes lives under
      // factionId=blood-angels post-PR-B of the scalar-to-ref refactor).
      expect(result.factions).toContain(expectedSf.replace(/ /g, '-'))
    })
  }

  // Aeldari chapters/subfactions expand to the parent faction only
  const aeldariSubs: string[] = ['ynnari abilities', 'harlequins troupe', 'asuryani craftworld']

  for (const query of aeldariSubs) {
    it(`"${query}" → aeldari`, () => {
      const result = detectFactions(query)
      expect(result.factions).toContain('aeldari')
    })
  }

  // Chaos daemon legions expand to the parent faction only
  const daemonLegions: string[] = [
    'plague legions abilities',
    'scintillating legions stratagems',
    'legions of excess enhancements',
    'blood legions detachment',
  ]

  for (const query of daemonLegions) {
    it(`"${query}" → chaos-daemons`, () => {
      const result = detectFactions(query)
      expect(result.factions).toContain('chaos-daemons')
    })
  }
})

// ── detectFactions — disambiguation and edge cases ─────────────────────────

describe('detectFactions — edge cases', () => {
  it('returns empty for generic question with no faction', () => {
    const result = detectFactions('how does cover work in 10th edition')
    expect(result.factions).toEqual([])
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
    expect(result.factions).toContain('blood-angels')
  })

  it('ork does not match in "work" or "cork"', () => {
    const result = detectFactions('how does overwatch work')
    expect(result.factions).not.toContain('orks')
  })
})

// ── PR F — Ask auto-filter fix (2026-07-03-scalar-to-ref-refactor) ──────────
// Repro queries from the 2026-07-03 QA sweep. The auto-filter chip must NOT
// misfire on chapter aliases that share letters with the query, and the chip
// must key off `factions[0]` — so when the user names a broader parent
// faction explicitly, that parent goes first.

describe('detectFactions — auto-filter QA repro (PR F)', () => {
  it('"How does the Space Marines Rhino work?" → space-marines, not white-scars', () => {
    // Repro from QA sweep: "Rhino" or another token was pulling White Scars.
    // Whole-word matching plus explicit-parent-first ordering keeps SM primary.
    const result = detectFactions('How does the Space Marines Rhino work?')
    expect(result.factions).toContain('space-marines')
    expect(result.factions).not.toContain('white-scars')
    expect(result.factions[0]).toBe('space-marines')
  })

  it('"Grey Knights Paladin" → grey-knights only, no SM misfire', () => {
    const result = detectFactions('Grey Knights Paladin')
    expect(result.factions).toContain('grey-knights')
    expect(result.factions).not.toContain('space-marines')
    expect(result.factions).not.toContain('white-scars')
  })

  it('"Chaos Daemons Sorcerer" → chaos-daemons, no chapter misfire', () => {
    const result = detectFactions('Chaos Daemons Sorcerer')
    expect(result.factions).toContain('chaos-daemons')
    expect(result.factions).not.toContain('space-marines')
    // Sorcerer is a datasheet across factions but the query names the faction
    // explicitly — the filter must land on chaos-daemons, not a lookalike.
    expect(result.factions).not.toContain('thousand-sons')
    expect(result.factions).not.toContain('chaos-space-marines')
  })

  it('"Thousand Sons Sorcerer" → thousand-sons', () => {
    const result = detectFactions('Thousand Sons Sorcerer')
    expect(result.factions).toContain('thousand-sons')
    expect(result.factions[0]).toBe('thousand-sons')
    expect(result.factions).not.toContain('chaos-space-marines')
  })

  it('"World Eaters Lord on Juggernaut" → world-eaters, no CSM misfire', () => {
    const result = detectFactions('World Eaters Lord on Juggernaut')
    expect(result.factions).toContain('world-eaters')
    expect(result.factions).not.toContain('chaos-space-marines')
    expect(result.factions).not.toContain('space-marines')
  })

  it('"Rhino" bare → no faction detected', () => {
    // A unit name alone must not trigger any faction filter — auto-filter
    // stays off and search shows every Rhino across factions.
    const result = detectFactions('Rhino')
    expect(result.factions).toEqual([])
  })

  it('"BA Captain" → blood-angels via BA abbreviation', () => {
    const result = detectFactions('BA Captain')
    expect(result.factions).toContain('blood-angels')
    // Parent slug still comes along for dim_subfaction expansion downstream.
    expect(result.factions).toContain('space-marines')
    // Chapter is what the user typed → chapter is primary.
    expect(result.factions[0]).toBe('blood-angels')
  })
})

describe('detectFactions — whole-word matching (PR F substring guard)', () => {
  it('does not match chapter alias as a substring inside a longer word', () => {
    // A prior implementation used `String.indexOf(sf)`, which would fire on
    // any query containing the substring. Whole-word matching guards against
    // that: "asuryani" as a substring of "asuryanix" must not match.
    const result = detectFactions('the asuryanix codex')
    expect(result.factions).not.toContain('asuryani')
    expect(result.factions).not.toContain('aeldari')
  })

  it('bare chapter token still fires as a whole word', () => {
    // Whole-word boundary must not regress the normal case: "damned" as its
    // own token still legitimately matches the Damned Legion alias.
    const result = detectFactions('damned legion strategy')
    expect(result.factions).toContain('damned')
    expect(result.factions).toContain('chaos-space-marines')
  })

  it('"salamander" (singular) does NOT match "salamanders" chapter', () => {
    // SUBFACTION_TO_PARENT keys are canonical (plural) forms. Word-boundary
    // matching rejects the singular form — that's fine; users who mean the
    // chapter type its full name.
    const result = detectFactions('lone salamander lore')
    expect(result.factions).not.toContain('salamanders')
  })

  it('substring inside another word does not match "iron hands"', () => {
    // A pathological but concrete case: the alias must not fire on a partial
    // match somewhere inside a longer word.
    const result = detectFactions('wrought iron handshake')
    expect(result.factions).not.toContain('iron-hands')
  })
})

describe('detectFactions — parent-first ordering (PR F)', () => {
  it('explicit parent + chapter → parent is primary', () => {
    // When the user names BOTH a parent faction AND a chapter word, they've
    // asked for the broader scope; keep the parent as `factions[0]` so the
    // Ask auto-filter chip / factionBrowse root key off the parent.
    const result = detectFactions('Space Marines Blood Angels tactics')
    expect(result.factions).toContain('space-marines')
    expect(result.factions).toContain('blood-angels')
    expect(result.factions[0]).toBe('space-marines')
  })

  it('chapter alone → chapter is primary', () => {
    const result = detectFactions('blood angels tactics')
    expect(result.factions[0]).toBe('blood-angels')
    expect(result.factions).toContain('space-marines')
  })

  it('explicit parent alone → parent is primary', () => {
    const result = detectFactions('space marines detachments')
    expect(result.factions[0]).toBe('space-marines')
    expect(result.factions).not.toContain('blood-angels')
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

  it('removes chapter name when parent faction detected', () => {
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
