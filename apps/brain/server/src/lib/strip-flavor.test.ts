import { describe, it, expect } from 'vitest'
import { stripFlavorText } from './strip-flavor'

describe('stripFlavorText', () => {
  it('handles empty string', () => {
    expect(stripFlavorText('')).toBe('')
  })

  it('keeps lines with game mechanic keywords', () => {
    const input = 'This unit has a 3+ save.\nThis model can re-roll hit rolls.\nMake wound rolls for each attack.'
    const result = stripFlavorText(input)
    expect(result).toContain('3+ save')
    expect(result).toContain('re-roll')
    expect(result).toContain('wound rolls')
  })

  it('removes long italic lore blocks', () => {
    const input = 'Some rules text.\n*This is a very long piece of lore flavor text that goes on and on.*\nMore rules.'
    const result = stripFlavorText(input)
    expect(result).not.toContain('lore flavor text')
    expect(result).toContain('Some rules text')
    expect(result).toContain('More rules')
  })

  it('keeps stratagem structure lines (WHEN/TARGET/EFFECT)', () => {
    const input = '**WHEN:** In your Shooting phase.\n**TARGET:** One unit.\n**EFFECT:** Do something.'
    const result = stripFlavorText(input)
    expect(result).toContain('WHEN')
    expect(result).toContain('TARGET')
    expect(result).toContain('EFFECT')
  })

  it('keeps weapon ability keywords in brackets', () => {
    const input = '[SUSTAINED HITS 1]\n[LETHAL HITS]\n[DEVASTATING WOUNDS]'
    const result = stripFlavorText(input)
    expect(result).toContain('SUSTAINED')
    expect(result).toContain('LETHAL')
    expect(result).toContain('DEVASTATING')
  })

  it('removes long narrative lines with no numbers or brackets', () => {
    const long = 'This is a very long narrative flavor text line that goes on and tells a story about some ancient warrior'
    expect(long.length).toBeGreaterThan(80)
    const result = stripFlavorText(long)
    expect(result).toBe('')
  })

  it('keeps long lines that contain numbers', () => {
    const long = 'This unit can advance and still shoot with a -1 to hit modifier applied to all attacks made'
    const result = stripFlavorText(long)
    expect(result).toContain('advance')
  })

  it('keeps long lines that contain brackets', () => {
    const long = 'This unit has the following special ability [IGNORES COVER] when targeting units in terrain features'
    const result = stripFlavorText(long)
    expect(result).toContain('IGNORES COVER')
  })

  it('collapses triple+ newlines', () => {
    const input = 'Line one.\n\n\n\nLine two.'
    const result = stripFlavorText(input)
    expect(result).not.toMatch(/\n{3,}/)
  })

  it('trims leading and trailing whitespace', () => {
    const input = '\n\nSome text with D6 attacks.\n\n'
    const result = stripFlavorText(input)
    expect(result).not.toMatch(/^\n/)
    expect(result).not.toMatch(/\n$/)
  })

  it('keeps lines with Detachment Ability and Enhancement labels', () => {
    const input = 'Detachment Ability: Advance and charge.\nAbility: Ignore modifiers.\nEnhancement: +1 to wound.'
    const result = stripFlavorText(input)
    expect(result).toContain('Detachment Ability')
    expect(result).toContain('Ability:')
    expect(result).toContain('Enhancement:')
  })

  it('keeps lines with D6 and attack keywords', () => {
    const input = 'Roll D6 dice.\nMake 3 attacks.\nUnit must take a Battle-shock test.'
    const result = stripFlavorText(input)
    expect(result).toContain('D6')
    expect(result).toContain('attacks')
    expect(result).toContain('Battle-shock')
  })
})
