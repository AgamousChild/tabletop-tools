import { useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

const API_BASE = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'

interface GraphNode {
  id: string
  label: string
  layer: string
  category: string
  factionId?: string
  summary?: string
  relevance?: number
  // force-graph internals
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
}

interface GraphEdge {
  source: string
  target: string
  rel?: string
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphEdge[]
}

interface NodeDetails {
  id: string
  title: string
  layer: string
  category: string
  factionId?: string
  summary?: string
}

const LAYER_COLORS: Record<string, string> = {
  core: '#f59e0b',      // amber
  faction: '#3b82f6',   // blue
  unit: '#10b981',      // green
  errata: '#ef4444',    // red
  balance: '#a855f7',   // purple
  community: '#06b6d4', // cyan
}

function nodeColor(node: GraphNode): string {
  return LAYER_COLORS[node.layer] ?? '#94a3b8'
}

function nodeSize(node: GraphNode): number {
  const relevance = node.relevance ?? 0
  return relevance > 0.7 ? 6 : 4
}

export function ForceGraph() {
  const [searchQuery, setSearchQuery] = useState('')
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] })
  const [selectedNode, setSelectedNode] = useState<NodeDetails | null>(null)
  const [loading, setLoading] = useState(false)

  async function visualize() {
    if (!searchQuery.trim()) return
    setLoading(true)
    setSelectedNode(null)

    try {
      // Try /graph-data first (Task 6 endpoint)
      const graphRes = await fetch(`${API_BASE}/graph-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      })

      if (graphRes.ok) {
        const data = await graphRes.json()
        setGraphData({
          nodes: (data.nodes ?? []).map((n: any) => ({
            id: n.id,
            label: n.title?.substring(0, 30) ?? n.id,
            layer: n.layer ?? 'core',
            category: n.category ?? '',
            factionId: n.factionId,
            summary: n.summary,
            relevance: n.relevance ?? 0,
          })),
          links: (data.edges ?? []).map((e: any) => ({
            source: e.sourceId ?? e.source,
            target: e.targetId ?? e.target,
            rel: e.rel,
          })),
        })
        return
      }
    } catch {
      // fall through to search fallback
    }

    // Fallback: /search with no edges
    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 20 }),
      })
      const data = await res.json()
      const results = data.results ?? []

      setGraphData({
        nodes: results.map((r: any) => ({
          id: r.id,
          label: r.title?.substring(0, 30) ?? r.id,
          layer: r.layer ?? 'core',
          category: r.category ?? '',
          factionId: r.factionId,
          summary: r.summary,
          relevance: r.score ?? 0,
        })),
        links: [],
      })
    } catch (err) {
      console.error('Graph search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleNodeClick(node: GraphNode) {
    setSelectedNode({
      id: node.id,
      title: node.label,
      layer: node.layer,
      category: node.category,
      factionId: node.factionId,
      summary: node.summary,
    })
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search to visualize graph..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && visualize()}
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder-slate-500"
        />
        <button
          onClick={visualize}
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

      {/* Graph + side panel */}
      <div className="flex gap-3">
        <div
          className="flex-1 bg-slate-950 border border-slate-800 rounded overflow-hidden"
          style={{ height: '500px' }}
        >
          <ForceGraph2D
            graphData={graphData}
            backgroundColor="#0f172a"
            nodeColor={nodeColor}
            nodeRelSize={nodeSize as any}
            nodeLabel={(node) => (node as GraphNode).label}
            linkColor={() => '#475569'}
            onNodeClick={(node) => handleNodeClick(node as GraphNode)}
            width={undefined}
            height={500}
          />
        </div>

        {/* Side panel */}
        {selectedNode && (
          <div className="w-64 bg-slate-900 border border-slate-700 rounded p-3 self-start">
            <h3 className="text-sm font-bold text-amber-400 mb-2">{selectedNode.title}</h3>
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded">{selectedNode.layer}</span>
              <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded">{selectedNode.category}</span>
              {selectedNode.factionId && (
                <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded">{selectedNode.factionId}</span>
              )}
            </div>
            {selectedNode.summary && (
              <p className="text-xs text-slate-300">{selectedNode.summary}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
