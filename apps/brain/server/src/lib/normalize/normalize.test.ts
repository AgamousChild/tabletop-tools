import { describe, it, expect } from 'vitest'
import { normalizeMarkdown } from './normalize'

describe('normalizeMarkdown', () => {
  it('inserts line breaks at sentence boundaries', () => {
    const input = 'First sentence. Second sentence. Third sentence.'
    const result = normalizeMarkdown(input)
    const lines = result.split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  it('converts ALL-CAPS headings to markdown headings', () => {
    const input = 'some intro SHOOTING PHASE You can shoot with units. CHARGE PHASE You can charge.'
    const result = normalizeMarkdown(input)
    expect(result).toContain('## SHOOTING PHASE')
    expect(result).toContain('## CHARGE PHASE')
  })

  it('handles numbered phase headings', () => {
    const input = '1 COMMAND PHASE Start here. 2 MOVEMENT PHASE Move units.'
    const result = normalizeMarkdown(input)
    expect(result).toContain('## 1 COMMAND PHASE')
    expect(result).toContain('## 2 MOVEMENT PHASE')
  })

  it('formats stratagem blocks', () => {
    const input = 'FIRE OVERWATCH COST: 1CP WHEN: Your opponent declares a charge. TARGET: One unit. EFFECT: That unit can shoot.'
    const result = normalizeMarkdown(input)
    expect(result).toContain('**COST:** 1CP')
    expect(result).toContain('**WHEN:**')
    expect(result).toContain('**TARGET:**')
    expect(result).toContain('**EFFECT:**')
  })

  it('normalizes smart quotes to ASCII', () => {
    const input = 'The unit\u2019s ability doesn\u2019t apply \u2013 use the core rule instead.'
    const result = normalizeMarkdown(input)
    expect(result).toContain("unit's")
    expect(result).toContain("doesn't")
    expect(result).toContain(' - ')
  })

  it('preserves the original content', () => {
    const input = 'WOUND ROLL Compare the Strength of the attacking weapon. If equal to Toughness, wound on 4+.'
    const result = normalizeMarkdown(input)
    expect(result).toContain('Compare the Strength')
    expect(result).toContain('wound on 4+')
  })

  it('handles an empty string', () => {
    expect(normalizeMarkdown('')).toBe('')
  })

  it('handles text with existing line breaks (no excessive breaks)', () => {
    const input = '# Existing Heading\n\nSome content.\n\nMore content.'
    const result = normalizeMarkdown(input)
    expect(result).not.toContain('\n\n\n\n')
  })
})
