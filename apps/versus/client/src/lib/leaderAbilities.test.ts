import { describe, expect, it } from 'vitest'
import { parseAbilityDescription, extractLeaderRules } from './leaderAbilities'

describe('parseAbilityDescription', () => {
  it('returns empty array for empty description', () => {
    expect(parseAbilityDescription('')).toEqual([])
  })

  it('returns empty array when no patterns match', () => {
    expect(parseAbilityDescription('This unit has the Scouts 6" ability.')).toEqual([])
  })

  it('extracts re-roll all hit rolls', () => {
    const result = parseAbilityDescription(
      'While this model is leading a unit, each time a model in that unit makes an attack, you can re-roll the hit roll.',
    )
    expect(result).toContainEqual({ type: 'REROLL_HITS' })
  })

  it('extracts re-roll hit rolls of 1', () => {
    const result = parseAbilityDescription(
      'While this model is leading a unit, each time a model in that unit makes an attack, re-roll hit rolls of 1.',
    )
    expect(result).toContainEqual({ type: 'REROLL_HITS_OF_1' })
  })

  it('extracts re-roll wound rolls', () => {
    const result = parseAbilityDescription(
      'Each time a model in this unit makes an attack, you can re-roll the wound roll.',
    )
    expect(result).toContainEqual({ type: 'REROLL_WOUNDS' })
  })

  it('extracts Lethal Hits', () => {
    const result = parseAbilityDescription(
      'While this model is leading a unit, ranged weapons equipped by models in that unit have the [LETHAL HITS] ability.',
    )
    // The text says "LETHAL HITS" in brackets, but our pattern matches "lethal hits"
    expect(result).toContainEqual({ type: 'LETHAL_HITS' })
  })

  it('extracts Sustained Hits with value', () => {
    const result = parseAbilityDescription(
      'Melee weapons equipped by models in that unit have the [SUSTAINED HITS 1] ability.',
    )
    expect(result).toContainEqual({ type: 'SUSTAINED_HITS', value: 1 })
  })

  it('extracts Sustained Hits 2', () => {
    const result = parseAbilityDescription(
      'Attacks made by this unit have Sustained Hits 2.',
    )
    expect(result).toContainEqual({ type: 'SUSTAINED_HITS', value: 2 })
  })

  it('extracts Devastating Wounds', () => {
    const result = parseAbilityDescription(
      'While this model is leading a unit, weapons equipped by models in that unit have the [DEVASTATING WOUNDS] ability.',
    )
    expect(result).toContainEqual({ type: 'DEVASTATING_WOUNDS' })
  })

  it('extracts +1 to hit rolls', () => {
    const result = parseAbilityDescription(
      'Each time a model in this unit makes a ranged attack, add 1 to the hit roll.',
    )
    expect(result).toContainEqual({ type: 'HIT_MOD', value: 1 })
  })

  it('extracts +1 to wound rolls', () => {
    const result = parseAbilityDescription(
      'Each time a model in this unit makes an attack, add 1 to the wound roll.',
    )
    expect(result).toContainEqual({ type: 'WOUND_MOD', value: 1 })
  })

  it('extracts -1 to hit rolls (subtract)', () => {
    const result = parseAbilityDescription(
      'Each time an attack targets this unit, subtract 1 to the hit roll.',
    )
    expect(result).toContainEqual({ type: 'HIT_MOD', value: -1 })
  })

  it('extracts multiple rules from one description', () => {
    const result = parseAbilityDescription(
      'While this model is leading a unit, each time a model in that unit makes an attack, you can re-roll the hit roll, and add 1 to the wound roll.',
    )
    expect(result).toContainEqual({ type: 'REROLL_HITS' })
    expect(result).toContainEqual({ type: 'WOUND_MOD', value: 1 })
    expect(result).toHaveLength(2)
  })

  it('deduplicates identical rules from one description', () => {
    const result = parseAbilityDescription(
      'Lethal Hits: attacks have lethal hits.',
    )
    // Should only appear once even though "lethal hits" appears twice
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'LETHAL_HITS' })
  })

  it('handles +1 with plus sign notation', () => {
    const result = parseAbilityDescription(
      'Each time a model makes an attack, +1 to hit rolls.',
    )
    expect(result).toContainEqual({ type: 'HIT_MOD', value: 1 })
  })

  it('handles reroll with hyphen (re-roll)', () => {
    const result = parseAbilityDescription(
      'You can re-roll wound rolls for attacks made by this unit.',
    )
    expect(result).toContainEqual({ type: 'REROLL_WOUNDS' })
  })

  it('handles reroll without hyphen (reroll)', () => {
    const result = parseAbilityDescription(
      'You can reroll hit rolls for attacks made by this unit.',
    )
    expect(result).toContainEqual({ type: 'REROLL_HITS' })
  })
})

describe('extractLeaderRules', () => {
  it('returns empty array for no abilities', () => {
    expect(extractLeaderRules([])).toEqual([])
  })

  it('extracts rules with source ability name', () => {
    const result = extractLeaderRules([
      {
        name: 'Rites of Battle',
        description: 'While this model is leading a unit, each time a model in that unit makes an attack, you can re-roll the hit roll.',
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      rule: { type: 'REROLL_HITS' },
      source: 'Rites of Battle',
    })
  })

  it('extracts rules from multiple abilities', () => {
    const result = extractLeaderRules([
      {
        name: 'Tactical Precision',
        description: 'Add 1 to the wound roll for attacks made by this unit.',
      },
      {
        name: 'Inspiring Leader',
        description: 'Ranged weapons have the [LETHAL HITS] ability.',
      },
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      rule: { type: 'WOUND_MOD', value: 1 },
      source: 'Tactical Precision',
    })
    expect(result[1]).toEqual({
      rule: { type: 'LETHAL_HITS' },
      source: 'Inspiring Leader',
    })
  })

  it('deduplicates across multiple abilities', () => {
    const result = extractLeaderRules([
      {
        name: 'Ability A',
        description: 'You can re-roll the hit roll.',
      },
      {
        name: 'Ability B',
        description: 'You can re-roll hit rolls.',
      },
    ])
    // Same rule from two abilities — only keep the first
    expect(result).toHaveLength(1)
    expect(result[0]!.source).toBe('Ability A')
  })

  it('skips abilities with no matching rules', () => {
    const result = extractLeaderRules([
      {
        name: 'Scout 6"',
        description: 'This unit can make a Normal move of up to 6".',
      },
      {
        name: 'Rites of Battle',
        description: 'You can re-roll the hit roll.',
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.source).toBe('Rites of Battle')
  })
})
