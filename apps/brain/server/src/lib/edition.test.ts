import { describe, expect, it } from 'vitest'

import {
  editionsAvailableForId,
  filterByEdition,
  nodeMatchesEdition,
  parseEditionParam,
  resolveEdition,
} from './edition'
import type { Node } from './model'

const makeNode = (overrides: Partial<Node>): Node => ({
  id: 'test',
  layer: 'unit',
  category: 'datasheet',
  title: 'Test',
  content: 'content',
  summary: 'summary',
  sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
  refs: [],
  version: 1,
  keywords: [],
  ...overrides,
})

describe('parseEditionParam', () => {
  it('returns the edition when valid', () => {
    expect(parseEditionParam('11th')).toBe('11th')
    expect(parseEditionParam('10th')).toBe('10th')
    expect(parseEditionParam('9th')).toBe('9th')
    expect(parseEditionParam('any')).toBe('any')
  })

  it('lowercases and trims input', () => {
    expect(parseEditionParam('  11TH  ')).toBe('11th')
    expect(parseEditionParam('Any')).toBe('any')
  })

  it('returns undefined for missing/empty', () => {
    expect(parseEditionParam(undefined)).toBeUndefined()
    expect(parseEditionParam(null)).toBeUndefined()
    expect(parseEditionParam('')).toBeUndefined()
    expect(parseEditionParam('   ')).toBeUndefined()
  })

  it('returns undefined for unknown values (caller applies default)', () => {
    expect(parseEditionParam('12th')).toBeUndefined()
    expect(parseEditionParam('bogus')).toBeUndefined()
  })
})

describe('resolveEdition', () => {
  it('uses query param when set', () => {
    expect(resolveEdition('11th', '10th')).toBe('11th')
  })

  it('falls back to env default when query param is missing', () => {
    expect(resolveEdition(undefined, '11th')).toBe('11th')
    expect(resolveEdition('', '10th')).toBe('10th')
  })

  it('returns "any" when neither query nor env is set', () => {
    expect(resolveEdition(undefined, undefined)).toBe('any')
    expect(resolveEdition('', '')).toBe('any')
  })

  it('falls back to env default when query param is unknown', () => {
    expect(resolveEdition('bogus', '11th')).toBe('11th')
  })
})

describe('nodeMatchesEdition', () => {
  it('matches the exact edition', () => {
    expect(nodeMatchesEdition({ edition: '11th' }, '11th')).toBe(true)
    expect(nodeMatchesEdition({ edition: '10th' }, '10th')).toBe(true)
  })

  it('rejects mismatched editions', () => {
    expect(nodeMatchesEdition({ edition: '10th' }, '11th')).toBe(false)
    expect(nodeMatchesEdition({ edition: '11th' }, '10th')).toBe(false)
  })

  it('treats missing edition as 11th (Rule 5)', () => {
    expect(nodeMatchesEdition({}, '11th')).toBe(true)
    expect(nodeMatchesEdition({}, '10th')).toBe(false)
  })

  it('any always matches', () => {
    expect(nodeMatchesEdition({ edition: '10th' }, 'any')).toBe(true)
    expect(nodeMatchesEdition({ edition: '11th' }, 'any')).toBe(true)
    expect(nodeMatchesEdition({}, 'any')).toBe(true)
  })

  it('edition-agnostic categories always match — faction identity spans editions', () => {
    // A faction node (Orks, Space Marines, etc.) exists across every edition.
    // Filtering it out because it lacks — or carries a stale — edition tag
    // erases the Factions browse layer whenever the user picks an edition.
    expect(nodeMatchesEdition({ category: 'faction' }, '11th')).toBe(true)
    expect(nodeMatchesEdition({ category: 'faction' }, '10th')).toBe(true)
    expect(nodeMatchesEdition({ category: 'faction' }, '9th')).toBe(true)
    expect(nodeMatchesEdition({ category: 'faction', edition: '10th' }, '11th')).toBe(true)
    expect(nodeMatchesEdition({ category: 'faction', edition: '11th' }, '10th')).toBe(true)
  })

  it('non-agnostic categories still respect the edition filter', () => {
    expect(nodeMatchesEdition({ category: 'datasheet', edition: '10th' }, '11th')).toBe(false)
    expect(nodeMatchesEdition({ category: 'stratagem', edition: '10th' }, '11th')).toBe(false)
    expect(nodeMatchesEdition({ category: 'detachment', edition: '10th' }, '11th')).toBe(false)
  })
})

describe('filterByEdition', () => {
  const nodes = [
    makeNode({ id: '10a', edition: '10th' }),
    makeNode({ id: '11a', edition: '11th' }),
    makeNode({ id: '11b', edition: '11th' }),
    makeNode({ id: 'untagged', edition: undefined }),
  ]

  it('returns only 11th nodes (untagged counts as 11th)', () => {
    const filtered = filterByEdition(nodes, '11th')
    expect(filtered.map((n) => n.id).sort()).toEqual(['11a', '11b', 'untagged'])
  })

  it('returns only 10th nodes — untagged is NOT included', () => {
    const filtered = filterByEdition(nodes, '10th')
    expect(filtered.map((n) => n.id)).toEqual(['10a'])
  })

  it('returns everything for any', () => {
    expect(filterByEdition(nodes, 'any')).toHaveLength(4)
  })
})

describe('editionsAvailableForId', () => {
  it('returns sorted editions for a given id', () => {
    const nodes = [
      makeNode({ id: 'unit:warriors', edition: '10th' }),
      makeNode({ id: 'unit:warriors', edition: '11th' }),
      makeNode({ id: 'unit:other', edition: '11th' }),
    ]
    expect(editionsAvailableForId(nodes, 'unit:warriors')).toEqual(['10th', '11th'])
  })

  it('treats untagged nodes as 11th', () => {
    const nodes = [makeNode({ id: 'unit:x', edition: undefined })]
    expect(editionsAvailableForId(nodes, 'unit:x')).toEqual(['11th'])
  })

  it('returns empty array when id not found', () => {
    const nodes = [makeNode({ id: 'unit:x', edition: '11th' })]
    expect(editionsAvailableForId(nodes, 'missing')).toEqual([])
  })
})
