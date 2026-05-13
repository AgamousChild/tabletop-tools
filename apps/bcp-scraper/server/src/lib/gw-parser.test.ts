import { describe, it, expect } from 'vitest'
import { parseGwApp } from './gw-parser'

const SAMPLE_TYRANIDS = `Unearthing My First (1995 Points)TyranidsSubterranean AssaultStrike Force (2,000 Points)CHARACTERSHive Tyrant (215 Points)  \u2022 Warlord  \u2022 1x Heavy venom cannon  \u2022 1x Monstrous bonesword and lash whip  \u2022 Enhancements: Tremor SensesHyperadapted Raveners (165 Points)  \u2022 1x Ravener Prime     \u25E6 1x Prime claws and talons  \u2022 4x Raveners     \u25E6 4x Ravener heavy claws and talons     \u25E6 1x Venom boltNeurotyrant (105 Points)  \u2022 1x Neurotyrant claws and lashes  \u2022 1x Psychic scream`

const SAMPLE_GREY_KNIGHTS = `Grey Knight List (1990)Grey KnightsStrike Force (2000 points)Warpbane Task ForceCHARACTERSCastellan Crowe (90 points)  \u2022 Warlord  \u2022 1x Black Blade of Antwyr    1x Purifying Flame    1x Storm bolterGrand Master in Nemesis Dreadknight (235 points)  \u2022 1x Fragstorm grenade launcher    1x Heavy psycannon    1x Nemesis daemon greathammer    1x Sublimator  \u2022 Enhancement: Paragon of Sanctity`

const SAMPLE_SPACE_MARINES = `Look man, Ultramarines were my first army alright im here for hobby stuff (2000 points)Space MarinesUltramarinesStrike Force (2000 points)Gladius Task ForceCHARACTERSCaptain Sicarius (85 points)  \u2022 1x Artisan plasma pistol    1x Talassarian Tempest Blade`

describe('parseGwApp', () => {
  describe('Sample 1 — Tyranids', () => {
    const result = parseGwApp(SAMPLE_TYRANIDS)

    it('parses meta', () => {
      expect(result.version).toBe(1)
      expect(result.parsedWith).toBe('gw-app-v1')
      expect(result.parseStatus).toBe('ok')
      expect(result.meta.name).toBe('Unearthing My First')
      expect(result.meta.totalPoints).toBe(1995)
      expect(result.meta.battleSize).toBe('Strike Force')
      expect(result.meta.edition).toBe('10th')
      expect(result.meta.source).toBe('bcp-import')
    })

    it('parses faction and detachment', () => {
      expect(result.list.factionName).toBe('Tyranids')
      expect(result.list.factionId).toBe('tyranids')
      expect(result.list.detachmentName).toBe('Subterranean Assault')
      expect(result.list.detachmentId).toBe('subterranean-assault')
    })

    it('parses 3 units', () => {
      expect(result.list.units).toHaveLength(3)
    })

    it('parses Hive Tyrant with warlord and enhancement', () => {
      const hive = result.list.units[0]!
      expect(hive.name).toBe('Hive Tyrant')
      expect(hive.points).toBe(215)
      expect(hive.role).toBe('Character')
      expect(hive.isWarlord).toBe(true)
      expect(hive.enhancement).toBe('Tremor Senses')
      expect(hive.wargear).toContain('Heavy venom cannon')
      expect(hive.wargear).toContain('Monstrous bonesword and lash whip')
    })

    it('parses Hyperadapted Raveners with sub-model wargear', () => {
      const raveners = result.list.units[1]!
      expect(raveners.name).toBe('Hyperadapted Raveners')
      expect(raveners.points).toBe(165)
      expect(raveners.role).toBe('Character')
      expect(raveners.wargear).toContain('Prime claws and talons')
      expect(raveners.wargear).toContain('Ravener heavy claws and talons')
      expect(raveners.wargear).toContain('Venom bolt')
    })

    it('parses Neurotyrant', () => {
      const neuro = result.list.units[2]!
      expect(neuro.name).toBe('Neurotyrant')
      expect(neuro.points).toBe(105)
      expect(neuro.role).toBe('Character')
      expect(neuro.wargear).toContain('Neurotyrant claws and lashes')
      expect(neuro.wargear).toContain('Psychic scream')
    })
  })

  describe('Sample 2 — Grey Knights', () => {
    const result = parseGwApp(SAMPLE_GREY_KNIGHTS)

    it('parses meta with bare-number points', () => {
      expect(result.meta.name).toBe('Grey Knight List')
      expect(result.meta.totalPoints).toBe(1990)
      expect(result.meta.battleSize).toBe('Strike Force')
    })

    it('parses faction and detachment after battle size', () => {
      expect(result.list.factionName).toBe('Grey Knights')
      expect(result.list.factionId).toBe('grey-knights')
      expect(result.list.detachmentName).toBe('Warpbane Task Force')
      expect(result.list.detachmentId).toBe('warpbane-task-force')
    })

    it('parses Castellan Crowe as warlord', () => {
      const crowe = result.list.units[0]!
      expect(crowe.name).toBe('Castellan Crowe')
      expect(crowe.points).toBe(90)
      expect(crowe.isWarlord).toBe(true)
      expect(crowe.wargear).toContain('Black Blade of Antwyr')
      expect(crowe.wargear).toContain('Purifying Flame')
      expect(crowe.wargear).toContain('Storm bolter')
    })

    it('parses Grand Master with enhancement', () => {
      const gm = result.list.units[1]!
      expect(gm.name).toBe('Grand Master in Nemesis Dreadknight')
      expect(gm.points).toBe(235)
      expect(gm.enhancement).toBe('Paragon of Sanctity')
      expect(gm.wargear).toContain('Fragstorm grenade launcher')
      expect(gm.wargear).toContain('Heavy psycannon')
      expect(gm.wargear).toContain('Nemesis daemon greathammer')
      expect(gm.wargear).toContain('Sublimator')
    })

    it('has ok parse status', () => {
      expect(result.parseStatus).toBe('ok')
    })
  })

  describe('Sample 3 — Space Marines with subfaction', () => {
    const result = parseGwApp(SAMPLE_SPACE_MARINES)

    it('parses meta', () => {
      expect(result.meta.name).toBe(
        'Look man, Ultramarines were my first army alright im here for hobby stuff',
      )
      expect(result.meta.totalPoints).toBe(2000)
    })

    it('parses faction as Space Marines', () => {
      expect(result.list.factionName).toBe('Space Marines')
      expect(result.list.factionId).toBe('space-marines')
    })

    it('parses Ultramarines as subfaction', () => {
      expect(result.list.subfactionName).toBe('Ultramarines')
      expect(result.list.subfactionId).toBe('ultramarines')
    })

    it('parses detachment', () => {
      expect(result.list.detachmentName).toBe('Gladius Task Force')
      expect(result.list.detachmentId).toBe('gladius-task-force')
    })

    it('parses Captain Sicarius', () => {
      const cap = result.list.units[0]!
      expect(cap.name).toBe('Captain Sicarius')
      expect(cap.points).toBe(85)
      expect(cap.role).toBe('Character')
      expect(cap.wargear).toContain('Artisan plasma pistol')
      expect(cap.wargear).toContain('Talassarian Tempest Blade')
    })
  })

  describe('edge cases', () => {
    it('strips Exported with App Version footer', () => {
      const text = `Test List (500 Points)TyranidsVanguard OnslaughtStrike Force (2,000 Points)CHARACTERSNeurotyrant (105 Points)  \u2022 1x Psychic screamExported with App Version: 4.12.1`
      const result = parseGwApp(text)
      expect(result.list.units).toHaveLength(1)
      expect(result.list.units[0]!.name).toBe('Neurotyrant')
    })

    it('returns failed when no units found', () => {
      const text = `My List (500 Points)Tyranids`
      const result = parseGwApp(text)
      expect(result.parseStatus).toBe('failed')
    })

    it('returns partial when no detachment found', () => {
      const text = `My List (500 Points)TyranidsStrike Force (2,000 Points)CHARACTERSNeurotyrant (105 Points)  \u2022 1x Psychic scream`
      const result = parseGwApp(text)
      expect(result.parseStatus).toBe('partial')
      expect(result.list.detachmentName).toBeUndefined()
    })

    it('stores rawSource in exports', () => {
      const result = parseGwApp(SAMPLE_TYRANIDS)
      expect(result.exports?.rawSource).toBe(SAMPLE_TYRANIDS)
    })
  })
})
