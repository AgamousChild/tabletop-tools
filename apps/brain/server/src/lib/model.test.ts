import { describe, it, expect } from 'vitest'
import {
  NodeSchema, NodeRefSchema, SourceSchema,
  NodeCategorySchema,
  RecordTypeSchema, RecordSchema, CrossRefSchema, ErrataAnnotationSchema,
  type Node, type NodeRef, type Source,
  type NodeLayer, type NodeCategory, type GamePhase, type RefType,
  type BrainRecord, type CrossRef, type ErrataAnnotation,
} from './model'

describe('model schemas', () => {
  describe('SourceSchema', () => {
    it('validates a PDF source', () => {
      const source: Source = {
        type: 'pdf',
        title: 'Core Rules v1.0',
        page: 10,
        section: 'Shooting Phase',
        retrievedAt: '2026-04-08',
      }
      expect(SourceSchema.parse(source)).toEqual(source)
    })

    it('validates a source with url', () => {
      const source: Source = {
        type: 'wahapedia',
        title: 'Wahapedia',
        url: 'https://wahapedia.ru/wh40k10ed/factions/space-marines',
        retrievedAt: '2026-04-08',
      }
      expect(SourceSchema.parse(source)).toEqual(source)
    })

    it('rejects invalid source type', () => {
      expect(() => SourceSchema.parse({
        type: 'invalid',
        title: 'X',
        retrievedAt: '2026-04-08',
      })).toThrow()
    })

    it('rejects missing title', () => {
      expect(() => SourceSchema.parse({
        type: 'pdf',
        retrievedAt: '2026-04-08',
      })).toThrow()
    })
  })

  describe('NodeRefSchema', () => {
    it('validates a ref with context', () => {
      const ref: NodeRef = {
        sourceId: 'core:saving-throw',
        targetId: 'core:wound-roll',
        rel: 'requires',
        context: 'Must understand wound roll to resolve saves',
      }
      expect(NodeRefSchema.parse(ref)).toEqual(ref)
    })

    it('validates a bidirectional ref', () => {
      const ref: NodeRef = {
        sourceId: 'core:wound-roll',
        targetId: 'core:shooting-phase',
        rel: 'part_of',
        context: 'Wound roll is a step within the shooting phase',
        bidirectional: true,
      }
      expect(NodeRefSchema.parse(ref)).toEqual(ref)
    })

    it('rejects ref without context', () => {
      expect(() => NodeRefSchema.parse({
        sourceId: 'core:a',
        targetId: 'core:wound-roll',
        rel: 'requires',
      })).toThrow()
    })

    it('rejects ref without targetId', () => {
      expect(() => NodeRefSchema.parse({
        sourceId: 'core:a',
        rel: 'requires',
        context: 'some context',
      })).toThrow()
    })

    it('rejects ref without sourceId', () => {
      expect(() => NodeRefSchema.parse({
        targetId: 'core:wound-roll',
        rel: 'requires',
        context: 'some context',
      })).toThrow()
    })

    it('rejects invalid rel type', () => {
      expect(() => NodeRefSchema.parse({
        sourceId: 'core:a',
        targetId: 'core:wound-roll',
        rel: 'invalid_rel',
        context: 'some context',
      })).toThrow()
    })
  })

  describe('NodeSchema', () => {
    it('validates a minimal core node', () => {
      const node: Node = {
        id: 'core:wound-roll',
        layer: 'core',
        category: 'core-mechanic',
        title: 'Wound Roll',
        content: 'When making a wound roll...',
        summary: 'How to resolve wound rolls in the shooting and fight phases.',
        sources: [{
          type: 'pdf',
          title: 'Core Rules v1.0',
          page: 22,
          retrievedAt: '2026-04-08',
        }],
        refs: [],
        version: 1,
        keywords: ['wound', 'roll', 'shooting', 'fight'],
      }
      const result = NodeSchema.parse(node)
      expect(result.id).toBe('core:wound-roll')
      expect(result.layer).toBe('core')
    })

    it('validates a faction node with optional fields', () => {
      const node: Node = {
        id: 'faction:space-marines:oath-of-moment',
        layer: 'faction',
        category: 'faction-ability',
        title: 'Oath of Moment',
        content: 'At the start of your Command phase...',
        summary: 'Space Marines faction ability that marks a target for re-rolls.',
        phase: 'command',
        factionId: 'space-marines',
        sources: [{
          type: 'pdf',
          title: 'Faction Pack: Space Marines v1.6',
          retrievedAt: '2026-04-08',
        }],
        refs: [{
          sourceId: 'faction:space-marines:oath-of-moment',
          targetId: 'core:command-phase',
          rel: 'part_of',
          context: 'Resolved at the start of the Command phase',
        }],
        version: 1,
        keywords: ['oath', 'moment', 're-roll'],
      }
      expect(NodeSchema.parse(node)).toBeTruthy()
    })

    it('validates a node with errata fields', () => {
      const node: Node = {
        id: 'errata:core:p10:1',
        layer: 'errata',
        category: 'commentary',
        title: 'Out-of-Phase Rules',
        content: 'Some rules allow shooting outside normal sequence...',
        summary: 'Clarification on out-of-phase rule interactions.',
        effectiveDate: '2026-04-01',
        supersededBy: 'errata:core:p10:2',
        sources: [{ type: 'faq', title: 'Rules Commentary', retrievedAt: '2026-04-08' }],
        refs: [],
        version: 1,
        keywords: ['out-of-phase', 'overwatch'],
      }
      const result = NodeSchema.parse(node)
      expect(result.effectiveDate).toBe('2026-04-01')
      expect(result.supersededBy).toBe('errata:core:p10:2')
    })

    it('rejects node without required fields', () => {
      expect(() => NodeSchema.parse({
        id: 'core:test',
        layer: 'core',
      })).toThrow()
    })

    it('rejects node with empty sources', () => {
      expect(() => NodeSchema.parse({
        id: 'core:test',
        layer: 'core',
        category: 'core-mechanic',
        title: 'Test',
        content: 'Content',
        summary: 'Summary',
        sources: [],
        refs: [],
        version: 1,
        keywords: [],
      })).toThrow()
    })

    it('accepts optional qualityFlags array', () => {
      const node: Node = {
        id: 'core:test-flags',
        layer: 'core',
        category: 'core-mechanic',
        title: 'Test Node',
        content: 'Content here.',
        summary: 'Summary here.',
        sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
        refs: [],
        version: 1,
        keywords: ['test'],
        qualityFlags: ['content-inferred', 'pdf-ref-invalid'],
      }
      expect(() => NodeSchema.parse(node)).not.toThrow()
      expect(NodeSchema.parse(node).qualityFlags).toEqual(['content-inferred', 'pdf-ref-invalid'])
    })

    it('accepts node without qualityFlags (field is optional)', () => {
      const node: Node = {
        id: 'core:no-flags',
        layer: 'core',
        category: 'core-mechanic',
        title: 'No Flags',
        content: 'Content.',
        summary: 'Summary.',
        sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
        refs: [],
        version: 1,
        keywords: [],
      }
      expect(() => NodeSchema.parse(node)).not.toThrow()
      expect(NodeSchema.parse(node).qualityFlags).toBeUndefined()
    })
  })

  describe('type unions', () => {
    it('layer values are exhaustive', () => {
      const layers: NodeLayer[] = ['core', 'faction', 'unit', 'errata', 'balance', 'community']
      expect(layers).toHaveLength(6)
    })

    it('category values cover all spec categories', () => {
      const categories: NodeCategory[] = [
        'core-mechanic', 'phase-sequence', 'terrain', 'army-construction', 'mission', 'keyword',
        'detachment-rule', 'stratagem', 'enhancement', 'faction-ability',
        'datasheet', 'weapon', 'unit-ability', 'wargear-option', 'leader-attachment', 'unit-composition',
        'balance-change', 'faq', 'commentary',
        'ruling', 'tactic', 'worked-example',
        'primary-mission', 'secondary-mission', 'deployment-zone',
        'twist', 'challenger', 'terrain-layout',
      ]
      expect(categories).toHaveLength(28)
    })

    it('game phase values are exhaustive', () => {
      const phases: GamePhase[] = [
        'command', 'movement', 'shooting', 'charge', 'fight',
        'any', 'pre-battle', 'deployment', 'end-of-turn',
      ]
      expect(phases).toHaveLength(9)
    })

    it('ref type values are exhaustive', () => {
      const refs: RefType[] = [
        'part_of', 'supersedes', 'clarifies',
        'requires', 'modifies', 'triggers', 'sequence_adjacent',
        'interacts_with', 'commonly_confused', 'edge_case', 'stacks_with', 'prevents',
      ]
      expect(refs).toHaveLength(12)
    })
  })
})

// Helper — minimal valid Node for Record tests
const makeMinimalNode = (id: string): Node => ({
  id,
  layer: 'core',
  category: 'core-mechanic',
  title: 'Test Node',
  content: 'Some content.',
  summary: 'Short summary.',
  sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
  refs: [],
  version: 1,
  keywords: [],
})

describe('Record schema', () => {
  it('validates a unit record', () => {
    const record: BrainRecord = {
      type: 'unit',
      primaryNode: makeMinimalNode('unit:space-marines:intercessors'),
      childNodes: [],
      crossRefs: [],
      errata: [],
      matchedChildIds: [],
    }
    expect(() => RecordSchema.parse(record)).not.toThrow()
  })

  it('validates an army-rule record', () => {
    const record: BrainRecord = {
      type: 'army-rule',
      primaryNode: makeMinimalNode('faction:space-marines:army-rule'),
      childNodes: [makeMinimalNode('faction:space-marines:oath-of-moment')],
      crossRefs: [],
      errata: [],
      matchedChildIds: ['faction:space-marines:oath-of-moment'],
    }
    expect(() => RecordSchema.parse(record)).not.toThrow()
  })

  it('validates all record types', () => {
    const recordTypes = [
      'unit', 'detachment', 'stratagem', 'enhancement',
      'rule', 'army-rule', 'errata', 'balance',
      'primary-mission', 'secondary-mission', 'deployment-zone',
      'twist', 'challenger', 'terrain-layout',
    ] as const
    for (const type of recordTypes) {
      expect(() => RecordTypeSchema.parse(type)).not.toThrow()
    }
  })

  it('validates a cross-reference', () => {
    const ref: CrossRef = {
      targetRecordId: 'core:wound-roll',
      targetTitle: 'Wound Roll',
      targetType: 'rule',
      rel: 'modifies',
      context: 'Modifies the wound roll mechanic',
      refCount: 3,
    }
    expect(() => CrossRefSchema.parse(ref)).not.toThrow()
  })

  it('rejects a cross-reference with refCount < 1', () => {
    expect(() => CrossRefSchema.parse({
      targetRecordId: 'core:wound-roll',
      targetTitle: 'Wound Roll',
      targetType: 'rule',
      rel: 'modifies',
      context: 'Some context',
      refCount: 0,
    })).toThrow()
  })

  it('validates an errata annotation', () => {
    const errata: ErrataAnnotation = {
      nodeId: 'errata:core-commentary:p6:1',
      title: 'REDEPLOYMENTS',
      content: 'Rules that allow players to redeploy...',
      source: { type: 'faq', title: 'Core Rules Updates', page: 6 },
    }
    expect(() => ErrataAnnotationSchema.parse(errata)).not.toThrow()
  })

  it('validates an errata annotation without optional page', () => {
    const errata: ErrataAnnotation = {
      nodeId: 'errata:core-commentary:p6:1',
      title: 'REDEPLOYMENTS',
      content: 'Rules that allow players to redeploy...',
      source: { type: 'faq', title: 'Core Rules Updates' },
    }
    expect(() => ErrataAnnotationSchema.parse(errata)).not.toThrow()
  })

  it('validates new node categories', () => {
    expect(() => NodeCategorySchema.parse('primary-mission')).not.toThrow()
    expect(() => NodeCategorySchema.parse('secondary-mission')).not.toThrow()
    expect(() => NodeCategorySchema.parse('twist')).not.toThrow()
    expect(() => NodeCategorySchema.parse('challenger')).not.toThrow()
    expect(() => NodeCategorySchema.parse('deployment-zone')).not.toThrow()
    expect(() => NodeCategorySchema.parse('terrain-layout')).not.toThrow()
  })
})
