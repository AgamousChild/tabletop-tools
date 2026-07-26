import { describe, expect, test } from 'vitest'

import { buildDetachmentNodes } from './combo-detection'
import type { Node } from './model'

const source = {
  type: 'wahapedia' as const,
  title: 'Wahapedia',
  retrievedAt: '2026-01-01T00:00:00Z',
}

function rule(id: string, factionId: string, title: string, edition: string): Node {
  return {
    id,
    layer: 'faction',
    category: 'detachment-rule',
    title,
    content: `${title} rule text`,
    summary: title,
    factionId,
    edition,
    sources: [source],
    refs: [],
    version: 1,
    keywords: [],
  }
}

function detachment(id: string, factionId: string, title: string, dp?: number): Node {
  return {
    id,
    layer: 'faction',
    category: 'detachment',
    title,
    content: `${title} container`,
    summary: title,
    factionId,
    edition: '11th',
    ...(dp != null ? { dp } : {}),
    sources: [source],
    refs: [],
    version: 1,
    keywords: [],
  }
}

describe('buildDetachmentNodes', () => {
  test('emits a container for a 10e detachment-rule with no canonical 11e counterpart', () => {
    const nodes = [rule('det:orks:goff-rock', 'orks', 'Goff Rock Detachment', '10th')]
    const result = buildDetachmentNodes(nodes)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]!.id).toBe('detachment:det:orks:goff-rock')
  })

  test('does NOT emit a container when a canonical 11e detachment already exists (same faction + title)', () => {
    const nodes = [
      rule(
        'det:space-marines:unforgiven-task-force',
        'space-marines',
        'Unforgiven Task Force',
        '10th',
      ),
      detachment(
        '11e:det:space-marines:unforgiven-task-force',
        'space-marines',
        'Unforgiven Task Force',
        2,
      ),
    ]
    const result = buildDetachmentNodes(nodes)
    // Only the canonical 11e already exists; buildDetachmentNodes must not
    // add a `detachment:det:...` twin that step 8b would flip to 11th.
    expect(result.nodes).toHaveLength(0)
  })

  test('normalizes title differences (curly quotes, punctuation) when matching to canonical', () => {
    const nodes = [
      rule('det:space-marines:lions-blade', 'space-marines', 'Lion’s Blade Task Force', '10th'),
      detachment(
        '11e:det:space-marines:lions-blade',
        'space-marines',
        "Lion's Blade Task Force",
        2,
      ),
    ]
    const result = buildDetachmentNodes(nodes)
    expect(result.nodes).toHaveLength(0)
  })

  test('emits containers for both when factions differ (shared-name detachment is per-faction)', () => {
    // Same detachment title under two different factions — both need containers.
    const nodes = [
      rule('det:dark-angels:wrath', 'dark-angels', 'Wrath of the Rock', '10th'),
      rule('det:space-marines:wrath', 'space-marines', 'Wrath of the Rock', '10th'),
    ]
    const result = buildDetachmentNodes(nodes)
    expect(result.nodes).toHaveLength(2)
  })
})
