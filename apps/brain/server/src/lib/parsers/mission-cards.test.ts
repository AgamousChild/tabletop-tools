import { describe, expect, it } from 'vitest'

import type { MissionCardOcrManifest } from './mission-cards'
import { parseMissionCards } from './mission-cards'

const OCR_AT = '2026-06-28T12:00:00Z'

function makeManifest(cards: MissionCardOcrManifest['cards']): MissionCardOcrManifest {
  return { generatedAt: OCR_AT, cards }
}

describe('parseMissionCards', () => {
  it('emits one primary-mission node per primary card', () => {
    const manifest = makeManifest([
      {
        slug: 'battlefield-dominance',
        kind: 'primary',
        group: 'take-and-hold',
        back: false,
        title: 'BATTLEFIELD DOMINANCE',
        body: 'At the end of each battle round, the player who controls more objective markers scores 5 VP.',
        sourceUrl:
          'https://gdmissions.app/assets/11th/primary-missions/take-and-hold/battlefield-dominance.png',
        ocrAt: OCR_AT,
        relPath: 'primary-missions/take-and-hold/battlefield-dominance.png',
      },
    ])
    const result = parseMissionCards(manifest)

    expect(result.primaries).toBe(1)
    expect(result.secondaries).toBe(0)
    expect(result.nodes).toHaveLength(1)

    const node = result.nodes[0]!
    expect(node.id).toBe('ca11:primary:take-and-hold:battlefield-dominance')
    expect(node.layer).toBe('core')
    expect(node.category).toBe('primary-mission')
    expect(node.edition).toBe('11th')
    // Deck-group slug rides in keywords now (see mission-cards.ts comment).
    expect(node.keywords).toContain('take and hold')
    expect(node.title).toBe('BATTLEFIELD DOMINANCE')
    expect(node.content).toContain('5 VP')
    expect(node.sources[0]!.type).toBe('community')
    expect(node.sources[0]!.url).toContain('gdmissions.app')
    expect(node.keywords).toContain('primary mission')
    expect(node.keywords).toContain('11th edition')
    expect(node.keywords).toContain('battlefield dominance')
    expect(node.keywords).toContain('take and hold')
  })

  it('merges attacker + defender secondaries into one node with usableBy both', () => {
    const manifest = makeManifest([
      {
        slug: 'assassination',
        kind: 'secondary',
        group: 'attacker',
        back: false,
        title: 'ASSASSINATION',
        body: 'Score 5 VP if your opponent has no CHARACTER models on the battlefield at the end of your turn.',
        sourceUrl:
          'https://gdmissions.app/assets/11th/secondary-missions/attacker/assassination.png',
        ocrAt: OCR_AT,
        relPath: 'secondary-missions/attacker/assassination.png',
      },
      {
        slug: 'assassination',
        kind: 'secondary',
        group: 'defender',
        back: false,
        title: 'ASSASSINATION',
        body: 'Score 5 VP if your opponent has no CHARACTER models on the battlefield at the end of your turn.',
        sourceUrl:
          'https://gdmissions.app/assets/11th/secondary-missions/defender/assassination.png',
        ocrAt: OCR_AT,
        relPath: 'secondary-missions/defender/assassination.png',
      },
    ])
    const result = parseMissionCards(manifest)

    // Attacker + defender collapse to a single node.
    expect(result.secondaries).toBe(1)
    expect(result.nodes).toHaveLength(1)
    const node = result.nodes[0]!
    expect(node.id).toBe('ca11:secondary:assassination')
    expect(node.category).toBe('secondary-mission')
    expect(node.edition).toBe('11th')
    expect(node.usableBy).toEqual(['attacker', 'defender'])
    expect(node.keywords).toContain('attacker')
    expect(node.keywords).toContain('defender')
    expect(node.keywords).toContain('secondary mission')
  })

  it('prefers the longer-body OCR text when attacker + defender disagree', () => {
    const manifest = makeManifest([
      {
        slug: 'cleanse',
        kind: 'secondary',
        group: 'attacker',
        back: false,
        title: '',
        body: 'short',
        sourceUrl: 'https://gdmissions.app/assets/11th/secondary-missions/attacker/cleanse.png',
        ocrAt: OCR_AT,
        relPath: 'secondary-missions/attacker/cleanse.png',
      },
      {
        slug: 'cleanse',
        kind: 'secondary',
        group: 'defender',
        back: false,
        title: 'CLEANSE',
        body: 'A much longer body with more rules detail captured.',
        sourceUrl: 'https://gdmissions.app/assets/11th/secondary-missions/defender/cleanse.png',
        ocrAt: OCR_AT,
        relPath: 'secondary-missions/defender/cleanse.png',
      },
    ])
    const result = parseMissionCards(manifest)
    expect(result.secondaries).toBe(1)
    expect(result.nodes[0]!.content).toContain('much longer body')
  })

  it('overrides OCR body with secondaryBodyBySlug when provided', () => {
    const manifest = makeManifest([
      {
        slug: 'plunder',
        kind: 'secondary',
        group: 'attacker',
        back: false,
        title: 'PLUNDER',
        body: 'noisy OCR text',
        sourceUrl: 'https://gdmissions.app/assets/11th/secondary-missions/attacker/plunder.png',
        ocrAt: OCR_AT,
        relPath: 'secondary-missions/attacker/plunder.png',
      },
    ])
    const result = parseMissionCards(manifest, {
      secondaryBodyBySlug: new Map([
        ['plunder', 'CLEAN canonical body text from Canon transcript'],
      ]),
    })
    expect(result.nodes[0]!.content).toContain('CLEAN canonical body text')
    expect(result.nodes[0]!.content).not.toContain('noisy OCR text')
  })

  it('attaches back-of-card text as a Back: block on the front node', () => {
    const manifest = makeManifest([
      {
        slug: 'death-trap',
        kind: 'primary',
        group: 'disruption',
        back: false,
        title: 'DEATH TRAP',
        body: 'Front rules text.',
        sourceUrl: 'https://gdmissions.app/assets/11th/primary-missions/disruption/death-trap.png',
        ocrAt: OCR_AT,
        relPath: 'primary-missions/disruption/death-trap.png',
      },
      {
        slug: 'death-trap',
        kind: 'primary',
        group: 'disruption',
        back: true,
        title: '',
        body: 'Back rules text with extra clarification.',
        sourceUrl:
          'https://gdmissions.app/assets/11th/primary-missions/disruption/death-trap-back.png',
        ocrAt: OCR_AT,
        relPath: 'primary-missions/disruption/death-trap-back.png',
      },
    ])
    const result = parseMissionCards(manifest)

    expect(result.primaries).toBe(1) // back doesn't emit its own node
    const node = result.nodes[0]!
    expect(node.content).toContain('Front rules text.')
    expect(node.content).toContain('**Back:**')
    expect(node.content).toContain('Back rules text')
  })

  it('skips empty-body OCR entries instead of emitting blank nodes', () => {
    const manifest = makeManifest([
      {
        slug: 'sabotage',
        kind: 'primary',
        group: 'priority-assets',
        back: false,
        title: 'SABOTAGE',
        body: '',
        sourceUrl:
          'https://gdmissions.app/assets/11th/primary-missions/priority-assets/sabotage.png',
        ocrAt: OCR_AT,
        relPath: 'primary-missions/priority-assets/sabotage.png',
      },
    ])
    const result = parseMissionCards(manifest)
    expect(result.nodes).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('falls back to slug-derived title when OCR title is missing', () => {
    const manifest = makeManifest([
      {
        slug: 'extract-relic',
        kind: 'primary',
        group: 'priority-assets',
        back: false,
        title: '',
        body: 'Rules text.',
        sourceUrl:
          'https://gdmissions.app/assets/11th/primary-missions/priority-assets/extract-relic.png',
        ocrAt: OCR_AT,
        relPath: 'primary-missions/priority-assets/extract-relic.png',
      },
    ])
    const result = parseMissionCards(manifest)
    expect(result.nodes[0]!.title).toBe('EXTRACT RELIC')
  })

  it('ignores force-disposition icons (no text content)', () => {
    const manifest = makeManifest([
      {
        slug: 'take-and-hold',
        kind: 'force-disposition',
        group: 'force-disposition',
        back: false,
        title: '',
        body: '',
        sourceUrl: 'https://gdmissions.app/assets/11th/force-disposition/take-and-hold.png',
        ocrAt: OCR_AT,
        relPath: 'force-disposition/take-and-hold.png',
      },
    ])
    const result = parseMissionCards(manifest)
    expect(result.nodes).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })
})
