declare const __APP_VERSION__: string

import { useState, useEffect, useCallback, useRef } from 'react'
import { ForceGraph } from '../components/ForceGraph'
import { ResultCard } from '../components/ResultCard'
import { FactionBanner } from '../components/FactionBanner'
import { Overlay } from '../components/Overlay'
import { LinkedText } from '../components/LinkedText'
import { UnitCard } from '../components/cards/UnitCard'
import { StratagemCard } from '../components/cards/StratagemCard'
import { EnhancementCard } from '../components/cards/EnhancementCard'
import { RuleCard } from '../components/cards/RuleCard'
import { MissionCard } from '../components/cards/MissionCard'
import { TwistCard } from '../components/cards/TwistCard'
import { ChallengerCard } from '../components/cards/ChallengerCard'
import { CoreRuleCard } from '../components/cards/CoreRuleCard'
import { ErrataCard } from '../components/cards/ErrataCard'
import { BalanceCard } from '../components/cards/BalanceCard'
import { CommunityCard } from '../components/cards/CommunityCard'
import { DetachmentCard } from '../components/cards/DetachmentCard'
import { DeploymentZoneCard } from '../components/cards/DeploymentZoneCard'
import { TerrainLayoutCard } from '../components/cards/TerrainLayoutCard'
import type { CardData, CardContext, ErrataEntry } from '../components/cards/types'
import { resolveCardView } from '../lib/card-display'
import { type EntityMap } from '../lib/entity-linker'
import { PdfPageView } from '../components/cards/PdfPageView'
import { DetachmentPage } from './DetachmentPage'
import type { DetachmentPageProps } from './DetachmentPage'
import { deriveUnitType } from '../../../shared/derive-unit-type'
import { Pagination } from '../components/Pagination'

const API_BASE = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'

/** Simple markdown to HTML — handles ##, **, -, `, and brain: entity links */
function renderMarkdown(text: string): string {
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
  factionName?: string
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
  const internal = /^(t\d|sv\d|w\d|pts-|ppw-|moderate|cheap|expensive|premium|heavy-|light-|standard-|elite-|super-|titanic|toughness-|save-|wounds-|damage-|strength-|invuln-|ap-|ap\d|s\d|d\d|fnp-|feel no pain$|type:|characters$|sustained hits|lethal hits|devastating wounds|hazardous|blast|torrent|twin-linked|rapid fire|melta|lance|anti$|ignores cover|indirect fire|pistol|heavy$|assault$|one shot|^other$|^power armou?r$|^gravis$|^terminator armou?r$|^phobos$|^tacticus$|^mk x|^artificer armou?r$|^scout armou?r$|^deathwing$|^ravenwing$|^inner circle$|^wolf guard$|^sanguinary guard$|^lion guard$)/
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
  const seen = new Set<string>()
  for (const kw of keywords) {
    const lower = kw.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    if (internal.test(lower)) continue
    if (factionNames.some(f => lower === f)) {
      factionKw.push(kw)
    } else if (kw.length > 1) {
      display.push(kw)
    }
  }
  return { display, faction: factionKw }
}

/** Formal faction names that map to their slug — used to filter redundant faction keywords */
const FORMAL_TO_SLUG: Record<string, string> = {
  'adeptus astartes': 'space-marines',
  'heretic astartes': 'chaos-space-marines',
  "t'au empire": 't-au-empire',
  'astra militarum': 'astra-militarum',
  'adepta sororitas': 'adepta-sororitas',
  'adeptus custodes': 'adeptus-custodes',
  'adeptus mechanicus': 'adeptus-mechanicus',
  'agents of the imperium': 'imperial-agents',
}

/** Remove faction keywords that are just the formal name of the node's own factionId */
function filterRedundantFactionKeywords(factionKeywords: string[], nodeFactionId: string): string[] {
  return factionKeywords.filter(kw => {
    const slug = FORMAL_TO_SLUG[kw.toLowerCase()]
    return slug !== nodeFactionId
  })
}

function buildUnitData(node: ResultNode) {
  const stats = parseStatLine(node.content || '')
  const content = node.content || ''

  // Extract structured fields from content
  const points = extractContentField(content, 'Points')
  const composition = extractContentField(content, 'Composition')
  const loadout = extractContentField(content, 'Loadout')
  const wargearOptions = extractContentField(content, 'Wargear Options')

  // Derive unit type from keywords (not the raw role field)
  const allKeywords = node.keywords || []
  const role = deriveUnitType(allKeywords)

  // Filter keywords for display
  const { display: displayKeywords, faction: rawFactionKw } = filterDisplayKeywords(allKeywords)
  const factionKeywords = filterRedundantFactionKeywords(rawFactionKw, node.factionId || '')

  // Core abilities from keywords (some are parameterized like "deadly demise D3")
  const coreAbilityPrefixes = ['grenades', 'deep strike', 'lone operative', 'stealth', 'scouts', 'infiltrators', 'deadly demise', 'fights first', 'firing deck']
  const coreAbilities = displayKeywords
    .filter(k => coreAbilityPrefixes.some(prefix => k.toLowerCase().startsWith(prefix)))
    .map(k => {
      // Title-case the ability name
      return k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    })

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
    keywords: displayKeywords.filter(k => !coreAbilityPrefixes.some(prefix => k.toLowerCase().startsWith(prefix))),
    factionKeywords,
    composition,
    loadout,
    wargearOptions,
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
  const content = node.content || node.summary || ''
  // Extract cost from "**Cost:** 10" or from summary "(10pts)"
  const costMatch = content.match(/\*\*Cost:\*\*\s*(\d+)/) || node.summary?.match(/\((\d+)pts?\)/)
  const cost = costMatch ? costMatch[1] : ''
  // Extract restriction — first line of content after cost (e.g., "Infantry Warboss model only.")
  const lines = content.replace(/\*\*Cost:\*\*\s*\d+\s*/, '').split('\n').map(l => l.trim()).filter(Boolean)
  const restrictionLine = lines[0] && /model only/i.test(lines[0]) ? lines[0] : ''
  const description = restrictionLine ? lines.slice(1).join('\n') : lines.join('\n')
  // Detachment name from detachmentId (format: "det:faction:slug" or just a slug)
  const detSlug = node.detachmentId || ''
  const detName = detSlug.includes(':')
    ? detSlug.split(':').pop()!.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : detSlug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

  return {
    id: node.id,
    name: node.title,
    cost,
    restriction: restrictionLine,
    description,
    detachmentName: detName,
    factionId: node.factionId || '',
    subfaction: node.subfaction,
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
          {factionFilter && answer.detected?.factions?.length > 0 && (
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

interface SearchRecord {
  type: string
  primaryNode: ResultNode
  childNodes: ResultNode[]
  crossRefs: any[]
  errata: ErrataEntry[]
  matchedChildIds: string[]
}

/** Server response — supports both the new record-based format and the old flat format */
interface SearchResponse {
  detected: DetectedFactions
  // New record-based format
  records?: SearchRecord[]
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
  // Legacy flat format (backward compat)
  results?: ResultNode[]
}

interface SearchTabProps {
  onOpenCard: (node: ResultNode) => void
  onOpenRecord?: (record: SearchRecord) => void
  activeFilters: string[]
  onFilterChange: (filters: string[]) => void
}

function SearchTab({ onOpenCard, onOpenRecord, activeFilters, onFilterChange }: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [factionFilter, setFactionFilter] = useState(true)
  const [entityMap, setEntityMap] = useState<EntityMap>(new Map())
  const [page, setPage] = useState(1)
  // Track the last query string used so page-change re-fetches use the correct query
  const lastQueryRef = useRef('')

  const doSearch = useCallback(async (q: string, p: number) => {
    if (!q.trim()) return
    lastQueryRef.current = q
    setLoading(true)
    setFactionFilter(true)
    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, page: p, pageSize: 10 }),
      })
      const data = await res.json() as SearchResponse
      setResponse(data)
      // Build entity map from whichever node list is available
      const nodes = data.records
        ? data.records.map(r => r.primaryNode)
        : (data.results ?? [])
      setEntityMap(buildEntityMap(nodes, data.detected?.keywords))
    } catch {
      setResponse(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-fetch when page changes (only when there's an active query)
  useEffect(() => {
    if (!lastQueryRef.current) return
    doSearch(lastQueryRef.current, page)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // Re-query when filters change (only if we have a query) — reset to page 1
  useEffect(() => {
    if (!query.trim() || activeFilters.length === 0) return
    const combined = [query, ...activeFilters].join(' ')
    setPage(1)
    doSearch(combined, 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters])

  function handleSearch() {
    const combined = activeFilters.length > 0
      ? [query, ...activeFilters].join(' ')
      : query
    setPage(1)
    doSearch(combined, 1)
  }

  function removeFilter(f: string) {
    onFilterChange(activeFilters.filter(x => x !== f))
  }

  function handlePageChange(p: number) {
    setPage(p)
    // doSearch will be triggered by the page useEffect
  }

  const detected = response?.detected

  // Determine rendering mode: record-based (new) or flat (legacy)
  const isRecordMode = !!response?.records

  // For legacy mode, build a flat list (no pagination from server)
  const legacyResults = response?.results ?? []

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

      {/* Total count */}
      {response?.total != null && response.total > 0 && (
        <p className="text-xs text-slate-500">{response.total} results</p>
      )}

      {/* Record-based results (new format) */}
      {isRecordMode && response!.records!.length > 0 && (
        <div className="space-y-2">
          {response!.records!.map((record, i) => {
            const r = record.primaryNode
            // Collect titles of matched child nodes for the badge
            const matchedChildTitles = record.matchedChildIds.length > 0
              ? record.childNodes
                  .filter(c => record.matchedChildIds.includes(c.id))
                  .map(c => c.title)
              : []

            return (
              <div key={r.id + '-' + i} className="mb-2">
                <button
                  onClick={() => onOpenRecord ? onOpenRecord(record) : onOpenCard(r)}
                  className="w-full text-left"
                >
                  <ResultCard
                    index={((response!.page ?? 1) - 1) * (response!.pageSize ?? 10) + i + 1}
                    title={r.title}
                    summary={r.summary}
                    layer={r.layer}
                    category={r.category}
                    score={r.score}
                    factionId={r.factionId}
                    factionName={r.factionName}
                    subfaction={r.subfaction}
                    phase={r.phase}
                    parentUnit={r.parentUnit}
                  />
                </button>
                {matchedChildTitles.length > 0 && (
                  <p className="text-xs text-slate-500 mt-0.5 px-3">
                    Matched: <span className="text-amber-400/70">{matchedChildTitles.join(', ')}</span>
                  </p>
                )}
                {entityMap.size > 0 && r.summary && (
                  <p className="text-xs text-slate-400 mt-1 px-3">
                    <LinkedText
                      text={r.summary}
                      entities={entityMap}
                      onEntityClick={() => onOpenRecord ? onOpenRecord(record) : onOpenCard(r)}
                    />
                  </p>
                )}
              </div>
            )
          })}
          <Pagination
            page={response!.page ?? 1}
            totalPages={response!.totalPages ?? 1}
            total={response!.total ?? 0}
            pageSize={response!.pageSize ?? 10}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      {/* Legacy flat results (old format, no server pagination) */}
      {!isRecordMode && legacyResults.length > 0 && (
        <div className="space-y-2">
          {legacyResults.map((r, i) => (
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
                    onEntityClick={() => onOpenCard(r)}
                  />
                </p>
              )}
            </div>
          ))}
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
  onOpenCard: (node: ResultNode) => void | Promise<void>
}

interface BrowsePaginatedResponse {
  nodes: any[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function BrowseTab({ onOpenCard }: BrowseTabProps) {
  const [layers, setLayers] = useState<BrowseLayer[]>([])
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const [browseResponse, setBrowseResponse] = useState<BrowsePaginatedResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [layersLoading, setLayersLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Load layers on mount
  useEffect(() => {
    fetch(`${API_BASE}/browse/layers`)
      .then(r => r.json())
      .then(data => { setLayers(data.layers || []); setLayersLoading(false) })
      .catch(() => setLayersLoading(false))
  }, [])

  // Reset page when layer changes
  useEffect(() => {
    setPage(1)
  }, [selectedLayer])

  // Load nodes when layer or page changes
  useEffect(() => {
    if (!selectedLayer) { setBrowseResponse(null); return }
    setLoading(true)
    fetch(`${API_BASE}/browse/nodes?layer=${selectedLayer}&page=${page}&pageSize=${pageSize}`)
      .then(r => r.json())
      .then((data: BrowsePaginatedResponse) => {
        setBrowseResponse({
          nodes: data.nodes || [],
          total: data.total || 0,
          page: data.page || page,
          pageSize: data.pageSize || pageSize,
          totalPages: data.totalPages || 1,
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedLayer, page])

  // Load full node detail and open card
  function viewNode(nodeId: string) {
    fetch(`${API_BASE}/browse/node/${encodeURIComponent(nodeId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.node) {
          Promise.resolve(onOpenCard(data.node)).catch((err: unknown) => console.error('Card open failed:', err))
        }
      })
      .catch(err => console.error('Browse node fetch failed:', err))
  }

  const nodes = browseResponse?.nodes ?? []
  const total = browseResponse?.total ?? 0
  const totalPages = browseResponse?.totalPages ?? 1
  const currentPage = browseResponse?.page ?? page

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
              {nodes.map((node: any, i: number) => (
                <button
                  key={node.id}
                  onClick={() => viewNode(node.id)}
                  className="w-full text-left"
                >
                  <ResultCard
                    index={(currentPage - 1) * pageSize + i + 1}
                    title={node.title}
                    summary={node.summary || ''}
                    layer={node.layer || ''}
                    category={node.category || ''}
                    score={0}
                    factionId={node.factionId}
                    subfaction={node.subfaction}
                  />
                </button>
              ))}
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
              />
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
  const [pdfView, setPdfView] = useState<{ pdfName: string; page: number; title: string; topPct?: number; heightPct?: number; leftPct?: number; widthPct?: number } | null>(null)

  async function handleOpenRecord(record: SearchRecord) {
    const node = record.primaryNode

    // For unit cards — build data directly from record.childNodes, avoiding a second API fetch
    if (record.type === 'unit' || node.category === 'datasheet') {
      const base = buildUnitData(node)
      const ranged: any[] = []
      const melee: any[] = []
      const unitAbilities: any[] = []

      for (const child of record.childNodes) {
        if (child.category === 'weapon') {
          const rangeMatch = child.content.match(/\*\*Range:\*\*\s*(\S+)/)
          const aMatch = child.content.match(/\*\*A:\*\*\s*(\S+)/)
          const skillMatch = child.content.match(/\*\*BS\/WS:\*\*\s*(\S+)/)
          const sMatch = child.content.match(/\*\*S:\*\*\s*(\S+)/)
          const apMatch = child.content.match(/\*\*AP:\*\*\s*(\S+)/)
          const dMatch = child.content.match(/\*\*D:\*\*\s*(\S+)/)
          const abMatch = child.summary?.match(/\[([^\]]+)\]/g)
          const abilities = abMatch ? abMatch.join(' ') : ''

          const profile = {
            name: child.title,
            range: rangeMatch?.[1] ?? '',
            attacks: aMatch?.[1] ?? '',
            skill: skillMatch?.[1] ?? '',
            strength: sMatch?.[1] ?? '',
            ap: apMatch?.[1] ?? '',
            damage: dMatch?.[1] ?? '',
            abilities,
          }
          const isRanged = child.content.includes('**Type:** Ranged') || child.summary?.includes('(Ranged)')
          if (isRanged) {
            ranged.push(profile)
          } else {
            melee.push(profile)
          }
        } else if (child.category === 'unit-ability') {
          unitAbilities.push({
            name: child.title,
            description: child.content || child.summary,
            type: child.keywords?.includes('faction') ? 'Faction' : 'Datasheet',
          })
        }
      }

      setActiveCard({
        type: 'unit',
        data: { ...base, rangedWeapons: ranged, meleeWeapons: melee, abilities: unitAbilities, errata: record.errata },
      })
      return
    }

    // For army rules, fetch sub-abilities from API
    if (node.category === 'army-rule') {
      try {
        const res = await fetch(`${API_BASE}/browse/army-rule/${encodeURIComponent(node.id)}`)
        const data = await res.json() as { armyRule: ResultNode; subAbilities: ResultNode[] }
        const subRules = data.subAbilities.map(a => ({
          name: a.title.replace(/\s*\(.*\)\s*$/, ''),
          description: a.content || a.summary || '',
        }))
        setActiveCard({
          type: 'rule',
          data: {
            id: node.id,
            name: node.title,
            description: node.content || node.summary || '',
            factionId: node.factionId || '',
            subfaction: node.subfaction,
            isArmyRule: true,
            subRules: subRules.length > 0 ? subRules : undefined,
            sources: node.sources as any[],
          },
        })
        return
      } catch { /* fall through to default */ }
    }

    // For ALL other types: use resolveCardView (never PDF-first)
    const { card } = resolveCardView(node)
    if (record.errata && record.errata.length > 0) {
      (card.data as any).errata = record.errata
    }
    setActiveCard(card)
  }

  async function handleOpenCard(node: ResultNode) {
    // For unit cards, fetch full data (weapons + abilities) from API
    if (node.category === 'datasheet') {
      const unitData = await fetchFullUnitData(node.id, node)
      setActiveCard({ type: 'unit', data: unitData })
      return
    }

    // For detachment cards, fetch stratagems + enhancements from API
    if (node.category === 'detachment-rule') {
      const { card } = resolveCardView(node)
      if (card.type === 'detachment') {
        try {
          const res = await fetch(`${API_BASE}/browse/detachment/${encodeURIComponent(node.id)}`)
          const data = await res.json() as {
            detachment: ResultNode
            stratagems: ResultNode[]
            enhancements: ResultNode[]
            abilities: ResultNode[]
          }
          card.data.stratagems = (data.stratagems || []).map(n => buildStratagemData(n))
          card.data.enhancements = (data.enhancements || []).map(n => buildEnhancementData(n))
        } catch {
          // Fallback: show card without stratagems/enhancements
        }
      }
      setActiveCard(card)
      return
    }

    // For army rules, fetch sub-abilities from API
    if (node.category === 'army-rule') {
      try {
        const res = await fetch(`${API_BASE}/browse/army-rule/${encodeURIComponent(node.id)}`)
        const data = await res.json() as { armyRule: ResultNode; subAbilities: ResultNode[] }
        const subRules = data.subAbilities.map(a => ({
          name: a.title.replace(/\s*\(.*\)\s*$/, ''),
          description: a.content || a.summary || '',
        }))
        setActiveCard({
          type: 'rule',
          data: {
            id: node.id,
            name: node.title,
            description: node.content || node.summary || '',
            factionId: node.factionId || '',
            subfaction: node.subfaction,
            isArmyRule: true,
            subRules: subRules.length > 0 ? subRules : undefined,
            sources: node.sources as any[],
          },
        })
        return
      } catch { /* fall through */ }
    }

    // For all other types: use resolveCardView
    const { card } = resolveCardView(node)
    console.log('handleOpenCard setting card:', card.type, node.title)
    setActiveCard(card)
  }

  const cardContext: CardContext = {
    highlightTerms: activeFilters,
    onContentClick: async (term: string) => {
      // Try to find and open the rule card for this term
      try {
        const res = await fetch(`${API_BASE}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, pageSize: 5 }),
        })
        if (res.ok) {
          const data = await res.json() as SearchResponse
          // Look for an exact title match first among records
          const records = data.records ?? []
          const exactMatch = records.find(
            r => r.primaryNode.title.toLowerCase() === term.toLowerCase()
          )
          if (exactMatch) {
            handleOpenRecord(exactMatch)
            return
          }
          // Fall back to first non-unit result (prefer rules/mechanics)
          const ruleResult = records.find(
            r => r.primaryNode.category !== 'datasheet'
          )
          if (ruleResult) {
            handleOpenRecord(ruleResult)
            return
          }
          // Fall back to first result of any type
          if (records.length > 0) {
            handleOpenRecord(records[0])
            return
          }
          // Legacy format fallback
          const results = data.results ?? []
          if (results.length > 0) {
            handleOpenCard(results[0])
            return
          }
        }
      } catch { /* fall through to filter behavior */ }
      // If no rule found, add as filter
      setActiveCard(null)
      setActiveFilters(prev => prev.includes(term) ? prev : [...prev, term])
    },
    onDismiss: () => setActiveCard(null),
    onViewSource: (pdfName, page, title, topPct, heightPct, leftPct, widthPct) => {
      setActiveCard(null)
      setPdfView({ pdfName, page, title, topPct, heightPct, leftPct, widthPct })
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
              onOpenRecord={handleOpenRecord}
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
        {activeCard?.type === 'mission' && <MissionCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'twist' && <TwistCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'challenger' && <ChallengerCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'core-rule' && <CoreRuleCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'deployment-zone' && <DeploymentZoneCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'terrain-layout' && <TerrainLayoutCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'errata' && <ErrataCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'balance' && <BalanceCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'community' && <CommunityCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'detachment' && <DetachmentCard data={activeCard.data} context={cardContext} />}
      </Overlay>

      {pdfView && (
        <PdfPageView
          pdfName={pdfView.pdfName}
          pageNumber={pdfView.page}
          title={pdfView.title}
          highlightText=""
          topPct={pdfView.topPct}
          heightPct={pdfView.heightPct}
          leftPct={pdfView.leftPct}
          widthPct={pdfView.widthPct}
          onDismiss={() => setPdfView(null)}
        />
      )}
    </div>
  )
}
