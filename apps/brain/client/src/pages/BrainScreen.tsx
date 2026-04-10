import { useState } from 'react'
import { LayerNav } from '../components/LayerNav'
import { NodeCard } from '../components/NodeCard'
import { RefList } from '../components/RefList'
import { useNode, useNodesByLayer, useNodeSearch, useNodeRefs } from '../lib/hooks'
import type { BrainNode } from '../lib/store'

export function BrainScreen() {
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: layerNodes, isLoading: layerLoading } = useNodesByLayer(selectedLayer || '')
  const { data: searchResults } = useNodeSearch(searchQuery)
  const { data: selectedNode } = useNode(selectedNodeId || '')
  const { data: nodeRefs } = useNodeRefs(selectedNodeId || '')

  const displayNodes = searchQuery ? searchResults : (selectedLayer ? layerNodes : [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-amber-400">40K Brain</h1>
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 w-64"
          />
        </div>
      </header>

      <div className="flex">
        <aside className="w-48 border-r border-slate-800 p-4">
          <LayerNav selectedLayer={selectedLayer} onLayerSelect={setSelectedLayer} />
        </aside>

        <main className="flex-1 p-4">
          {selectedNode ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-sm text-amber-400 hover:underline"
              >
                &larr; Back to list
              </button>
              <NodeCard node={selectedNode} />
              <div className="mt-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Connections</h3>
                <RefList
                  refs={[...nodeRefs.from, ...nodeRefs.to]}
                  onNodeClick={setSelectedNodeId}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {!selectedLayer && !searchQuery && (
                <p className="text-slate-400">Select a layer or search to browse rules.</p>
              )}
              {layerLoading && selectedLayer && !searchQuery && (
                <p className="text-slate-400">Loading...</p>
              )}
              {displayNodes.map((node: BrainNode) => (
                <button
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className="w-full text-left"
                >
                  <NodeCard node={node} />
                </button>
              ))}
              {selectedLayer && !layerLoading && !searchQuery && displayNodes.length === 0 && (
                <p className="text-slate-400">No nodes found. Sync brain data first.</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
