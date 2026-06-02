import { trpc } from './trpc'

export type CatalogMission = {
  id: string
  name: string
  kind: 'primary' | 'secondary'
  side: 'symmetric' | 'attacker' | 'defender'
  cap: number | null
  uiPattern: string
}

export function useMissionCatalog() {
  const { data: primaries = [], isLoading: primariesLoading } =
    trpc.mission.listPrimaries.useQuery()
  const { data: secondaries = [], isLoading: secondariesLoading } =
    trpc.mission.listSecondaries.useQuery()

  return {
    primaries: primaries as CatalogMission[],
    secondaries: secondaries as CatalogMission[],
    isLoading: primariesLoading || secondariesLoading,
  }
}
