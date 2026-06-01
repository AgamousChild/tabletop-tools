/**
 * useListsV2 — React Query hooks for the listV2 tRPC router.
 *
 * These hooks are the single interface for list CRUD in the list-builder client.
 * IndexedDB lists/list_units stores are DEPRECATED as primary storage; this module
 * is the source of truth.
 */
import { useCallback } from 'react'

import { trpc, trpcClient } from './trpc'

// ---------------------------------------------------------------------------
// Inferred output types from the tRPC router
// ---------------------------------------------------------------------------

export type ListUnitV2 = {
  id: string
  listId: string
  datasheetId: string | null
  enhancementId: string | null
  isWarlord: boolean
  points: number
  attachedToUnitId: string | null
  attachRole: 'leader' | 'support' | null
  loadouts: Array<{
    id: string
    listUnitId: string
    modelCount: number
    weapons: Array<{
      id: string
      loadoutId: string
      weaponId: string | null
      count: number
    }>
  }>
}

export type ListV2 = {
  id: string
  userId: string
  name: string
  edition: '10th' | '11th'
  battleSize: string
  totalPoints: number
  source: string
  author: string | null
  factionId: string | null
  subfactionId: string | null
  detachmentId: string | null
  dataslateId: string | null
  createdAt: number
  updatedAt: number
  units: ListUnitV2[]
}

export type ListSummaryV2 = Omit<ListV2, 'units'>

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

/** All lists for the signed-in user (summaries, no units). */
export function useListsV2() {
  return trpc.listV2.getAll.useQuery(undefined, {
    staleTime: 30_000,
  })
}

/** Single list including all units + loadouts. */
export function useListV2(id: string | null) {
  return trpc.listV2.get.useQuery(
    { id: id! },
    {
      enabled: !!id,
      staleTime: 10_000,
    },
  )
}

// ---------------------------------------------------------------------------
// Mutation hooks — each invalidates the relevant queries on success
// ---------------------------------------------------------------------------

export function useCreateListV2() {
  const utils = trpc.useUtils()
  return trpc.listV2.create.useMutation({
    onSuccess: () => {
      void utils.listV2.getAll.invalidate()
    },
  })
}

export function useUpdateListV2() {
  const utils = trpc.useUtils()
  return trpc.listV2.update.useMutation({
    onSuccess: (_data, variables) => {
      void utils.listV2.getAll.invalidate()
      void utils.listV2.get.invalidate({ id: variables.id })
    },
  })
}

export function useDeleteListV2() {
  const utils = trpc.useUtils()
  return trpc.listV2.delete.useMutation({
    onSuccess: () => {
      void utils.listV2.getAll.invalidate()
    },
  })
}

export function useAddUnitV2() {
  const utils = trpc.useUtils()
  return trpc.listV2.addUnit.useMutation({
    onSuccess: (_data, variables) => {
      void utils.listV2.get.invalidate({ id: variables.listId })
    },
  })
}

export function useUpdateUnitV2() {
  const utils = trpc.useUtils()
  return trpc.listV2.updateUnit.useMutation({
    onSuccess: () => {
      // We need to invalidate the parent list; the unit's listId is not
      // available in the mutation variables, so invalidate all get queries.
      void utils.listV2.get.invalidate()
    },
  })
}

export function useRemoveUnitV2() {
  const utils = trpc.useUtils()
  return trpc.listV2.removeUnit.useMutation({
    onSuccess: () => {
      void utils.listV2.get.invalidate()
    },
  })
}

export function useSetLoadoutV2() {
  const utils = trpc.useUtils()
  return trpc.listV2.setLoadout.useMutation({
    onSuccess: () => {
      void utils.listV2.get.invalidate()
    },
  })
}

export function useComputePointsV2() {
  const utils = trpc.useUtils()
  return trpc.listV2.computePoints.useMutation({
    onSuccess: (_data, variables) => {
      void utils.listV2.get.invalidate({ id: variables.listId })
      void utils.listV2.getAll.invalidate()
    },
  })
}

// ---------------------------------------------------------------------------
// Imperative helpers (for event handlers that need fire-and-forget)
// ---------------------------------------------------------------------------

/** Create a list and return its id. Throws on failure. */
export async function createListV2Imperative(input: {
  name: string
  battleSize: string
  factionId?: string
  detachmentId?: string
  edition?: '10th' | '11th'
}): Promise<string> {
  const res = await trpcClient.listV2.create.mutate({
    name: input.name,
    battleSize: input.battleSize as
      | 'Combat Patrol'
      | 'Incursion'
      | 'Strike Force'
      | 'Onslaught'
      | 'unknown',
    factionId: input.factionId,
    detachmentId: input.detachmentId,
    edition: input.edition ?? '11th',
  })
  return res.id
}

/** Add a unit to a list and return its id. Throws on failure. */
export async function addUnitV2Imperative(input: {
  listId: string
  datasheetId?: string
  enhancementId?: string
  isWarlord?: boolean
  points: number
  attachedToUnitId?: string
  attachRole?: 'leader' | 'support'
}): Promise<string> {
  const res = await trpcClient.listV2.addUnit.mutate(input)
  return res.id
}

/** Update list metadata. Throws on failure. */
export function updateListV2Imperative(
  input: Parameters<typeof trpcClient.listV2.update.mutate>[0],
): Promise<{ success: boolean }> {
  return trpcClient.listV2.update.mutate(input)
}

/** Remove a unit from a list. Throws on failure. */
export function removeUnitV2Imperative(unitId: string): Promise<{ success: boolean }> {
  return trpcClient.listV2.removeUnit.mutate({ id: unitId })
}

/** Delete a list. Throws on failure. */
export function deleteListV2Imperative(listId: string): Promise<{ success: boolean }> {
  return trpcClient.listV2.delete.mutate({ id: listId })
}

/** Update a unit (warlord flag, enhancement, attachment). Throws on failure. */
export function updateUnitV2Imperative(
  input: Parameters<typeof trpcClient.listV2.updateUnit.mutate>[0],
): Promise<{ success: boolean }> {
  return trpcClient.listV2.updateUnit.mutate(input)
}

// ---------------------------------------------------------------------------
// battleSize label → enum mapping
// ---------------------------------------------------------------------------

const BATTLE_SIZE_POINTS: Record<number, string> = {
  500: 'Incursion',
  1000: 'Strike Force',
  2000: 'Strike Force',
  3000: 'Onslaught',
}

/** Map a points number to the tRPC battleSize enum value. */
export function pointsToBattleSizeEnum(points: number): string {
  return BATTLE_SIZE_POINTS[points] ?? 'unknown'
}

// ---------------------------------------------------------------------------
// Hook: useListV2InvalidateAll — useful after a migration batch
// ---------------------------------------------------------------------------

export function useInvalidateListsV2() {
  const utils = trpc.useUtils()
  return useCallback(() => {
    void utils.listV2.getAll.invalidate()
    void utils.listV2.get.invalidate()
  }, [utils])
}
