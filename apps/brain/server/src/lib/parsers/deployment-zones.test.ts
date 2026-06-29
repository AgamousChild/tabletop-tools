import { describe, expect, it } from 'vitest'

import {
  buildDeploymentZoneNodes,
  DEPLOYMENT_ZONE_PAGE,
  DEPLOYMENT_ZONE_SLUGS,
  DEPLOYMENT_ZONE_TITLES,
} from './deployment-zones'

describe('buildDeploymentZoneNodes', () => {
  it('emits one node per canonical slug, in canonical order', () => {
    const nodes = buildDeploymentZoneNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    expect(nodes).toHaveLength(DEPLOYMENT_ZONE_SLUGS.length)
    expect(nodes.map((n) => n.id)).toEqual(
      DEPLOYMENT_ZONE_SLUGS.map((s) => `ca11:deployment-zone:${s}`),
    )
  })

  it('uses the canonical (uppercase) title for each node', () => {
    const nodes = buildDeploymentZoneNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      const slug = node.id.replace(
        /^ca11:deployment-zone:/,
        '',
      ) as keyof typeof DEPLOYMENT_ZONE_TITLES
      expect(node.title).toBe(DEPLOYMENT_ZONE_TITLES[slug])
      expect(node.title).toBe(node.title.toUpperCase())
    }
  })

  it('emits a single pdf source whose title slugifies to ca11-deployment-zones', () => {
    const nodes = buildDeploymentZoneNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.sources).toHaveLength(1)
      const src = node.sources[0]!
      expect(src.type).toBe('pdf')
      const slug = src.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      expect(slug).toBe('ca11-deployment-zones')
    }
  })

  it('sets each source page to match DEPLOYMENT_ZONE_PAGE', () => {
    const nodes = buildDeploymentZoneNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      const slug = node.id.replace(
        /^ca11:deployment-zone:/,
        '',
      ) as keyof typeof DEPLOYMENT_ZONE_PAGE
      expect(node.sources[0]!.page).toBe(DEPLOYMENT_ZONE_PAGE[slug])
    }
  })

  it('page numbers cover 1..6 with no gaps or duplicates', () => {
    const pages = Object.values(DEPLOYMENT_ZONE_PAGE).sort((a, b) => a - b)
    expect(pages).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('tags every node as 11th edition, core layer, deployment-zone category', () => {
    const nodes = buildDeploymentZoneNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.edition).toBe('11th')
      expect(node.layer).toBe('core')
      expect(node.category).toBe('deployment-zone')
    }
  })

  it('content is short structural body (no parsed rules text)', () => {
    const nodes = buildDeploymentZoneNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      // No placeholder text — image carries the rules content.
      expect(node.content).not.toMatch(/has not yet been ingested/i)
      expect(node.content).toMatch(/Strike Force/)
      expect(node.content).toMatch(/See deployment card image/)
    }
  })

  it('keywords always include deployment + deployment zone + 11th edition + slug-as-words', () => {
    const nodes = buildDeploymentZoneNodes({ retrievedAt: '2026-06-29T00:00:00Z' })
    for (const node of nodes) {
      expect(node.keywords).toContain('deployment')
      expect(node.keywords).toContain('deployment zone')
      expect(node.keywords).toContain('11th edition')
      const slug = node.id.replace(/^ca11:deployment-zone:/, '')
      expect(node.keywords).toContain(slug.replace(/-/g, ' '))
    }
  })

  it('respects retrievedAt override', () => {
    const ts = '2026-06-29T12:34:56Z'
    const nodes = buildDeploymentZoneNodes({ retrievedAt: ts })
    for (const node of nodes) {
      expect(node.sources[0]!.retrievedAt).toBe(ts)
    }
  })

  it('respects publishedAt override', () => {
    const nodes = buildDeploymentZoneNodes({
      retrievedAt: '2026-06-29T00:00:00Z',
      publishedAt: '2025-12-01',
    })
    for (const node of nodes) {
      expect(node.sources[0]!.publishedAt).toBe('2025-12-01')
    }
  })

  it('respects sourceTitle override (test seam — production callers MUST keep the default)', () => {
    const nodes = buildDeploymentZoneNodes({
      retrievedAt: '2026-06-29T00:00:00Z',
      sourceTitle: 'Synthetic Test Title',
    })
    for (const node of nodes) {
      expect(node.sources[0]!.title).toBe('Synthetic Test Title')
    }
  })
})
