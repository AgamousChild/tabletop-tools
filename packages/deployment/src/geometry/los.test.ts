import { describe, expect, it } from 'vitest'

import type { Rect, TerrainPiece } from '../types'
import { hasLOS, isHiddenFromAllPositions, lineIntersectsRect } from './los'

// Helper to create terrain
function makeTerrain(
  id: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
  losBlocking = true,
): TerrainPiece {
  return {
    id,
    position: { x: cx, y: cy },
    footprint: { center: { x: cx, y: cy }, width: w, height: h },
    losBlocking,
  }
}

describe('lineIntersectsRect', () => {
  // Rect: center=(5,5), w=4, h=4 → x∈[3,7], y∈[3,7]
  const rect: Rect = { center: { x: 5, y: 5 }, width: 4, height: 4 }

  it('returns false for a line that does not intersect the rect', () => {
    // Line from (0,0) to (1,0) — far from rect
    expect(lineIntersectsRect({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, rect)).toBe(false)
  })

  it('returns true for a horizontal line crossing the left edge', () => {
    // Line from (0,5) to (10,5) — passes through the rect
    expect(lineIntersectsRect({ a: { x: 0, y: 5 }, b: { x: 10, y: 5 } }, rect)).toBe(true)
  })

  it('returns true for a vertical line crossing the top edge', () => {
    // Line from (5,0) to (5,10) — passes through the rect vertically
    expect(lineIntersectsRect({ a: { x: 5, y: 0 }, b: { x: 5, y: 10 } }, rect)).toBe(true)
  })

  it('returns true for a diagonal line that crosses the rect', () => {
    // Line from (0,0) to (10,10) — diagonal through rect center
    expect(lineIntersectsRect({ a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }, rect)).toBe(true)
  })

  it('returns false for a line segment that ends before the rect', () => {
    // Line from (0,5) to (2,5) — does not reach the rect (left edge at x=3)
    expect(lineIntersectsRect({ a: { x: 0, y: 5 }, b: { x: 2, y: 5 } }, rect)).toBe(false)
  })

  it('returns false for a line that passes above the rect', () => {
    // Line from (0,0) to (10,0) — y=0 is above rect (rect starts y=3)
    expect(lineIntersectsRect({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, rect)).toBe(false)
  })
})

describe('hasLOS', () => {
  // A terrain block at center (15, 10), 4x4 → x∈[13,17], y∈[8,12]
  const wall = makeTerrain('wall', 15, 10, 4, 4)
  // Non-blocking terrain (open area)
  const openTerrain = makeTerrain('open', 15, 10, 4, 4, false)

  it('returns true when there is no terrain between the two points', () => {
    expect(hasLOS({ x: 0, y: 0 }, { x: 10, y: 0 }, [])).toBe(true)
  })

  it('returns false when LOS-blocking terrain is directly between the two points', () => {
    // Shooter at (0, 10), target at (30, 10) — wall at x∈[13,17] blocks LOS on y=10
    expect(hasLOS({ x: 0, y: 10 }, { x: 30, y: 10 }, [wall])).toBe(false)
  })

  it('returns true when terrain is present but not between the two points', () => {
    // Shooter at (0, 0), target at (10, 0) — wall is at (15,10), not in path
    expect(hasLOS({ x: 0, y: 0 }, { x: 10, y: 0 }, [wall])).toBe(true)
  })

  it('returns true when terrain is non-LOS-blocking (open area)', () => {
    // Same positions as blocked test but terrain is openTerrain
    expect(hasLOS({ x: 0, y: 10 }, { x: 30, y: 10 }, [openTerrain])).toBe(true)
  })

  it('returns false when target is inside terrain and shooter is outside', () => {
    // Target at center of wall (15, 10), shooter outside
    expect(hasLOS({ x: 0, y: 10 }, { x: 15, y: 10 }, [wall])).toBe(false)
  })

  it('returns true when both points are inside the same terrain', () => {
    // Both inside wall: x∈[13,17], y∈[8,12]
    expect(hasLOS({ x: 14, y: 9 }, { x: 16, y: 11 }, [wall])).toBe(true)
  })

  it('returns true when both points are in different terrain pieces', () => {
    // Two separate terrain pieces; they are in different ones so normal LOS applies
    const wall2 = makeTerrain('wall2', 5, 10, 4, 4)
    // point a is in wall2 (x∈[3,7], y∈[8,12]), point b is in wall (x∈[13,17], y∈[8,12])
    // There's a gap between x=7 and x=13, but is the line from (5,10) to (15,10) blocked?
    // The line goes from inside wall2 to inside wall, passing through the gap in between.
    // The wall2 edges are at x=3 and x=7; the line exits wall2 at x=7, then enters wall at x=13.
    // From (5,10) to (15,10): line crosses wall2 right edge at (7,10) and wall left edge at (13,10).
    // From inside wall2 outward: the line DOES intersect wall2's right edge.
    // The special case is "both in same terrain" — different terrain = no special case.
    // So LOS is blocked because: shooter is inside wall2 (not blocked by wall2 itself per rule),
    // but target is inside wall — shooter is outside wall → blocked.
    expect(hasLOS({ x: 5, y: 10 }, { x: 15, y: 10 }, [wall2, wall])).toBe(false)
  })

  it('returns false with multiple terrain, one of which blocks', () => {
    const nonBlock = makeTerrain('open', 5, 5, 2, 2, false)
    // Shooter (0,10) → target (30,10), wall at (15,10) blocks
    expect(hasLOS({ x: 0, y: 10 }, { x: 30, y: 10 }, [nonBlock, wall])).toBe(false)
  })

  it('shooter outside, target inside non-blocking terrain → true (not hidden)', () => {
    expect(hasLOS({ x: 0, y: 10 }, { x: 15, y: 10 }, [openTerrain])).toBe(true)
  })
})

describe('isHiddenFromAllPositions', () => {
  // Wall at center (15, 10), 4x4 → x∈[13,17], y∈[8,12]
  const wall = makeTerrain('wall', 15, 10, 4, 4)

  it('returns true when target is hidden from all positions', () => {
    // Target inside wall, all positions outside
    const positions = [
      { x: 0, y: 10 },
      { x: 0, y: 8 },
      { x: 0, y: 12 },
    ]
    expect(isHiddenFromAllPositions({ x: 15, y: 10 }, positions, [wall])).toBe(true)
  })

  it('returns false when target is visible from at least one position', () => {
    // Target inside wall, one position is also inside wall (can see)
    const positions = [
      { x: 0, y: 10 }, // outside wall — cannot see target inside
      { x: 14, y: 9 }, // inside wall — can see target
    ]
    expect(isHiddenFromAllPositions({ x: 15, y: 10 }, positions, [wall])).toBe(false)
  })

  it('returns false when there is no terrain (clear LOS from all positions)', () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]
    expect(isHiddenFromAllPositions({ x: 5, y: 5 }, positions, [])).toBe(false)
  })

  it('returns false when target is visible from all positions (no blocking terrain between)', () => {
    // Terrain is far away, not blocking
    const farWall = makeTerrain('far', 50, 50, 4, 4)
    const positions = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]
    expect(isHiddenFromAllPositions({ x: 5, y: 5 }, positions, [farWall])).toBe(false)
  })
})
