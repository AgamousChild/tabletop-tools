import { useState, useCallback } from 'react'
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
  summary?: string
  content?: string
  isCenter?: boolean
  nodeId: string
}

function BrainNode({ data }: { data: BrainNodeData }) {
  const bg = LAYER_BG[data.layer] || 'bg-slate-800/50 border-slate-600/50'
  const borderWidth = data.isCenter ? 'border-2 ring-1 ring-amber-500/30' : 'border'

  return (
    <div className={`rounded-lg ${borderWidth} ${bg} px-3 py-2 min-w-[180px] max-w-[260px] cursor-pointer hover:brightness-125 transition-all`}>
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

function layoutNodes(
  centerNode: any,
  connectedNodes: any[],
  edges: any[],
): { nodes: RFNode[]; edges: RFEdge[] } {
  const nodes: RFNode[] = []
  const rfEdges: RFEdge[] = []

  const cx = 0
  const cy = 0

  nodes.push({
    id: centerNode.id,
    type: 'brain',
    position: { x: cx, y: cy },
    data: {
      label: centerNode.title?.substring(0, 50) || centerNode.id,
      fullTitle: centerNode.title || centerNode.id,
      layer: centerNode.layer || 'core',
      category: centerNode.category || '',
      factionId: centerNode.factionId,
      subfaction: centerNode.subfaction,
      summary: centerNode.summary,
      content: centerNode.content,
      isCenter: true,
      nodeId: centerNode.id,
    },
  })

  // Group by category
  const groups: Record<string, any[]> = {}
  for (const n of connectedNodes) {
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
    const maxShow = 10

    for (let i = 0; i < Math.min(groupNodes.length, maxShow); i++) {
      const n = groupNodes[i]!
      const spread = Math.min(0.5, Math.PI / Math.max(groupNodes.length, 2))
      const angle = baseAngle + (i - Math.min(groupNodes.length, maxShow) / 2) * spread
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)

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
          summary: n.summary,
          content: n.content,
          nodeId: n.id,
        },
      })
    }

    if (groupNodes.length > maxShow) {
      const angle = baseAngle
      nodes.push({
        id: `more-${groupIdx}`,
        type: 'brain',
        position: { x: cx + (radius + 80) * Math.cos(angle), y: cy + (radius + 80) * Math.sin(angle) },
        data: {
          label: `+${groupNodes.length - maxShow} more ${groupNodes[0]?.category || ''}`,
          fullTitle: '',
          layer: groupNodes[0]?.layer || 'core',
          category: groupNodes[0]?.category || '',
          nodeId: '',
        },
      })
    }

    groupIdx++
  }

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

export function ForceGraph() {
  const [searchQuery, setSearchQuery] = useState('')
  const [rfNodes, setRfNodes] = useState<RFNode[]>([])
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<BrainNodeData | null>(null)

  const loadGraph = useCallback(async (query: string) => {
    if (!query.trim()) return
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/graph-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 10 }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      const allNodes = data.nodes || []
      const allEdges = data.edges || []

      if (allNodes.length === 0) {
        setRfNodes([])
        setRfEdges([])
        return
      }

      const center = allNodes[0]
      const connected = allNodes.slice(1)
      const { nodes, edges } = layoutNodes(center, connected, allEdges)
      setRfNodes(nodes)
      setRfEdges(edges)
      setSelectedNode(null)
    } catch {
      setRfNodes([])
      setRfEdges([])
    } finally {
      setLoading(false)
    }
  }, [])

  const onNodeClick = useCallback((_: any, node: RFNode) => {
    const data = node.data as unknown as BrainNodeData
    setSelectedNode(data)

    // Double-click behavior: re-center on this node
    if (data.nodeId && !data.isCenter && data.nodeId !== '') {
      loadGraph(data.fullTitle || data.label)
    }
  }, [loadGraph])

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

      {/* Graph area — full remaining height */}
      <div className="flex-1 relative">
        {rfNodes.length > 0 ? (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
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
            {loading ? 'Loading...' : 'Search to explore the knowledge graph. Click nodes to navigate.'}
          </div>
        )}

        {/* Floating detail panel */}
        {selectedNode && (
          <div className="absolute top-3 right-3 w-80 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-lg p-4 shadow-xl z-10">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-bold text-amber-400 pr-2">{selectedNode.fullTitle || selectedNode.label}</h3>
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
            {selectedNode.summary && (
              <p className="text-xs text-slate-300 mb-2">{selectedNode.summary}</p>
            )}
            {selectedNode.content && selectedNode.content !== selectedNode.summary && (
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer text-amber-400 hover:text-amber-300 mb-1">Full content</summary>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap">{selectedNode.content}</div>
              </details>
            )}
            {selectedNode.nodeId && !selectedNode.isCenter && (
              <button
                onClick={() => {
                  setSearchQuery(selectedNode.fullTitle || selectedNode.label)
                  loadGraph(selectedNode.fullTitle || selectedNode.label)
                }}
                className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline"
              >
                Explore this node &rarr;
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
