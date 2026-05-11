import { describe, it, expect } from 'vitest'
import { extractDetachment } from './detachment-map'

describe('extractDetachment', () => {
  it('extracts from BattleScribe DETACHMENT line', () => {
    const list = `++ Army Roster (Chaos Space Marines) [2,000pts] ++

+ DETACHMENT: Pactbound Zealots (Marks of Chaos) +

+ HQ +

Abaddon the Despoiler [280pts]`

    expect(extractDetachment(list, 'chaos-space-marines')).toBe('pactbound-zealots')
  })

  it('extracts detachment without parenthetical', () => {
    const list = `++ Army Roster ++

+ DETACHMENT: Gladius Task Force +

+ HQ +`

    expect(extractDetachment(list, 'space-marines')).toBe('gladius-task-force')
  })

  it('extracts from GW App format (detachment on line 2-3)', () => {
    const list = `Chaos Space Marines
Pactbound Zealots
Strike Force (2000 Points)

Abaddon the Despoiler (280 Points)`

    expect(extractDetachment(list, 'chaos-space-marines')).toBe('pactbound-zealots')
  })

  it('extracts from GW App format with faction on line 1 and detachment on line 3', () => {
    const list = `Space Marines
Ultramarines
Gladius Task Force
Strike Force (2000 Points)`

    expect(extractDetachment(list, 'space-marines')).toBe('gladius-task-force')
  })

  it('returns null for empty text', () => {
    expect(extractDetachment('', 'orks')).toBeNull()
  })

  it('returns null for unrecognizable text', () => {
    const list = `Just some random text
that does not contain
any detachment information`

    expect(extractDetachment(list, 'space-marines')).toBeNull()
  })

  it('strips parenthetical content from detachment name', () => {
    const list = `+ DETACHMENT: Veterans of the Long War (Chaos Marks) +`
    expect(extractDetachment(list, 'chaos-space-marines')).toBe('veterans-of-the-long-war')
  })
})
