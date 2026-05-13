import { describe, it, expect } from 'vitest'
import { computeDropOrder } from './drop-order'
import type { DeploymentUnit } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUnit(
  id: string,
  tacticalRole: DeploymentUnit['tacticalRole'],
  points: number,
): DeploymentUnit {
  return {
    id,
    name: id,
    models: 5,
    baseSize: 32,
    points,
    move: 6,
    toughness: 4,
    save: 4,
    wounds: 1,
    keywords: [],
    abilities: {},
    weapons: [{ name: 'Boltgun', range: 24 }],
    tacticalRole,
    strategicPurpose: 'scoring',
  }
}

// ── Priority Order ────────────────────────────────────────────────────────────

describe('computeDropOrder — priority tiers', () => {
  it('holders come before hammers', () => {
    const hammer = makeUnit('hammer', 'hammer', 200)
    const holder = makeUnit('holder', 'holder', 80)
    const order = computeDropOrder([hammer, holder])
    expect(order.indexOf('holder')).toBeLessThan(order.indexOf('hammer'))
  })

  it('transports come before anchors', () => {
    const anchor = makeUnit('anchor', 'anchor', 300)
    const transport = makeUnit('transport', 'transport', 100)
    const order = computeDropOrder([anchor, transport])
    expect(order.indexOf('transport')).toBeLessThan(order.indexOf('anchor'))
  })

  it('screens come before mid-range-shooters', () => {
    const mid = makeUnit('mid', 'mid-range-shooter', 120)
    const screen = makeUnit('screen', 'screen', 60)
    const order = computeDropOrder([mid, screen])
    expect(order.indexOf('screen')).toBeLessThan(order.indexOf('mid'))
  })

  it('deep-strike units are last (after all deployed units)', () => {
    const holder = makeUnit('holder', 'holder', 60)
    const hammer = makeUnit('hammer', 'hammer', 200)
    const ds = makeUnit('deep-strike', 'deep-strike', 150)
    const infiltrator = makeUnit('infiltrator', 'infiltrator', 90)
    const order = computeDropOrder([holder, hammer, ds, infiltrator])
    // deep-strike should be after infiltrator and scout
    expect(order.indexOf('deep-strike')).toBeGreaterThan(order.indexOf('infiltrator'))
    expect(order.indexOf('deep-strike')).toBeGreaterThan(order.indexOf('holder'))
  })

  it('infiltrators come before scouts', () => {
    const scout = makeUnit('scout', 'scout', 70)
    const infiltrator = makeUnit('infiltrator', 'infiltrator', 80)
    const order = computeDropOrder([scout, infiltrator])
    expect(order.indexOf('infiltrator')).toBeLessThan(order.indexOf('scout'))
  })

  it('gunlines come before mid-range-shooters', () => {
    const mid = makeUnit('mid', 'mid-range-shooter', 130)
    const gunline = makeUnit('gunline', 'gunline', 130)
    const order = computeDropOrder([mid, gunline])
    expect(order.indexOf('gunline')).toBeLessThan(order.indexOf('mid'))
  })
})

// ── Within-Tier Sorting ───────────────────────────────────────────────────────

describe('computeDropOrder — within-tier sorting by points ascending', () => {
  it('same tier: cheaper holder deployed first', () => {
    const cheapHolder = makeUnit('cheap-holder', 'holder', 55)
    const expHolder = makeUnit('exp-holder', 'holder', 120)
    const order = computeDropOrder([expHolder, cheapHolder])
    expect(order.indexOf('cheap-holder')).toBeLessThan(order.indexOf('exp-holder'))
  })

  it('same tier: two hammers sorted by points ascending', () => {
    const smallHammer = makeUnit('small-hammer', 'hammer', 150)
    const bigHammer = makeUnit('big-hammer', 'hammer', 280)
    const order = computeDropOrder([bigHammer, smallHammer])
    expect(order.indexOf('small-hammer')).toBeLessThan(order.indexOf('big-hammer'))
  })
})

// ── Mixed Army ────────────────────────────────────────────────────────────────

describe('computeDropOrder — mixed army', () => {
  it('produces all unit IDs in the output', () => {
    const units = [
      makeUnit('a-holder', 'holder', 60),
      makeUnit('b-screen', 'screen', 55),
      makeUnit('c-gunline', 'gunline', 135),
      makeUnit('d-mid', 'mid-range-shooter', 100),
      makeUnit('e-anchor', 'anchor', 250),
      makeUnit('f-hammer', 'hammer', 200),
      makeUnit('g-infiltrator', 'infiltrator', 85),
      makeUnit('h-scout', 'scout', 70),
      makeUnit('i-deep-strike', 'deep-strike', 150),
      makeUnit('j-transport', 'transport', 90),
      makeUnit('k-counter-charge', 'counter-charge', 130),
    ]
    const order = computeDropOrder(units)
    expect(order).toHaveLength(units.length)
    for (const u of units) {
      expect(order).toContain(u.id)
    }
  })

  it('reasonable full army order: holders/transports before hammers/deep-strike', () => {
    const units = [
      makeUnit('ds-squad', 'deep-strike', 100),
      makeUnit('home-guard', 'holder', 55),
      makeUnit('rhino', 'transport', 75),
      makeUnit('berzerkers', 'hammer', 200),
      makeUnit('marines', 'mid-range-shooter', 110),
    ]
    const order = computeDropOrder(units)
    // Home guard and rhino must come before berzerkers and ds-squad
    expect(order.indexOf('home-guard')).toBeLessThan(order.indexOf('berzerkers'))
    expect(order.indexOf('rhino')).toBeLessThan(order.indexOf('berzerkers'))
    expect(order.indexOf('berzerkers')).toBeLessThan(order.indexOf('ds-squad'))
  })

  it('counter-charge and hammer in same priority block', () => {
    const hammer = makeUnit('hammer-unit', 'hammer', 180)
    const counter = makeUnit('counter-unit', 'counter-charge', 160)
    const order = computeDropOrder([hammer, counter])
    // Both in tier 7; counter is cheaper so goes first
    expect(order.indexOf('counter-unit')).toBeLessThan(order.indexOf('hammer-unit'))
  })
})

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe('computeDropOrder — edge cases', () => {
  it('empty army → empty array', () => {
    expect(computeDropOrder([])).toEqual([])
  })

  it('single unit → returned as single-element array', () => {
    const unit = makeUnit('solo', 'anchor', 200)
    expect(computeDropOrder([unit])).toEqual(['solo'])
  })

  it('units without tacticalRole assigned → still returned (fallback to screen tier)', () => {
    const unit: DeploymentUnit = {
      id: 'unassigned',
      name: 'Unassigned',
      models: 5,
      baseSize: 32,
      points: 100,
      move: 6,
      toughness: 4,
      save: 4,
      wounds: 1,
      keywords: [],
      abilities: {},
      weapons: [],
    }
    const order = computeDropOrder([unit])
    expect(order).toEqual(['unassigned'])
  })
})
