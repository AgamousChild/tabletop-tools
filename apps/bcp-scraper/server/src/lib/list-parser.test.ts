import { describe, it, expect } from 'vitest'
import { parseList } from './list-parser'

describe('parseList', () => {
  it('routes GW App format to gw parser', () => {
    const result = parseList('My List (2000 Points)TyranidsSubterranean AssaultStrike Force (2,000 Points)CHARACTERSHive Tyrant (215 Points)  • Warlord')
    expect(result.parsedWith).toBe('gw-app-v1')
    expect(result.list.factionId).toBe('tyranids')
    expect(result.list.units.length).toBeGreaterThan(0)
  })

  it('routes BattleScribe format to bs parser', () => {
    const result = parseList('++++ FACTION KEYWORD: Chaos - Chaos Space Marines+ DETACHMENT: Pactbound Zealots+ TOTAL ARMY POINTS: 2000ptsChar1: 1x Abaddon the Despoiler (270 pts): Warlord')
    expect(result.parsedWith).toBe('battlescribe-v1')
    expect(result.list.factionId).toBe('chaos-space-marines')
  })

  it('returns failed for HTML', () => {
    const result = parseList('You need to enable JavaScript to run this app.<div>content</div>')
    expect(result.parseStatus).toBe('failed')
    expect(result.parsedWith).toBe('html-detected')
    expect(result.exports?.rawSource).toContain('JavaScript')
  })

  it('returns failed for unknown format', () => {
    const result = parseList('just some random text about my army')
    expect(result.parseStatus).toBe('failed')
    expect(result.parsedWith).toBe('unknown')
    expect(result.exports?.rawSource).toBe('just some random text about my army')
  })

  it('returns failed for empty input', () => {
    const result = parseList('')
    expect(result.parseStatus).toBe('failed')
  })
})
