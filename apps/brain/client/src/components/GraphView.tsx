import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'

const API_BASE = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'

interface GraphNode {
  id: string
  title: string
  layer: string
  category: string
  factionId?: string
  summary?: string
}

interface GraphRef {
  sourceId: string
  targetId: string
  rel: string
  context: string
}

const LAYER_COLORS: Record<string, string> = {
  core: '#f59e0b',      // amber
  faction: '#3b82f6',   // blue
  unit: '#10b981',      // green
  errata: '#ef4444',    // red
  balance: '#a855f7',   // purple
  community: '#06b6d4', // cyan
}

const CATEGORY_SHAPES: Record<string, cytoscape.Css.NodeShape> = {
  datasheet: 'rectangle',
  weapon: 'diamond',
  'unit-ability': 'ellipse',
  'faction-ability': 'hexagon',
  stratagem: 'star',
  enhancement: 'tag',
  'detachment-rule': 'barrel',
  'core-mechanic': 'round-rectangle',
  'phase-sequence': 'round-rectangle',
}

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'background-color': 'data(color)',
            shape: 'data(shape)' as any,
            width: 'data(size)',
            height: 'data(size)',
            'font-size': '10px',
            color: '#e2e8f0',
            'text-outline-color': '#0f172a',
            'text-outline-width': 2,
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-max-width': '100px',
            'text-wrap': 'ellipsis',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#475569',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': '8px',
            color: '#64748b',
            'text-outline-color': '#0f172a',
            'text-outline-width': 1,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#fbbf24',
          },
        },
      ],
      layout: { name: 'cose', animate: false },
      minZoom: 0.1,
      maxZoom: 5,
    })

    cy.on('tap', 'node', (evt) => {
      const node = evt.target
      setSelectedNode({
        id: node.data('id'),
        title: node.data('label'),
        layer: node.data('layer'),
        category: node.data('category'),
        factionId: node.data('factionId'),
        summary: node.data('summary'),
      })
    })

    cy.on('tap', (evt) => {
      if (evt.target === cy) setSelectedNode(null)
    })

    cyRef.current = cy

    return () => { cy.destroy() }
  }, [])

  async function searchAndVisualize() {
    if (!searchQuery.trim() || !cyRef.current) return
    setLoading(true)

    try {
      // Search for nodes
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 20 }),
      })
      const data = await res.json()
      const results = data.results || []

      if (results.length === 0) {
        setLoading(false)
        return
      }

      const cy = cyRef.current
      cy.elements().remove()

      // Add result nodes
      for (const r of results) {
        cy.add({
          group: 'nodes',
          data: {
            id: r.id,
            label: r.title?.substring(0, 30) || r.id,
            color: LAYER_COLORS[r.layer] || '#94a3b8',
            shape: CATEGORY_SHAPES[r.category] || 'ellipse',
            size: r.score > 0.7 ? 40 : 30,
            layer: r.layer,
            category: r.category,
            factionId: r.factionId,
            summary: r.summary,
          },
        })
      }

      // Fetch connected nodes for the top result via the ask endpoint's graph
      const topId = results[0]?.id
      if (topId) {
        try {
          const refRes = await fetch(`${API_BASE}/data/refs/forward-index.json`)
          if (refRes.ok) {
            const fwdIndex = await refRes.json() as Record<string, Array<{ targetId: string; rel: string }>>
            const revRes = await fetch(`${API_BASE}/data/refs/reverse-index.json`)
            const revIndex = revRes.ok
              ? await revRes.json() as Record<string, Array<{ sourceId: string; rel: string }>>
              : {}

            const resultIds = new Set(results.map((r: any) => r.id))

            // Add forward refs between existing nodes
            for (const r of results) {
              const fwd = fwdIndex[r.id]
              if (fwd) {
                for (const ref of fwd.slice(0, 5)) {
                  if (resultIds.has(ref.targetId)) {
                    cy.add({
                      group: 'edges',
                      data: {
                        source: r.id,
                        target: ref.targetId,
                        label: ref.rel,
                      },
                    })
                  }
                }
              }

              // Add reverse refs
              const rev = (revIndex as any)[r.id]
              if (rev) {
                for (const ref of rev.slice(0, 3)) {
                  if (resultIds.has(ref.sourceId)) {
                    cy.add({
                      group: 'edges',
                      data: {
                        source: ref.sourceId,
                        target: r.id,
                        label: ref.rel,
                      },
                    })
                  }
                }
              }
            }
          }
        } catch {
          // Refs not available — show nodes without edges
        }
      }

      cy.layout({ name: 'cose', animate: true, animationDuration: 500 }).run()
    } catch (err) {
      console.error('Graph search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  async function expandNode(nodeId: string) {
    if (!cyRef.current) return
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: selectedNode?.title || nodeId, limit: 10 }),
      })
      const data = await res.json()
      const cy = cyRef.current

      for (const r of (data.results || [])) {
        if (!cy.getElementById(r.id).length) {
          cy.add({
            group: 'nodes',
            data: {
              id: r.id,
              label: r.title?.substring(0, 30) || r.id,
              color: LAYER_COLORS[r.layer] || '#94a3b8',
              shape: CATEGORY_SHAPES[r.category] || 'ellipse',
              size: 25,
              layer: r.layer,
              category: r.category,
              factionId: r.factionId,
              summary: r.summary,
            },
          })
        }
      }

      cy.layout({ name: 'cose', animate: true, animationDuration: 300 }).run()
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search to visualize graph..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchAndVisualize()}
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder-slate-500"
        />
        <button
          onClick={searchAndVisualize}
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

      {/* Graph container */}
      <div
        ref={containerRef}
        className="w-full bg-slate-950 border border-slate-800 rounded"
        style={{ height: '500px' }}
      />

      {/* Selected node info */}
      {selectedNode && (
        <div className="bg-slate-900 border border-slate-700 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-amber-400">{selectedNode.title}</h3>
            <button
              onClick={() => expandNode(selectedNode.id)}
              className="text-xs bg-slate-800 px-2 py-1 rounded hover:bg-slate-700"
            >
              Expand
            </button>
          </div>
          <div className="flex gap-2 text-xs text-slate-400 mb-2">
            <span className="bg-slate-800 px-1.5 py-0.5 rounded">{selectedNode.layer}</span>
            <span className="bg-slate-800 px-1.5 py-0.5 rounded">{selectedNode.category}</span>
            {selectedNode.factionId && (
              <span className="bg-slate-800 px-1.5 py-0.5 rounded">{selectedNode.factionId}</span>
            )}
          </div>
          {selectedNode.summary && (
            <p className="text-xs text-slate-300">{selectedNode.summary}</p>
          )}
        </div>
      )}
    </div>
  )
}
