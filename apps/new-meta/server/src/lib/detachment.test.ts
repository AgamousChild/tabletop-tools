import { describe, it, expect } from 'vitest'
import { extractDetachment } from './detachment.js'

describe('extractDetachment', () => {
  it('extracts from BattleScribe DETACHMENT: header', () => {
    const list = `
+ FACTION KEYWORD: Space Marines
+ DETACHMENT: Gladius Task Force

HQ:
  Captain [100pts]
`.trim()
    expect(extractDetachment(list)).toBe('Gladius Task Force')
  })

  it('extracts from plain DETACHMENT: without plus prefix', () => {
    const list = `
FACTION KEYWORD: Space Marines
DETACHMENT: Ironstorm Spearhead
`.trim()
    expect(extractDetachment(list)).toBe('Ironstorm Spearhead')
  })

  it('extracts from New Recruit "Detachment:" format', () => {
    const list = `
Army: Space Marines
Detachment: Gladius Task Force
Total Points: 2000
`.trim()
    expect(extractDetachment(list)).toBe('Gladius Task Force')
  })

  it('extracts from "-- Name Detachment --" format', () => {
    const list = `
== Space Marines ==
-- Gladius Task Force Detachment --
Captain [100pts]
`.trim()
    expect(extractDetachment(list)).toBe('Gladius Task Force')
  })

  it('is case-insensitive for DETACHMENT keyword', () => {
    const list = `detachment: Waaagh Tribe`
    expect(extractDetachment(list)).toBe('Waaagh Tribe')
  })

  it('returns null when no detachment found', () => {
    const list = `
HQ:
  Captain [100pts]
Troops:
  Intercessors [90pts]
`.trim()
    expect(extractDetachment(list)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractDetachment('')).toBeNull()
  })

  it('trims whitespace from extracted name', () => {
    const list = `DETACHMENT:   Gladius Task Force   `
    expect(extractDetachment(list)).toBe('Gladius Task Force')
  })
})
