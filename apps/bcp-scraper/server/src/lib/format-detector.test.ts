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
})
