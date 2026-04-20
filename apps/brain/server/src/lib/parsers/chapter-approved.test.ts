import { existsSync, readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import {
  parseChallengerCards,
  parsePrimaryMissions,
  parseSecondaryMissions,
  parseTwistCards,
} from './chapter-approved'

const CA_DIR = 'C:/R/sync-data/.local/chapter-approved/markdown'
const hasData = existsSync(CA_DIR)

// ── Unit tests against synthetic fixtures ─────────────────────────────────────

describe('parsePrimaryMissions (unit)', () => {
  const FIXTURE = `# Primary Missions

TAKE AND HOLD PRIMARY MISSION WHEN: End of the Command phase. The player whose turn it is scores: For each objective marker that they control. 5 VP (MAX 15VP) SECOND BATTLE ROUND ONWARDS VP SCORCHED EARTH PRIMARY MISSION WHEN: Any time. Each time a player burns an objective marker. BURN OBJECTIVE (ACTION) 5 VP 10 VP`

  it('splits into individual mission cards', () => {
    const nodes = parsePrimaryMissions(FIXTURE, '2026-04-20')
    expect(nodes.length).toBe(2)
  })

  it('parses TAKE AND HOLD card', () => {
    const nodes = parsePrimaryMissions(FIXTURE, '2026-04-20')
    const tah = nodes.find((n) => n.title === 'TAKE AND HOLD')
    expect(tah).toBeDefined()
    expect(tah!.id).toBe('ca:primary:take-and-hold')
    expect(tah!.layer).toBe('core')
    expect(tah!.category).toBe('primary-mission')
    expect(tah!.content).toContain('5 VP')
    expect(tah!.keywords).toContain('primary mission')
    expect(tah!.keywords).toContain('take and hold')
    expect(tah!.sources[0]!.type).toBe('pdf')
    expect(tah!.sources[0]!.retrievedAt).toBe('2026-04-20')
  })

  it('parses SCORCHED EARTH card', () => {
    const nodes = parsePrimaryMissions(FIXTURE, '2026-04-20')
    const se = nodes.find((n) => n.title === 'SCORCHED EARTH')
    expect(se).toBeDefined()
    expect(se!.content).toContain('BURN OBJECTIVE')
  })

  it('sets summary to truncated content', () => {
    const nodes = parsePrimaryMissions(FIXTURE, '2026-04-20')
    for (const node of nodes) {
      expect(node.summary.length).toBeLessThanOrEqual(153) // 150 + '...'
    }
  })
})

describe('parseSecondaryMissions (unit)', () => {
  const FIXTURE = `# Secondary Missions (Attacker)

AREA DENIAL SECONDARY MISSION WHEN: End of your turn. One or more units from your army are within 3" of the center. 2 VP ANY BATTLE ROUND VP ASSASSINATION FIXED - SECONDARY MISSION WHEN: End of either player's turn. One or more enemy CHARACTER models were destroyed. 5 VP ANY BATTLE ROUND VP`

  it('splits into individual mission cards (attacker)', () => {
    const nodes = parseSecondaryMissions(FIXTURE, 'attacker', '2026-04-20')
    expect(nodes.length).toBe(2)
  })

  it('sets attacker IDs correctly', () => {
    const nodes = parseSecondaryMissions(FIXTURE, 'attacker', '2026-04-20')
    const area = nodes.find((n) => n.title === 'AREA DENIAL')
    expect(area!.id).toBe('ca:secondary:atk:area-denial')
  })

  it('identifies ASSASSINATION as fixed', () => {
    const nodes = parseSecondaryMissions(FIXTURE, 'attacker', '2026-04-20')
    const assassin = nodes.find((n) => n.title === 'ASSASSINATION')
    expect(assassin).toBeDefined()
    expect(assassin!.keywords).toContain('fixed')
  })

  it('sets defender IDs correctly', () => {
    const nodes = parseSecondaryMissions(FIXTURE, 'defender', '2026-04-20')
    const area = nodes.find((n) => n.title === 'AREA DENIAL')
    expect(area!.id).toBe('ca:secondary:def:area-denial')
  })

  it('sets category to secondary-mission', () => {
    const nodes = parseSecondaryMissions(FIXTURE, 'attacker', '2026-04-20')
    for (const node of nodes) {
      expect(node.category).toBe('secondary-mission')
    }
  })
})

describe('parseTwistCards (unit)', () => {
  const FIXTURE = `# Twist Cards

NIGHT FIGHTING TWIST Each unit can only be the target of a ranged attack if the attacking model is within 18". BLOODLUST TWIST A unit is eligible to charge if it is within 18" of one or more enemy units.`

  it('splits into individual twist cards', () => {
    const nodes = parseTwistCards(FIXTURE, '2026-04-20')
    expect(nodes.length).toBe(2)
  })

  it('parses NIGHT FIGHTING card', () => {
    const nodes = parseTwistCards(FIXTURE, '2026-04-20')
    const nf = nodes.find((n) => n.title === 'NIGHT FIGHTING')
    expect(nf).toBeDefined()
    expect(nf!.id).toBe('ca:twist:night-fighting')
    expect(nf!.category).toBe('twist')
    expect(nf!.content).toContain('18"')
    expect(nf!.keywords).toContain('twist')
  })

  it('parses BLOODLUST card', () => {
    const nodes = parseTwistCards(FIXTURE, '2026-04-20')
    const bl = nodes.find((n) => n.title === 'BLOODLUST')
    expect(bl).toBeDefined()
    expect(bl!.content).toContain('charge')
  })
})

describe('parseChallengerCards (unit)', () => {
  const FIXTURE = `# Challenger Cards

ATTRITION PIVOTAL MOMENT CHALLENGER MISSION STRATEGIC PLOY 0 CP WHEN: End of your turn. One or more enemy units were destroyed this turn. WHEN: Your Movement phase. TARGET: One unit from your army. EFFECT: Until the end of the turn, your unit is eligible to shoot and declare a charge. 3 VP ANY BATTLE ROUND VP OVER THE LINE GREAT HASTE CHALLENGER MISSION STRATEGIC PLOY 0 CP WHEN: Your Movement phase. TARGET: One unit from your army. EFFECT: Add d6" to the Move characteristic. WHEN: End of your turn. One or more units from your army are within your opponent's deployment zone. 3 VP`

  it('splits into individual challenger cards', () => {
    const nodes = parseChallengerCards(FIXTURE, '2026-04-20')
    expect(nodes.length).toBe(2)
  })

  it('parses ATTRITION card with stratagem', () => {
    const nodes = parseChallengerCards(FIXTURE, '2026-04-20')
    const attrition = nodes.find((n) => n.title === 'ATTRITION')
    expect(attrition).toBeDefined()
    expect(attrition!.id).toBe('ca:challenger:attrition')
    expect(attrition!.category).toBe('challenger')
    expect(attrition!.content).toContain('PIVOTAL MOMENT')
    expect(attrition!.keywords).toContain('challenger')
  })

  it('parses OVER THE LINE card', () => {
    const nodes = parseChallengerCards(FIXTURE, '2026-04-20')
    const otl = nodes.find((n) => n.title === 'OVER THE LINE')
    expect(otl).toBeDefined()
    expect(otl!.content).toContain('GREAT HASTE')
  })
})

// ── Integration tests against real markdown files ─────────────────────────────

describe.skipIf(!hasData)('parsePrimaryMissions (real data)', () => {
  it('splits into individual mission cards', () => {
    const md = readFileSync(`${CA_DIR}/primary-missions.md`, 'utf8')
    const nodes = parsePrimaryMissions(md, '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(10)
    for (const node of nodes) {
      expect(node.category).toBe('primary-mission')
      expect(node.layer).toBe('core')
      expect(node.title).toBeTruthy()
      expect(node.content).toBeTruthy()
      expect(node.id).toMatch(/^ca:primary:/)
    }
  })

  it('parses TAKE AND HOLD', () => {
    const md = readFileSync(`${CA_DIR}/primary-missions.md`, 'utf8')
    const nodes = parsePrimaryMissions(md, '2026-04-20')
    const tah = nodes.find((n) => n.title.includes('TAKE AND HOLD'))
    expect(tah).toBeDefined()
    expect(tah!.content).toContain('5 VP')
  })

  it('parses SCORCHED EARTH with action', () => {
    const md = readFileSync(`${CA_DIR}/primary-missions.md`, 'utf8')
    const nodes = parsePrimaryMissions(md, '2026-04-20')
    const se = nodes.find((n) => n.title.includes('SCORCHED EARTH'))
    expect(se).toBeDefined()
    expect(se!.content).toContain('BURN OBJECTIVE')
  })

  it('includes asymmetric missions', () => {
    const md = readFileSync(`${CA_DIR}/primary-missions.md`, 'utf8')
    const nodes = parsePrimaryMissions(md, '2026-04-20')
    const holdOut = nodes.find((n) => n.title.includes('HOLD OUT'))
    expect(holdOut).toBeDefined()
  })

  it('all nodes have valid IDs and content', () => {
    const md = readFileSync(`${CA_DIR}/primary-missions.md`, 'utf8')
    const nodes = parsePrimaryMissions(md, '2026-04-20')
    const ids = nodes.map((n) => n.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
    for (const node of nodes) {
      expect(node.content.length).toBeGreaterThan(20)
    }
  })
})

describe.skipIf(!hasData)('parseSecondaryMissions (real data)', () => {
  it('splits attacker missions', () => {
    const md = readFileSync(`${CA_DIR}/secondary-missions-attacker.md`, 'utf8')
    const nodes = parseSecondaryMissions(md, 'attacker', '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(15)
    for (const node of nodes) {
      expect(node.category).toBe('secondary-mission')
      expect(node.id).toMatch(/^ca:secondary:atk:/)
    }
  })

  it('identifies ASSASSINATION as fixed mission', () => {
    const md = readFileSync(`${CA_DIR}/secondary-missions-attacker.md`, 'utf8')
    const nodes = parseSecondaryMissions(md, 'attacker', '2026-04-20')
    const assassin = nodes.find((n) => n.title === 'ASSASSINATION')
    expect(assassin).toBeDefined()
    expect(assassin!.keywords).toContain('fixed')
  })

  it('identifies CLEANSE as fixed mission', () => {
    const md = readFileSync(`${CA_DIR}/secondary-missions-attacker.md`, 'utf8')
    const nodes = parseSecondaryMissions(md, 'attacker', '2026-04-20')
    const cleanse = nodes.find((n) => n.title === 'CLEANSE')
    expect(cleanse).toBeDefined()
    expect(cleanse!.keywords).toContain('fixed')
  })

  it('splits defender missions', () => {
    const md = readFileSync(`${CA_DIR}/secondary-missions-defender.md`, 'utf8')
    const nodes = parseSecondaryMissions(md, 'defender', '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(10)
    for (const node of nodes) {
      expect(node.id).toMatch(/^ca:secondary:def:/)
    }
  })

  it('defender and attacker have same card titles', () => {
    const atkMd = readFileSync(`${CA_DIR}/secondary-missions-attacker.md`, 'utf8')
    const defMd = readFileSync(`${CA_DIR}/secondary-missions-defender.md`, 'utf8')
    const atkNodes = parseSecondaryMissions(atkMd, 'attacker', '2026-04-20')
    const defNodes = parseSecondaryMissions(defMd, 'defender', '2026-04-20')
    const atkTitles = new Set(atkNodes.map((n) => n.title))
    const defTitles = new Set(defNodes.map((n) => n.title))
    // Defender should have all the same cards (same deck)
    for (const title of defTitles) {
      expect(atkTitles.has(title)).toBe(true)
    }
  })
})

describe.skipIf(!hasData)('parseTwistCards (real data)', () => {
  it('parses all twist cards', () => {
    const md = readFileSync(`${CA_DIR}/twist-cards.md`, 'utf8')
    const nodes = parseTwistCards(md, '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(8)
    for (const node of nodes) {
      expect(node.category).toBe('twist')
    }
  })

  it('parses NIGHT FIGHTING', () => {
    const md = readFileSync(`${CA_DIR}/twist-cards.md`, 'utf8')
    const nodes = parseTwistCards(md, '2026-04-20')
    const nf = nodes.find((n) => n.title === 'NIGHT FIGHTING')
    expect(nf).toBeDefined()
    expect(nf!.content).toContain('18"')
  })

  it('parses BLOODLUST', () => {
    const md = readFileSync(`${CA_DIR}/twist-cards.md`, 'utf8')
    const nodes = parseTwistCards(md, '2026-04-20')
    const bl = nodes.find((n) => n.title === 'BLOODLUST')
    expect(bl).toBeDefined()
    expect(bl!.content).toContain('18"')
  })
})

describe.skipIf(!hasData)('parseChallengerCards (real data)', () => {
  it('parses challenger cards', () => {
    const md = readFileSync(`${CA_DIR}/challenger-cards.md`, 'utf8')
    const nodes = parseChallengerCards(md, '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(8)
    for (const node of nodes) {
      expect(node.category).toBe('challenger')
    }
  })

  it('ATTRITION includes paired stratagem', () => {
    const md = readFileSync(`${CA_DIR}/challenger-cards.md`, 'utf8')
    const nodes = parseChallengerCards(md, '2026-04-20')
    const attrition = nodes.find((n) => n.title.includes('ATTRITION'))
    expect(attrition).toBeDefined()
    expect(attrition!.content).toContain('PIVOTAL MOMENT')
  })

  it('OVER THE LINE includes GREAT HASTE stratagem', () => {
    const md = readFileSync(`${CA_DIR}/challenger-cards.md`, 'utf8')
    const nodes = parseChallengerCards(md, '2026-04-20')
    const otl = nodes.find((n) => n.title === 'OVER THE LINE')
    expect(otl).toBeDefined()
    expect(otl!.content).toContain('GREAT HASTE')
  })

  it('all nodes have unique IDs', () => {
    const md = readFileSync(`${CA_DIR}/challenger-cards.md`, 'utf8')
    const nodes = parseChallengerCards(md, '2026-04-20')
    const ids = nodes.map((n) => n.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})
