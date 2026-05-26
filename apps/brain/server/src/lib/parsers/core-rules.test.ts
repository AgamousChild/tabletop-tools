import { beforeAll, describe, expect, it } from 'vitest'

import type { Node, NodeRef } from '../model'
import { parseCoreRules } from './core-rules'

// Multi-level headings matching the new structured parser output
const SAMPLE_NORMALIZED = `
## CORE CONCEPTS

An introduction to the essential rules terms.

### ENGAGEMENT RANGE

Engagement range is 1" horizontally and 5" vertically.
Units within engagement range of enemy models are locked in combat.

## COMMAND PHASE

The first phase of each battle round.
Players alternate resolving Command phase abilities.

### BATTLE-SHOCK

In this step, you must take a Battle-shock test for each of your units on the battlefield that is Below Half-strength.
Roll 2D6: if the result is greater than or equal to the best Leadership characteristic in that unit, the test is passed.

## MOVEMENT PHASE

Move your units across the battlefield.

### NORMAL MOVES

When a unit makes a Normal Move, each model can move up to its Move characteristic.

### ADVANCE MOVES

When a unit Advances, roll one D6 and add the result to the Move characteristic.

### FALL BACK MOVES

When a unit Falls Back, each model can move up to its Move characteristic away from engagement range.

## SHOOTING PHASE

Select eligible units to shoot with.

### MAKING ATTACKS

Attacks are made using ranged or melee weapons.

#### WOUND ROLL

Compare the Strength of the attacking weapon to the Toughness of the target.
If Strength is double the Toughness, wound on 2+.
If Strength is greater, wound on 3+.
If equal, wound on 4+.
If lower, wound on 5+.
If half or less, wound on 6+.

#### SAVING THROW

The player controlling the target unit makes one saving throw by rolling one D6 and modifying the result by the Armour Penetration characteristic of the attacking weapon.

## CHARGE PHASE

Declare charges and move into engagement range.

## FIGHT PHASE

Units in engagement range fight in melee.

### FIGHTS FIRST

Some warriors attack with such speed that they can strike before the enemy can react.

## STRATAGEMS

Command points can be spent during the battle to use Stratagems.

### FIRE OVERWATCH

**WHEN:** Your opponent's Movement or Charge phase, just after an enemy unit is set up or when an enemy unit starts or ends a Normal, Advance, Fall Back or Charge move.
**TARGET:** One unit from your army that is within 24" of that enemy unit and would be eligible to shoot.
**EFFECT:** Your unit can shoot that enemy unit as if it were your Shooting phase.
`.trim()

describe('parseCoreRules', () => {
  let nodes: Node[]
  let refs: NodeRef[]

  beforeAll(() => {
    const result = parseCoreRules(SAMPLE_NORMALIZED, '2026-04-08')
    nodes = result.nodes
    refs = result.refs
  })

  it('creates nodes from all heading levels', () => {
    const titles = nodes.map((n) => n.title)
    // ## level
    expect(titles).toContain('CORE CONCEPTS')
    expect(titles).toContain('MOVEMENT PHASE')
    // ### level
    expect(titles).toContain('ENGAGEMENT RANGE')
    expect(titles).toContain('NORMAL MOVES')
    expect(titles).toContain('BATTLE-SHOCK')
    // #### level
    expect(titles).toContain('WOUND ROLL')
    expect(titles).toContain('SAVING THROW')
  })

  it('assigns core layer to all nodes', () => {
    for (const node of nodes) {
      expect(node.layer).toBe('core')
    }
  })

  it('assigns phase annotations to phase sections', () => {
    const commandPhase = nodes.find((n) => n.title === 'COMMAND PHASE')
    expect(commandPhase?.phase).toBe('command')

    const movementPhase = nodes.find((n) => n.title === 'MOVEMENT PHASE')
    expect(movementPhase?.phase).toBe('movement')

    const shootingPhase = nodes.find((n) => n.title === 'SHOOTING PHASE')
    expect(shootingPhase?.phase).toBe('shooting')
  })

  it('generates deterministic IDs', () => {
    const woundRoll = nodes.find((n) => n.title === 'WOUND ROLL')
    expect(woundRoll?.id).toBe('core:wound-roll')
  })

  it('includes source attribution on all nodes', () => {
    for (const node of nodes) {
      expect(node.sources).toHaveLength(1)
      expect(node.sources[0]!.type).toBe('pdf')
      expect(node.sources[0]!.title).toContain('Core Rules')
    }
  })

  it('generates part_of refs for sub-sections under parent sections', () => {
    const partOfRefs = refs.filter((r) => r.rel === 'part_of')
    expect(partOfRefs.length).toBeGreaterThan(0)

    // NORMAL MOVES should be part_of MOVEMENT PHASE
    const normalMovesRef = partOfRefs.find(
      (r) => r.context.includes('NORMAL MOVES') && r.context.includes('MOVEMENT PHASE'),
    )
    expect(normalMovesRef).toBeDefined()

    // WOUND ROLL should be part_of MAKING ATTACKS
    const woundRollRef = partOfRefs.find(
      (r) => r.context.includes('WOUND ROLL') && r.context.includes('MAKING ATTACKS'),
    )
    expect(woundRollRef).toBeDefined()

    // ENGAGEMENT RANGE should be part_of CORE CONCEPTS
    const engagementRef = partOfRefs.find(
      (r) => r.context.includes('ENGAGEMENT RANGE') && r.context.includes('CORE CONCEPTS'),
    )
    expect(engagementRef).toBeDefined()
  })

  it('generates sequence_adjacent refs between phases', () => {
    const seqRefs = refs.filter((r) => r.rel === 'sequence_adjacent')
    expect(seqRefs.length).toBeGreaterThan(0)

    // Command -> Movement -> Shooting -> Charge -> Fight
    const commandToMovement = seqRefs.find(
      (r) => r.context.includes('COMMAND') && r.context.includes('MOVEMENT'),
    )
    expect(commandToMovement).toBeDefined()
  })

  it('generates keywords from content', () => {
    const woundRoll = nodes.find((n) => n.title === 'WOUND ROLL')
    expect(woundRoll?.keywords).toContain('wound')
    expect(woundRoll?.keywords).toContain('strength')
    expect(woundRoll?.keywords).toContain('toughness')
  })

  it('populates content and summary', () => {
    const woundRoll = nodes.find((n) => n.title === 'WOUND ROLL')
    expect(woundRoll?.content).toContain('Compare the Strength')
    expect(woundRoll?.summary.length).toBeGreaterThan(10)
  })

  it('sets version to 1 on all nodes', () => {
    for (const node of nodes) {
      expect(node.version).toBe(1)
    }
  })

  it('is idempotent', () => {
    const result2 = parseCoreRules(SAMPLE_NORMALIZED, '2026-04-08')
    expect(result2.nodes.map((n) => n.id)).toEqual(nodes.map((n) => n.id))
  })

  it('deduplicates node IDs when headings repeat', () => {
    const dupeInput = `
## CORE CONCEPTS

First section.

## CORE CONCEPTS

Second section with same heading.
`.trim()

    const result = parseCoreRules(dupeInput, '2026-04-08')
    const ids = result.nodes.map((n) => n.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('detects stratagem category for stratagem sections', () => {
    const overwatch = nodes.find((n) => n.title === 'FIRE OVERWATCH')
    expect(overwatch?.category).toBe('stratagem')
  })

  it('filters out TOC-style entries', () => {
    const tocInput = `
## CORE CONCEPTS

##### (PG 5-9)

An introduction to the essential rules terms.

## THE BATTLE ROUND

##### (PG 10-36)

From manoeuvring your army.

### ACTUAL CONTENT

This is real content about the battle round with enough text to not be filtered.
`.trim()

    const result = parseCoreRules(tocInput, '2026-04-08')
    // The (PG X-Y) entries should be filtered out
    const titles = result.nodes.map((n) => n.title)
    expect(titles).not.toContain('(PG 5-9)')
    expect(titles).not.toContain('(PG 10-36)')
    expect(titles).toContain('ACTUAL CONTENT')
  })
})
