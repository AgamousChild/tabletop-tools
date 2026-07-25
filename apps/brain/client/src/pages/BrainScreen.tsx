declare const __APP_VERSION__: string

import { useCallback, useEffect, useRef, useState } from 'react'

import { deriveUnitType } from '../../../shared/derive-unit-type'
import { ActiveEditionChip } from '../components/ActiveEditionChip'
import { BalanceCard } from '../components/cards/BalanceCard'
import { ChallengerCard } from '../components/cards/ChallengerCard'
import { CommunityCard } from '../components/cards/CommunityCard'
import { CoreRuleCard } from '../components/cards/CoreRuleCard'
import { DeploymentZoneCard } from '../components/cards/DeploymentZoneCard'
import { DetachmentCard } from '../components/cards/DetachmentCard'
import { EnhancementCard } from '../components/cards/EnhancementCard'
import { ErrataCard } from '../components/cards/ErrataCard'
import { ForceDispositionCard } from '../components/cards/ForceDispositionCard'
import { MissionCard } from '../components/cards/MissionCard'
import { PdfPageView } from '../components/cards/PdfPageView'
import { RuleCard } from '../components/cards/RuleCard'
import { StratagemCard } from '../components/cards/StratagemCard'
import { TerrainLayoutCard } from '../components/cards/TerrainLayoutCard'
import { TwistCard } from '../components/cards/TwistCard'
import type {
  AttachmentChip,
  CardContext,
  CardData,
  ErrataEntry,
  UnitCardData,
} from '../components/cards/types'
import { UnitCard } from '../components/cards/UnitCard'
import { EditionFallbackBanner } from '../components/EditionFallbackBanner'
import { EditionNotAvailableNotice } from '../components/EditionNotAvailableNotice'
import { EditionPicker } from '../components/EditionPicker'
import { FactionBanner } from '../components/FactionBanner'
import { ForceGraph } from '../components/ForceGraph'
import { LinkedText } from '../components/LinkedText'
import { Overlay } from '../components/Overlay'
import { Pagination } from '../components/Pagination'
import { ResultCard } from '../components/ResultCard'
import { brainFetch, parseAvailableEditions } from '../lib/api'
import { resolveCardView } from '../lib/card-display'
import { type Edition, parseEditionFromHash, writeEditionToHash } from '../lib/edition'
import { type EntityMap } from '../lib/entity-linker'
import { factionDisplayName } from '../lib/faction-names'
import { linkBrainHtml } from '../lib/render-markdown'
import { LayoutRenderer } from '../lib/server-cards/Renderer'
import type { CardLayout } from '../lib/server-cards/types'
import type { DetachmentPageProps } from './DetachmentPage'
import { DetachmentPage } from './DetachmentPage'

/** Simple markdown to HTML — handles ##, **, -, `, and brain: entity links */
function renderMarkdown(text: string): string {
  // `linkBrainHtml` is the shared helper that emits the canonical
  // `brain-entity-link` class — keep it in lockstep with LinkedText.
  const linkBrain = linkBrainHtml

  return text
    .split('\n')
    .map((line) => {
      // Headings
      if (line.startsWith('## '))
        return `<h2 class="text-lg font-bold text-amber-400 mt-4 mb-2">${linkBrain(line.slice(3))}</h2>`
      if (line.startsWith('### '))
        return `<h3 class="text-base font-semibold text-amber-300 mt-3 mb-1">${linkBrain(line.slice(4))}</h3>`
      // Bullet points
      if (line.startsWith('- ')) {
        const content = line
          .slice(2)
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
      const formatted = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
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
  phase?: string
  parentUnit?: string
  detachmentId?: string
  /** Per-node edition tag from the Worker (`'11th' | '10th' | '9th'`). */
  edition?: string
  sources: any[]
  keywords: string[]
  /**
   * Structured USR / core-ability entries promoted onto the datasheet Node
   * by the server parser (PR #71/#76). Each entry carries the keyword and an
   * optional value (e.g. `FIRING DECK 2`, `FEEL NO PAIN 5+`). When present
   * the unit-card chip row should render value-bearing entries with the
   * value appended so `FIRING DECK 2` doesn't collapse to plain `FIRING
   * DECK` (Bug 5 in the round-2 verification report).
   */
  coreAbilities?: Array<{ keyword: string; value?: string }>
}

interface DetectedFactions {
  factions: string[]
  strippedQuery: string
  keywords: string[]
}

// ── Card builder ─────────────────────────────────────────────────────────────

/** Parse "M6\" T4 Sv3+ W2 Ld6+ OC1" style stat line from content */
function parseStatLine(content: string) {
  const stats: {
    move: string
    toughness: string
    save: string
    wounds: string
    leadership: string
    oc: string
    invSv?: string
  } = { move: '-', toughness: '-', save: '-', wounds: '-', leadership: '-', oc: '-' }
  const m = content.match(
    /M(\d+["\u2033]?)\s+T(\d+)\s+Sv(\d+\+)\s+W(\d+)\s+Ld(\d+\+)\s+OC(\d+)\s*(\d+\+\+)?/,
  )
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
  const internal =
    /^(t\d|sv\d|w\d|pts-|ppw-|moderate|cheap|expensive|premium|heavy-|light-|standard-|elite-|super-|titanic|toughness-|save-|wounds-|damage-|strength-|invuln-|ap-|ap\d|s\d|d\d|fnp-|feel no pain$|type:|characters$|sustained hits|lethal hits|devastating wounds|hazardous|blast|torrent|twin-linked|rapid fire|melta|lance|anti$|ignores cover|indirect fire|pistol|heavy$|assault$|one shot|^other$|^power armou?r$|^gravis$|^terminator armou?r$|^phobos$|^tacticus$|^mk x|^artificer armou?r$|^scout armou?r$|^deathwing$|^ravenwing$|^inner circle$|^wolf guard$|^sanguinary guard$|^lion guard$)/
  const factionNames = [
    'adeptus astartes',
    'heretic astartes',
    'orks',
    'necrons',
    'tyranids',
    'aeldari',
    "t'au empire",
    'chaos',
    'imperium',
    'drukhari',
    'leagues of votann',
    'adeptus custodes',
    'adeptus mechanicus',
    'adepta sororitas',
    'genestealer cults',
    'death guard',
    'thousand sons',
    'world eaters',
    'chaos daemons',
    'grey knights',
    'imperial agents',
    'imperial knights',
    'chaos knights',
    'astra militarum',
    'agents of the imperium',
    // Subfactions
    'blood angels',
    'dark angels',
    'space wolves',
    'black templars',
    'ultramarines',
    'deathwatch',
    'imperial fists',
    'iron hands',
    'salamanders',
    'raven guard',
    'white scars',
    'crimson fists',
    'blood ravens',
    'ynnari',
    'harlequins',
    'asuryani',
    'plague legions',
    'scintillating legions',
    'legions of excess',
    'blood legions',
    'damned',
  ]
  const display: string[] = []
  const factionKw: string[] = []
  const seen = new Set<string>()
  for (const kw of keywords) {
    const lower = kw.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    if (internal.test(lower)) continue
    if (factionNames.some((f) => lower === f)) {
      factionKw.push(kw)
    } else if (kw.length > 1) {
      display.push(kw)
    }
  }
  return { display, faction: factionKw }
}

/**
 * Remove faction keywords whose display string collides with the node's own
 * factionId display string, and dedupe entries whose displays repeat within
 * the list.
 *
 * The old FORMAL_TO_SLUG map only covered the eight formal names whose slug
 * diverges from the display (e.g. "adeptus astartes" → "space-marines"). Any
 * chapter promoted to a top-level faction in PR B (Death Guard, World Eaters,
 * Thousand Sons, Blood Angels, ...) fell through unfiltered, so their cards
 * came out as "DEATH GUARD DEATH GUARD" (once in the header, once in the
 * keyword bar). PR E also drops the header's `factionKeywords[0]` fallback in
 * UnitCard so the primary badge is always the factionId display — that makes
 * this dedupe against the factionId one line rather than a circular case.
 *
 * See PR E of docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md
 * (Bug 3).
 */
export function filterRedundantFactionKeywords(
  factionKeywords: string[],
  nodeFactionId: string,
): string[] {
  if (!factionKeywords.length) return factionKeywords
  const seen = new Set<string>()
  if (nodeFactionId) seen.add(factionDisplayName(nodeFactionId).toUpperCase())
  const result: string[] = []
  for (const kw of factionKeywords) {
    const display = factionDisplayName(kw).toUpperCase()
    if (seen.has(display)) continue
    seen.add(display)
    result.push(kw)
  }
  return result
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
  const coreAbilityPrefixes = [
    'grenades',
    'deep strike',
    'lone operative',
    'stealth',
    'scouts',
    'infiltrators',
    'deadly demise',
    'fights first',
    'firing deck',
  ]
  // Prefer the server-parsed structured coreAbilities (PR #71/#76) when
  // present — those carry the optional `value` field (e.g. `FIRING DECK 2`).
  // Fall back to deriving from displayKeywords when the structured field is
  // absent so legacy datasheets keep showing chips.
  const coreAbilities: UnitCardData['coreAbilities'] =
    node.coreAbilities && node.coreAbilities.length > 0
      ? node.coreAbilities.map((ca) =>
          ca.value ? { keyword: ca.keyword, value: ca.value } : { keyword: ca.keyword },
        )
      : displayKeywords
          .filter((k) => coreAbilityPrefixes.some((prefix) => k.toLowerCase().startsWith(prefix)))
          .map((k) => {
            // Title-case the ability name
            return k
              .split(' ')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ')
          })

  // Feel No Pain — extract value from fnp-X keyword (set by server parser)
  const fnpKeyword = allKeywords.find((k) => /^fnp-\d$/.test(k))
  const fnpValue = fnpKeyword ? `${fnpKeyword.replace('fnp-', '')}++` : undefined

  return {
    id: node.id,
    name: node.title,
    factionId: node.factionId || '',
    role,
    derivedType: role,
    points,
    stats: { ...stats, ...(fnpValue ? { fnp: fnpValue } : {}) },
    rangedWeapons: [] as any[], // populated async from /browse/unit/:id
    meleeWeapons: [] as any[],
    abilities: [] as any[],
    coreAbilities,
    keywords: displayKeywords.filter(
      (k) => !coreAbilityPrefixes.some((prefix) => k.toLowerCase().startsWith(prefix)),
    ),
    factionKeywords,
    composition,
    loadout,
    wargearOptions,
    leaders: [],
  }
}

/** Response type for the /browse/unit/:id endpoint */
interface UnitEndpointResponse {
  datasheet: any
  weapons: Array<{ title: string; content: string; summary: string; category: string }>
  abilities: Array<{
    title: string
    content: string
    summary: string
    category: string
    keywords: string[]
  }>
  /** Server-driven layout descriptor — present when the server has a registered builder. */
  layout?: CardLayout
  /** Errata entries linked to this datasheet (PR: card display layer). */
  errata?: Array<{
    nodeId: string
    title: string
    content: string
    source: { type: string; title: string; page?: number }
  }>
  /**
   * 11e attachment refs surfaced by the server (PR #76 SUPPORT extraction).
   *
   * - For a character datasheet: forward `can_lead` / `can_support` refs
   *   (units the character can attach to).
   * - For a non-character: reverse refs (characters that can attach to it).
   *
   * The card renders these as collapsed panels — labels swap depending on
   * whether the datasheet itself is a character.
   */
  leaders?: AttachmentChip[]
  support?: AttachmentChip[]
}

/**
 * Strip leading copies of an ability title from its description body.
 *
 * Wahapedia / BSData ability descriptions sometimes open with the rule name
 * as a header ("Deep Strike\nDEEP STRIKE\n<rule text>"). UnitCard's
 * CollapsibleUSR already prints the title above the body — leaving the
 * leading header in the description body produces a visible duplication
 * (or triplication when both Title Case and ALL CAPS forms are present).
 */
function stripLeadingAbilityTitle(description: string, title: string): string {
  if (!description || !title) return description
  const trimmedTitle = title.trim()
  if (!trimmedTitle) return description

  let out = description
  let changed = true
  let iterations = 0
  while (changed && iterations < 3) {
    changed = false
    iterations++
    const escaped = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const variants = [
      new RegExp(`^\\s*\\*\\*${escaped}\\*\\*\\s*\\n?`, 'i'),
      new RegExp(`^\\s*${escaped}\\s*\\n`, 'i'),
    ]
    for (const re of variants) {
      const next = out.replace(re, '')
      if (next !== out) {
        out = next
        changed = true
        break
      }
    }
  }
  return out
}

/** Fetch full unit data (datasheet + weapons + abilities) from API */
async function fetchFullUnitData(
  nodeId: string,
  node: ResultNode,
  edition: Edition,
): Promise<{
  unitData: UnitCardData
  layout: CardLayout | null
  /** When the unit exists but not in the requested edition (404 + X-Available-Editions). */
  unavailable?: { available: Edition[] }
}> {
  const base = buildUnitData(node)

  try {
    const res = await brainFetch(`/browse/unit/${encodeURIComponent(nodeId)}`, { edition })
    if (res.status === 404) {
      const available = parseAvailableEditions(res.headers.get('X-Available-Editions'))
      if (available.length > 0) {
        return { unitData: base, layout: null, unavailable: { available } }
      }
      return { unitData: base, layout: null }
    }
    if (!res.ok) return { unitData: base, layout: null }

    const data = (await res.json()) as UnitEndpointResponse

    // Parse weapons from weapon nodes
    const ranged: any[] = []
    const melee: any[] = []
    for (const w of data.weapons) {
      // Summary format: "Name (Type) — Range, AttA, SKILL, SSTR, APAP, DDAM. [abilities]"
      const m = w.summary.match(
        /^(.+?)\s*\((\w+)\)\s*—\s*(\S+),\s*(\S+),\s*\S(\d+),\s*AP(\S+),\s*D(\S+)/,
      )
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

    // Parse abilities from ability nodes. Strip leading title duplicates from
    // the description so the rendered card doesn't show "Deep StrikeDeep
    // StrikeDEEP STRIKE" — Wahapedia descriptions sometimes embed the rule
    // name as a heading and the RenderAbility component already prints the
    // title above the body.
    const unitAbilities = data.abilities.map((a) => ({
      name: a.title,
      description: stripLeadingAbilityTitle(a.content || a.summary, a.title),
      type: a.keywords?.includes('faction') ? 'Faction' : 'Datasheet',
    }))

    return {
      unitData: {
        ...base,
        rangedWeapons: ranged,
        meleeWeapons: melee,
        abilities: unitAbilities,
        // Surface linked errata onto the card. Server attaches via
        // errata-linker (see worker.ts /browse/unit handler).
        ...(data.errata && data.errata.length > 0 ? { errata: data.errata } : {}),
        // 11e attachment chips (PR #76 SUPPORT extraction wired into the
        // /browse/unit/:id response — see UnitCardData.leaderChips/supportChips).
        ...(data.leaders && data.leaders.length > 0 ? { leaderChips: data.leaders } : {}),
        ...(data.support && data.support.length > 0 ? { supportChips: data.support } : {}),
      },
      layout: data.layout ?? null,
    }
  } catch {
    return { unitData: base, layout: null }
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
  }
}

function buildEnhancementData(node: ResultNode) {
  const content = node.content || node.summary || ''
  // Extract cost from "**Cost:** 10", "**Name** (10 pts)" header, or summary "(10pts)"
  const costMatch =
    content.match(/\*\*Cost:\*\*\s*(\d+)/) ||
    content.match(/^\*\*[^*]+\*\*\s*\((\d+)\s*pts?\)/) ||
    node.summary?.match(/\((\d+)pts?\)/)
  const cost = costMatch ? costMatch[1] : ''
  // Strip the leading "**Name** (Npts)" header from MFM nodes (apps/brain/
  // server/src/lib/parsers/mfm-detachments.ts buildEnhancementNode). The name
  // and cost are already surfaced via the card props — leaving the header in
  // the description shows literal markdown asterisks above the body text.
  const lines = content
    .replace(/^\*\*[^*]+\*\*\s*\(\d+\s*pts?\)\s*\n?/, '')
    .replace(/\*\*Cost:\*\*\s*\d+\s*/, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const restrictionLine = lines[0] && /model only/i.test(lines[0]) ? lines[0] : ''
  const description = restrictionLine ? lines.slice(1).join('\n') : lines.join('\n')
  // Detachment name from detachmentId (format: "det:faction:slug" or just a slug)
  const detSlug = node.detachmentId || ''
  const detName = detSlug.includes(':')
    ? detSlug
        .split(':')
        .pop()!
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
    : detSlug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

  return {
    id: node.id,
    name: node.title,
    cost,
    restriction: restrictionLine,
    description,
    detachmentName: detName,
    factionId: node.factionId || '',
  }
}

// ── Entity map builder ───────────────────────────────────────────────────────

function buildEntityMap(nodes: ResultNode[], keywords?: string[]): EntityMap {
  const map: EntityMap = new Map()
  for (const node of nodes) {
    const type =
      node.category === 'datasheet'
        ? 'unit'
        : node.category === 'stratagem'
          ? 'stratagem'
          : node.category === 'enhancement'
            ? 'enhancement'
            : node.category === 'faction-ability' ||
                node.category === 'detachment-rule' ||
                node.category === 'detachment'
              ? 'rule'
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
  fallback?: boolean
  fallbackFrom?: Edition
}

interface AskTabProps {
  onOpenCard: (node: ResultNode) => void
  activeFilters: string[]
  onFilterChange: (filters: string[]) => void
  edition: Edition
}

function AskTab({ onOpenCard, activeFilters, onFilterChange, edition }: AskTabProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<QAResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [factionFilter, setFactionFilter] = useState(true)
  const [fallbackDismissed, setFallbackDismissed] = useState(false)
  const [entityMap, setEntityMap] = useState<EntityMap>(new Map())

  function clearResults() {
    setAnswer(null)
    setError(null)
    setEntityMap(new Map())
    setFactionFilter(true)
    setFallbackDismissed(false)
  }

  const doAsk = useCallback(
    async (q: string) => {
      if (!q.trim()) return
      setLoading(true)
      setError(null)
      setAnswer(null)
      setFactionFilter(true)
      setFallbackDismissed(false)

      try {
        const res = await brainFetch(`/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
          edition,
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || `HTTP ${res.status}`)
        }

        const data = (await res.json()) as QAResponse
        setAnswer(data)
        setEntityMap(buildEntityMap(data.reference || [], data.detected?.keywords))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get answer')
      } finally {
        setLoading(false)
      }
    },
    [edition],
  )

  // Re-query when filters change (only if we have a question)
  useEffect(() => {
    if (!question.trim() || activeFilters.length === 0) return
    const combined = [question, ...activeFilters].join(' ')
    doAsk(combined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters])

  function handleAsk() {
    const combined = activeFilters.length > 0 ? [question, ...activeFilters].join(' ') : question
    doAsk(combined)
  }

  function removeFilter(f: string) {
    onFilterChange(activeFilters.filter((x) => x !== f))
  }

  return (
    <div className="space-y-4">
      {(answer || error) && (
        <div className="flex justify-end">
          <button
            onClick={clearResults}
            data-testid="ask-clear-results"
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            Clear results
          </button>
        </div>
      )}
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
          {activeFilters.map((f) => (
            <span
              key={f}
              className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded flex items-center gap-1"
            >
              {f}
              <button
                onClick={() => removeFilter(f)}
                className="text-amber-400/60 hover:text-amber-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Loading overlay: spinner sits above (or beside) whatever's already
          rendered, and the previous answer blurs behind it so the user knows
          new data is on the way without losing visual continuity. */}
      {loading && (
        <div
          className={`flex items-center justify-center py-10 ${
            answer ? 'absolute inset-x-0 top-32 z-10 pointer-events-none' : ''
          }`}
          data-testid="ask-loading-spinner"
        >
          <div className="flex flex-col items-center gap-3 bg-slate-950/70 backdrop-blur-sm rounded-lg px-8 py-6 border border-slate-700">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent"></div>
            <span className="text-slate-300 text-sm font-medium">Thinking…</span>
          </div>
        </div>
      )}

      <div
        className={
          loading
            ? 'opacity-40 blur-sm pointer-events-none transition-all duration-200'
            : 'transition-all duration-200'
        }
      >
        {answer && (
          <div className="space-y-4">
            {factionFilter && answer.detected?.factions?.length > 0 && (
              <FactionBanner
                factions={answer.detected.factions}
                onDismiss={() => setFactionFilter(false)}
              />
            )}

            {!fallbackDismissed && answer.fallback && answer.fallbackFrom && (
              <EditionFallbackBanner
                fallbackFrom={answer.fallbackFrom}
                onDismiss={() => setFallbackDismissed(true)}
              />
            )}

            <div
              className="bg-slate-900 border border-slate-700 rounded p-4 overflow-auto max-h-[70vh]"
              onClick={async (e) => {
                const target = e.target as HTMLElement
                const nodeId = target.closest('[data-brain-node]')?.getAttribute('data-brain-node')
                if (!nodeId) return
                // Try reference list first
                const node = answer.reference?.find((r) => r.id === nodeId)
                if (node) {
                  onOpenCard(node)
                  return
                }
                // Fetch from API if not in reference
                try {
                  const res = await brainFetch(`/browse/node/${encodeURIComponent(nodeId)}`, {
                    edition,
                  })
                  if (res.ok) {
                    const data = (await res.json()) as { node: ResultNode }
                    if (data.node) onOpenCard(data.node)
                  }
                } catch {
                  /* ignore fetch errors */
                }
              }}
            >
              <div
                className="max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(answer.answer) }}
              />
            </div>

            {answer.webSources && answer.webSources.length > 0 && (
              <details className="bg-slate-900/50 border border-slate-800 rounded p-3">
                <summary className="text-xs font-medium text-slate-400 uppercase cursor-pointer select-none hover:text-slate-300">
                  Sources ({answer.webSources.length})
                </summary>
                <div className="flex flex-wrap gap-2 mt-2">
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
              </details>
            )}

            {answer.reference && answer.reference.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-sm font-medium text-slate-400 uppercase">Reference</h4>
                  <ActiveEditionChip edition={edition} />
                </div>
                {answer.reference.map((r, i) => (
                  <div key={r.id + '-' + i} className="mb-2">
                    <button onClick={() => onOpenCard(r)} className="w-full text-left">
                      <ResultCard
                        index={i + 1}
                        title={r.title}
                        summary={r.summary}
                        layer={r.layer}
                        category={r.category}
                        score={r.score}
                        factionId={r.factionId}
                        phase={r.phase}
                        parentUnit={r.parentUnit}
                        edition={r.edition}
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
                                const res = await brainFetch(
                                  `/browse/node/${encodeURIComponent(info.nodeId)}`,
                                  { edition },
                                )
                                if (res.ok) {
                                  const data = (await res.json()) as { node: ResultNode }
                                  if (data.node) {
                                    onOpenCard(data.node)
                                    return
                                  }
                                }
                              } catch {
                                /* fall through */
                              }
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
                <h4 className="text-xs font-medium text-slate-400 uppercase mb-2">
                  Sources ({answer.sources.length} nodes, {answer.connectedCount} connected)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {answer.sources.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 bg-slate-800 rounded px-2 py-1 text-xs"
                    >
                      <span className="text-amber-400">{s.layer}</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-slate-300">
                        {s.title.length > 40 ? s.title.substring(0, 37) + '...' : s.title}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
  fallback?: boolean
  fallbackFrom?: Edition
}

interface SearchTabProps {
  onOpenCard: (node: ResultNode) => void
  onOpenRecord?: (record: SearchRecord) => void
  activeFilters: string[]
  onFilterChange: (filters: string[]) => void
  edition: Edition
}

function SearchTab({
  onOpenCard,
  onOpenRecord,
  activeFilters,
  onFilterChange,
  edition,
}: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [factionFilter, setFactionFilter] = useState(true)
  const [fallbackDismissed, setFallbackDismissed] = useState(false)
  const [entityMap, setEntityMap] = useState<EntityMap>(new Map())
  const [page, setPage] = useState(1)
  // Track the last query string used so page-change re-fetches use the correct query
  const lastQueryRef = useRef('')

  const doSearch = useCallback(
    async (q: string, p: number) => {
      if (!q.trim()) return
      lastQueryRef.current = q
      setLoading(true)
      setFactionFilter(true)
      setFallbackDismissed(false)
      try {
        const res = await brainFetch(`/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, page: p, pageSize: 10 }),
          edition,
        })
        const data = (await res.json()) as SearchResponse
        setResponse(data)
        // Build entity map from whichever node list is available
        const nodes = data.records ? data.records.map((r) => r.primaryNode) : (data.results ?? [])
        setEntityMap(buildEntityMap(nodes, data.detected?.keywords))
      } catch {
        setResponse(null)
      } finally {
        setLoading(false)
      }
    },
    [edition],
  )

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
    const combined = activeFilters.length > 0 ? [query, ...activeFilters].join(' ') : query
    setPage(1)
    doSearch(combined, 1)
  }

  function removeFilter(f: string) {
    onFilterChange(activeFilters.filter((x) => x !== f))
  }

  function handlePageChange(p: number) {
    setPage(p)
    // doSearch will be triggered by the page useEffect
  }

  function clearResults() {
    setResponse(null)
    setEntityMap(new Map())
    setPage(1)
    setFactionFilter(true)
    setFallbackDismissed(false)
    lastQueryRef.current = ''
  }

  const detected = response?.detected

  // Determine rendering mode: record-based (new) or flat (legacy)
  const isRecordMode = !!response?.records

  // For legacy mode, build a flat list (no pagination from server)
  const legacyResults = response?.results ?? []

  return (
    <div className="space-y-4">
      {response && (
        <div className="flex justify-end">
          <button
            onClick={clearResults}
            data-testid="search-clear-results"
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            Clear results
          </button>
        </div>
      )}
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
          {activeFilters.map((f) => (
            <span
              key={f}
              className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded flex items-center gap-1"
            >
              {f}
              <button
                onClick={() => removeFilter(f)}
                className="text-amber-400/60 hover:text-amber-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {factionFilter && detected && detected.factions.length > 0 && (
        <FactionBanner factions={detected.factions} onDismiss={() => setFactionFilter(false)} />
      )}

      {!fallbackDismissed && response?.fallback && response.fallbackFrom && (
        <EditionFallbackBanner
          fallbackFrom={response.fallbackFrom}
          onDismiss={() => setFallbackDismissed(true)}
        />
      )}

      {/* Total count */}
      {response?.total != null && response.total > 0 && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-500">{response.total} results</p>
          <ActiveEditionChip edition={edition} />
        </div>
      )}

      {/* Record-based results (new format) */}
      {isRecordMode && response!.records!.length > 0 && (
        <div className="space-y-2">
          {response!.records!.map((record, i) => {
            const r = record.primaryNode
            // Collect titles of matched child nodes for the badge
            const matchedChildTitles =
              record.matchedChildIds.length > 0
                ? record.childNodes
                    .filter((c) => record.matchedChildIds.includes(c.id))
                    .map((c) => c.title)
                : []

            return (
              <div key={r.id + '-' + i} className="mb-2">
                <button
                  onClick={() => (onOpenRecord ? onOpenRecord(record) : onOpenCard(r))}
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
                    phase={r.phase}
                    parentUnit={r.parentUnit}
                    edition={r.edition}
                  />
                </button>
                {matchedChildTitles.length > 0 && (
                  <p className="text-xs text-slate-500 mt-0.5 px-3">
                    Matched:{' '}
                    <span className="text-amber-400/70">{matchedChildTitles.join(', ')}</span>
                  </p>
                )}
                {entityMap.size > 0 && r.summary && (
                  <p className="text-xs text-slate-400 mt-1 px-3">
                    <LinkedText
                      text={r.summary}
                      entities={entityMap}
                      onEntityClick={() => (onOpenRecord ? onOpenRecord(record) : onOpenCard(r))}
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
              <button onClick={() => onOpenCard(r)} className="w-full text-left">
                <ResultCard
                  index={i + 1}
                  title={r.title}
                  summary={r.summary}
                  layer={r.layer}
                  category={r.category}
                  score={r.score}
                  factionId={r.factionId}
                  phase={r.phase}
                  parentUnit={r.parentUnit}
                  edition={r.edition}
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
  edition: Edition
}

interface BrowsePaginatedResponse {
  nodes: any[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function BrowseTab({ onOpenCard, edition }: BrowseTabProps) {
  const [layers, setLayers] = useState<BrowseLayer[]>([])
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const [browseResponse, setBrowseResponse] = useState<BrowsePaginatedResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [layersLoading, setLayersLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Load layers whenever the edition changes. Sidebar counts and layer-view
  // counts must respect the same edition filter — otherwise the sidebar shows
  // "Units (2605)" while the layer view shows "1352 results" under
  // `?edition=11th`. See PR E of the 2026-07-03 scalar-to-ref refactor plan.
  useEffect(() => {
    setLayersLoading(true)
    brainFetch(`/browse/layers`, { edition })
      .then((r) => r.json())
      .then((data) => {
        setLayers(data.layers || [])
        setLayersLoading(false)
      })
      .catch(() => setLayersLoading(false))
  }, [edition])

  // Reset page when layer or edition changes
  useEffect(() => {
    setPage(1)
  }, [selectedLayer, edition])

  // Load nodes when layer, page, or edition changes
  useEffect(() => {
    if (!selectedLayer) {
      setBrowseResponse(null)
      return
    }
    setLoading(true)
    brainFetch(`/browse/nodes?layer=${selectedLayer}&page=${page}&pageSize=${pageSize}`, {
      edition,
    })
      .then((r) => r.json())
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
  }, [selectedLayer, page, edition])

  // Load full node detail and open card
  function viewNode(nodeId: string) {
    brainFetch(`/browse/node/${encodeURIComponent(nodeId)}`, { edition })
      .then((r) => r.json())
      .then((data) => {
        if (data.node) {
          Promise.resolve(onOpenCard(data.node)).catch((err: unknown) =>
            console.error('Card open failed:', err),
          )
        }
      })
      .catch((err) => console.error('Browse node fetch failed:', err))
  }

  const nodes = browseResponse?.nodes ?? []
  const total = browseResponse?.total ?? 0
  const totalPages = browseResponse?.totalPages ?? 1
  const currentPage = browseResponse?.page ?? page

  return (
    <div className="flex">
      <aside className="w-48 border-r border-slate-800 p-4 shrink-0">
        {edition !== 'any' && (
          <div className="mb-3">
            <ActiveEditionChip edition={edition} />
          </div>
        )}
        <nav className="space-y-1">
          {layersLoading && <p className="text-xs text-slate-500">Loading...</p>}
          {layers.map((layer) => (
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
          {!selectedLayer && <p className="text-slate-400">Select a layer to browse rules.</p>}
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
                    edition={node.edition}
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
  /** Server-driven layout descriptor — set alongside activeCard for datasheets. */
  const [activeLayout, setActiveLayout] = useState<CardLayout | null>(null)
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [detachmentView, setDetachmentView] = useState<DetachmentPageProps | null>(null)
  const [edition, setEditionState] = useState<Edition>(() =>
    typeof window === 'undefined' ? '11th' : parseEditionFromHash(window.location.hash),
  )
  /** When a direct-fetch (e.g. /browse/unit/:id) returned 404 with X-Available-Editions. */
  const [editionUnavailable, setEditionUnavailable] = useState<{
    subject: string
    requested: Edition
    available: Edition[]
    retry: (nextEdition: Edition) => Promise<void> | void
  } | null>(null)
  const [pdfView, setPdfView] = useState<{
    pdfName: string
    page: number
    title: string
    topPct?: number
    heightPct?: number
    leftPct?: number
    widthPct?: number
  } | null>(null)

  // Sync edition state back into window.location.hash so it survives reload + share.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const next = writeEditionToHash(window.location.hash, edition)
    if (window.location.hash.replace(/^#/, '') !== next) {
      // Replace hash without scrolling.
      const url = `${window.location.pathname}${window.location.search}#${next}`
      window.history.replaceState(null, '', url)
    }
  }, [edition])

  // Listen for hash changes from elsewhere (back/forward, manual edit, deep link)
  // so the picker stays in sync.
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onHashChange() {
      const next = parseEditionFromHash(window.location.hash)
      setEditionState((prev) => (prev === next ? prev : next))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function setEdition(next: Edition) {
    setEditionState(next)
    // Clear any stale "this entry isn't available" notice — the user just
    // changed editions, so the next render's fetch will produce a fresh state.
    setEditionUnavailable(null)
  }

  async function handleOpenRecord(record: SearchRecord) {
    const node = record.primaryNode

    // For unit cards — delegate to fetchFullUnitData to get the layout descriptor too
    if (record.type === 'unit' || node.category === 'datasheet') {
      const result = await fetchFullUnitData(node.id, node, edition)
      if (result.unavailable) {
        setEditionUnavailable({
          subject: 'This unit',
          requested: edition,
          available: result.unavailable.available,
          retry: async (next) => {
            const retried = await fetchFullUnitData(node.id, node, next)
            setActiveCard({
              type: 'unit',
              data: { ...retried.unitData, errata: record.errata },
            })
            setActiveLayout(retried.layout)
            setEdition(next)
          },
        })
        // Still show whatever fallback unit card we built from the search hit.
        setActiveCard({
          type: 'unit',
          data: { ...result.unitData, errata: record.errata },
        })
        setActiveLayout(result.layout)
        return
      }
      setActiveCard({
        type: 'unit',
        data: { ...result.unitData, errata: record.errata },
      })
      setActiveLayout(result.layout)
      return
    }

    // For army rules, fetch sub-abilities from API
    if (node.category === 'army-rule') {
      try {
        const res = await brainFetch(`/browse/army-rule/${encodeURIComponent(node.id)}`, {
          edition,
        })
        const data = (await res.json()) as { armyRule: ResultNode; subAbilities: ResultNode[] }
        const subRules = data.subAbilities.map((a) => ({
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
            isArmyRule: true,
            subRules: subRules.length > 0 ? subRules : undefined,
            sources: node.sources as any[],
          },
        })
        return
      } catch {
        /* fall through to default */
      }
    }

    // For ALL other types: use resolveCardView (never PDF-first)
    const { card } = resolveCardView(node)
    if (record.errata && record.errata.length > 0) {
      ;(card.data as any).errata = record.errata
    }
    setActiveCard(card)
  }

  async function handleOpenCard(node: ResultNode) {
    // For unit cards, fetch full data (weapons + abilities) from API
    if (node.category === 'datasheet') {
      const result = await fetchFullUnitData(node.id, node, edition)
      if (result.unavailable) {
        setEditionUnavailable({
          subject: 'This unit',
          requested: edition,
          available: result.unavailable.available,
          retry: async (next) => {
            const retried = await fetchFullUnitData(node.id, node, next)
            setActiveCard({ type: 'unit', data: retried.unitData })
            setActiveLayout(retried.layout)
            setEdition(next)
          },
        })
      }
      setActiveCard({ type: 'unit', data: result.unitData })
      setActiveLayout(result.layout)
      return
    }

    // For detachment cards, fetch stratagems + enhancements from API.
    // Post PR #76 merge-sources collapse, the survivor node may carry
    // category 'detachment' instead of 'detachment-rule'. Accept both
    // so the STRATAGEMS/ENHANCEMENTS sections populate either way.
    if (node.category === 'detachment-rule' || node.category === 'detachment') {
      const { card } = resolveCardView(node)
      if (card.type === 'detachment') {
        try {
          const res = await brainFetch(`/browse/detachment/${encodeURIComponent(node.id)}`, {
            edition,
          })
          if (res.status === 404) {
            const available = parseAvailableEditions(res.headers.get('X-Available-Editions'))
            if (available.length > 0) {
              setEditionUnavailable({
                subject: 'This detachment',
                requested: edition,
                available,
                retry: async (next) => {
                  await handleOpenCard(node)
                  setEdition(next)
                },
              })
            }
          }
          const data = (await res.json()) as {
            detachment: ResultNode
            stratagems: ResultNode[]
            enhancements: ResultNode[]
            abilities: ResultNode[]
            errata?: Array<{
              nodeId: string
              title: string
              content: string
              source: { type: string; title: string; page?: number }
            }>
          }
          card.data.stratagems = (data.stratagems || []).map((n) => buildStratagemData(n))
          card.data.enhancements = (data.enhancements || []).map((n) => buildEnhancementData(n))
          if (data.errata && data.errata.length > 0) {
            card.data.errata = data.errata
          }
          // Lift MFM-merged structured fields onto the card when the server
          // returns them (PR #70). The merge step on the worker collapses
          // mfm:det:* into det:* so this is the canonical source now.
          const detNode = data.detachment as any
          if (detNode?.dp != null) card.data.dp = detNode.dp
          if (detNode?.forceDisposition) card.data.forceDisposition = detNode.forceDisposition
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
        const res = await brainFetch(`/browse/army-rule/${encodeURIComponent(node.id)}`, {
          edition,
        })
        const data = (await res.json()) as { armyRule: ResultNode; subAbilities: ResultNode[] }
        const subRules = data.subAbilities.map((a) => ({
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
            isArmyRule: true,
            subRules: subRules.length > 0 ? subRules : undefined,
            sources: node.sources as any[],
          },
        })
        return
      } catch {
        /* fall through */
      }
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
        const res = await brainFetch(`/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, pageSize: 5 }),
          edition,
        })
        if (res.ok) {
          const data = (await res.json()) as SearchResponse
          // Look for an exact title match first among records
          const records = data.records ?? []
          const exactMatch = records.find(
            (r) => r.primaryNode.title.toLowerCase() === term.toLowerCase(),
          )
          if (exactMatch) {
            handleOpenRecord(exactMatch)
            return
          }
          // Fall back to first non-unit result (prefer rules/mechanics)
          const ruleResult = records.find((r) => r.primaryNode.category !== 'datasheet')
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
      } catch {
        /* fall through to filter behavior */
      }
      // If no rule found, add as filter
      setActiveCard(null)
      setActiveFilters((prev) => (prev.includes(term) ? prev : [...prev, term]))
    },
    onDismiss: () => {
      setActiveCard(null)
      setActiveLayout(null)
    },
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
            <span className="text-xs text-slate-600" data-testid="app-version">
              {__APP_VERSION__}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <EditionPicker value={edition} onChange={setEdition} />
            <div className="flex gap-1">
              {(['ask', 'search', 'browse', 'graph'] as const).map((t) => (
                <button
                  key={t}
                  data-testid={`tab-${t}`}
                  onClick={() => handleTabSwitch(t)}
                  className={`px-3 py-1.5 text-sm rounded ${
                    tab === t
                      ? 'bg-amber-500 text-slate-950 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'ask'
                    ? 'Ask'
                    : t === 'search'
                      ? 'Search'
                      : t === 'browse'
                        ? 'Browse'
                        : 'Graph'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {detachmentView ? (
        <DetachmentPage {...detachmentView} />
      ) : (
        <>
          {/* All four tab panels stay mounted across tab switches so their
              internal React state (results, queries, scroll, expanded
              sections) survives. Visibility is toggled via `hidden` so the
              browser hides three of them without React unmounting. */}
          <main hidden={tab !== 'ask'} className="flex-1 p-4 max-w-4xl mx-auto">
            <AskTab
              onOpenCard={handleOpenCard}
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
              edition={edition}
            />
          </main>
          <main hidden={tab !== 'search'} className="flex-1 p-4 max-w-4xl mx-auto">
            <SearchTab
              onOpenCard={handleOpenCard}
              onOpenRecord={handleOpenRecord}
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
              edition={edition}
            />
          </main>
          <div hidden={tab !== 'browse'}>
            <BrowseTab onOpenCard={handleOpenCard} edition={edition} />
          </div>
          <div hidden={tab !== 'graph'}>
            <ForceGraph edition={edition} />
          </div>
        </>
      )}

      <Overlay
        open={!!activeCard}
        onDismiss={() => {
          setActiveCard(null)
          setActiveLayout(null)
          setEditionUnavailable(null)
        }}
      >
        {editionUnavailable && (
          <div className="mb-3">
            <EditionNotAvailableNotice
              requested={editionUnavailable.requested}
              available={editionUnavailable.available}
              subject={editionUnavailable.subject}
              onSwitch={async (next) => {
                const action = editionUnavailable.retry
                setEditionUnavailable(null)
                await Promise.resolve(action(next))
              }}
            />
          </div>
        )}
        {activeCard?.type === 'unit' &&
          (activeLayout ? (
            <LayoutRenderer layout={activeLayout} />
          ) : (
            <UnitCard data={activeCard.data} context={cardContext} />
          ))}
        {activeCard?.type === 'stratagem' && (
          <StratagemCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'enhancement' && (
          <EnhancementCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'rule' && <RuleCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'mission' && (
          <MissionCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'twist' && <TwistCard data={activeCard.data} context={cardContext} />}
        {activeCard?.type === 'challenger' && (
          <ChallengerCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'core-rule' && (
          <CoreRuleCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'deployment-zone' && (
          <DeploymentZoneCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'force-disposition' && (
          <ForceDispositionCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'terrain-layout' && (
          <TerrainLayoutCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'errata' && (
          <ErrataCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'balance' && (
          <BalanceCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'community' && (
          <CommunityCard data={activeCard.data} context={cardContext} />
        )}
        {activeCard?.type === 'detachment' && (
          <DetachmentCard data={activeCard.data} context={cardContext} />
        )}
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
