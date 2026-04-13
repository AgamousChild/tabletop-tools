import { describe, it, expect } from 'vitest'
import {
  FACTION_PATTERNS,
  SUBFACTION_TO_PARENT,
  MECHANIC_ALIASES,
  detectFactions,
  stripFactionFromQuery,
  extractMechanicKeywords,
} from './faction-detect'

describe('FACTION_PATTERNS', () => {
  it('has at least 25 entries', () => {
    expect(FACTION_PATTERNS.length).toBeGreaterThanOrEqual(25)
  })

  it('has chaos space marine before space marine', () => {
    const csmIdx = FACTION_PATTERNS.findIndex(p => p.pattern === 'chaos space marine')
    const smIdx = FACTION_PATTERNS.findIndex(p => p.pattern === 'space marine')
    expect(csmIdx).toBeGreaterThanOrEqual(0)
    expect(smIdx).toBeGreaterThanOrEqual(0)
    expect(csmIdx).toBeLessThan(smIdx)
  })
})

describe('detectFactions', () => {
  it('detects single faction (necrons)', () => {
    const result = detectFactions('how do necrons score objectives')
    expect(result.factions).toEqual(['necrons'])
    expect(result.subfaction).toBeUndefined()
  })

  it('detects SM chapter: blood angels → space-marines + subfaction', () => {
    const result = detectFactions('what stratagems do blood angels have')
    expect(result.factions).toContain('space-marines')
    expect(result.subfaction).toBe('blood angels')
  })

  it('detects multiple factions (necrons vs orks)', () => {
    const result = detectFactions('how do necrons compare to orks in melee')
    expect(result.factions).toContain('necrons')
    expect(result.factions).toContain('orks')
  })

  it('returns empty factions for generic question', () => {
    const result = detectFactions('how does cover work in 10th edition')
    expect(result.factions).toEqual([])
    expect(result.subfaction).toBeUndefined()
  })

  it('disambiguates chaos space marines from space marines', () => {
    const result = detectFactions('what is the chaos space marines stratagem')
    expect(result.factions).toContain('chaos-space-marines')
    expect(result.factions).not.toContain('space-marines')
  })

  it("detects T'au with apostrophe", () => {
    const result = detectFactions("what are the t'au sept rules")
    expect(result.factions).toContain('t-au-empire')
  })

  it('detects chaos daemon subfaction: plague legions → chaos-daemons + subfaction', () => {
    const result = detectFactions('plague legions daemon rules')
    expect(result.factions).toContain('chaos-daemons')
    expect(result.subfaction).toBe('plague legions')
  })

  it('detects aeldari subfaction: ynnari → aeldari + subfaction', () => {
    const result = detectFactions('ynnari ability rules')
    expect(result.factions).toContain('aeldari')
    expect(result.subfaction).toBe('ynnari')
  })

  it('detects aeldari subfaction: harlequins → aeldari + subfaction', () => {
    const result = detectFactions('harlequins movement rules')
    expect(result.factions).toContain('aeldari')
    expect(result.subfaction).toBe('harlequins')
  })
})

describe('stripFactionFromQuery', () => {
  it('removes detected faction from query', () => {
    const result = stripFactionFromQuery('how do necrons score objectives', ['necrons'])
    expect(result.toLowerCase()).not.toContain('necron')
    expect(result.toLowerCase()).toContain('score objectives')
  })

  it('handles multiple factions', () => {
    const result = stripFactionFromQuery('necrons vs orks melee comparison', ['necrons', 'orks'])
    expect(result.toLowerCase()).not.toContain('necron')
    expect(result.toLowerCase()).not.toContain('ork')
    expect(result.toLowerCase()).toContain('melee comparison')
  })

  it('returns original query when faction not found in text', () => {
    const original = 'how does cover work'
    const result = stripFactionFromQuery(original, ['necrons'])
    expect(result).toBe(original)
  })
})

describe('extractMechanicKeywords', () => {
  it('expands fnp alias to feel no pain', () => {
    const result = extractMechanicKeywords('how does fnp work')
    expect(result).toContain('feel no pain')
  })

  it('expands dev wounds alias to devastating wounds', () => {
    const result = extractMechanicKeywords('what triggers dev wounds')
    expect(result).toContain('devastating wounds')
  })

  it('extracts literal mechanic without alias', () => {
    const result = extractMechanicKeywords('how does deep strike work')
    expect(result).toContain('deep strike')
  })

  it('returns empty array for no mechanics', () => {
    const result = extractMechanicKeywords('what colour are necrons')
    expect(result).toEqual([])
  })
})

describe('SUBFACTION_TO_PARENT', () => {
  it('maps blood angels to space-marines', () => {
    expect(SUBFACTION_TO_PARENT['blood angels']).toBe('space-marines')
  })

  it('maps plague legions to chaos-daemons', () => {
    expect(SUBFACTION_TO_PARENT['plague legions']).toBe('chaos-daemons')
  })

  it('maps ynnari to aeldari', () => {
    expect(SUBFACTION_TO_PARENT['ynnari']).toBe('aeldari')
  })

  it('maps damned to chaos-space-marines', () => {
    expect(SUBFACTION_TO_PARENT['damned']).toBe('chaos-space-marines')
  })
})
