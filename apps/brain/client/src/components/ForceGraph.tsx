import '@xyflow/react/dist/style.css'

import {
  Background,
  Controls,
  type Edge as RFEdge,
  Handle,
  MiniMap,
  type Node as RFNode,
  type NodeTypes,
  Position,
  ReactFlow,
} from '@xyflow/react'
import { useCallback, useRef, useState } from 'react'

import { brainFetch } from '../lib/api'
import type { Edition } from '../lib/edition'

const LAYER_COLORS: Record<string, string> = {
  core: '#f59e0b',
  faction: '#3b82f6',
  unit: '#10b981',
  errata: '#ef4444',
  balance: '#a855f7',
  community: '#06b6d4',
}

const LAYER_BG: Record<string, string> = {
  core: 'bg-amber-900/30 border-amber-500/50',
  faction: 'bg-blue-900/30 border-blue-500/50',
  unit: 'bg-green-900/30 border-green-500/50',
  errata: 'bg-red-900/30 border-red-500/50',
  balance: 'bg-purple-900/30 border-purple-500/50',
  community: 'bg-cyan-900/30 border-cyan-500/50',
}

interface BrainNodeData {
  label: string
  fullTitle: string
  layer: string
  category: string
  factionId?: string
  subfaction?: string
  edition?: string
  summary?: string
  content?: string
  isCenter?: boolean
  nodeId: string
  depth: number // distance from current focus node
}

interface GraphNode {
  id: string
  title: string
  layer: string
  category: string
  factionId?: string
  subfaction?: string
  edition?: string
  summary?: string
  content?: string
}

interface GraphEdge {
  source: string
  target: string
  rel: string
}

function BrainNode({ data }: { data: BrainNodeData }) {
  const bg = LAYER_BG[data.layer] || 'bg-slate-800/50 border-slate-600/50'
  const borderWidth = data.isCenter ? 'border-2 ring-1 ring-amber-500/30' : 'border'
  const opacity = data.depth > 1 ? 'opacity-60' : ''

  return (
    <div
      className={`rounded-lg ${borderWidth} ${bg} ${opacity} px-3 py-2 min-w-[180px] max-w-[260px] cursor-pointer hover:brightness-125 transition-all`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: LAYER_COLORS[data.layer] || '#94a3b8' }}
        />
        <span className="text-[10px] text-slate-500 uppercase tracking-wide">{data.category}</span>
      </div>
      <p className="text-xs font-semibold text-slate-100 leading-tight">{data.label}</p>
      {data.subfaction && (
        <span className="text-[10px] text-amber-400 mt-0.5 block">{data.subfaction}</span>
      )}
      {data.factionId && !data.subfaction && (
        <span className="text-[10px] text-slate-500 mt-0.5 block">{data.factionId}</span>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes: NodeTypes = { brain: BrainNode as any }

// Track which nodes are at what depth from the focus node
interface GraphState {
  focusId: string
  allNodes: Map<string, GraphNode>
  allEdges: GraphEdge[]
  depthMap: Map<string, number> // nodeId → distance from focus
}

function getFirstDegreeNeighbors(nodeId: string, edges: GraphEdge[]): Set<string> {
  const neighbors = new Set<string>()
  for (const e of edges) {
    if (e.source === nodeId) neighbors.add(e.target)
    if (e.target === nodeId) neighbors.add(e.source)
  }
  return neighbors
}

function computeDepths(focusId: string, edges: GraphEdge[], maxDepth: number): Map<string, number> {
  const depths = new Map<string, number>()
  depths.set(focusId, 0)
  const queue = [focusId]
  let i = 0
  while (i < queue.length) {
    const current = queue[i++]!
    const currentDepth = depths.get(current)!
    if (currentDepth >= maxDepth) continue
    const neighbors = getFirstDegreeNeighbors(current, edges)
    for (const n of neighbors) {
      if (!depths.has(n)) {
        depths.set(n, currentDepth + 1)
        queue.push(n)
      }
    }
  }
  return depths
}

function layoutFromState(
  state: GraphState,
  categoryFilters?: Set<string>,
  editionFilter?: string,
): { nodes: RFNode[]; edges: RFEdge[] } {
  const nodes: RFNode[] = []
  const rfEdges: RFEdge[] = []

  // Only include nodes within depth 1 of focus
  const visibleIds = new Set<string>()
  for (const [id, depth] of state.depthMap) {
    if (depth <= 1) visibleIds.add(id)
  }

  const focusNode = state.allNodes.get(state.focusId)
  if (!focusNode) return { nodes: [], edges: [] }

  const cx = 0
  const cy = 0

  // Place focus node at center
  nodes.push({
    id: focusNode.id,
    type: 'brain',
    position: { x: cx, y: cy },
    data: {
      label: focusNode.title?.substring(0, 50) || focusNode.id,
      fullTitle: focusNode.title || focusNode.id,
      layer: focusNode.layer || 'core',
      category: focusNode.category || '',
      factionId: focusNode.factionId,
      subfaction: focusNode.subfaction,
      edition: focusNode.edition,
      summary: focusNode.summary,
      content: focusNode.content,
      isCenter: true,
      nodeId: focusNode.id,
      depth: 0,
    },
  })

  // Group connected nodes by category, applying filters
  const connected: GraphNode[] = []
  for (const id of visibleIds) {
    if (id === state.focusId) continue
    const n = state.allNodes.get(id)
    if (!n) continue
    // Apply category filter (if any toggles are active)
    if (categoryFilters && categoryFilters.size > 0 && !categoryFilters.has(n.category)) continue
    // Apply edition filter
    if (editionFilter && editionFilter !== 'all' && n.edition && n.edition !== editionFilter)
      continue
    connected.push(n)
  }

  const groups: Record<string, GraphNode[]> = {}
  for (const n of connected) {
    const cat = n.category || 'other'
    if (!groups[cat]) groups[cat] = []
    groups[cat]!.push(n)
  }

  const groupKeys = Object.keys(groups)
  const angleStep = (2 * Math.PI) / Math.max(groupKeys.length, 1)
  let groupIdx = 0

  for (const [, groupNodes] of Object.entries(groups)) {
    const baseAngle = groupIdx * angleStep - Math.PI / 2
    const radius = 300 + Math.min(groupNodes.length, 8) * 20

    for (let i = 0; i < groupNodes.length; i++) {
      const n = groupNodes[i]!
      const spread = Math.min(0.5, Math.PI / Math.max(groupNodes.length, 2))
      const angle = baseAngle + (i - groupNodes.length / 2) * spread
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)
      const depth = state.depthMap.get(n.id) ?? 1

      nodes.push({
        id: n.id,
        type: 'brain',
        position: { x, y },
        data: {
          label: n.title?.substring(0, 50) || n.id,
          fullTitle: n.title || n.id,
          layer: n.layer || 'core',
          category: n.category || '',
          factionId: n.factionId,
          subfaction: n.subfaction,
          edition: n.edition,
          summary: n.summary,
          content: n.content,
          nodeId: n.id,
          depth,
        },
      })
    }
    groupIdx++
  }

  // Only include edges between visible nodes
  for (const e of state.allEdges) {
    if (visibleIds.has(e.source) && visibleIds.has(e.target)) {
      rfEdges.push({
        id: `${e.source}-${e.target}-${e.rel}`,
        source: e.source,
        target: e.target,
        label: e.rel,
        animated: e.rel === 'stacks_with',
        style: {
          stroke: e.rel === 'stacks_with' ? '#f59e0b' : e.rel === 'part_of' ? '#3b82f6' : '#475569',
          strokeWidth: e.rel === 'stacks_with' ? 2 : 1,
        },
        labelStyle: { fill: '#64748b', fontSize: 9 },
      })
    }
  }

  return { nodes, edges: rfEdges }
}

const CATEGORY_FILTERS = [
  { key: 'faction', label: 'Factions' },
  { key: 'army-rule', label: 'Army Rules' },
  { key: 'detachment', label: 'Detachments' },
  { key: 'detachment-rule', label: 'Det. Rules' },
  { key: 'stratagem', label: 'Stratagems' },
  { key: 'enhancement', label: 'Enhancements' },
  { key: 'datasheet', label: 'Units' },
  { key: 'weapon', label: 'Weapons' },
  { key: 'unit-ability', label: 'Abilities' },
  { key: 'faction-ability', label: 'Faction Abilities' },
] as const

export interface ForceGraphProps {
  /** Active rules edition — threaded into /graph-data so the server pre-filters. */
  edition?: Edition
}

export function ForceGraph({ edition }: ForceGraphProps = {}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [rfNodes, setRfNodes] = useState<RFNode[]>([])
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<BrainNodeData | null>(null)
  const graphState = useRef<GraphState | null>(null)
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set())
  const [editionFilter, setEditionFilter] = useState<string>('all')

  const loadGraph = useCallback(
    async (query: string) => {
      if (!query.trim()) return
      setLoading(true)

      try {
        const res = await brainFetch(`/graph-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit: 10 }),
          edition,
        })
        if (!res.ok) throw new Error('API error')
        const data = await res.json()
        const allNodes: GraphNode[] = data.nodes || []
        const allEdges: GraphEdge[] = data.edges || []

        if (allNodes.length === 0) {
          setRfNodes([])
          setRfEdges([])
          graphState.current = null
          return
        }

        const center = allNodes[0]!
        const nodeMap = new Map<string, GraphNode>()
        for (const n of allNodes) nodeMap.set(n.id, n)

        const depthMap = computeDepths(center.id, allEdges, 3)

        const state: GraphState = {
          focusId: center.id,
          allNodes: nodeMap,
          allEdges: allEdges,
          depthMap,
        }
        graphState.current = state

        const { nodes, edges } = layoutFromState(state, categoryFilters, editionFilter)
        setRfNodes(nodes)
        setRfEdges(edges)
        setSelectedNode(null)
      } catch {
        setRfNodes([])
        setRfEdges([])
        graphState.current = null
      } finally {
        setLoading(false)
      }
    },
    [edition, categoryFilters, editionFilter],
  )

  const refocusOnNode = useCallback(
    async (nodeId: string) => {
      if (!graphState.current) return
      const state = graphState.current
      const node = state.allNodes.get(nodeId)
      if (!node) return

      // Always fetch — the original query only returned edges for the center node,
      // not for connected nodes. We need this node's own connections.
      setLoading(true)
      try {
        const res = await brainFetch(`/graph-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: node.title, limit: 10 }),
          edition,
        })
        if (!res.ok) throw new Error('API error')
        const data = await res.json()
        const newNodes: GraphNode[] = data.nodes || []
        const newEdges: GraphEdge[] = data.edges || []

        // Merge new data into existing state
        for (const n of newNodes) {
          if (!state.allNodes.has(n.id)) state.allNodes.set(n.id, n)
        }
        const existingEdgeKeys = new Set(
          state.allEdges.map((e) => `${e.source}|${e.target}|${e.rel}`),
        )
        for (const e of newEdges) {
          const key = `${e.source}|${e.target}|${e.rel}`
          if (!existingEdgeKeys.has(key)) {
            state.allEdges.push(e)
            existingEdgeKeys.add(key)
          }
        }
      } catch {
        // Continue with existing data
      } finally {
        setLoading(false)
      }

      // Recompute depths from new focus — keep max 2 hops
      const newDepths = computeDepths(nodeId, state.allEdges, 2)

      // Prune nodes that are >2 hops from the new focus
      const keepIds = new Set(newDepths.keys())
      state.focusId = nodeId
      state.depthMap = newDepths

      // Remove nodes that are too far away to keep memory bounded
      for (const id of state.allNodes.keys()) {
        if (!keepIds.has(id)) state.allNodes.delete(id)
      }

      const { nodes, edges } = layoutFromState(state, categoryFilters, editionFilter)
      setRfNodes(nodes)
      setRfEdges(edges)
      setSelectedNode(null)
    },
    [edition, categoryFilters, editionFilter],
  )

  const toggleCategory = useCallback((cat: string) => {
    setCategoryFilters((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  // Apply filters whenever they change
  const prevFiltersRef = useRef({ categoryFilters, editionFilter })
  if (
    prevFiltersRef.current.categoryFilters !== categoryFilters ||
    prevFiltersRef.current.editionFilter !== editionFilter
  ) {
    prevFiltersRef.current = { categoryFilters, editionFilter }
    if (graphState.current) {
      const { nodes, edges } = layoutFromState(graphState.current, categoryFilters, editionFilter)
      setRfNodes(nodes)
      setRfEdges(edges)
    }
  }

  const onNodeClick = useCallback((_: any, node: RFNode) => {
    const data = node.data as unknown as BrainNodeData
    setSelectedNode(data)
  }, [])

  const onNodeDoubleClick = useCallback(
    (_: any, node: RFNode) => {
      const data = node.data as unknown as BrainNodeData
      if (data.nodeId && data.nodeId !== '') {
        refocusOnNode(data.nodeId)
      }
    },
    [refocusOnNode],
  )

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Search bar */}
      <div className="flex gap-2 p-3 border-b border-slate-800">
        <input
          type="text"
          placeholder="Search to visualize graph..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadGraph(searchQuery)}
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder-slate-500 text-sm"
        />
        <button
          onClick={() => loadGraph(searchQuery)}
          disabled={loading}
          className="bg-amber-500 text-slate-950 px-4 py-2 rounded font-medium hover:bg-amber-400 disabled:opacity-50 text-sm"
        >
          {loading ? '...' : 'Visualize'}
        </button>
      </div>

      {/* Filter controls */}
      {rfNodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/50">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Show:</span>
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => toggleCategory(f.key)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                categoryFilters.size === 0 || categoryFilters.has(f.key)
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                  : 'border-slate-700 bg-slate-800/50 text-slate-500 hover:text-slate-400'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="text-slate-700 mx-1">|</span>
          <select
            value={editionFilter}
            onChange={(e) => setEditionFilter(e.target.value)}
            className="text-[10px] bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300"
          >
            <option value="all">All Editions</option>
            <option value="10th">10th Only</option>
            <option value="11th">11th Only</option>
          </select>
          {(categoryFilters.size > 0 || editionFilter !== 'all') && (
            <button
              onClick={() => {
                setCategoryFilters(new Set())
                setEditionFilter('all')
              }}
              className="text-[10px] text-slate-500 hover:text-slate-300 underline ml-1"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Graph area — full remaining height */}
      <div className="flex-1 relative">
        {rfNodes.length > 0 ? (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.2}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={24} />
            <Controls
              showInteractive={false}
              className="!bg-slate-800 !border-slate-700 !shadow-none [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-300"
            />
            <MiniMap
              nodeColor={(n) => LAYER_COLORS[(n.data as any)?.layer] || '#94a3b8'}
              maskColor="rgba(15, 23, 42, 0.8)"
              className="!bg-slate-900 !border-slate-800"
              pannable
              zoomable
            />
          </ReactFlow>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            {loading
              ? 'Loading...'
              : 'Search to explore the knowledge graph. Double-click nodes to navigate.'}
          </div>
        )}

        {/* Floating detail panel */}
        {selectedNode && (
          <div className="absolute top-3 right-3 w-80 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-lg p-4 shadow-xl z-10">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-bold text-amber-400 pr-2">
                {selectedNode.fullTitle || selectedNode.label}
              </h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-500 hover:text-slate-300 text-lg leading-none shrink-0"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              <span
                className="text-[10px] px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: LAYER_COLORS[selectedNode.layer] || '#475569' }}
              >
                {selectedNode.layer}
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                {selectedNode.category}
              </span>
              {selectedNode.factionId && (
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                  {selectedNode.factionId}
                </span>
              )}
              {selectedNode.subfaction && (
                <span className="text-[10px] bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded">
                  {selectedNode.subfaction}
                </span>
              )}
            </div>
            {/* Connection stats */}
            {graphState.current &&
              selectedNode.nodeId &&
              (() => {
                const edges = graphState.current!.allEdges
                const id = selectedNode.nodeId
                const direct = new Set<string>()
                for (const e of edges) {
                  if (e.source === id) direct.add(e.target)
                  if (e.target === id) direct.add(e.source)
                }
                return direct.size > 0 ? (
                  <p className="text-[10px] text-slate-500 mb-2">
                    {direct.size} direct connection{direct.size !== 1 ? 's' : ''} loaded
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-600 mb-2 italic">
                    No connections loaded — double-click to explore
                  </p>
                )
              })()}
            {selectedNode.summary && (
              <p className="text-xs text-slate-300 mb-2">{selectedNode.summary}</p>
            )}
            {selectedNode.content && selectedNode.content !== selectedNode.summary && (
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer text-amber-400 hover:text-amber-300 mb-1">
                  Full content
                </summary>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {selectedNode.content}
                </div>
              </details>
            )}
            {selectedNode.nodeId && !selectedNode.isCenter && (
              <button
                onClick={() => refocusOnNode(selectedNode.nodeId)}
                className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline"
              >
                Focus on this node &rarr;
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
