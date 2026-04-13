declare const __APP_VERSION__: string

import { useState, useEffect } from 'react'
import { ForceGraph } from '../components/ForceGraph'
import { ResultCard } from '../components/ResultCard'
import { FactionBanner } from '../components/FactionBanner'

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

// ── Shared result type ───────────────────────────────────────────────────────

interface ResultNode {
  id: string
  score: number
  title: string
  summary: string
  content: string
  layer: string
  category: string
  factionId?: string
  subfaction?: string
  phase?: string
  parentUnit?: string
  sources: any[]
  keywords: string[]
}

interface DetectedFactions {
  factions: string[]
  subfaction?: string
  strippedQuery: string
  keywords: string[]
}

// ── AskTab ───────────────────────────────────────────────────────────────────

interface QASource {
  id: string
  title: string
  layer: string
  category: string
  sources?: any[]
}

interface QAResponse {
  detected: DetectedFactions
  answer: string
  reference: ResultNode[]
  sources: QASource[]
  connectedCount: number
}

function AskTab() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<QAResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [factionFilter, setFactionFilter] = useState(true)

  async function handleAsk() {
    if (!question.trim()) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    setFactionFilter(true)

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
          {answer.detected?.factions?.length > 0 && (
            <FactionBanner
              factions={answer.detected.factions}
              subfaction={answer.detected.subfaction}
              onDismiss={() => setFactionFilter(false)}
            />
          )}

          <div className="bg-slate-900 border border-slate-700 rounded p-4 overflow-auto max-h-[70vh]">
            <div
              className="max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(answer.answer) }}
            />
          </div>

          {answer.reference && answer.reference.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-400 uppercase mb-2">Reference</h4>
              {answer.reference.map((r, i) => (
                <ResultCard
                  key={r.id}
                  index={i + 1}
                  title={r.title}
                  summary={r.summary}
                  layer={r.layer}
                  category={r.category}
                  score={r.score}
                  factionId={r.factionId}
                  subfaction={r.subfaction}
                  phase={r.phase}
                  parentUnit={r.parentUnit}
                />
              ))}
            </div>
          )}

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

// ── SearchTab ────────────────────────────────────────────────────────────────

interface SearchResponse {
  detected: DetectedFactions
  results: ResultNode[]
}

function SearchTab() {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [factionFilter, setFactionFilter] = useState(true)
  const [selectedResult, setSelectedResult] = useState<ResultNode | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
    setFactionFilter(true)
    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 20 }),
      })
      const data = await res.json()
      setResponse(data)
    } catch {
      setResponse(null)
    } finally {
      setLoading(false)
    }
  }

  const detected = response?.detected
  const allResults = response?.results ?? []

  const filteredResults = factionFilter && detected && detected.factions.length > 0
    ? allResults.filter(r => r.factionId && detected.factions.includes(r.factionId))
    : allResults

  // Cap displayed results to prevent browser hang on faction browse (3000+ nodes)
  const MAX_DISPLAY = 100
  const visibleResults = filteredResults.slice(0, MAX_DISPLAY)
  const totalCount = filteredResults.length

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

      {factionFilter && detected && detected.factions.length > 0 && (
        <FactionBanner
          factions={detected.factions}
          subfaction={detected.subfaction}
          onDismiss={() => setFactionFilter(false)}
        />
      )}

      {selectedResult && (
        <NodeDetailModal node={selectedResult} onClose={() => setSelectedResult(null)} />
      )}

      {visibleResults.length > 0 && (
        <div className="space-y-2">
          {visibleResults.map((r, i) => (
            <button
              key={r.id + '-' + i}
              onClick={() => setSelectedResult(r)}
              className="w-full text-left"
            >
              <ResultCard
                index={i + 1}
                title={r.title}
                summary={r.summary}
                layer={r.layer}
                category={r.category}
                score={r.score}
                factionId={r.factionId}
                subfaction={r.subfaction}
                phase={r.phase}
                parentUnit={r.parentUnit}
              />
            </button>
          ))}
          {totalCount > MAX_DISPLAY && (
            <p className="text-xs text-slate-500 text-center py-2">
              Showing {MAX_DISPLAY} of {totalCount} results
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── BrowseTab ───────────────────────────────────────────────────────────────

interface BrowseLayer {
  id: string
  label: string
  count: number
}

function BrowseTab() {
  const [layers, setLayers] = useState<BrowseLayer[]>([])
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const [nodes, setNodes] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [selectedNode, setSelectedNode] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [layersLoading, setLayersLoading] = useState(true)

  // Load layers on mount
  useEffect(() => {
    fetch(`${API_BASE}/browse/layers`)
      .then(r => r.json())
      .then(data => { setLayers(data.layers || []); setLayersLoading(false) })
      .catch(() => setLayersLoading(false))
  }, [])

  // Load nodes when layer selected
  useEffect(() => {
    if (!selectedLayer) { setNodes([]); return }
    setLoading(true)
    setSelectedNode(null)
    fetch(`${API_BASE}/browse/nodes?layer=${selectedLayer}&limit=100`)
      .then(r => r.json())
      .then(data => { setNodes(data.nodes || []); setTotalCount(data.total || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedLayer])

  // Load full node detail
  function viewNode(nodeId: string) {
    fetch(`${API_BASE}/browse/node/${encodeURIComponent(nodeId)}`)
      .then(r => r.json())
      .then(data => { if (data.node) setSelectedNode(data.node) })
      .catch(() => {})
  }

  return (
    <div className="flex">
      <aside className="w-48 border-r border-slate-800 p-4 shrink-0">
        <nav className="space-y-1">
          {layersLoading && <p className="text-xs text-slate-500">Loading...</p>}
          {layers.map(layer => (
            <button
              key={layer.id}
              onClick={() => setSelectedLayer(layer.id)}
              className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors ${
                selectedLayer === layer.id
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {layer.label} <span className="text-xs opacity-60">({layer.count})</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 p-4 max-w-4xl">
        {selectedNode ? (
          <div className="space-y-4">
            <button
              onClick={() => setSelectedNode(null)}
              className="text-sm text-amber-400 hover:underline"
            >
              &larr; Back to list
            </button>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded text-xs font-medium text-white bg-slate-600">
                  {selectedNode.layer}
                </span>
                <span className="text-xs text-slate-400">{selectedNode.category}</span>
                {selectedNode.factionId && <span className="text-xs text-slate-400">{selectedNode.factionId}</span>}
                {selectedNode.subfaction && <span className="text-xs text-amber-400">{selectedNode.subfaction}</span>}
                {selectedNode.phase && <span className="text-xs text-slate-500">({selectedNode.phase})</span>}
              </div>
              <h2 className="text-lg font-bold text-slate-100 mb-3">{selectedNode.title}</h2>
              <div
                className="text-sm text-slate-300 mb-3"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedNode.content || selectedNode.summary) }}
              />
              {selectedNode.sources?.length > 0 && (
                <div className="border-t border-slate-800 pt-2 mt-2">
                  <p className="text-xs text-slate-500">
                    Sources: {selectedNode.sources.map((s: any) => `${s.title}${s.page ? ` p.${s.page}` : ''}`).join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {!selectedLayer && (
              <p className="text-slate-400">Select a layer to browse rules.</p>
            )}
            {loading && <p className="text-slate-400">Loading...</p>}
            {!loading && selectedLayer && nodes.length === 0 && (
              <p className="text-slate-400">No nodes in this layer.</p>
            )}
            {nodes.length > 0 && (
              <>
                <p className="text-xs text-slate-500">
                  Showing {nodes.length} of {totalCount} nodes
                </p>
                {nodes.map((node: any) => (
                  <button
                    key={node.id}
                    onClick={() => viewNode(node.id)}
                    className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{node.category}</span>
                      {node.factionId && <span className="text-xs text-slate-500">{node.factionId}</span>}
                      {node.subfaction && <span className="text-xs text-amber-400">{node.subfaction}</span>}
                    </div>
                    <h3 className="text-sm font-medium text-slate-200">{node.title}</h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{node.summary}</p>
                  </button>
                ))}
                {totalCount > nodes.length && (
                  <p className="text-xs text-slate-500 text-center py-2">
                    Showing {nodes.length} of {totalCount}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── SearchTab result detail ─────────────────────────────────────────────────

function NodeDetailModal({ node, onClose }: { node: ResultNode; onClose: () => void }) {
  return (
    <div className="bg-slate-900 border border-amber-500/30 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{node.category}</span>
          {node.factionId && <span className="text-xs text-slate-400">{node.factionId}</span>}
          {node.subfaction && <span className="text-xs text-amber-400">{node.subfaction}</span>}
        </div>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">&times; Close</button>
      </div>
      <h2 className="text-lg font-bold text-slate-100 mb-2">{node.title}</h2>
      {node.parentUnit && <p className="text-xs text-slate-400 italic mb-2">on {node.parentUnit}</p>}
      <div
        className="text-sm text-slate-300"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(node.content || node.summary) }}
      />
    </div>
  )
}

// ── BrainScreen ──────────────────────────────────────────────────────────────

export function BrainScreen() {
  const [tab, setTab] = useState<'ask' | 'search' | 'browse' | 'graph'>('ask')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold text-amber-400">40K Brain</h1>
            <span className="text-xs text-slate-600" data-testid="app-version">{__APP_VERSION__}</span>
          </div>
          <div className="flex gap-1">
            {(['ask', 'search', 'browse', 'graph'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm rounded ${
                  tab === t
                    ? 'bg-amber-500 text-slate-950 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'ask' ? 'Ask' : t === 'search' ? 'Search' : t === 'browse' ? 'Browse' : 'Graph'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-4xl mx-auto">
        {tab === 'ask' && <AskTab />}
        {tab === 'search' && <SearchTab />}
        {tab === 'graph' && <ForceGraph />}
      </main>
      {tab === 'browse' && <BrowseTab />}
    </div>
  )
}
