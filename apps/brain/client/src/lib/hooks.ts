import { useState, useEffect } from 'react'
import {
  getNode, getNodesByLayer, getNodesByFaction, searchNodes,
  getRefsFrom, getRefsTo,
  type BrainNode, type StoredRef,
} from './store'

function useBrainQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  defaultValue: T,
): { data: T; error: string | null; isLoading: boolean } {
  const [data, setData] = useState<T>(defaultValue)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'IndexedDB unavailable')
          setData(defaultValue)
          setIsLoading(false)
        }
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, isLoading }
}

export function useNode(id: string) {
  return useBrainQuery(() => getNode(id), [id], null as BrainNode | null)
}

export function useNodesByLayer(layer: string) {
  return useBrainQuery(() => getNodesByLayer(layer), [layer], [] as BrainNode[])
}

export function useNodesByFaction(factionId: string) {
  return useBrainQuery(() => getNodesByFaction(factionId), [factionId], [] as BrainNode[])
}

export function useNodeSearch(query: string) {
  return useBrainQuery(() => searchNodes(query), [query], [] as BrainNode[])
}

export function useNodeRefs(nodeId: string) {
  return useBrainQuery(
    async () => {
      const [from, to] = await Promise.all([getRefsFrom(nodeId), getRefsTo(nodeId)])
      return { from, to }
    },
    [nodeId],
    { from: [] as StoredRef[], to: [] as StoredRef[] },
  )
}

/**
 * Get all nodes connected to the given node (1 level deep).
 * Follows refs in both directions.
 */
export function useConnectedNodes(nodeId: string) {
  return useBrainQuery(
    async () => {
      const [from, to] = await Promise.all([getRefsFrom(nodeId), getRefsTo(nodeId)])
      const connectedIds = new Set<string>()
      for (const ref of from) connectedIds.add(ref.targetId)
      for (const ref of to) connectedIds.add(ref.sourceId)
      connectedIds.delete(nodeId)

      const nodes: BrainNode[] = []
      for (const id of connectedIds) {
        const node = await getNode(id)
        if (node) nodes.push(node)
      }
      return nodes
    },
    [nodeId],
    [] as BrainNode[],
  )
}
