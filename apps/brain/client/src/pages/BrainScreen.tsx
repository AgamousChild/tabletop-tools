declare const __APP_VERSION__: string

import { useState, useEffect, useCallback } from 'react'
import { ForceGraph } from '../components/ForceGraph'
import { ResultCard } from '../components/ResultCard'
import { FactionBanner } from '../components/FactionBanner'
import { Overlay } from '../components/Overlay'
import { LinkedText } from '../components/LinkedText'
import { UnitCard } from '../components/cards/UnitCard'
import { StratagemCard } from '../components/cards/StratagemCard'
import { EnhancementCard } from '../components/cards/EnhancementCard'
import { RuleCard } from '../components/cards/RuleCard'
import type { CardData, CardContext } from '../components/cards/types'
import { type EntityMap } from '../lib/entity-linker'
import { PdfPageView } from '../components/cards/PdfPageView'
import { DetachmentPage } from './DetachmentPage'
import type { DetachmentPageProps } from './DetachmentPage'
import { deriveUnitType } from '../../../shared/derive-unit-type'

const API_BASE = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'

/** Simple markdown to HTML — handles ##, **, -, `, and brain: entity links */
function renderMarkdown(text: string, onBrainLink?: (nodeId: string) => void): string {
  // Convert [text](brain:nodeId) to clickable entity links
  const linkBrain = (s: string) =>
    s.replace(/\[([^\]]+)\]\(brain:([^)]+)\)/g,
      (_m, label, nodeId) => `<button class="text-amber-400 hover:text-amber-300 underline decoration-amber-400/30 hover:decoration-amber-400 cursor-pointer" data-brain-node="${nodeId}">${label}</button>`)

  return text
    .split('\n')
    .map(line => {
      // Headings
      if (line.startsWith('## ')) return `<h2 class="text-lg font-bold text-amber-400 mt-4 mb-2">${linkBrain(line.slice(3))}</h2>`
      if (line.startsWith('### ')) return `<h3 class="text-base font-semibold text-amber-300 mt-3 mb-1">${linkBrain(line.slice(4))}</h3>`
      // Bullet points
      if (line.startsWith('- ')) {
        const content = line.slice(2)
          .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-100">$1</strong>')
        return `<div class="pl-4 py-0.5 text-sm text-slate-300 border-l border-slate-700 ml-2">${linkBrain(content)}</div>`
      }
      // Italic line
      if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
        return `<p class="text-xs text-slate-500 italic mt-2">${linkBrain(line.slice(1, -1))}</p>`
      }
      // Empty line
      if (!line.trim()) return ''
      // Regular text with bold
      const formatted = line
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      return `<p class="text-sm text-slate-300 my-1">${linkBrain(formatted)}</p>`
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
  detachmentId?: string
  sources: any[]
  keywords: string[]
}

interface DetectedFactions {
  factions: string[]
  subfaction?: string
  strippedQuery: string
  keywords: string[]
}

// ── Card builder ─────────────────────────────────────────────────────────────

/** Parse "M6\" T4 Sv3+ W2 Ld6+ OC1" style stat line from content */
function parseStatLine(content: string) {
  const stats: { move: string; toughness: string; save: string; wounds: string; leadership: string; oc: string; invSv?: string } =
    { move: '-', toughness: '-', save: '-', wounds: '-', leadership: '-', oc: '-' }
  const m = content.match(/M(\d+["\u2033]?)\s+T(\d+)\s+Sv(\d+\+)\s+W(\d+)\s+Ld(\d+\+)\s+OC(\d+)\s*(\d+\+\+)?/)
  if (m) {
    stats.move = m[1]!
    stats.toughness = m[2]!
    stats.save = m[3]!
    stats.wounds = m[4]!
    stats.leadership = m[5]!
    stats.oc = m[6]!
    if (m[7]) stats.invSv = m[7]
  }
  return stats
}

/** Parse weapon profiles from content sections */
function parseWeapons(content: string, section: string) {
  const lines: string[] = []
  const sectionIdx = content.indexOf(section)
  if (sectionIdx === -1) return lines

  const after = content.slice(sectionIdx + section.length)
  const nextSection = after.search(/Ranged weapons|Melee weapons|Abilities|Keywords/i)
  const weaponBlock = nextSection === -1 ? after : after.slice(0, nextSection)

  return weaponBlock
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
}

/** Parse WHEN/TARGET/EFFECT from stratagem content */
function parseStratagemFields(content: string) {
  const extract = (label: string) => {
    const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]+:\\*\\*|$)`, 'i')
    const m = content.match(re)
    return m ? m[1].trim() : ''
  }
  return {
    when: extract('WHEN'),
    target: extract('TARGET'),
    effect: extract('EFFECT'),
  }
}

/** Parse content sections like **Points:** or **Composition:** */
function extractContentField(content: string, field: string): string {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]|$)`, 'i')
  const m = content.match(re)
  return m ? m[1].trim() : ''
}

/** Filter internal keywords from display, separate faction keywords */
function filterDisplayKeywords(keywords: string[]): { display: string[]; faction: string[] } {
  const internal = /^(t\d|sv\d|w\d|pts-|ppw-|moderate|cheap|expensive|premium|heavy-|light-|standard-|elite-|super-|titanic|toughness-|save-|wounds-|damage-|strength-|invuln-|ap-|ap\d|s\d|d\d|fnp-|feel no pain$|type:|characters$|sustained hits|lethal hits|devastating wounds|hazardous|blast|torrent|twin-linked|rapid fire|melta|lance|anti$|ignores cover|indirect fire|pistol|heavy$|assault$|one shot)/
  const factionNames = [
    'adeptus astartes', 'heretic astartes', 'orks', 'necrons', 'tyranids',
    'aeldari', "t'au empire", 'chaos', 'imperium', 'drukhari',
    'leagues of votann', 'adeptus custodes', 'adeptus mechanicus',
    'adepta sororitas', 'genestealer cults', 'death guard',
    'thousand sons', 'world eaters', 'chaos daemons', 'grey knights',
    'imperial agents', 'imperial knights', 'chaos knights',
    'astra militarum', 'agents of the imperium',
    // Subfactions
    'blood angels', 'dark angels', 'space wolves', 'black templars',
    'ultramarines', 'deathwatch', 'imperial fists', 'iron hands',
    'salamanders', 'raven guard', 'white scars', 'crimson fists',
    'blood ravens', 'ynnari', 'harlequins', 'asuryani',
    'plague legions', 'scintillating legions', 'legions of excess',
    'blood legions', 'damned',
  ]
  const display: string[] = []
  const factionKw: string[] = []
  for (const kw of keywords) {
    if (internal.test(kw)) continue
    if (factionNames.some(f => kw.toLowerCase() === f)) {
      factionKw.push(kw)
    } else if (kw.length > 1) {
      display.push(kw)
    }
  }
  return { display, faction: factionKw }
}

function buildUnitData(node: ResultNode) {
  const stats = parseStatLine(node.content || '')
  const content = node.content || ''

  // Extract structured fields from content
  const points = extractContentField(content, 'Points')
  const composition = extractContentField(content, 'Composition')
  const loadout = extractContentField(content, 'Loadout')

  // Derive unit type from keywords (not the raw role field)
  const allKeywords = node.keywords || []
  const role = deriveUnitType(allKeywords)

  // Filter keywords for display
  const { display: displayKeywords, faction: factionKeywords } = filterDisplayKeywords(allKeywords)

  // Core abilities from keywords
  const coreAbilityNames = ['grenades', 'deep strike', 'lone operative', 'stealth', 'scouts', 'infiltrators', 'deadly demise', 'fights first', 'firing deck']
  const coreAbilities = displayKeywords.filter(k => coreAbilityNames.includes(k.toLowerCase()))

  // Feel No Pain — extract value from fnp-X keyword (set by server parser)
  const fnpKeyword = allKeywords.find(k => /^fnp-\d$/.test(k))
  const fnpValue = fnpKeyword ? `${fnpKeyword.replace('fnp-', '')}++` : undefined

  return {
    id: node.id,
    name: node.title,
    factionId: node.factionId || '',
    subfaction: node.subfaction,
    role,
    derivedType: role,
    points,
    stats: { ...stats, ...(fnpValue ? { fnp: fnpValue } : {}) },
    rangedWeapons: [] as any[],  // populated async from /browse/unit/:id
    meleeWeapons: [] as any[],
    abilities: [] as any[],
    coreAbilities,
    keywords: displayKeywords.filter(k => !coreAbilityNames.includes(k.toLowerCase())),
    factionKeywords,
    composition,
    loadout,
    leaders: [],
  }
}

/** Fetch full unit data (datasheet + weapons + abilities) from API */
async function fetchFullUnitData(nodeId: string, node: ResultNode): Promise<import('../components/cards/types').UnitCardData> {
  const base = buildUnitData(node)

  try {
    const res = await fetch(`${API_BASE}/browse/unit/${encodeURIComponent(nodeId)}`)
    if (!res.ok) return base

    const data = await res.json() as {
      datasheet: any
      weapons: Array<{ title: string; content: string; summary: string; category: string }>
      abilities: Array<{ title: string; content: string; summary: string; category: string; keywords: string[] }>
    }

    // Parse weapons from weapon nodes
    const ranged: any[] = []
    const melee: any[] = []
    for (const w of data.weapons) {
      // Summary format: "Name (Type) — Range, AttA, SKILL, SSTR, APAP, DDAM. [abilities]"
      const m = w.summary.match(/^(.+?)\s*\((\w+)\)\s*—\s*(\S+),\s*(\S+),\s*\S(\d+),\s*AP(\S+),\s*D(\S+)/)
      const abMatch = w.summary.match(/\[([^\]]+)\]/g)
      const abilities = abMatch ? abMatch.join(' ') : ''

      // Parse from content which has structured format
      const rangeMatch = w.content.match(/\*\*Range:\*\*\s*(\S+)/)
      const aMatch = w.content.match(/\*\*A:\*\*\s*(\S+)/)
      const skillMatch = w.content.match(/\*\*BS\/WS:\*\*\s*(\S+)/)
      const sMatch = w.content.match(/\*\*S:\*\*\s*(\S+)/)
      const apMatch = w.content.match(/\*\*AP:\*\*\s*(\S+)/)
      const dMatch = w.content.match(/\*\*D:\*\*\s*(\S+)/)

      const profile = {
        name: w.title,
        range: rangeMatch?.[1] || (m?.[3] ?? ''),
        attacks: aMatch?.[1] || (m?.[4] ?? ''),
        skill: skillMatch?.[1] || '',
        strength: sMatch?.[1] || '',
        ap: apMatch?.[1] || '',
        damage: dMatch?.[1] || '',
        abilities,
      }

      const isRanged = w.content.includes('**Type:** Ranged') || w.summary.includes('(Ranged)')
      if (isRanged) {
        ranged.push(profile)
      } else {
        melee.push(profile)
      }
    }

    // Parse abilities from ability nodes
    const unitAbilities = data.abilities.map(a => ({
      name: a.title,
      description: a.content || a.summary,
      type: a.keywords?.includes('faction') ? 'Faction' : 'Datasheet',
    }))

    // Extract leaders from forward refs if available
    // For now, leaders come from leader_attachments — the browse/unit endpoint could be extended

    return {
      ...base,
      rangedWeapons: ranged,
      meleeWeapons: melee,
      abilities: unitAbilities,
    }
  } catch {
    return base
  }
}

function buildStratagemData(node: ResultNode) {
  const { when, target, effect } = parseStratagemFields(node.content || node.summary || '')
  return {
    id: node.id,
    name: node.title,
    type: 'Stratagem',
    cpCost: '1',
    turn: '',
    phase: node.phase || '',
    when,
    target,
    effect: effect || node.summary,
    detachmentName: '',
    factionId: node.factionId || '',
    subfaction: node.subfaction,
  }
}

function buildEnhancementData(node: ResultNode) {
  return {
    id: node.id,
    name: node.title,
    cost: '',
    description: node.content || node.summary,
    detachmentName: '',
    factionId: node.factionId || '',
    subfaction: node.subfaction,
  }
}

function buildRuleData(node: ResultNode) {
  return {
    id: node.id,
    name: node.title,
    description: node.content || node.summary,
    factionId: node.factionId || '',
    subfaction: node.subfaction,
    detachmentName: '',
    sources: node.sources,
  }
}

function buildCardFromNode(node: ResultNode): CardData {
  switch (node.category) {
    case 'datasheet':
      return { type: 'unit', data: buildUnitData(node) }
    case 'stratagem':
      return { type: 'stratagem', data: buildStratagemData(node) }
    case 'enhancement':
      return { type: 'enhancement', data: buildEnhancementData(node) }
    case 'faction-ability':
      if (!node.detachmentId) {
        return { type: 'rule', data: { ...buildRuleData(node), isArmyRule: true } }
      }
      return { type: 'rule', data: { ...buildRuleData(node), isArmyRule: false } }
    case 'detachment-rule':
      return { type: 'rule', data: { ...buildRuleData(node), isArmyRule: false } }
    default:
      return { type: 'rule', data: { ...buildRuleData(node), isArmyRule: false } }
  }
}

// ── Entity map builder ───────────────────────────────────────────────────────

function buildEntityMap(nodes: ResultNode[], keywords?: string[]): EntityMap {
  const map: EntityMap = new Map()
  for (const node of nodes) {
    const type =
      node.category === 'datasheet' ? 'unit'
      : node.category === 'stratagem' ? 'stratagem'
      : node.category === 'enhancement' ? 'enhancement'
      : node.category === 'faction-ability' || node.category === 'detachment-rule' ? 'rule'
      : 'mechanic'
    map.set(node.title.toLowerCase(), { type, nodeId: node.id })
  }
  if (keywords) {
    for (const kw of keywords) {
      const key = kw.toLowerCase()
      if (!map.has(key)) {
        map.set(key, { type: 'mechanic', nodeId: kw })
      }
    }
  }
  return map
}

// ── AskTab ───────────────────────────────────────────────────────────────────

interface QASource {
  id: string
  title: string
  layer: string
  category: string
  sources?: any[]
}

interface WebSource {
  url: string
  title: string
}

interface QAResponse {
  detected: DetectedFactions
  answer: string
  reference: ResultNode[]
  sources: QASource[]
  connectedCount: number
  webSources?: WebSource[]
}

interface AskTabProps {
  onOpenCard: (node: ResultNode) => void
  activeFilters: string[]
  onFilterChange: (filters: string[]) => void
}

function AskTab({ onOpenCard, activeFilters, onFilterChange }: AskTabProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<QAResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [factionFilter, setFactionFilter] = useState(true)
  const [entityMap, setEntityMap] = useState<EntityMap>(new Map())

  const doAsk = useCallback(async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    setFactionFilter(true)

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data = await res.json() as QAResponse
      setAnswer(data)
      setEntityMap(buildEntityMap(data.reference || [], data.detected?.keywords))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get answer')
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-query when filters change (only if we have a question)
  useEffect(() => {
    if (!question.trim() || activeFilters.length === 0) return
    const combined = [question, ...activeFilters].join(' ')
    doAsk(combined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters])

  function handleAsk() {
    const combined = activeFilters.length > 0
      ? [question, ...activeFilters].join(' ')
      : question
    doAsk(combined)
  }

  function removeFilter(f: string) {
    onFilterChange(activeFilters.filter(x => x !== f))
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

      {activeFilters.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {activeFilters.map(f => (
            <span key={f} className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded flex items-center gap-1">
              {f}
              <button onClick={() => removeFilter(f)} className="text-amber-400/60 hover:text-amber-400">×</button>
            </span>
          ))}
        </div>
      )}

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

          <div
            className="bg-slate-900 border border-slate-700 rounded p-4 overflow-auto max-h-[70vh]"
            onClick={async (e) => {
              const target = e.target as HTMLElement
              const nodeId = target.closest('[data-brain-node]')?.getAttribute('data-brain-node')
              if (!nodeId) return
              // Try reference list first
              const node = answer.reference?.find(r => r.id === nodeId)
              if (node) { onOpenCard(node); return }
              // Fetch from API if not in reference
              try {
                const res = await fetch(`${API_BASE}/browse/node/${encodeURIComponent(nodeId)}`)
                if (res.ok) {
                  const data = await res.json() as { node: ResultNode }
                  if (data.node) onOpenCard(data.node)
                }
              } catch { /* ignore fetch errors */ }
            }}
          >
            <div
              className="max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(answer.answer) }}
            />
          </div>

          {answer.webSources && answer.webSources.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded p-3">
              <h4 className="text-xs font-medium text-slate-400 uppercase mb-2">Web Sources</h4>
              <div className="flex flex-wrap gap-2">
                {answer.webSources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 bg-slate-800 rounded px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-slate-700"
                  >
                    {s.title.length > 50 ? s.title.substring(0, 47) + '...' : s.title}
                    <span className="text-slate-600">↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {answer.reference && answer.reference.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-400 uppercase mb-2">Reference</h4>
              {answer.reference.map((r, i) => (
                <div key={r.id + '-' + i} className="mb-2">
                  <button
                    onClick={() => onOpenCard(r)}
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
                  {entityMap.size > 0 && r.summary && (
                    <p className="text-xs text-slate-400 mt-1 px-3">
                      <LinkedText
                        text={r.summary}
                        entities={entityMap}
                        onEntityClick={async (name) => {
                          const info = entityMap.get(name.toLowerCase())
                          if (info) {
                            try {
                              const res = await fetch(`${API_BASE}/browse/node/${encodeURIComponent(info.nodeId)}`)
                              if (res.ok) {
                                const data = await res.json() as { node: ResultNode }
                                if (data.node) { onOpenCard(data.node); return }
                              }
                            } catch { /* fall through */ }
                          }
                          onOpenCard(r)
                        }}
                      />
                    </p>
                  )}
                </div>
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

interface SearchTabProps {
  onOpenCard: (node: ResultNode) => void
  activeFilters: string[]
  onFilterChange: (filters: string[]) => void
}

function SearchTab({ onOpenCard, activeFilters, onFilterChange }: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [factionFilter, setFactionFilter] = useState(true)
  const [entityMap, setEntityMap] = useState<EntityMap>(new Map())

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    setFactionFilter(true)
    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 20 }),
      })
      const data = await res.json() as SearchResponse
      setResponse(data)
      setEntityMap(buildEntityMap(data.results || [], data.detected?.keywords))
    } catch {
      setResponse(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-query when filters change (only if we have a query)
  useEffect(() => {
    if (!query.trim() || activeFilters.length === 0) return
    const combined = [query, ...activeFilters].join(' ')
    doSearch(combined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters])

  function handleSearch() {
    const combined = activeFilters.length > 0
      ? [query, ...activeFilters].join(' ')
      : query
    doSearch(combined)
  }

  function removeFilter(f: string) {
    onFilterChange(activeFilters.filter(x => x !== f))
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

      {activeFilters.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {activeFilters.map(f => (
            <span key={f} className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded flex items-center gap-1">
              {f}
              <button onClick={() => removeFilter(f)} className="text-amber-400/60 hover:text-amber-400">×</button>
            </span>
          ))}
        </div>
      )}

      {factionFilter && detected && detected.factions.length > 0 && (
        <FactionBanner
          factions={detected.factions}
          subfaction={detected.subfaction}
          onDismiss={() => setFactionFilter(false)}
        />
      )}

      {visibleResults.length > 0 && (
        <div className="space-y-2">
          {visibleResults.map((r, i) => (
            <div key={r.id + '-' + i} className="mb-2">
              <button
                onClick={() => onOpenCard(r)}
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
              {entityMap.size > 0 && r.summary && (
                <p className="text-xs text-slate-400 mt-1 px-3">
                  <LinkedText
                    text={r.summary}
                    entities={entityMap}
                    onEntityClick={(name) => onOpenCard(r)}
                  />
                </p>
              )}
            </div>
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

interface BrowseTabProps {
  onOpenCard: (node: ResultNode) => void
}

function BrowseTab({ onOpenCard }: BrowseTabProps) {
  const [layers, setLayers] = useState<BrowseLayer[]>([])
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const [nodes, setNodes] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
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
    fetch(`${API_BASE}/browse/nodes?layer=${selectedLayer}&limit=100`)
      .then(r => r.json())
      .then(data => { setNodes(data.nodes || []); setTotalCount(data.total || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedLayer])

  // Load full node detail and open card
  function viewNode(nodeId: string) {
    fetch(`${API_BASE}/browse/node/${encodeURIComponent(nodeId)}`)
      .then(r => r.json())
      .then(data => { if (data.node) onOpenCard(data.node) })
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
      </div>
    </div>
  )
}

// ── BrainScreen ──────────────────────────────────────────────────────────────

export function BrainScreen() {
  const [tab, setTab] = useState<'ask' | 'search' | 'browse' | 'graph'>('ask')
  const [activeCard, setActiveCard] = useState<CardData | null>(null)
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [detachmentView, setDetachmentView] = useState<DetachmentPageProps | null>(null)
  const [pdfView, setPdfView] = useState<{ pdfName: string; page: number; title: string } | null>(null)

  async function openDetachmentPage(node: ResultNode) {
    // Fetch stratagems and enhancements for this detachment
    const detachmentId = node.id
    const factionId = node.factionId || ''

    try {
      const params = new URLSearchParams({ layer: 'detachment', limit: '200' })
      if (factionId) params.set('factionId', factionId)
      const res = await fetch(`${API_BASE}/browse/nodes?${params.toString()}`)
      const data = await res.json() as { nodes: ResultNode[]; total: number }
      const allNodes: ResultNode[] = data.nodes || []

      // Filter nodes that belong to this detachment
      const related = allNodes.filter(n => n.detachmentId === detachmentId || n.detachmentId === node.title)

      const stratagems = related
        .filter(n => n.category === 'stratagem')
        .map(n => buildStratagemData(n))

      const enhancements = related
        .filter(n => n.category === 'enhancement')
        .map(n => buildEnhancementData(n))

      const ability: DetachmentPageProps['ability'] = node.content
        ? { ...buildRuleData(node), isArmyRule: false }
        : undefined

      setDetachmentView({
        detachmentName: node.title,
        factionId,
        subfaction: node.subfaction,
        ability,
        stratagems,
        enhancements,
        onContentClick: (term: string) => {
          setDetachmentView(null)
          setActiveFilters(prev => prev.includes(term) ? prev : [...prev, term])
        },
        onBack: () => setDetachmentView(null),
      })
    } catch {
      // Fallback: show page with just the ability node
      const ability: DetachmentPageProps['ability'] = node.content
        ? { ...buildRuleData(node), isArmyRule: false }
        : undefined
      setDetachmentView({
        detachmentName: node.title,
        factionId,
        subfaction: node.subfaction,
        ability,
        stratagems: [],
        enhancements: [],
        onContentClick: (term: string) => {
          setDetachmentView(null)
          setActiveFilters(prev => prev.includes(term) ? prev : [...prev, term])
        },
        onBack: () => setDetachmentView(null),
      })
    }
  }

  async function handleOpenCard(node: ResultNode) {
    if (node.category === 'detachment-rule') {
      openDetachmentPage(node)
      return
    }

    // For unit cards, fetch full data (weapons + abilities) from API
    if (node.category === 'datasheet') {
      const unitData = await fetchFullUnitData(node.id, node)
      setActiveCard({ type: 'unit', data: unitData })
      return
    }

    setActiveCard(buildCardFromNode(node))
  }

  const cardContext: CardContext = {
    highlightTerms: activeFilters,
    onContentClick: (term: string) => {
      setActiveCard(null)
      setActiveFilters(prev => prev.includes(term) ? prev : [...prev, term])
    },
    onDismiss: () => setActiveCard(null),
    onViewSource: (pdfName, page, title) => {
      setActiveCard(null)
      setPdfView({ pdfName, page, title })
    },
  }

  // Clear filters when switching tabs
  function handleTabSwitch(t: 'ask' | 'search' | 'browse' | 'graph') {
    if (t !== tab) {
      setActiveFilters([])
      setDetachmentView(null)
    }
    setTab(t)
  }

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
                onClick={() => handleTabSwitch(t)}
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

      {detachmentView ? (
        <DetachmentPage {...detachmentView} />
      ) : tab === 'browse' ? (
        <BrowseTab onOpenCard={handleOpenCard} />
      ) : tab === 'graph' ? (
        <ForceGraph />
      ) : (
        <main className="flex-1 p-4 max-w-4xl mx-auto">
          {tab === 'ask' && (
            <AskTab
              onOpenCard={handleOpenCard}
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
            />
          )}
          {tab === 'search' && (
            <SearchTab
              onOpenCard={handleOpenCard}
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
            />
          )}
        </main>
      )}

      <Overlay open={!!activeCard} onDismiss={() => setActiveCard(null)}>
        {activeCard?.type === 'unit' && <UnitCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'stratagem' && <StratagemCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'enhancement' && <EnhancementCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'rule' && <RuleCard data={activeCard.data} context={cardContext} />}
      </Overlay>

      {pdfView && (
        <PdfPageView
          pdfName={pdfView.pdfName}
          pageNumber={pdfView.page}
          title={pdfView.title}
          highlightText=""
          onDismiss={() => setPdfView(null)}
        />
      )}
    </div>
  )
}
