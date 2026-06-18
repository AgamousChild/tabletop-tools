import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { parseTournamentCompanion } from './tournament-companion'

const TC_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/markdown'
const hasPariahNexus = existsSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`)
const hasChapterApproved = existsSync(`${TC_DIR}/chapter-approved-tournament-companion.md`)

// ── Pariah Nexus ──────────────────────────────────────────────────────────────

describe.skipIf(!hasPariahNexus)('parseTournamentCompanion — Pariah Nexus', () => {
  it('produces rule nodes from the markdown', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(10)
  })

  it('includes SECRET MISSIONS section', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    const sm = nodes.find((n) => n.title.includes('SECRET MISSION'))
    expect(sm).toBeDefined()
    expect(sm!.content).toContain('third battle round')
  })

  it('includes ACTIONS section', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    const actions = nodes.find((n) => n.title === 'ACTIONS')
    expect(actions).toBeDefined()
  })

  it('generates supersedes refs for errata cards', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { refs } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    const supersedesRefs = refs.filter((r) => r.rel === 'supersedes')
    expect(supersedesRefs.length).toBeGreaterThan(0)
  })

  it('skips meta headings (VERSION, TOURNAMENT COMPANION)', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    expect(nodes.find((n) => n.title.includes('VERSION'))).toBeUndefined()
    expect(nodes.find((n) => n.title === 'TOURNAMENT COMPANION')).toBeUndefined()
  })

  it('all nodes have correct source attribution', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    for (const node of nodes) {
      expect(node.sources[0].title).toBe('Pariah Nexus Tournament Companion')
    }
  })

  it('node IDs use tc:pariah-nexus: prefix', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    for (const node of nodes) {
      expect(node.id).toMatch(/^tc:pariah-nexus:/)
    }
  })

  it('does not produce duplicate node IDs', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    const ids = nodes.map((n) => n.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('errata supersedes refs point to ca: target IDs', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { refs } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    const supersedesRefs = refs.filter((r) => r.rel === 'supersedes')
    for (const ref of supersedesRefs) {
      expect(ref.sourceId).toMatch(/^tc:pariah-nexus:/)
      expect(ref.targetId).toMatch(/^ca:/)
    }
  })

  it('nodes all have non-empty keywords', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    for (const node of nodes) {
      expect(node.keywords.length).toBeGreaterThan(0)
    }
  })

  it('includes DETERMINE VICTOR section', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    const victor = nodes.find((n) => n.title === 'DETERMINE VICTOR')
    expect(victor).toBeDefined()
    expect(victor!.content).toContain('100VP')
  })

  it('includes PAIRING PLAYERS section', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    const pairing = nodes.find((n) => n.title === 'PAIRING PLAYERS')
    expect(pairing).toBeDefined()
  })

  it('skips standalone PARIAH NEXUS heading', () => {
    const md = readFileSync(`${TC_DIR}/pariah-nexus-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    expect(nodes.find((n) => n.title === 'PARIAH NEXUS')).toBeUndefined()
  })
})

// ── Chapter Approved ──────────────────────────────────────────────────────────

describe.skipIf(!hasChapterApproved)('parseTournamentCompanion — Chapter Approved', () => {
  it('produces rule nodes from the markdown', () => {
    const md = readFileSync(`${TC_DIR}/chapter-approved-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'chapter-approved', '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(10)
  })

  it('node IDs use tc:chapter-approved: prefix', () => {
    const md = readFileSync(`${TC_DIR}/chapter-approved-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'chapter-approved', '2026-04-20')
    for (const node of nodes) {
      expect(node.id).toMatch(/^tc:chapter-approved:/)
    }
  })

  it('all nodes have correct source attribution', () => {
    const md = readFileSync(`${TC_DIR}/chapter-approved-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'chapter-approved', '2026-04-20')
    for (const node of nodes) {
      expect(node.sources[0].title).toBe('Chapter Approved Tournament Companion')
    }
  })

  it('skips meta headings (VERSION, TOURNAMENT COMPANION, CHAPTER APPROVED)', () => {
    const md = readFileSync(`${TC_DIR}/chapter-approved-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'chapter-approved', '2026-04-20')
    expect(nodes.find((n) => n.title.includes('VERSION'))).toBeUndefined()
    expect(nodes.find((n) => n.title === 'TOURNAMENT COMPANION')).toBeUndefined()
    expect(nodes.find((n) => n.title === 'CHAPTER APPROVED')).toBeUndefined()
  })

  it('does not produce duplicate node IDs', () => {
    const md = readFileSync(`${TC_DIR}/chapter-approved-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'chapter-approved', '2026-04-20')
    const ids = nodes.map((n) => n.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('includes ACTIONS section', () => {
    const md = readFileSync(`${TC_DIR}/chapter-approved-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'chapter-approved', '2026-04-20')
    const actions = nodes.find((n) => n.title === 'ACTIONS')
    expect(actions).toBeDefined()
  })

  it('includes PAIRING PLAYERS section', () => {
    const md = readFileSync(`${TC_DIR}/chapter-approved-tournament-companion.md`, 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'chapter-approved', '2026-04-20')
    const pairing = nodes.find((n) => n.title === 'PAIRING PLAYERS')
    expect(pairing).toBeDefined()
  })

  it('generates supersedes refs for errata cards', () => {
    const md = readFileSync(`${TC_DIR}/chapter-approved-tournament-companion.md`, 'utf8')
    const { refs } = parseTournamentCompanion(md, 'chapter-approved', '2026-04-20')
    const supersedesRefs = refs.filter((r) => r.rel === 'supersedes')
    expect(supersedesRefs.length).toBeGreaterThan(0)
  })
})

// ── Unit tests with synthetic markdown ───────────────────────────────────────

describe('parseTournamentCompanion — synthetic', () => {
  const MINIMAL_MD = `# Pariah Nexus Tournament Companion

##### INTRODUCTION

Welcome to the tournament companion.

## PARIAH NEXUS

## TOURNAMENT COMPANION

##### VERSION 1.4

##### MUSTER ARMIES

Muster armies as described in the Core Rules.

##### SECRET MISSIONS

At the end of the third battle round, if your Primary Mission VP total is less than or equal to your opponent's, you can choose to undertake a Secret Mission.

##### ACTIONS

Your forces can attempt daring battlefield tasks to turn the conflict in your favour.

#### PARIAH NEXUS MISSION DECK: CARDS ERRATA

When using the Pariah Nexus Mission Deck, use the updated cards presented below.

#### RECOVER ASSETS

Updated card text for Recover Assets goes here.

#### ASSASSINATION

Updated card text for Assassination goes here.
`

  it('parses basic sections', () => {
    const { nodes } = parseTournamentCompanion(MINIMAL_MD, 'pariah-nexus', '2026-04-20')
    expect(nodes.length).toBeGreaterThan(0)
    const titles = nodes.map((n) => n.title)
    expect(titles).toContain('MUSTER ARMIES')
    expect(titles).toContain('SECRET MISSIONS')
    expect(titles).toContain('ACTIONS')
  })

  it('skips VERSION, PARIAH NEXUS, TOURNAMENT COMPANION', () => {
    const { nodes } = parseTournamentCompanion(MINIMAL_MD, 'pariah-nexus', '2026-04-20')
    const titles = nodes.map((n) => n.title)
    expect(titles).not.toContain('VERSION 1.4')
    expect(titles).not.toContain('PARIAH NEXUS')
    expect(titles).not.toContain('TOURNAMENT COMPANION')
  })

  it('generates supersedes refs for errata #### headings', () => {
    const { refs } = parseTournamentCompanion(MINIMAL_MD, 'pariah-nexus', '2026-04-20')
    const supersedesRefs = refs.filter((r) => r.rel === 'supersedes')
    expect(supersedesRefs.length).toBe(2) // RECOVER ASSETS and ASSASSINATION
    const targetIds = supersedesRefs.map((r) => r.targetId)
    expect(targetIds).toContain('ca:secondary:atk:recover-assets')
    expect(targetIds).toContain('ca:secondary:atk:assassination')
  })

  it('errata nodes get tc: IDs', () => {
    const { nodes } = parseTournamentCompanion(MINIMAL_MD, 'pariah-nexus', '2026-04-20')
    const recover = nodes.find((n) => n.title === 'RECOVER ASSETS')
    expect(recover).toBeDefined()
    expect(recover!.id).toBe('tc:pariah-nexus:recover-assets')
  })

  it('INTRODUCTION node is included', () => {
    const { nodes } = parseTournamentCompanion(MINIMAL_MD, 'pariah-nexus', '2026-04-20')
    const intro = nodes.find((n) => n.title === 'INTRODUCTION')
    expect(intro).toBeDefined()
  })

  it('all nodes pass version=1', () => {
    const { nodes } = parseTournamentCompanion(MINIMAL_MD, 'pariah-nexus', '2026-04-20')
    for (const node of nodes) {
      expect(node.version).toBe(1)
    }
  })

  it('chapter-approved source sets correct title', () => {
    const md = `# Chapter Approved Tournament Companion

##### MUSTER ARMIES

Muster armies as described in the Core Rules.

## CHAPTER APPROVED

## TOURNAMENT COMPANION

##### VERSION 1.5

#### NO PRISONERS

Updated card text.
`
    const { nodes } = parseTournamentCompanion(md, 'chapter-approved', '2026-04-20')
    for (const node of nodes) {
      expect(node.sources[0].title).toBe('Chapter Approved Tournament Companion')
    }
  })
})
