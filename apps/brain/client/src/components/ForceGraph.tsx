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
import { useCallback, useEffect, useRef, useState } from 'react'

import { brainFetch } from '../lib/api'
import { resolveCardView, type ResultNode } from '../lib/card-display'
import type { Edition } from '../lib/edition'
import { BalanceCard } from './cards/BalanceCard'
import { ChallengerCard } from './cards/ChallengerCard'
import { CommunityCard } from './cards/CommunityCard'
import { CoreRuleCard } from './cards/CoreRuleCard'
import { DeploymentZoneCard } from './cards/DeploymentZoneCard'
import { DetachmentCard } from './cards/DetachmentCard'
import { EnhancementCard } from './cards/EnhancementCard'
import { ErrataCard } from './cards/ErrataCard'
import { ForceDispositionCard } from './cards/ForceDispositionCard'
import { MissionCard } from './cards/MissionCard'
import { RuleCard } from './cards/RuleCard'
import { StratagemCard } from './cards/StratagemCard'
import { TerrainLayoutCard } from './cards/TerrainLayoutCard'
import { TwistCard } from './cards/TwistCard'
import type { CardContext, CardData } from './cards/types'
import { UnitCard } from './cards/UnitCard'

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
      {data.factionId && (
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

/**
 * Renders a CardData via the matching card component. Mirrors the routing in
 * BrainScreen's Overlay but doesn't depend on it — the force-graph panel
 * lives outside the main overlay flow.
 *
 * Passes a no-op CardContext: the in-graph card is a peek, not a clickable
 * detail. Navigation goes through the Focus button instead.
 */
function ForceGraphCard({ card }: { card: CardData }): JSX.Element {
  const ctx: CardContext = {
    highlightTerms: [],
    onContentClick: () => {},
    onDismiss: () => {},
  }
  switch (card.type) {
    case 'unit':
      return <UnitCard data={card.data} context={ctx} />
    case 'stratagem':
      return <StratagemCard data={card.data} context={ctx} />
    case 'enhancement':
      return <EnhancementCard data={card.data} context={ctx} />
    case 'rule':
      return <RuleCard data={card.data} context={ctx} />
    case 'core-rule':
      return <CoreRuleCard data={card.data} context={ctx} />
    case 'mission':
      return <MissionCard data={card.data} context={ctx} />
    case 'twist':
      return <TwistCard data={card.data} context={ctx} />
    case 'challenger':
      return <ChallengerCard data={card.data} context={ctx} />
    case 'deployment-zone':
      return <DeploymentZoneCard data={card.data} context={ctx} />
    case 'force-disposition':
      return <ForceDispositionCard data={card.data} context={ctx} />
    case 'terrain-layout':
      return <TerrainLayoutCard data={card.data} context={ctx} />
    case 'errata':
      return <ErrataCard data={card.data} context={ctx} />
    case 'balance':
      return <BalanceCard data={card.data} context={ctx} />
    case 'community':
      return <CommunityCard data={card.data} context={ctx} />
    case 'detachment':
      return <DetachmentCard data={card.data} context={ctx} />
  }
}

/**
 * Adapter from a graph-data BrainNode shape to the ResultNode shape that
 * `resolveCardView` expects. Brain graph-data returns a lightweight projection
 * of each Node — when a card needs more (weapons/abilities for units,
 * stratagems/enhancements for detachments), the floating panel fires a
 * follow-up `/browse/unit/:id` or `/browse/detachment/:id` request and
 * merges the result in.
 */
function brainNodeToResultNode(data: BrainNodeData, extra?: Partial<ResultNode>): ResultNode {
  return {
    id: data.nodeId,
    score: 0,
    title: data.fullTitle || data.label,
    summary: data.summary ?? '',
    content: data.content ?? '',
    layer: data.layer,
    category: data.category,
    factionId: data.factionId,
    sources: [],
    keywords: [],
    ...extra,
  }
}

export function ForceGraph({ edition }: ForceGraphProps = {}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [rfNodes, setRfNodes] = useState<RFNode[]>([])
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<BrainNodeData | null>(null)
  // The hydrated card data for the floating panel. resolveCardView runs
  // synchronously off the light BrainNodeData; detachment/unit cards then
  // get enriched async via /browse routes so stratagems + weapons fill in.
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null)
  const graphState = useRef<GraphState | null>(null)
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set())

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

        const { nodes, edges } = layoutFromState(state, categoryFilters)
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
    [edition, categoryFilters],
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

      const { nodes, edges } = layoutFromState(state, categoryFilters)
      setRfNodes(nodes)
      setRfEdges(edges)
      setSelectedNode(null)
    },
    [edition, categoryFilters],
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
  const prevFiltersRef = useRef({ categoryFilters })
  if (prevFiltersRef.current.categoryFilters !== categoryFilters) {
    prevFiltersRef.current = { categoryFilters }
    if (graphState.current) {
      const { nodes, edges } = layoutFromState(graphState.current, categoryFilters)
      setRfNodes(nodes)
      setRfEdges(edges)
    }
  }

  // Whenever the selected node changes, hydrate the card via resolveCardView
  // and then fire any follow-up fetches needed for full data (weapons for
  // units, stratagems/enhancements for detachments).
  useEffect(() => {
    if (!selectedNode) {
      setSelectedCard(null)
      return
    }
    const resultNode = brainNodeToResultNode(selectedNode)
    const { card } = resolveCardView(resultNode)
    setSelectedCard(card)

    let cancelled = false
    async function hydrate() {
      if (!selectedNode) return
      try {
        if (selectedNode.category === 'datasheet') {
          const res = await brainFetch(`/browse/unit/${encodeURIComponent(selectedNode.nodeId)}`, {
            edition,
          })
          if (!res.ok || cancelled) return
          const body = (await res.json()) as {
            datasheet?: { content?: string; title?: string }
            weapons?: Array<any>
            abilities?: Array<any>
          }
          if (cancelled) return
          // Re-resolve with the full content so card-display extractors fire.
          const enrichedNode = brainNodeToResultNode(selectedNode, {
            content: body.datasheet?.content ?? selectedNode.content ?? '',
          })
          const { card: enriched } = resolveCardView(enrichedNode)
          setSelectedCard(enriched)
        } else if (
          selectedNode.category === 'detachment-rule' ||
          selectedNode.category === 'detachment'
        ) {
          const res = await brainFetch(
            `/browse/detachment/${encodeURIComponent(selectedNode.nodeId)}`,
            { edition },
          )
          if (!res.ok || cancelled) return
          const body = (await res.json()) as {
            detachment?: any
            stratagems?: any[]
            enhancements?: any[]
          }
          if (cancelled) return
          const enrichedNode = brainNodeToResultNode(selectedNode, {
            content: body.detachment?.content ?? selectedNode.content ?? '',
            dp: body.detachment?.dp,
            forceDisposition: body.detachment?.forceDisposition,
            sources: body.detachment?.sources ?? [],
          })
          const { card: enriched } = resolveCardView(enrichedNode)
          // No need to fully build the strat/enh sub-cards here — graph
          // selection is a peek, not a full record view. The top-level
          // card is enough; navigation via Focus drills into them.
          setSelectedCard(enriched)
        }
      } catch {
        // best-effort; the basic card is already shown
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [selectedNode, edition])

  const onNodeClick = useCallback((_: any, node: RFNode) => {
    const data = node.data as unknown as BrainNodeData
    setSelectedNode(data)
  }, [])

  function clearResults() {
    setRfNodes([])
    setRfEdges([])
    setSelectedNode(null)
    setSelectedCard(null)
    graphState.current = null
  }

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
        {rfNodes.length > 0 && (
          <button
            onClick={clearResults}
            data-testid="graph-clear-results"
            className="text-xs text-slate-400 hover:text-slate-200 underline self-center"
          >
            Clear results
          </button>
        )}
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
          {edition && edition !== 'any' && (
            <>
              <span className="text-slate-700 mx-1">|</span>
              <span
                data-testid="forcegraph-edition-chip"
                className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/50 text-slate-400"
                title="Edition is set via the picker in the header"
              >
                Edition: {edition}
              </span>
            </>
          )}
          {categoryFilters.size > 0 && (
            <button
              onClick={() => setCategoryFilters(new Set())}
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

        {/* Floating detail panel — renders the real card component for the
            selected node via resolveCardView. The light BrainNodeData gets
            adapted to ResultNode and routed through the same display layer
            the search overlay uses. */}
        {selectedNode && (
          <div
            data-testid="forcegraph-selected-card"
            className="absolute top-3 right-3 w-[420px] max-w-[90vw] max-h-[90vh] overflow-y-auto bg-slate-900/95 backdrop-blur border border-slate-700 rounded-lg shadow-xl z-10"
          >
            <div className="flex items-start justify-between p-2 border-b border-slate-800 sticky top-0 bg-slate-900/95">
              <div className="flex flex-wrap gap-1">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded text-white"
                  style={{ backgroundColor: LAYER_COLORS[selectedNode.layer] || '#475569' }}
                >
                  {selectedNode.layer}
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                  {selectedNode.category}
                </span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-500 hover:text-slate-300 text-lg leading-none shrink-0"
              >
                &times;
              </button>
            </div>
            <div className="p-2">
              {selectedCard ? (
                <ForceGraphCard card={selectedCard} />
              ) : (
                <p className="text-xs text-slate-400 p-3">Loading…</p>
              )}
              {selectedNode.nodeId && !selectedNode.isCenter && (
                <button
                  onClick={() => refocusOnNode(selectedNode.nodeId)}
                  className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline px-2"
                >
                  Focus on this node &rarr;
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
