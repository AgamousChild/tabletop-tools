import { useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeTypes,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const API_BASE = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'

// ── Layer colors ────────────────────────────────────────────────────────────

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

// ── Custom Node ─────────────────────────────────────────────────────────────

interface BrainNodeData {
  label: string
  layer: string
  category: string
  factionId?: string
  subfaction?: string
  summary?: string
  isCenter?: boolean
}

function BrainNode({ data }: { data: BrainNodeData }) {
  const bg = LAYER_BG[data.layer] || 'bg-slate-800/50 border-slate-600/50'
  const borderWidth = data.isCenter ? 'border-2' : 'border'

  return (
    <div className={`rounded-lg ${borderWidth} ${bg} px-3 py-2 min-w-[160px] max-w-[280px]`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: LAYER_COLORS[data.layer] || '#94a3b8' }}
        />
        <span className="text-[10px] text-slate-500">{data.category}</span>
        {data.subfaction && (
          <span className="text-[10px] text-amber-400">{data.subfaction}</span>
        )}
      </div>
      <p className="text-xs font-medium text-slate-200 leading-tight">{data.label}</p>
      {data.summary && (
        <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{data.summary}</p>
      )}
      {data.factionId && (
        <span className="text-[10px] text-slate-600 mt-1 block">{data.factionId}</span>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes: NodeTypes = { brain: BrainNode as any }

// ── Layout ──────────────────────────────────────────────────────────────────

function layoutNodes(
  centerNode: any,
  connectedNodes: any[],
  edges: any[],
): { nodes: RFNode[]; edges: RFEdge[] } {
  const nodes: RFNode[] = []
  const rfEdges: RFEdge[] = []

  // Center node
  nodes.push({
    id: centerNode.id,
    type: 'brain',
    position: { x: 400, y: 300 },
    data: {
      label: centerNode.title?.substring(0, 40) || centerNode.id,
      layer: centerNode.layer || 'core',
      category: centerNode.category || '',
      factionId: centerNode.factionId,
      subfaction: centerNode.subfaction,
      summary: centerNode.summary?.substring(0, 80),
      isCenter: true,
    },
  })

  // Group connected nodes by category for layout
  const groups: Record<string, any[]> = {}
  for (const n of connectedNodes) {
    const cat = n.category || 'other'
    if (!groups[cat]) groups[cat] = []
    groups[cat]!.push(n)
  }

  // Radial layout per group
  const groupKeys = Object.keys(groups)
  const angleStep = (2 * Math.PI) / Math.max(groupKeys.length, 1)
  let groupIdx = 0

  for (const [, groupNodes] of Object.entries(groups)) {
    const baseAngle = groupIdx * angleStep - Math.PI / 2
    const radius = 250 + groupNodes.length * 10

    for (let i = 0; i < Math.min(groupNodes.length, 12); i++) {
      const n = groupNodes[i]!
      const spread = Math.min(0.4, Math.PI / Math.max(groupNodes.length, 2))
      const angle = baseAngle + (i - groupNodes.length / 2) * spread
      const x = 400 + radius * Math.cos(angle)
      const y = 300 + radius * Math.sin(angle)

      nodes.push({
        id: n.id,
        type: 'brain',
        position: { x, y },
        data: {
          label: n.title?.substring(0, 40) || n.id,
          layer: n.layer || 'core',
          category: n.category || '',
          factionId: n.factionId,
          subfaction: n.subfaction,
          summary: n.summary?.substring(0, 80),
        },
      })
    }

    // Show count if truncated
    if (groupNodes.length > 12) {
      nodes.push({
        id: `overflow-${groupIdx}`,
        type: 'brain',
        position: {
          x: 400 + (radius + 60) * Math.cos(baseAngle),
          y: 300 + (radius + 60) * Math.sin(baseAngle),
        },
        data: {
          label: `+${groupNodes.length - 12} more`,
          layer: groupNodes[0]?.layer || 'core',
          category: groupNodes[0]?.category || '',
        },
      })
    }

    groupIdx++
  }

  // Edges
  const nodeIdSet = new Set(nodes.map(n => n.id))
  for (const e of edges) {
    const src = e.source || e.sourceId
    const tgt = e.target || e.targetId
    if (nodeIdSet.has(src) && nodeIdSet.has(tgt)) {
      rfEdges.push({
        id: `${src}-${tgt}-${e.rel || 'ref'}`,
        source: src,
        target: tgt,
        label: e.rel,
        style: { stroke: '#475569' },
        labelStyle: { fill: '#64748b', fontSize: 9 },
      })
    }
  }

  return { nodes, edges: rfEdges }
}

// ── Component ───────────────────────────────────────────────────────────────

export function ForceGraph() {
  const [searchQuery, setSearchQuery] = useState('')
  const [rfNodes, setRfNodes] = useState<RFNode[]>([])
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<any | null>(null)

  const search = useCallback(async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    setSelectedNode(null)

    try {
      const res = await fetch(`${API_BASE}/graph-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 10 }),
      })

      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      const allNodes = data.nodes || []
      const allEdges = data.edges || []

      if (allNodes.length === 0) {
        setRfNodes([])
        setRfEdges([])
        setLoading(false)
        return
      }

      // First node is the center
      const center = allNodes[0]
      const connected = allNodes.slice(1)
      const { nodes, edges } = layoutNodes(center, connected, allEdges)
      setRfNodes(nodes)
      setRfEdges(edges)
    } catch {
      setRfNodes([])
      setRfEdges([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  const onNodeClick = useCallback((_: any, node: RFNode) => {
    setSelectedNode(node.data)
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search to visualize graph..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder-slate-500"
        />
        <button
          onClick={search}
          disabled={loading}
          className="bg-amber-500 text-slate-950 px-4 py-2 rounded font-medium hover:bg-amber-400 disabled:opacity-50"
        >
          {loading ? '...' : 'Visualize'}
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(LAYER_COLORS).map(([layer, color]) => (
          <span key={layer} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            {layer}
          </span>
        ))}
      </div>

      {/* Graph */}
      <div className="flex gap-3">
        <div
          className="flex-1 bg-slate-950 border border-slate-800 rounded overflow-hidden"
          style={{ height: '550px' }}
        >
          {rfNodes.length > 0 ? (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
              minZoom={0.3}
              maxZoom={2}
              defaultEdgeOptions={{ animated: false }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1e293b" gap={20} />
              <Controls className="!bg-slate-800 !border-slate-700 !shadow-none [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-300" />
              <MiniMap
                nodeColor={(n) => LAYER_COLORS[(n.data as any)?.layer] || '#94a3b8'}
                maskColor="rgba(15, 23, 42, 0.8)"
                className="!bg-slate-900 !border-slate-800"
              />
            </ReactFlow>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              {loading ? 'Loading...' : 'Search to visualize the knowledge graph'}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div className="w-72 bg-slate-900 border border-slate-700 rounded p-3 self-start shrink-0">
            <h3 className="text-sm font-bold text-amber-400 mb-2">
              {(selectedNode as BrainNodeData).label}
            </h3>
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded">
                {(selectedNode as BrainNodeData).layer}
              </span>
              <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded">
                {(selectedNode as BrainNodeData).category}
              </span>
              {(selectedNode as BrainNodeData).factionId && (
                <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded">
                  {(selectedNode as BrainNodeData).factionId}
                </span>
              )}
              {(selectedNode as BrainNodeData).subfaction && (
                <span className="text-xs bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded">
                  {(selectedNode as BrainNodeData).subfaction}
                </span>
              )}
            </div>
            {(selectedNode as BrainNodeData).summary && (
              <p className="text-xs text-slate-300">
                {(selectedNode as BrainNodeData).summary}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
