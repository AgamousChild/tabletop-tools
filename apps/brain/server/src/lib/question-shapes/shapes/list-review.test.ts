/**
 * shapes/list-review.test.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { _clearRegistry, register } from '../registry'
import type { ShapeContext } from '../types'
import { listReviewShape } from './list-review'

// Ensure the shape is registered before tests run.
beforeEach(() => {
  _clearRegistry()
  register(listReviewShape)
})

afterEach(() => {
  _clearRegistry()
})

function ctx(question: string, factions: string[] = []): ShapeContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { question, detectedFactions: factions, edition: '11th', bucket: {} as any }
}

// ── matches() ─────────────────────────────────────────────────────────────────

describe('list-review matches()', () => {
  it('matches a question with points total AND bulleted units', () => {
    const q = `Rate my list please!
1500pts Space Marines
- Intercessors (100pts)
- Captain (80pts)
- Assault Intercessors (90pts)`
    expect(listReviewShape.matches(ctx(q))).toBe(true)
  })

  it('matches "pts" abbreviation', () => {
    const q = `2000pts
- Termagants
- Hive Tyrant
- Ripper Swarms`
    expect(listReviewShape.matches(ctx(q))).toBe(true)
  })

  it('matches "points" spelled out', () => {
    const q = `Running a 1000 points list:
- Necron Warriors
- Overlord`
    expect(listReviewShape.matches(ctx(q))).toBe(true)
  })

  it('matches with "attached unit" signal instead of bullets', () => {
    const q = `Is my 1500pts list ok? Attached unit: Captain. Characters: Librarian`
    expect(listReviewShape.matches(ctx(q))).toBe(true)
  })

  it('does NOT match question with points but no unit list', () => {
    const q = `Are 1500pts lists competitive for Space Marines?`
    expect(listReviewShape.matches(ctx(q))).toBe(false)
  })

  it('does NOT match question with bullets but no points', () => {
    const q = `What units should I take?
- Intercessors
- Captain
- Scouts`
    expect(listReviewShape.matches(ctx(q))).toBe(false)
  })

  it('does NOT match unrelated question', () => {
    expect(listReviewShape.matches(ctx('How does Oath of Moment work?'))).toBe(false)
  })
})

// ── canonicalize() ────────────────────────────────────────────────────────────

describe('list-review canonicalize()', () => {
  it('extracts points value', () => {
    const q = `1500pts\n- Intercessors\n- Captain\n- Scouts`
    const parsed = listReviewShape.canonicalize(ctx(q))
    expect(parsed.points).toBe(1500)
  })

  it('handles comma-formatted points (1,500pts)', () => {
    const q = `1,500pts\n- Intercessors\n- Captain\n- Scouts`
    const parsed = listReviewShape.canonicalize(ctx(q))
    expect(parsed.points).toBe(1500)
  })

  it('extracts units from bulleted list', () => {
    const q = `2000pts\n- Intercessors\n- Captain\n- Land Raider`
    const parsed = listReviewShape.canonicalize(ctx(q))
    expect(parsed.units).toContain('Intercessors')
    expect(parsed.units).toContain('Captain')
    expect(parsed.units).toContain('Land Raider')
  })

  it('strips trailing point costs from unit names', () => {
    const q = `2000pts\n- Intercessors (100pts)\n- Captain [80]`
    const parsed = listReviewShape.canonicalize(ctx(q))
    expect(parsed.units[0]).toBe('Intercessors')
    expect(parsed.units[1]).toBe('Captain')
  })

  it('uses detectedFactions for faction', () => {
    const q = `1500pts\n- Intercessors\n- Captain\n- Scouts`
    const parsed = listReviewShape.canonicalize(ctx(q, ['space-marines']))
    expect(parsed.faction).toBe('space-marines')
  })

  it('extracts detachment name', () => {
    const q = `2000pts Space Marines, Gladius Task Force detachment\n- Intercessors\n- Captain\n- Scouts`
    const parsed = listReviewShape.canonicalize(ctx(q))
    expect(parsed.detachment).toMatch(/gladius task force/i)
  })

  it('parseOk: true when points and 2+ units present', () => {
    const q = `1500pts\n- Intercessors\n- Captain`
    const parsed = listReviewShape.canonicalize(ctx(q))
    expect(parsed.parseOk).toBe(true)
  })

  it('parseOk: false when fewer than 2 units', () => {
    const q = `1500pts\n- Intercessors (attached unit captain)`
    const parsed = listReviewShape.canonicalize(ctx(q))
    expect(parsed.parseOk).toBe(false)
  })
})

// ── handle() ─────────────────────────────────────────────────────────────────

describe('list-review handle()', () => {
  it('returns delegated:false (never short-circuits)', async () => {
    const q = `1500pts\n- Intercessors\n- Captain\n- Land Raider`
    const parsed = listReviewShape.canonicalize(ctx(q))
    const result = await listReviewShape.handle(parsed, ctx(q))
    expect(result.delegated).toBe(false)
  })

  it('when parseOk:true, augmentContext contains PARSED LIST', async () => {
    const q = `2000pts\n- Intercessors\n- Captain\n- Scouts`
    const parsed = listReviewShape.canonicalize(ctx(q, ['space-marines']))
    const result = await listReviewShape.handle(parsed, ctx(q, ['space-marines']))
    expect(result.augmentContext).toContain('PARSED LIST')
    expect(result.augmentContext).toContain('space-marines')
    expect(result.augmentContext).toContain('META COMPARISON PENDING')
  })

  it('when parseOk:true, lists units in augmentContext', async () => {
    const q = `1500pts\n- Termagants\n- Hive Tyrant\n- Gargoyles`
    const parsed = listReviewShape.canonicalize(ctx(q, ['tyranids']))
    const result = await listReviewShape.handle(parsed, ctx(q, ['tyranids']))
    expect(result.augmentContext).toContain('Termagants')
    expect(result.augmentContext).toContain('Hive Tyrant')
  })

  it('when parseOk:false, augmentContext contains formatting suggestion', async () => {
    const q = `1500pts here is my list (attached unit: Captain)`
    const parsed = listReviewShape.canonicalize(ctx(q))
    // Force parseOk false
    parsed.parseOk = false
    const result = await listReviewShape.handle(parsed, ctx(q))
    expect(result.augmentContext).toContain('could not be fully parsed')
  })

  it('shapeId is "list-review"', async () => {
    const q = `2000pts\n- Intercessors\n- Captain\n- Scouts`
    const parsed = listReviewShape.canonicalize(ctx(q))
    const result = await listReviewShape.handle(parsed, ctx(q))
    expect(result.shapeId).toBe('list-review')
  })
})
