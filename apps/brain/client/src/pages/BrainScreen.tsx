import { useState, useMemo } from 'react'
import { LayerNav } from '../components/LayerNav'
import { ForceGraph } from '../components/ForceGraph'
import { NodeCard } from '../components/NodeCard'
import { RefList } from '../components/RefList'
import { useNode, useNodesByLayer, useNodeSearch, useNodeRefs } from '../lib/hooks'
import type { BrainNode } from '../lib/store'

const API_BASE = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'

/** Simple markdown to HTML — handles ##, **, -, ` */
function renderMarkdown(text: string): string {
  return text
    .split('\n')
    .map(line => {
      // Headings
      if (line.startsWith('## ')) return `<h2 class="text-lg font-bold text-amber-400 mt-4 mb-2">${line.slice(3)}</h2>`
      if (line.startsWith('### ')) return `<h3 class="text-base font-semibold text-amber-300 mt-3 mb-1">${line.slice(4)}</h3>`
      // Bullet points
      if (line.startsWith('- ')) {
        const content = line.slice(2)
          .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-100">$1</strong>')
          .replace(/\[([^\]]+)\]/g, '<span class="text-amber-400 text-xs">[$1]</span>')
        return `<div class="pl-4 py-0.5 text-sm text-slate-300 border-l border-slate-700 ml-2">${content}</div>`
      }
      // Italic line
      if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
        return `<p class="text-xs text-slate-500 italic mt-2">${line.slice(1, -1)}</p>`
      }
      // Empty line
      if (!line.trim()) return ''
      // Regular text with bold
      const formatted = line
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      return `<p class="text-sm text-slate-300 my-1">${formatted}</p>`
    })
    .join('\n')
}

interface QASource {
  id: string
  title: string
  layer: string
  category: string
}

interface QAResponse {
  answer: string
  sources: QASource[]
  connectedCount: number
}

function AskTab() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<QAResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAsk() {
    if (!question.trim()) return
    setLoading(true)
    setError(null)
    setAnswer(null)

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data = await res.json() as QAResponse
      setAnswer(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get answer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Ask a 40K rules question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder-slate-500"
        />
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="bg-amber-500 text-slate-950 px-4 py-2 rounded font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {answer && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-700 rounded p-4 overflow-auto max-h-[70vh]">
            <div
              className="max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(answer.answer) }}
            />
          </div>

          {answer.sources.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded p-3">
              <h4 className="text-xs font-medium text-slate-400 uppercase mb-2">Sources ({answer.sources.length} nodes, {answer.connectedCount} connected)</h4>
              <div className="flex flex-wrap gap-2">
                {answer.sources.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 bg-slate-800 rounded px-2 py-1 text-xs"
                  >
                    <span className="text-amber-400">{s.layer}</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-slate-300">{s.title.length > 40 ? s.title.substring(0, 37) + '...' : s.title}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!answer && !loading && !error && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-lg mb-2">Ask anything about Warhammer 40K rules</p>
          <p className="text-sm">Try: "How does wound roll work?" or "Who has sustained hits?"</p>
        </div>
      )}
    </div>
  )
}

function SearchTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; score: number; title: string; summary: string; layer: string; category: string; factionId: string }>>([])
  const [loading, setLoading] = useState(false)

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 20 }),
      })
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Semantic search across all rules..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder-slate-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="bg-amber-500 text-slate-950 px-4 py-2 rounded font-medium hover:bg-amber-400 disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.id} className="bg-slate-900 border border-slate-800 rounded p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-slate-800 text-amber-400 px-1.5 py-0.5 rounded">{r.layer}</span>
                <span className="text-xs text-slate-500">{r.category}</span>
                {r.factionId && <span className="text-xs text-slate-500">{r.factionId}</span>}
                <span className="text-xs text-slate-600 ml-auto">{(r.score * 100).toFixed(0)}%</span>
              </div>
              <h3 className="text-sm font-medium text-slate-200">{r.title}</h3>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{r.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function BrainScreen() {
  const [tab, setTab] = useState<'ask' | 'search' | 'graph' | 'browse'>('ask')
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const { data: layerNodes, isLoading: layerLoading } = useNodesByLayer(selectedLayer || '')
  const { data: selectedNode } = useNode(selectedNodeId || '')
  const { data: nodeRefs } = useNodeRefs(selectedNodeId || '')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-amber-400">40K Brain</h1>
          <div className="flex gap-1">
            {(['ask', 'search', 'graph', 'browse'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm rounded ${
                  tab === t
                    ? 'bg-amber-500 text-slate-950 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'ask' ? 'Ask' : t === 'search' ? 'Search' : t === 'graph' ? 'Graph' : 'Browse'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={tab === 'browse' ? 'flex' : ''}>
        {tab === 'browse' && (
          <aside className="w-48 border-r border-slate-800 p-4">
            <LayerNav selectedLayer={selectedLayer} onLayerSelect={setSelectedLayer} />
          </aside>
        )}

        <main className="flex-1 p-4 max-w-4xl mx-auto">
          {tab === 'ask' && <AskTab />}
          {tab === 'search' && <SearchTab />}
          {tab === 'graph' && <ForceGraph />}
          {tab === 'browse' && (
            <>
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
                  {!selectedLayer && (
                    <p className="text-slate-400">Select a layer to browse rules.</p>
                  )}
                  {layerLoading && selectedLayer && (
                    <p className="text-slate-400">Loading...</p>
                  )}
                  {(selectedLayer ? layerNodes : []).map((node: BrainNode) => (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className="w-full text-left"
                    >
                      <NodeCard node={node} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
