import { describe, it, expect } from 'vitest'
import { resolveCardView } from './card-display'
import type { ResultNode } from './card-display'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<ResultNode> = {}): ResultNode {
  return {
    id: 'test:1',
    score: 0,
    title: 'Test',
    summary: 'Summary',
    content: 'Content text here.',
    layer: 'core',
    category: 'core-mechanic',
    sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-01-01' }],
    keywords: [],
    ...overrides,
  }
}

// ── resolveCardView ───────────────────────────────────────────────────────────

describe('resolveCardView', () => {
  it('returns a card for every known category', () => {
    const categories = [
      'datasheet',
      'stratagem',
      'enhancement',
      'faction-ability',
      'detachment-rule',
      'phase-sequence',
      'core-mechanic',
      'terrain',
      'army-construction',
      'mission',
      'keyword',
      'primary-mission',
      'secondary-mission',
      'twist',
      'challenger',
      'deployment-zone',
      'terrain-layout',
      'faq',
      'commentary',
      'balance-change',
      'ruling',
      'tactic',
      'worked-example',
    ]
    for (const cat of categories) {
      const result = resolveCardView(makeNode({ category: cat }))
      expect(result.card, `no card for category: ${cat}`).toBeDefined()
      expect(result.card.type, `no type for category: ${cat}`).toBeTruthy()
    }
  })

  it('always returns a card even for unknown categories', () => {
    const result = resolveCardView(makeNode({ category: 'unknown-thing' }))
    expect(result.card).toBeDefined()
    expect(result.card.type).toBe('rule') // fallback
  })

  it('extracts pdfSource when valid PDF ref with page exists', () => {
    const result = resolveCardView(
      makeNode({
        sources: [
          {
            type: 'pdf',
            title: 'Core Rules',
            page: 28,
            topPct: 7.69,
            heightPct: 27.19,
            leftPct: 44.32,
            widthPct: 40.42,
            retrievedAt: '2026-01-01',
          },
        ],
      }),
    )
    expect(result.pdfSource).toBeDefined()
    expect(result.pdfSource!.page).toBe(28)
    expect(result.pdfSource!.pdfName).toBe('core-rules')
    expect(result.pdfSource!.topPct).toBe(7.69)
    expect(result.pdfSource!.heightPct).toBe(27.19)
    expect(result.pdfSource!.leftPct).toBe(44.32)
    expect(result.pdfSource!.widthPct).toBe(40.42)
  })

  it('slugifies pdfName from source title', () => {
    const result = resolveCardView(
      makeNode({
        sources: [
          { type: 'pdf', title: 'Chapter Approved Deployment Zones', page: 1, retrievedAt: '2026-01-01' },
        ],
      }),
    )
    expect(result.pdfSource!.pdfName).toBe('chapter-approved-deployment-zones')
  })

  it('returns no pdfSource when PDF source has no page', () => {
    const result = resolveCardView(
      makeNode({
        sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-01-01' }],
      }),
    )
    expect(result.pdfSource).toBeUndefined()
  })

  it('returns no pdfSource when only a non-PDF source exists', () => {
    const result = resolveCardView(
      makeNode({
        sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
      }),
    )
    expect(result.pdfSource).toBeUndefined()
  })

  it('surfaces qualityFlags from node', () => {
    const result = resolveCardView(
      makeNode({ qualityFlags: ['content-inferred', 'orphan'] }),
    )
    expect(result.qualityFlags).toEqual(['content-inferred', 'orphan'])
  })

  it('returns empty qualityFlags when none present', () => {
    const result = resolveCardView(makeNode())
    expect(result.qualityFlags).toEqual([])
  })

  // ── Category-specific ────────────────────────────────────────────────────

  it('maps datasheet to unit card (minimal stub)', () => {
    const result = resolveCardView(makeNode({ category: 'datasheet', title: 'Intercessors', factionId: 'space-marines' }))
    expect(result.card.type).toBe('unit')
    if (result.card.type === 'unit') {
      expect(result.card.data.name).toBe('Intercessors')
      expect(result.card.data.factionId).toBe('space-marines')
      // Minimal stub — weapons empty, caller must enrich
      expect(result.card.data.rangedWeapons).toEqual([])
    }
  })

  it('maps stratagem correctly — extracts WHEN/TARGET/EFFECT fields', () => {
    const result = resolveCardView(
      makeNode({
        category: 'stratagem',
        title: 'Blood Tithe',
        content:
          '**Type:** Battle Tactic\n**CP:** 1\n**WHEN:** Fight phase.\n**TARGET:** One unit.\n**EFFECT:** Re-roll wounds.',
        phase: 'fight',
        detachmentId: 'det:world-eaters:berzerker-warband',
      }),
    )
    expect(result.card.type).toBe('stratagem')
    if (result.card.type === 'stratagem') {
      expect(result.card.data.name).toBe('Blood Tithe')
      expect(result.card.data.when).toContain('Fight phase')
      expect(result.card.data.target).toContain('One unit')
      expect(result.card.data.effect).toContain('Re-roll wounds')
      expect(result.card.data.cpCost).toBe('1')
      expect(result.card.data.detachmentName).toBe('Berzerker Warband')
    }
  })

  it('maps enhancement correctly — extracts cost and restriction', () => {
    const result = resolveCardView(
      makeNode({
        category: 'enhancement',
        title: 'Sanctic Halo',
        content: '**Cost:** 25\nADEPTUS ASTARTES model only. Bearer has 4++ invuln.',
        factionId: 'space-marines',
        detachmentId: 'det:sm:gladius',
      }),
    )
    expect(result.card.type).toBe('enhancement')
    if (result.card.type === 'enhancement') {
      expect(result.card.data.name).toBe('Sanctic Halo')
      expect(result.card.data.cost).toBe('25')
      expect(result.card.data.restriction).toMatch(/model only/i)
      expect(result.card.data.detachmentName).toBe('Gladius')
    }
  })

  it('maps faction-ability without detachmentId to army rule', () => {
    const result = resolveCardView(
      makeNode({
        category: 'faction-ability',
        title: 'Oath of Moment',
        factionId: 'space-marines',
      }),
    )
    expect(result.card.type).toBe('rule')
    if (result.card.type === 'rule') {
      expect(result.card.data.isArmyRule).toBe(true)
    }
  })

  it('maps faction-ability with detachmentId to non-army rule', () => {
    const result = resolveCardView(
      makeNode({
        category: 'faction-ability',
        title: 'Detachment Ability',
        factionId: 'space-marines',
        detachmentId: 'det:sm:gladius',
      }),
    )
    expect(result.card.type).toBe('rule')
    if (result.card.type === 'rule') {
      expect(result.card.data.isArmyRule).toBe(false)
      expect(result.card.data.detachmentName).toBe('Gladius')
    }
  })

  it('maps detachment-rule to detachment card', () => {
    const result = resolveCardView(
      makeNode({
        category: 'detachment-rule',
        title: 'Gladius Task Force',
        factionId: 'space-marines',
        factionName: 'Space Marines',
      }),
    )
    expect(result.card.type).toBe('detachment')
    if (result.card.type === 'detachment') {
      expect(result.card.data.factionName).toBe('Space Marines')
      expect(result.card.data.stratagems).toEqual([])
      expect(result.card.data.enhancements).toEqual([])
    }
  })

  it('maps core-mechanic to core-rule card', () => {
    const result = resolveCardView(makeNode({ category: 'core-mechanic', title: 'Fight Phase' }))
    expect(result.card.type).toBe('core-rule')
    if (result.card.type === 'core-rule') {
      expect(result.card.data.name).toBe('Fight Phase')
    }
  })

  it('maps phase-sequence to core-rule card', () => {
    const result = resolveCardView(makeNode({ category: 'phase-sequence' }))
    expect(result.card.type).toBe('core-rule')
  })

  it('maps primary-mission with correct missionType', () => {
    const result = resolveCardView(makeNode({ category: 'primary-mission', title: 'Purge the Foe' }))
    expect(result.card.type).toBe('mission')
    if (result.card.type === 'mission') {
      expect(result.card.data.missionType).toBe('primary')
    }
  })

  it('maps secondary-mission and detects attacker/defender from id', () => {
    const resultAtk = resolveCardView(makeNode({ category: 'secondary-mission', id: 'mission:sm:atk:001' }))
    const resultDef = resolveCardView(makeNode({ category: 'secondary-mission', id: 'mission:sm:def:001' }))
    const resultNeither = resolveCardView(makeNode({ category: 'secondary-mission', id: 'mission:001' }))

    if (resultAtk.card.type === 'mission') expect(resultAtk.card.data.side).toBe('attacker')
    if (resultDef.card.type === 'mission') expect(resultDef.card.data.side).toBe('defender')
    if (resultNeither.card.type === 'mission') expect(resultNeither.card.data.side).toBeUndefined()
  })

  it('marks secondary-mission as fixed when keyword present', () => {
    const result = resolveCardView(makeNode({ category: 'secondary-mission', keywords: ['fixed'] }))
    if (result.card.type === 'mission') {
      expect(result.card.data.isFixed).toBe(true)
    }
  })

  it('maps twist to twist card', () => {
    const result = resolveCardView(makeNode({ category: 'twist', title: 'Hidden Agendas' }))
    expect(result.card.type).toBe('twist')
    if (result.card.type === 'twist') {
      expect(result.card.data.name).toBe('Hidden Agendas')
    }
  })

  it('maps challenger to challenger card', () => {
    const result = resolveCardView(makeNode({ category: 'challenger', title: 'Challenger Rules' }))
    expect(result.card.type).toBe('challenger')
  })

  it('maps deployment-zone with PDF image reference', () => {
    const result = resolveCardView(
      makeNode({
        category: 'deployment-zone',
        title: 'DAWN OF WAR',
        sources: [
          {
            type: 'pdf',
            title: 'Chapter Approved Deployment Zones',
            page: 2,
            retrievedAt: '2026-01-01',
          },
        ],
      }),
    )
    expect(result.card.type).toBe('deployment-zone')
    if (result.card.type === 'deployment-zone') {
      expect(result.card.data.pdfImages).toBeDefined()
      expect(result.card.data.pdfImages![0].page).toBe(2)
      expect(result.card.data.pdfImages![0].pdfName).toBe('chapter-approved-deployment-zones')
    }
  })

  it('maps deployment-zone without PDF — pdfImages is undefined', () => {
    const result = resolveCardView(
      makeNode({ category: 'deployment-zone', sources: [] }),
    )
    expect(result.card.type).toBe('deployment-zone')
    if (result.card.type === 'deployment-zone') {
      expect(result.card.data.pdfImages).toBeUndefined()
    }
  })

  it('maps terrain-layout with PDF image', () => {
    const result = resolveCardView(
      makeNode({
        category: 'terrain-layout',
        sources: [{ type: 'pdf', title: 'Mission Pack', page: 5, retrievedAt: '2026-01-01' }],
      }),
    )
    expect(result.card.type).toBe('terrain-layout')
    if (result.card.type === 'terrain-layout') {
      expect(result.card.data.pdfImage).toBeDefined()
    }
  })

  it('maps faq to errata card', () => {
    const result = resolveCardView(
      makeNode({ category: 'faq', title: 'FAQ Entry', content: 'Clarification text.' }),
    )
    expect(result.card.type).toBe('errata')
    if (result.card.type === 'errata') {
      expect(result.card.data.correctionText).toBe('Clarification text.')
    }
  })

  it('maps commentary to errata card', () => {
    const result = resolveCardView(makeNode({ category: 'commentary' }))
    expect(result.card.type).toBe('errata')
  })

  it('maps balance-change to balance card', () => {
    const result = resolveCardView(
      makeNode({ category: 'balance-change', title: 'Points Update' }),
    )
    expect(result.card.type).toBe('balance')
    if (result.card.type === 'balance') {
      expect(result.card.data.name).toBe('Points Update')
    }
  })

  it('maps ruling to community card', () => {
    const result = resolveCardView(makeNode({ category: 'ruling' }))
    expect(result.card.type).toBe('community')
  })

  it('maps tactic to community card', () => {
    const result = resolveCardView(makeNode({ category: 'tactic' }))
    expect(result.card.type).toBe('community')
  })

  it('maps worked-example to community card', () => {
    const result = resolveCardView(makeNode({ category: 'worked-example' }))
    expect(result.card.type).toBe('community')
  })
})

// ── Helper internals (via resolveCardView) ────────────────────────────────────

describe('formatDetachmentName (via stratagem)', () => {
  it('handles colon-delimited detachmentId', () => {
    const result = resolveCardView(
      makeNode({ category: 'stratagem', detachmentId: 'det:space-marines:gladius-task-force' }),
    )
    if (result.card.type === 'stratagem') {
      expect(result.card.data.detachmentName).toBe('Gladius Task Force')
    }
  })

  it('handles plain slug detachmentId', () => {
    const result = resolveCardView(
      makeNode({ category: 'stratagem', detachmentId: 'berzerker-warband' }),
    )
    if (result.card.type === 'stratagem') {
      expect(result.card.data.detachmentName).toBe('Berzerker Warband')
    }
  })

  it('returns empty string when no detachmentId', () => {
    const result = resolveCardView(
      makeNode({ category: 'stratagem', detachmentId: undefined }),
    )
    if (result.card.type === 'stratagem') {
      expect(result.card.data.detachmentName).toBe('')
    }
  })
})
