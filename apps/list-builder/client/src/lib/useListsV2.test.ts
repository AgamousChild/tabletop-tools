import { describe, expect, it } from 'vitest'

import { pointsToBattleSizeEnum } from './useListsV2'

// The hook surface (useListsV2, useListV2, etc.) depends on tRPC context and React Query,
// which require a full provider tree. Those are covered by the component tests that mock
// the hooks. This file tests the pure utilities exported from the module.

describe('pointsToBattleSizeEnum', () => {
  it('maps 500 to Incursion', () => {
    expect(pointsToBattleSizeEnum(500)).toBe('Incursion')
  })

  it('maps 1000 to Strike Force', () => {
    expect(pointsToBattleSizeEnum(1000)).toBe('Strike Force')
  })

  it('maps 2000 to Strike Force', () => {
    expect(pointsToBattleSizeEnum(2000)).toBe('Strike Force')
  })

  it('maps 3000 to Onslaught', () => {
    expect(pointsToBattleSizeEnum(3000)).toBe('Onslaught')
  })

  it('returns unknown for unrecognized points values', () => {
    expect(pointsToBattleSizeEnum(9999)).toBe('unknown')
  })
})
