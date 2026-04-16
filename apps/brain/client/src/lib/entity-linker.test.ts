import { describe, it, expect } from 'vitest'
import { linkEntities } from './entity-linker'
import type { EntityMap } from './entity-linker'

function makeMap(entries: [string, string, string][]): EntityMap {
  const m: EntityMap = new Map()
  for (const [name, type, nodeId] of entries) {
    m.set(name.toLowerCase(), { type: type as 'unit' | 'stratagem' | 'enhancement' | 'rule' | 'mechanic', nodeId })
  }
  return m
}

describe('linkEntities', () => {
  it('returns single text segment when no entities match', () => {
    const result = linkEntities('some random text here', new Map())
    expect(result).toEqual([{ text: 'some random text here' }])
  })

  it('returns empty array for empty text', () => {
    const result = linkEntities('', new Map())
    expect(result).toEqual([])
  })

  it('matches one entity and returns three segments (before, entity, after)', () => {
    const entities = makeMap([['Infernus Squad', 'unit', 'node-1']])
    const result = linkEntities('Use the Infernus Squad to advance.', entities)
    expect(result).toEqual([
      { text: 'Use the ' },
      { text: 'Infernus Squad', entity: { type: 'unit', nodeId: 'node-1' } },
      { text: ' to advance.' },
    ])
  })

  it('matches entity at start of text', () => {
    const entities = makeMap([['Infernus Squad', 'unit', 'node-1']])
    const result = linkEntities('Infernus Squad advances.', entities)
    expect(result).toEqual([
      { text: 'Infernus Squad', entity: { type: 'unit', nodeId: 'node-1' } },
      { text: ' advances.' },
    ])
  })

  it('matches entity at end of text', () => {
    const entities = makeMap([['Infernus Squad', 'unit', 'node-1']])
    const result = linkEntities('Target the Infernus Squad', entities)
    expect(result).toEqual([
      { text: 'Target the ' },
      { text: 'Infernus Squad', entity: { type: 'unit', nodeId: 'node-1' } },
    ])
  })

  it('is case-insensitive ("infernus squad" matches "Infernus Squad" in entity map)', () => {
    const entities = makeMap([['Infernus Squad', 'unit', 'node-1']])
    const result = linkEntities('the infernus squad charges.', entities)
    expect(result).toHaveLength(3)
    expect(result[1].entity?.nodeId).toBe('node-1')
    // preserves original casing in segment text
    expect(result[1].text).toBe('infernus squad')
  })

  it('preserves original text casing in segment output', () => {
    const entities = makeMap([['Infernus Squad', 'unit', 'node-1']])
    const result = linkEntities('INFERNUS SQUAD is powerful.', entities)
    expect(result[0].text).toBe('INFERNUS SQUAD')
    expect(result[0].entity?.nodeId).toBe('node-1')
  })

  it('matches multiple entities in one string', () => {
    const entities = makeMap([
      ['Infernus Squad', 'unit', 'node-1'],
      ['Overwatch', 'stratagem', 'node-2'],
    ])
    const result = linkEntities('Use Overwatch against the Infernus Squad.', entities)
    const linked = result.filter(s => s.entity)
    expect(linked).toHaveLength(2)
    expect(linked[0].entity?.nodeId).toBe('node-2')
    expect(linked[1].entity?.nodeId).toBe('node-1')
  })

  it('longest match wins — "Chaos Space Marines" before "Space Marines"', () => {
    const entities = makeMap([
      ['Space Marines', 'unit', 'node-sm'],
      ['Chaos Space Marines', 'unit', 'node-csm'],
    ])
    const result = linkEntities('The Chaos Space Marines attack.', entities)
    const linked = result.filter(s => s.entity)
    expect(linked).toHaveLength(1)
    expect(linked[0].text).toBe('Chaos Space Marines')
    expect(linked[0].entity?.nodeId).toBe('node-csm')
  })

  it('does not double-match overlapping text', () => {
    const entities = makeMap([
      ['Space Marines', 'unit', 'node-sm'],
      ['Chaos Space Marines', 'unit', 'node-csm'],
    ])
    const result = linkEntities('Chaos Space Marines', entities)
    const linked = result.filter(s => s.entity)
    expect(linked).toHaveLength(1)
    expect(linked[0].entity?.nodeId).toBe('node-csm')
  })

  it('handles weapon ability tags [DEVASTATING WOUNDS] — strips brackets for lookup', () => {
    const entities = makeMap([['DEVASTATING WOUNDS', 'mechanic', 'node-dw']])
    const result = linkEntities('This weapon has [DEVASTATING WOUNDS] on a 6.', entities)
    const linked = result.filter(s => s.entity)
    expect(linked).toHaveLength(1)
    expect(linked[0].text).toBe('[DEVASTATING WOUNDS]')
    expect(linked[0].entity?.nodeId).toBe('node-dw')
  })

  it('handles weapon ability tag at start of text', () => {
    const entities = makeMap([['LETHAL HITS', 'mechanic', 'node-lh']])
    const result = linkEntities('[LETHAL HITS]: each hit auto-wounds.', entities)
    const linked = result.filter(s => s.entity)
    expect(linked).toHaveLength(1)
    expect(linked[0].text).toBe('[LETHAL HITS]')
  })

  it('matches entity that is the entire text', () => {
    const entities = makeMap([['Overwatch', 'stratagem', 'node-ow']])
    const result = linkEntities('Overwatch', entities)
    expect(result).toEqual([
      { text: 'Overwatch', entity: { type: 'stratagem', nodeId: 'node-ow' } },
    ])
  })

  it('handles adjacent entities with no gap', () => {
    const entities = makeMap([
      ['foo', 'rule', 'node-foo'],
      ['bar', 'rule', 'node-bar'],
    ])
    const result = linkEntities('foobar', entities)
    const linked = result.filter(s => s.entity)
    // "foo" and "bar" are adjacent — both should match
    expect(linked).toHaveLength(2)
    expect(linked[0].text).toBe('foo')
    expect(linked[1].text).toBe('bar')
  })

  it('filters out empty text segments', () => {
    const entities = makeMap([['Overwatch', 'stratagem', 'node-ow']])
    const result = linkEntities('Overwatch', entities)
    const emptyText = result.filter(s => !s.entity && s.text === '')
    expect(emptyText).toHaveLength(0)
  })
})
