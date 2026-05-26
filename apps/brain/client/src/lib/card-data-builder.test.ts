import { describe, expect, it } from 'vitest'

import type { BrainNode } from './card-data-builder'
import { buildCardData } from './card-data-builder'

// ── Mock nodes ────────────────────────────────────────────────────────────────

const datasheetNode: BrainNode = {
  id: '000000126',
  title: 'Infernus Squad',
  summary: 'Infernus Squad — Other',
  content:
    'Infernus Squad: M6" T4 Sv3+ W2 Ld6+ OC1\n**Keywords:** Infantry\n**Points:** 5 models: 90pts',
  layer: 'unit',
  category: 'datasheet',
  factionId: 'space-marines',
  keywords: ['infantry'],
  sources: [{ type: 'wahapedia', title: 'Wahapedia' }],
}

const stratagemNode: BrainNode = {
  id: 'det:sm:fs:immolation',
  title: 'IMMOLATION PROTOCOLS',
  summary: 'Immolation Protocols (2CP)',
  content:
    '**Type:** Battle Tactic\n**CP:** 2\n**Phase:** Shooting phase\n**WHEN:** Your Shooting phase.\n**TARGET:** One unit.\n**EFFECT:** Torrent weapons have [DEVASTATING WOUNDS].',
  layer: 'faction',
  category: 'stratagem',
  factionId: 'space-marines',
  keywords: ['stratagem'],
  sources: [],
}

const enhancementNode: BrainNode = {
  id: 'enh:sm:001',
  title: 'Sanctic Halo',
  summary: 'Sanctic Halo — Enhancement',
  content: '**Cost:** 25pts\nADEPTUS ASTARTES model only. The bearer has a 4+ invulnerable save.',
  layer: 'faction',
  category: 'enhancement',
  factionId: 'space-marines',
  keywords: ['enhancement'],
  sources: [],
}

const armyRuleNode: BrainNode = {
  id: 'faction:sm:codex-disc',
  title: 'Oath of Moment',
  summary: 'Oath of Moment — Army Rule',
  content:
    'At the start of your Command phase, select one enemy unit. All ADEPTUS ASTARTES models in your army have the Lethal Hits ability against that unit.',
  layer: 'faction',
  category: 'faction-ability',
  factionId: 'space-marines',
  keywords: ['army-rule'],
  sources: [],
}

const detachmentRuleNode: BrainNode = {
  id: 'det:sm:codex:rule:1',
  title: 'Angels of Death',
  summary: 'Angels of Death — Detachment Rule',
  content:
    'Each time a unit with this ability is selected to shoot or fight, models in that unit can re-roll one hit roll.',
  layer: 'faction',
  category: 'faction-ability',
  factionId: 'space-marines',
  detachmentId: 'det:sm:codex',
  keywords: ['detachment-rule'],
  sources: [],
}

const detachmentRuleCategoryNode: BrainNode = {
  id: 'det:csm:dev:rule:1',
  title: 'Heretic Astartes',
  summary: 'Heretic Astartes — Detachment Rule',
  content: 'All HERETIC ASTARTES units in this detachment gain the Mark of Chaos.',
  layer: 'faction',
  category: 'detachment-rule',
  factionId: 'chaos-space-marines',
  keywords: ['detachment-rule'],
  sources: [],
}

const weaponNode: BrainNode = {
  id: 'wpn:sm:bolter',
  title: 'Bolt Rifle',
  summary: 'Bolt Rifle — Weapon',
  content: 'Range 24", 2A, S4, AP-1, D1.',
  layer: 'unit',
  category: 'weapon',
  factionId: 'space-marines',
  keywords: ['weapon'],
  sources: [],
}

const coreMechanicNode: BrainNode = {
  id: 'core:wound-roll',
  title: 'Wound Roll',
  summary: 'Wound Roll — Core Mechanic',
  content: "Compare the attacking weapon's Strength characteristic to the target's Toughness.",
  layer: 'core',
  category: 'core-mechanic',
  keywords: [],
  sources: [],
}

const unitAbilityNode: BrainNode = {
  id: 'ua:sm:litanies',
  title: 'Litanies of Battle',
  summary: 'Litanies of Battle — Unit Ability',
  content: 'At the start of your Command phase, this model can chant one Litany it knows.',
  layer: 'unit',
  category: 'unit-ability',
  factionId: 'space-marines',
  keywords: ['ability'],
  sources: [],
}

const emptyContentNode: BrainNode = {
  id: 'empty-node',
  title: 'Empty Node',
  summary: 'A node with no content',
  content: '',
  layer: 'faction',
  category: 'faction-ability',
  keywords: [],
  sources: [],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildCardData', () => {
  describe('datasheet → UnitCardData', () => {
    it('returns type "unit"', () => {
      const card = buildCardData(datasheetNode)
      expect(card?.type).toBe('unit')
    })

    it('maps id and name from node', () => {
      const card = buildCardData(datasheetNode)
      expect(card?.type).toBe('unit')
      if (card?.type !== 'unit') return
      expect(card.data.id).toBe('000000126')
      expect(card.data.name).toBe('Infernus Squad')
    })

    it('maps factionId and keywords', () => {
      const card = buildCardData(datasheetNode)
      if (card?.type !== 'unit') return
      expect(card.data.factionId).toBe('space-marines')
      expect(card.data.keywords).toContain('infantry')
    })

    it('parses stat line from content', () => {
      const card = buildCardData(datasheetNode)
      if (card?.type !== 'unit') return
      expect(card.data.stats.move).toBe('6"')
      expect(card.data.stats.toughness).toBe('4')
      expect(card.data.stats.save).toBe('3+')
      expect(card.data.stats.wounds).toBe('2')
      expect(card.data.stats.leadership).toBe('6+')
      expect(card.data.stats.oc).toBe('1')
    })

    it('returns dash defaults when no stat line in content', () => {
      const node = { ...datasheetNode, content: 'No stats here.' }
      const card = buildCardData(node)
      if (card?.type !== 'unit') return
      expect(card.data.stats.move).toBe('-')
      expect(card.data.stats.toughness).toBe('-')
    })
  })

  describe('stratagem → StratagemCardData', () => {
    it('returns type "stratagem"', () => {
      const card = buildCardData(stratagemNode)
      expect(card?.type).toBe('stratagem')
    })

    it('maps id and name', () => {
      const card = buildCardData(stratagemNode)
      if (card?.type !== 'stratagem') return
      expect(card.data.id).toBe('det:sm:fs:immolation')
      expect(card.data.name).toBe('IMMOLATION PROTOCOLS')
    })

    it('parses WHEN field from content', () => {
      const card = buildCardData(stratagemNode)
      if (card?.type !== 'stratagem') return
      expect(card.data.when).toBe('Your Shooting phase.')
    })

    it('parses TARGET field from content', () => {
      const card = buildCardData(stratagemNode)
      if (card?.type !== 'stratagem') return
      expect(card.data.target).toBe('One unit.')
    })

    it('parses EFFECT field from content', () => {
      const card = buildCardData(stratagemNode)
      if (card?.type !== 'stratagem') return
      expect(card.data.effect).toBe('Torrent weapons have [DEVASTATING WOUNDS].')
    })

    it('parses CP cost from content', () => {
      const card = buildCardData(stratagemNode)
      if (card?.type !== 'stratagem') return
      expect(card.data.cpCost).toBe('2')
    })

    it('parses phase from content', () => {
      const card = buildCardData(stratagemNode)
      if (card?.type !== 'stratagem') return
      expect(card.data.phase).toBe('Shooting phase')
    })

    it('maps factionId', () => {
      const card = buildCardData(stratagemNode)
      if (card?.type !== 'stratagem') return
      expect(card.data.factionId).toBe('space-marines')
    })
  })

  describe('enhancement → EnhancementCardData', () => {
    it('returns type "enhancement"', () => {
      const card = buildCardData(enhancementNode)
      expect(card?.type).toBe('enhancement')
    })

    it('maps id and name', () => {
      const card = buildCardData(enhancementNode)
      if (card?.type !== 'enhancement') return
      expect(card.data.id).toBe('enh:sm:001')
      expect(card.data.name).toBe('Sanctic Halo')
    })

    it('parses cost from content', () => {
      const card = buildCardData(enhancementNode)
      if (card?.type !== 'enhancement') return
      expect(card.data.cost).toBe('25pts')
    })

    it('extracts restriction from content', () => {
      const card = buildCardData(enhancementNode)
      if (card?.type !== 'enhancement') return
      expect(card.data.restriction).toContain('ADEPTUS ASTARTES model only')
    })

    it('includes description', () => {
      const card = buildCardData(enhancementNode)
      if (card?.type !== 'enhancement') return
      expect(card.data.description.length).toBeGreaterThan(0)
    })

    it('maps factionId', () => {
      const card = buildCardData(enhancementNode)
      if (card?.type !== 'enhancement') return
      expect(card.data.factionId).toBe('space-marines')
    })
  })

  describe('faction-ability without detachmentId → RuleCardData (isArmyRule: true)', () => {
    it('returns type "rule"', () => {
      const card = buildCardData(armyRuleNode)
      expect(card?.type).toBe('rule')
    })

    it('sets isArmyRule to true', () => {
      const card = buildCardData(armyRuleNode)
      if (card?.type !== 'rule') return
      expect(card.data.isArmyRule).toBe(true)
    })

    it('maps id and name', () => {
      const card = buildCardData(armyRuleNode)
      if (card?.type !== 'rule') return
      expect(card.data.id).toBe('faction:sm:codex-disc')
      expect(card.data.name).toBe('Oath of Moment')
    })

    it('includes description from content', () => {
      const card = buildCardData(armyRuleNode)
      if (card?.type !== 'rule') return
      expect(card.data.description).toContain('ADEPTUS ASTARTES')
    })

    it('maps factionId', () => {
      const card = buildCardData(armyRuleNode)
      if (card?.type !== 'rule') return
      expect(card.data.factionId).toBe('space-marines')
    })
  })

  describe('faction-ability with detachmentId → RuleCardData (isArmyRule: false)', () => {
    it('sets isArmyRule to false when detachmentId present', () => {
      const card = buildCardData(detachmentRuleNode)
      if (card?.type !== 'rule') return
      expect(card.data.isArmyRule).toBe(false)
    })

    it('maps detachmentName from detachmentId', () => {
      const card = buildCardData(detachmentRuleNode)
      if (card?.type !== 'rule') return
      // detachmentId is present — detachmentName should be set (may be empty string or derived)
      expect(typeof card.data.detachmentName).toBe('string')
    })
  })

  describe('detachment-rule category → RuleCardData (isArmyRule: false)', () => {
    it('returns type "rule"', () => {
      const card = buildCardData(detachmentRuleCategoryNode)
      expect(card?.type).toBe('rule')
    })

    it('sets isArmyRule to false', () => {
      const card = buildCardData(detachmentRuleCategoryNode)
      if (card?.type !== 'rule') return
      expect(card.data.isArmyRule).toBe(false)
    })
  })

  describe('null-returning categories', () => {
    it('returns null for weapon nodes', () => {
      expect(buildCardData(weaponNode)).toBeNull()
    })

    it('returns null for core-mechanic nodes', () => {
      expect(buildCardData(coreMechanicNode)).toBeNull()
    })

    it('returns null for unit-ability nodes', () => {
      expect(buildCardData(unitAbilityNode)).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('handles empty content gracefully for datasheet', () => {
      const node = { ...datasheetNode, content: '' }
      const card = buildCardData(node)
      expect(card?.type).toBe('unit')
      if (card?.type !== 'unit') return
      expect(card.data.stats.move).toBe('-')
    })

    it('handles empty content for stratagem — falls back to summary', () => {
      const node = { ...stratagemNode, content: '' }
      const card = buildCardData(node)
      expect(card?.type).toBe('stratagem')
    })

    it('handles empty content for enhancement', () => {
      const node = { ...enhancementNode, content: '' }
      const card = buildCardData(node)
      expect(card?.type).toBe('enhancement')
      if (card?.type !== 'enhancement') return
      expect(card.data.cost).toBe('')
    })

    it('handles missing factionId gracefully', () => {
      const card = buildCardData(emptyContentNode)
      if (card?.type !== 'rule') return
      expect(card.data.factionId).toBe('')
    })

    it('handles missing optional fields (phase, parentUnit, subfaction)', () => {
      const card = buildCardData(stratagemNode)
      expect(card).not.toBeNull()
    })

    it('preserves subfaction when present', () => {
      const node = { ...armyRuleNode, subfaction: 'Ultramarines' }
      const card = buildCardData(node)
      if (card?.type !== 'rule') return
      expect(card.data.subfaction).toBe('Ultramarines')
    })
  })

  describe('sub-rules parsing', () => {
    it('splits ALL-CAPS headings into subRules for army rules', () => {
      const node: BrainNode = {
        ...armyRuleNode,
        content:
          'BLESSINGS OF KHORNE\nOnce per battle round, select one KHORNE DAEMON unit.\nBLOOD FOR THE BLOOD GOD\nAt the end of each fight phase, add 1 to the attacks.',
      }
      const card = buildCardData(node)
      if (card?.type !== 'rule') return
      expect(card.data.subRules).toBeDefined()
      expect(card.data.subRules!.length).toBe(2)
      expect(card.data.subRules![0].name).toBe('BLESSINGS OF KHORNE')
      expect(card.data.subRules![0].description).toContain('Once per battle round')
      expect(card.data.subRules![1].name).toBe('BLOOD FOR THE BLOOD GOD')
    })

    it('does not set subRules when no ALL-CAPS headings present', () => {
      const card = buildCardData(armyRuleNode)
      if (card?.type !== 'rule') return
      // Army rule content has no ALL-CAPS heading lines — no subRules
      expect(card.data.subRules).toBeUndefined()
    })
  })
})
