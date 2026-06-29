import { describe, expect, it } from 'vitest'

import {
  buildForceDispositionNodes,
  buildPrimaryMissionNodes,
  dispositionNodeId,
  FORCE_DISPOSITION_PAGE,
  FORCE_DISPOSITION_SLUGS,
  FORCE_DISPOSITION_TITLES,
  PRIMARY_MISSION_MATRIX,
  PRIMARY_MISSION_SLUGS,
  PRIMARY_MISSION_TITLES,
  primaryMissionNodeId,
} from './force-dispositions'

describe('buildForceDispositionNodes', () => {
  it('emits one node per canonical slug, in canonical order', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    expect(nodes).toHaveLength(FORCE_DISPOSITION_SLUGS.length)
    expect(nodes).toHaveLength(5)
    expect(nodes.map((n) => n.id)).toEqual(
      FORCE_DISPOSITION_SLUGS.map((s) => `ca11:force-disposition:${s}`),
    )
  })

  it('uses the canonical mixed-case title for each node', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      const slug = node.id.replace(
        /^ca11:force-disposition:/,
        '',
      ) as keyof typeof FORCE_DISPOSITION_TITLES
      expect(node.title).toBe(FORCE_DISPOSITION_TITLES[slug])
    }
  })

  it('emits a single pdf source whose title slugifies to ca11-force-dispositions', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.sources).toHaveLength(1)
      const src = node.sources[0]!
      expect(src.type).toBe('pdf')
      const slug = src.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      expect(slug).toBe('ca11-force-dispositions')
    }
  })

  it('sets each source page to match FORCE_DISPOSITION_PAGE', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      const slug = node.id.replace(
        /^ca11:force-disposition:/,
        '',
      ) as keyof typeof FORCE_DISPOSITION_PAGE
      expect(node.sources[0]!.page).toBe(FORCE_DISPOSITION_PAGE[slug])
    }
  })

  it('page numbers cover 1..5 with no gaps or duplicates', () => {
    const pages = Object.values(FORCE_DISPOSITION_PAGE).sort((a, b) => a - b)
    expect(pages).toEqual([1, 2, 3, 4, 5])
  })

  it('tags every node as 11th edition, core layer, force-disposition category', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.edition).toBe('11th')
      expect(node.layer).toBe('core')
      expect(node.category).toBe('force-disposition')
    }
  })

  it('content lists the disposition matchup row (5 opponents)', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      const slug = node.id.replace(
        /^ca11:force-disposition:/,
        '',
      ) as keyof typeof PRIMARY_MISSION_MATRIX
      // Every opponent disposition title appears in the content.
      for (const opp of FORCE_DISPOSITION_SLUGS) {
        expect(node.content).toContain(FORCE_DISPOSITION_TITLES[opp])
        const missionSlug = PRIMARY_MISSION_MATRIX[slug][opp]
        expect(node.content).toContain(PRIMARY_MISSION_TITLES[missionSlug])
      }
    }
  })

  it('does not reproduce printed GW flavor text', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.content).toContain('Player-facing disposition card')
    }
  })

  it('each disposition emits 5 cross-refs to its primary missions', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.refs).toHaveLength(5)
      for (const ref of node.refs) {
        expect(ref.sourceId).toBe(node.id)
        expect(ref.targetId).toMatch(/^ca11:primary-mission:/)
        expect(ref.rel).toBe('part_of')
        expect(ref.context.length).toBeGreaterThan(0)
      }
    }
  })

  it('cross-ref targets match the matrix exactly', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    const nodesBySlug = new Map(
      nodes.map((n) => [
        n.id.replace(/^ca11:force-disposition:/, '') as keyof typeof PRIMARY_MISSION_MATRIX,
        n,
      ]),
    )
    for (const player of FORCE_DISPOSITION_SLUGS) {
      const node = nodesBySlug.get(player)!
      const refTargets = node.refs.map((r) => r.targetId).sort()
      const expected = FORCE_DISPOSITION_SLUGS.map((opp) =>
        primaryMissionNodeId(PRIMARY_MISSION_MATRIX[player][opp]),
      ).sort()
      expect(refTargets).toEqual(expected)
    }
  })

  it('keywords always include force disposition + 11th edition + chapter approved + slug-as-words', () => {
    const nodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.keywords).toContain('force disposition')
      expect(node.keywords).toContain('11th edition')
      expect(node.keywords).toContain('chapter approved')
      const slug = node.id.replace(/^ca11:force-disposition:/, '')
      expect(node.keywords).toContain(slug.replace(/-/g, ' '))
    }
  })

  it('respects retrievedAt override', () => {
    const ts = '2026-06-29T12:34:56Z'
    const nodes = buildForceDispositionNodes({ retrievedAt: ts })
    for (const node of nodes) {
      expect(node.sources[0]!.retrievedAt).toBe(ts)
    }
  })

  it('respects publishedAt override', () => {
    const nodes = buildForceDispositionNodes({
      retrievedAt: '2026-06-29T00:00:00Z',
      publishedAt: '2025-12-01',
    })
    for (const node of nodes) {
      expect(node.sources[0]!.publishedAt).toBe('2025-12-01')
    }
  })

  it('respects sourceTitle override (test seam — production callers MUST keep the default)', () => {
    const nodes = buildForceDispositionNodes({
      retrievedAt: '2026-06-29T00:00:00Z',
      sourceTitle: 'Synthetic Test Title',
    })
    for (const node of nodes) {
      expect(node.sources[0]!.title).toBe('Synthetic Test Title')
    }
  })
})

describe('buildPrimaryMissionNodes', () => {
  it('emits exactly 25 nodes', () => {
    const nodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    expect(nodes).toHaveLength(25)
    expect(nodes).toHaveLength(PRIMARY_MISSION_SLUGS.length)
  })

  it('emits one node per canonical primary-mission slug', () => {
    const nodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    const ids = new Set(nodes.map((n) => n.id))
    for (const slug of PRIMARY_MISSION_SLUGS) {
      expect(ids.has(primaryMissionNodeId(slug))).toBe(true)
    }
  })

  it('all 25 slugs are unique (matrix integrity)', () => {
    const set = new Set(PRIMARY_MISSION_SLUGS)
    expect(set.size).toBe(25)
  })

  it('every matrix cell maps to a slug in PRIMARY_MISSION_SLUGS', () => {
    const slugSet = new Set<string>(PRIMARY_MISSION_SLUGS)
    for (const player of FORCE_DISPOSITION_SLUGS) {
      for (const opp of FORCE_DISPOSITION_SLUGS) {
        const missionSlug = PRIMARY_MISSION_MATRIX[player][opp]
        expect(slugSet.has(missionSlug)).toBe(true)
      }
    }
  })

  it('tags every node as 11th edition, core layer, primary-mission category', () => {
    const nodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.edition).toBe('11th')
      expect(node.layer).toBe('core')
      expect(node.category).toBe('primary-mission')
    }
  })

  it('content carries a placeholder body identifying the disposition pairing', () => {
    const nodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.content).toContain('Body text not yet ingested')
      expect(node.content).toMatch(
        /Primary mission selected when\s+\*\*[\w ']+\*\*\s+faces\s+\*\*[\w ']+\*\*\./,
      )
    }
  })

  it('summary tags missions as "body pending"', () => {
    const nodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.summary).toMatch(/body pending/)
    }
  })

  it('each mission ref points back to its owning disposition card', () => {
    const nodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(node.refs).toHaveLength(1)
      const ref = node.refs[0]!
      expect(ref.sourceId).toBe(node.id)
      expect(ref.targetId).toMatch(/^ca11:force-disposition:/)
      expect(ref.rel).toBe('part_of')
    }
  })

  it('total cross-ref counts match the spec (5 dispositions × 5 = 25; 25 missions × 1 = 25)', () => {
    const dispNodes = buildForceDispositionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    const missionNodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    const dispRefCount = dispNodes.reduce((acc, n) => acc + n.refs.length, 0)
    const missionRefCount = missionNodes.reduce((acc, n) => acc + n.refs.length, 0)
    expect(dispRefCount).toBe(25)
    expect(missionRefCount).toBe(25)
  })

  it('source page matches the owning disposition card page', () => {
    const nodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      const ref = node.refs[0]!
      const dispSlug = ref.targetId.replace(
        /^ca11:force-disposition:/,
        '',
      ) as keyof typeof FORCE_DISPOSITION_PAGE
      expect(node.sources[0]!.page).toBe(FORCE_DISPOSITION_PAGE[dispSlug])
    }
  })

  it('source title slugifies to ca11-force-dispositions', () => {
    const nodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      const src = node.sources[0]!
      const slug = src.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      expect(slug).toBe('ca11-force-dispositions')
    }
  })

  it('keywords always include primary mission + 11th edition + mission name lowercased', () => {
    const nodes = buildPrimaryMissionNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.keywords).toContain('primary mission')
      expect(node.keywords).toContain('11th edition')
      expect(node.keywords).toContain(node.title.toLowerCase())
    }
  })

  it('uses dispositionNodeId / primaryMissionNodeId helpers consistently', () => {
    expect(dispositionNodeId('priority-assets')).toBe('ca11:force-disposition:priority-assets')
    expect(primaryMissionNodeId('destroyers-wrath')).toBe('ca11:primary-mission:destroyers-wrath')
  })
})
