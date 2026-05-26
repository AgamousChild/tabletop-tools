import { describe, expect, it } from 'vitest'

import { formatRestrictionText, parseDetachmentRestrictions } from './detachmentRestrictions'

describe('parseDetachmentRestrictions', () => {
  it('returns empty array when no restrictions found', () => {
    const abilities = [
      { id: '1', name: 'Some Ability', description: 'This ability does cool stuff.' },
    ]
    expect(parseDetachmentRestrictions(abilities)).toEqual([])
  })

  it('parses chapter restriction with bold markdown', () => {
    const abilities = [
      {
        id: '1',
        name: 'Red Thirst',
        description:
          'Some ability text.\n\nRESTRICTIONS\nYour army can include **BLOOD** **ANGELS** units, but it cannot include any **ADEPTUS** **ASTARTES** units drawn from any other Chapter.',
      },
    ]
    const result = parseDetachmentRestrictions(abilities)
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('chapter')
    expect(result[0]!.chapterName).toBe('BLOOD ANGELS')
    expect(result[0]!.abilityName).toBe('Red Thirst')
  })

  it('parses chapter restriction without bold markers', () => {
    const abilities = [
      {
        id: '2',
        name: 'Legacy of the Angel',
        description:
          'Rules here.\n\nRestrictions\nYour army can include Blood Angels units, but it cannot include **ADEPTUS** **ASTARTES** units drawn from any other Chapter.',
      },
    ]
    const result = parseDetachmentRestrictions(abilities)
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('chapter')
    expect(result[0]!.chapterName).toBe('Blood Angels')
  })

  it('parses points cap restriction', () => {
    const abilities = [
      {
        id: '3',
        name: 'Blood Tithe',
        description:
          'Text.\n\nRESTRICTIONS\nYou can include the Blood Legions units in your army. The combined points cost of such units you can include in your army is:\n**Incursion:** Up to 500 pts',
      },
    ]
    const result = parseDetachmentRestrictions(abilities)
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('points_cap')
    expect(result[0]!.chapterName).toBeNull()
  })

  it('parses keyword restriction', () => {
    const abilities = [
      {
        id: '4',
        name: 'Marks of Chaos',
        description:
          'Some text.\n\nRESTRICTIONS\n\n- You cannot select the **KHORNE** keyword for a Psyker unit.\n- A Character unit can only be attached to a unit if both units share the same keyword.',
      },
    ]
    const result = parseDetachmentRestrictions(abilities)
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('keyword')
  })

  it('parses other/generic restriction', () => {
    const abilities = [
      {
        id: '5',
        name: 'Cosmic Distortion',
        description:
          'Text.\n\nRESTRICTIONS\nWhen mustering your army, each **NECRONS** **MONSTER** unit from your army has the relevant ability.',
      },
    ]
    const result = parseDetachmentRestrictions(abilities)
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('other')
  })

  it('ignores abilities with RESTRICTIONS header but empty text', () => {
    const abilities = [
      {
        id: '6',
        name: 'Empty Restriction',
        description: 'Text.\n\nRESTRICTIONS\n',
      },
    ]
    const result = parseDetachmentRestrictions(abilities)
    expect(result).toHaveLength(0)
  })

  it('handles multiple abilities with restrictions', () => {
    const abilities = [
      { id: '1', name: 'Ability A', description: 'No restrictions here.' },
      {
        id: '2',
        name: 'Ability B',
        description: 'Text.\n\nRESTRICTIONS\nCannot include any units from other Chapter.',
      },
      {
        id: '3',
        name: 'Ability C',
        description: 'Text.\n\nRestrictions\nCombined points cost limit applies.',
      },
    ]
    const result = parseDetachmentRestrictions(abilities)
    expect(result).toHaveLength(2)
  })

  it('handles case-insensitive restrictions header', () => {
    const abilities = [
      {
        id: '1',
        name: 'Test',
        description:
          'Text.\n\nrestrictions\nYour army can include Space Wolves units, but it cannot include any units drawn from any other Chapter.',
      },
    ]
    const result = parseDetachmentRestrictions(abilities)
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('chapter')
  })
})

describe('formatRestrictionText', () => {
  it('strips bold markdown markers', () => {
    const text = 'Cannot include **ADEPTUS** **ASTARTES** units from any other **Chapter**.'
    expect(formatRestrictionText(text)).toBe(
      'Cannot include ADEPTUS ASTARTES units from any other Chapter.',
    )
  })

  it('returns plain text unchanged', () => {
    const text = 'No restrictions apply.'
    expect(formatRestrictionText(text)).toBe('No restrictions apply.')
  })
})
