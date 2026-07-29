import { describe, expect, it } from 'vitest'

import { detectFormat } from './format-detector'

describe('detectFormat', () => {
  it('detects GW App format', () => {
    expect(detectFormat('Wu-Tang it (1990 Points)Adeptus Mechanicus')).toBe('gw-app')
    expect(detectFormat('My List (2000 points)Space Marines')).toBe('gw-app')
    expect(detectFormat('.plan D (1990 Points)When in doubt')).toBe('gw-app')
  })
  it('detects BattleScribe format', () => {
    expect(detectFormat('++++ FACTION KEYWORD: Chaos - CSM')).toBe('battlescribe')
    expect(detectFormat('some text + DETACHMENT: Pactbound')).toBe('battlescribe')
  })
  it('detects HTML', () => {
    expect(detectFormat('You need to enable JavaScript to run this app.')).toBe('html')
    expect(detectFormat('  body { background-image: url("test") }')).toBe('html')
    expect(detectFormat('<div class="list">stuff</div>')).toBe('html')
  })
  it('returns unknown for empty', () => {
    expect(detectFormat('')).toBe('unknown')
    expect(detectFormat('   ')).toBe('unknown')
  })
  it('returns unknown for unrecognizable text', () => {
    expect(detectFormat('just some random words about warhammer')).toBe('unknown')
  })

  // Players routinely paste a paragraph of commentary above the list. The
  // points marker is then well past the first 100 characters of the input,
  // which the original start-anchored check required.
  it('detects GW App format when prose precedes the list', () => {
    const text = [
      "Look, am I toxic? Probably. Is being toxic always wrong? Probably not. Do I have any intention of becoming less toxic? That's a question for a future version of me. Anyway, here's some Death Guard",
      '',
      'Death Guard',
      'Strike Force (2000 points)',
      'Virulent Vectorium',
    ].join('\n')
    expect(detectFormat(text)).toBe('gw-app')
  })

  it('detects GW App format from a key-value header with no points on line 1', () => {
    const text = [
      'Faction: Adeptus Custodes',
      'Detatchment: Lions of the Emperor',
      '',
      'CHARACTERS',
      '',
      'Blade Champion (120 Points)',
    ].join('\n')
    expect(detectFormat(text)).toBe('gw-app')
  })

  it('still returns unknown when no line carries a points marker', () => {
    expect(detectFormat('a long rambling note\nwith several lines\nand no list at all')).toBe(
      'unknown',
    )
  })
})
