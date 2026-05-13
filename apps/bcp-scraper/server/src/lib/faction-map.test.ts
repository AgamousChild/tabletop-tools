import { describe, it, expect } from 'vitest'
import { normalizeFaction, getSubfactionParent } from './faction-map'

describe('normalizeFaction', () => {
  it('maps standard factions', () => {
    expect(normalizeFaction('Orks')).toBe('orks')
    expect(normalizeFaction('Necrons')).toBe('necrons')
    expect(normalizeFaction('Tyranids')).toBe('tyranids')
  })

  it('maps factions with special characters', () => {
    expect(normalizeFaction("T'au Empire")).toBe('tau-empire')
    expect(normalizeFaction("Emperor's Children")).toBe('emperors-children')
  })

  it('maps multi-word factions', () => {
    expect(normalizeFaction('Space Marines (Astartes)')).toBe('space-marines')
    expect(normalizeFaction('Adepta Sororitas')).toBe('adepta-sororitas')
    expect(normalizeFaction('Chaos Space Marines')).toBe('chaos-space-marines')
  })

  it('maps chapter aliases to space-marines', () => {
    expect(normalizeFaction('Ultramarines')).toBe('space-marines')
    expect(normalizeFaction('Salamanders')).toBe('space-marines')
    expect(normalizeFaction('Imperial Fists')).toBe('space-marines')
    expect(normalizeFaction('Iron Hands')).toBe('space-marines')
    expect(normalizeFaction('Raven Guard')).toBe('space-marines')
    expect(normalizeFaction('White Scars')).toBe('space-marines')
    expect(normalizeFaction('Crimson Fists')).toBe('space-marines')
    expect(normalizeFaction('Carcharadons')).toBe('space-marines')
  })

  it('maps CSM warband aliases to chaos-space-marines', () => {
    expect(normalizeFaction('Black Legion')).toBe('chaos-space-marines')
    expect(normalizeFaction('Alpha Legion')).toBe('chaos-space-marines')
    expect(normalizeFaction('Night Lords')).toBe('chaos-space-marines')
    expect(normalizeFaction('Iron Warriors')).toBe('chaos-space-marines')
    expect(normalizeFaction('Word Bearers')).toBe('chaos-space-marines')
    expect(normalizeFaction('Red Corsairs')).toBe('chaos-space-marines')
  })

  it('maps tyranid aliases to tyranids', () => {
    expect(normalizeFaction('Forces of the Hive Mind')).toBe('tyranids')
    expect(normalizeFaction('Hive Fleet Kronos')).toBe('tyranids')
    expect(normalizeFaction('Hive Fleet Hyrda')).toBe('tyranids')
  })

  it('maps other aliases correctly', () => {
    expect(normalizeFaction('Flesh Tearers')).toBe('blood-angels')
    expect(normalizeFaction('Deathwing')).toBe('dark-angels')
    expect(normalizeFaction('Farsight Enclaves')).toBe('tau-empire')
    expect(normalizeFaction('Imperium')).toBe('imperial-agents')
    expect(normalizeFaction('Chaos')).toBe('chaos-space-marines')
    expect(normalizeFaction('Xenos')).toBe('aeldari')
  })

  it('handles both Genestealer spellings', () => {
    expect(normalizeFaction('Genestealer Cult')).toBe('genestealer-cults')
    expect(normalizeFaction('Genestealer Cults')).toBe('genestealer-cults')
  })

  it("returns '' for unknown factions", () => {
    expect(normalizeFaction('Not A Faction')).toBe('')
    expect(normalizeFaction('')).toBe('')
    expect(normalizeFaction('Squats')).toBe('')
  })
})

describe('getSubfactionParent', () => {
  it('returns parent for subfactions', () => {
    expect(getSubfactionParent('blood-angels')).toBe('space-marines')
    expect(getSubfactionParent('dark-angels')).toBe('space-marines')
    expect(getSubfactionParent('space-wolves')).toBe('space-marines')
    expect(getSubfactionParent('black-templars')).toBe('space-marines')
    expect(getSubfactionParent('deathwatch')).toBe('space-marines')
  })

  it('returns undefined for non-subfactions', () => {
    expect(getSubfactionParent('orks')).toBeUndefined()
    expect(getSubfactionParent('space-marines')).toBeUndefined()
    expect(getSubfactionParent('chaos-space-marines')).toBeUndefined()
    expect(getSubfactionParent('unknown')).toBeUndefined()
  })
})
