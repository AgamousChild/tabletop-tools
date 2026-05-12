import { describe, it, expect } from 'vitest'
import { parseBattleScribe } from './bs-parser'

const SAMPLE_CSM = `++++++++++++++++++++++++++++++++++++++++++++++++ FACTION KEYWORD: Chaos - Chaos Space Marines+ DETACHMENT: Pactbound Zealots (Marks of Chaos)+ TOTAL ARMY POINTS: 2000pts++ WARLORD: Char1: Abaddon the Despoiler+ ENHANCEMENT: Intoxicating Elixir (on Char4: Lord Discordant on Helstalker)+ NUMBER OF UNITS: 16+ SECONDARY: - Bring It Down: (3x2) - Assassination: 4 Characters+++++++++++++++++++++++++++++++++++++++++++++++Char1: 1x Abaddon the Despoiler (270 pts): Warlord, Drach'nyen, Talon of HorusChar2: 1x Dark Apostle (75 pts): Accursed crozius, Bolt pistolChar3: 1x Dark Apostle (75 pts): Accursed crozius, Bolt pistolChar4: 1x Lord Discordant on Helstalker (200 pts): Autocannon, Bolt pistol, Impaler chainglaive, Intoxicating Elixir, Mechatendrils, Techno-virus injector`

const SAMPLE_EC = `++++++++++++++++++++++++++++++++++++++++++++++++ FACTION KEYWORD: Chaos - Emperor's Children+ DETACHMENT: Coterie of the Conceited (Pledges to the Dark Prince)+ TOTAL ARMY POINTS: 1990pts++ WARLORD: Char1: Daemon Prince of Slaanesh with Wings+ ENHANCEMENT: Pledge of Unholy Fortune (on Char2: Daemon Prince of Slaanesh with Wings)+ NUMBER OF UNITS: 17Char1: 1x Daemon Prince of Slaanesh with Wings (200 pts): Warlord, Hellforged weapons`

describe('parseBattleScribe', () => {
  describe('Sample 1 - Chaos Space Marines', () => {
    const result = parseBattleScribe(SAMPLE_CSM)

    it('parses meta', () => {
      expect(result.version).toBe(1)
      expect(result.parsedWith).toBe('battlescribe-v1')
      expect(result.parseStatus).toBe('ok')
      expect(result.meta.totalPoints).toBe(2000)
      expect(result.meta.edition).toBe('10th')
      expect(result.meta.source).toBe('bcp-import')
    })

    it('parses faction', () => {
      expect(result.list.factionName).toBe('Chaos Space Marines')
      expect(result.list.factionId).toBe('chaos-space-marines')
    })

    it('parses detachment', () => {
      expect(result.list.detachmentName).toBe('Pactbound Zealots')
      expect(result.list.detachmentId).toBe('pactbound-zealots')
    })

    it('parses units', () => {
      expect(result.list.units.length).toBe(4)
    })

    it('parses Abaddon as warlord', () => {
      const abaddon = result.list.units.find(u => u.name === 'Abaddon the Despoiler')!
      expect(abaddon).toBeDefined()
      expect(abaddon.points).toBe(270)
      expect(abaddon.models).toBe(1)
      expect(abaddon.isWarlord).toBe(true)
      expect(abaddon.role).toBe('Character')
      expect(abaddon.wargear).toContain("Drach'nyen")
      expect(abaddon.wargear).toContain('Talon of Horus')
      expect(abaddon.wargear).not.toContain('Warlord')
    })

    it('parses Dark Apostle', () => {
      const apostles = result.list.units.filter(u => u.name === 'Dark Apostle')
      expect(apostles).toHaveLength(2)
      expect(apostles[0]!.points).toBe(75)
      expect(apostles[0]!.wargear).toContain('Accursed crozius')
    })

    it('parses Lord Discordant with enhancement', () => {
      const lord = result.list.units.find(u => u.name === 'Lord Discordant on Helstalker')!
      expect(lord).toBeDefined()
      expect(lord.points).toBe(200)
      expect(lord.enhancement).toBe('Intoxicating Elixir')
    })

    it('stores raw source', () => {
      expect(result.exports?.rawSource).toBe(SAMPLE_CSM)
    })
  })

  describe("Sample 2 - Emperor's Children", () => {
    const result = parseBattleScribe(SAMPLE_EC)

    it('parses faction', () => {
      expect(result.list.factionName).toBe("Emperor's Children")
      expect(result.list.factionId).toBe('emperors-children')
    })

    it('parses detachment', () => {
      expect(result.list.detachmentName).toBe('Coterie of the Conceited')
      expect(result.list.detachmentId).toBe('coterie-of-the-conceited')
    })

    it('parses total points', () => {
      expect(result.meta.totalPoints).toBe(1990)
    })

    it('parses Daemon Prince as warlord with enhancement on other unit', () => {
      const dp = result.list.units.find(u => u.name === 'Daemon Prince of Slaanesh with Wings')!
      expect(dp).toBeDefined()
      expect(dp.points).toBe(200)
      expect(dp.isWarlord).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('returns failed for missing faction', () => {
      const result = parseBattleScribe('+ TOTAL ARMY POINTS: 2000pts\nChar1: 1x Something (100 pts)')
      expect(result.parseStatus).toBe('failed')
      expect(result.parseError).toBeDefined()
    })

    it('returns failed for missing units', () => {
      const result = parseBattleScribe('+ FACTION KEYWORD: Chaos - Chaos Space Marines')
      expect(result.parseStatus).toBe('failed')
      expect(result.parseError).toBeDefined()
    })
  })
})
