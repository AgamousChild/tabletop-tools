import { describe, expect, it } from 'vitest'

import { assembleContext, formatConversationalAnswer } from './format'
import type { Node } from './model'

const makeNode = (overrides: Partial<Node>): Node => ({
  id: 'test:node',
  layer: 'unit',
  category: 'unit-ability',
  title: 'Test Ability',
  content: 'Test content.',
  summary: 'Test summary.',
  sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
  refs: [],
  version: 1,
  keywords: [],
  ...overrides,
})

// ── formatConversationalAnswer ───────────────────────────────────────────────

describe('formatConversationalAnswer', () => {
  it('outputs prose, not bullet lists', () => {
    const nodes = [
      makeNode({
        id: 'a:1',
        category: 'faction-ability',
        title: 'Oath of Moment',
        content: 'Units re-roll all hit rolls of 1.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('re-rolls', nodes, new Map())
    // Should not have lines starting with "- **"
    const lines = result.split('\n')
    const bulletLines = lines.filter((l) => l.startsWith('- **'))
    expect(bulletLines).toHaveLength(0)
  })

  it('output contains actual sentences with periods', () => {
    const nodes = [
      makeNode({
        id: 'a:1',
        category: 'faction-ability',
        title: 'Oath of Moment',
        content: 'Units re-roll all hit rolls of 1.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('re-rolls', nodes, new Map())
    expect(result).toMatch(/\.\s/)
  })

  it('groups by impact tier — faction abilities appear before weapons', () => {
    const nodes = [
      makeNode({
        id: 'w:1',
        category: 'weapon',
        title: 'Bolt Rifle',
        content: 'S4 AP-1 D1.',
        summary: 'S4 AP-1 D1.',
      }),
      makeNode({
        id: 'f:1',
        category: 'faction-ability',
        title: 'Oath of Moment',
        content: 'Re-roll hit rolls.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('bolters', nodes, new Map())
    const factionPos = result.indexOf('Oath of Moment')
    const weaponPos = result.indexOf('Bolt Rifle')
    expect(factionPos).toBeGreaterThan(-1)
    expect(weaponPos).toBeGreaterThan(-1)
    expect(factionPos).toBeLessThan(weaponPos)
  })

  it('includes parent unit for weapons from parentMap', () => {
    const parentMap = new Map([['w:1', 'Intercessor Squad']])
    const nodes = [
      makeNode({
        id: 'w:1',
        category: 'weapon',
        title: 'Bolt Rifle',
        content: 'S4 AP-1 D1.',
        summary: 'S4 AP-1 D1.',
      }),
    ]
    const result = formatConversationalAnswer('bolt rifle', nodes, parentMap)
    expect(result).toContain('Intercessor Squad')
  })

  it('includes parent unit for abilities from parentMap', () => {
    const parentMap = new Map([['u:1', 'Sternguard Veteran Squad']])
    const nodes = [
      makeNode({
        id: 'u:1',
        category: 'unit-ability',
        title: 'Veteran Marksmen',
        content: 'Models in this unit have Lethal Hits.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('lethal hits', nodes, parentMap)
    expect(result).toContain('Sternguard Veteran Squad')
  })

  it('contains a Reference section', () => {
    const nodes = [
      makeNode({
        id: 'a:1',
        category: 'faction-ability',
        title: 'Oath of Moment',
        content: 'Units re-roll hit rolls of 1.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('re-rolls', nodes, new Map())
    expect(result).toContain('## Reference')
  })

  it('skips empty groups without adding blank sections', () => {
    const nodes = [
      makeNode({
        id: 'a:1',
        category: 'stratagem',
        title: 'Adaptive Strategy',
        content: 'Use this stratagem at the start of any phase.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('stratagem', nodes, new Map())
    expect(result).not.toContain('Faction/Army-Wide Abilities')
    expect(result).not.toContain('Weapons')
  })

  it('includes a footer with total count and source note', () => {
    const nodes = [
      makeNode({
        id: 'a:1',
        category: 'faction-ability',
        title: 'Oath of Moment',
        content: 'Re-roll hit rolls.',
        factionId: 'Space Marines',
      }),
      makeNode({
        id: 'b:1',
        category: 'stratagem',
        title: 'Adaptive Strategy',
        content: 'Use this stratagem.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('abilities', nodes, new Map())
    expect(result).toContain('2')
    expect(result.toLowerCase()).toContain('source')
  })

  it('places leader abilities in a separate group from regular unit abilities', () => {
    const nodes = [
      makeNode({
        id: 'l:1',
        category: 'unit-ability',
        title: 'Rites of Battle',
        content: 'While this model is leading a unit, those models re-roll hit rolls of 1.',
        factionId: 'Space Marines',
      }),
      makeNode({
        id: 'u:1',
        category: 'unit-ability',
        title: 'Rapid Fire',
        content: 'This unit may fire twice when stationary.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('abilities', nodes, new Map())
    const leaderPos = result.indexOf('Rites of Battle')
    const regularPos = result.indexOf('Rapid Fire')
    // Both should appear somewhere
    expect(leaderPos).toBeGreaterThan(-1)
    expect(regularPos).toBeGreaterThan(-1)
    // Rites of Battle is a leader ability — it should appear before regular unit abilities in the tier order
    expect(leaderPos).toBeLessThan(regularPos)
  })

  it('strips flavor text from content', () => {
    const nodes = [
      makeNode({
        id: 'a:1',
        category: 'faction-ability',
        title: 'Oath of Moment',
        content:
          '*A piece of pure lore that is very long and has no game mechanical terms whatsoever.*\nUnits re-roll hit rolls of 1.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('re-rolls', nodes, new Map())
    // The italic flavor text should be stripped
    expect(result).not.toContain('A piece of pure lore')
    // The actual game mechanic should remain
    expect(result).toContain('re-roll')
  })

  it('includes faction name in output for faction abilities', () => {
    const nodes = [
      makeNode({
        id: 'a:1',
        category: 'faction-ability',
        title: 'Oath of Moment',
        content: 'Re-roll hit rolls.',
        factionId: 'Space Marines',
      }),
    ]
    const result = formatConversationalAnswer('re-rolls', nodes, new Map())
    expect(result).toContain('Space Marines')
  })

  it('handles empty node list gracefully', () => {
    const result = formatConversationalAnswer('re-rolls', [], new Map())
    expect(result).toContain('0')
    expect(result).toBeTruthy()
  })
})

// ── assembleContext ──────────────────────────────────────────────────────────

describe('assembleContext', () => {
  it('puts primary nodes before connected nodes', () => {
    const primary = [
      makeNode({
        id: 'p:1',
        title: 'Primary Node',
        category: 'faction-ability',
        content: 'Primary content.',
        factionId: 'Space Marines',
      }),
    ]
    const connected = [
      makeNode({
        id: 'c:1',
        title: 'Connected Node',
        category: 'weapon',
        content: 'Connected content.',
        summary: 'Connected summary.',
      }),
    ]
    const result = assembleContext(primary, connected, new Map())
    const primaryPos = result.indexOf('Primary Node')
    const connectedPos = result.indexOf('Connected Node')
    expect(primaryPos).toBeGreaterThan(-1)
    expect(connectedPos).toBeGreaterThan(-1)
    expect(primaryPos).toBeLessThan(connectedPos)
  })

  it('includes source attribution for primary nodes', () => {
    const primary = [
      makeNode({
        id: 'p:1',
        title: 'Primary Node',
        content: 'Some content.',
        sources: [{ type: 'wahapedia', title: 'Wahapedia', page: 42, retrievedAt: '2026-01-01' }],
      }),
    ]
    const result = assembleContext(primary, [], new Map())
    expect(result).toContain('Source:')
    expect(result).toContain('Wahapedia')
    expect(result).toContain('p.42')
  })

  it('uses [unit-ability, ON UNIT: X] format for unit abilities in connected nodes', () => {
    const parentMap = new Map([['u:1', 'Intercessor Squad']])
    const connected = [
      makeNode({
        id: 'u:1',
        category: 'unit-ability',
        title: 'Veteran Marksmen',
        content: 'Lethal Hits.',
        factionId: 'Space Marines',
      }),
    ]
    const result = assembleContext([], connected, parentMap)
    expect(result).toContain('ON UNIT: Intercessor Squad')
  })

  it('uses [weapon, ON UNIT: X] format for weapons in connected nodes', () => {
    const parentMap = new Map([['w:1', 'Intercessor Squad']])
    const connected = [
      makeNode({
        id: 'w:1',
        category: 'weapon',
        title: 'Bolt Rifle',
        content: 'S4 AP-1 D1.',
        summary: 'S4 AP-1 D1.',
      }),
    ]
    const result = assembleContext([], connected, parentMap)
    expect(result).toContain('ON UNIT: Intercessor Squad')
  })

  it('orders connected nodes: faction-ability → detachment-rule → stratagem → enhancement → unit-ability → weapon → datasheet → other', () => {
    const connected = [
      makeNode({
        id: 'w:1',
        category: 'weapon',
        title: 'Bolt Rifle',
        content: 'S4 AP-1 D1.',
        summary: 'S4 AP-1 D1.',
      }),
      makeNode({
        id: 'f:1',
        category: 'faction-ability',
        title: 'Oath of Moment',
        content: 'Re-roll hits.',
        factionId: 'Space Marines',
      }),
      makeNode({
        id: 's:1',
        category: 'stratagem',
        title: 'Adaptive Strategy',
        content: 'Strategy text.',
      }),
    ]
    const result = assembleContext([], connected, new Map())
    const factionPos = result.indexOf('Oath of Moment')
    const stratagemPos = result.indexOf('Adaptive Strategy')
    const weaponPos = result.indexOf('Bolt Rifle')
    expect(factionPos).toBeLessThan(stratagemPos)
    expect(stratagemPos).toBeLessThan(weaponPos)
  })

  it('handles empty arrays gracefully', () => {
    const result = assembleContext([], [], new Map())
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })

  it('includes layer/category label in primary node headers', () => {
    const primary = [
      makeNode({
        id: 'p:1',
        title: 'Primary Node',
        layer: 'faction',
        category: 'faction-ability',
        content: 'Content.',
        factionId: 'Space Marines',
      }),
    ]
    const result = assembleContext(primary, [], new Map())
    expect(result).toContain('[faction/faction-ability]')
  })
})
