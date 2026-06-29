/**
 * card-layout.ts — Server-side layout descriptor builders.
 *
 * Each `build*Layout` function converts structured node data into a
 * `CardLayout` JSON descriptor the client renders via `LayoutRenderer`
 * without any category-specific component code.
 *
 * Currently only datasheets are migrated.  Other categories continue to use
 * the existing TSX components on the client.
 */

import type { CardLayout, CardLayoutNode } from '../../../shared/card-layout-types'
import type { Node } from './model'

// Re-export so worker.ts can use it via a single import.
export type { CardLayout }

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format a node's points array into a display string, e.g. "1 model: 75pts". */
function formatPoints(node: Node): string {
  if (!node.points || node.points.length === 0) return ''
  return node.points.map((p) => `${p.models}: ${p.cost}pts`).join(', ')
}

/** Map factionId slug → display name (title-cased). */
function formatFactionName(node: Node): string {
  return (
    node.factionName ||
    (node.factionId
      ? node.factionId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : '')
  )
}

/** Keywords to treat as "core abilities" (rendered as pill badges, not ability blocks). */
const CORE_ABILITY_PREFIXES = [
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

function isCoreAbility(kw: string): boolean {
  const lower = kw.toLowerCase()
  return CORE_ABILITY_PREFIXES.some((p) => lower.startsWith(p))
}

/** Internal/meta keywords that are never shown in the keyword bar. */
const INTERNAL_KW_RE =
  /^(t\d|sv\d|w\d|pts-|ppw-|moderate|cheap|expensive|premium|heavy-|light-|standard-|elite-|super-|titanic|toughness-|save-|wounds-|damage-|strength-|invuln-|ap-|ap\d|s\d|d\d|fnp-|feel no pain$|type:|characters$|sustained hits|lethal hits|devastating wounds|hazardous|blast|torrent|twin-linked|rapid fire|melta|lance|anti$|ignores cover|indirect fire|pistol|heavy$|assault$|one shot|^other$)/

const FACTION_NAMES = new Set([
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
])

interface FilteredKeywords {
  display: string[]
  faction: string[]
  coreAbilities: string[]
}

function filterKeywords(node: Node): FilteredKeywords {
  const display: string[] = []
  const faction: string[] = []
  const coreAbilities: string[] = []
  const seen = new Set<string>()

  for (const kw of node.keywords) {
    const lower = kw.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    if (INTERNAL_KW_RE.test(lower)) continue

    if (FACTION_NAMES.has(lower)) {
      faction.push(kw)
    } else if (isCoreAbility(lower)) {
      coreAbilities.push(
        kw
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
      )
    } else if (kw.length > 1) {
      display.push(kw)
    }
  }

  return { display, faction, coreAbilities }
}

/** Parse `**Field:** value` from weapon node content. */
function parseWeaponField(content: string, field: string): string {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*([^\\n|]+)`)
  const m = content.match(re)
  return m ? m[1]!.trim() : ''
}

/** Extract weapon ability tags like `[HEAVY]` from a text string. */
function parseAbilityTags(text: string): string[] {
  return Array.from(text.matchAll(/\[([^\]]+)\]/g)).map((m) => m[1]!)
}

/** Extract a `**Field:** value` block from datasheet content. */
function extractContentField(content: string, field: string): string {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]|$)`, 'i')
  const m = content.match(re)
  return m ? m[1]!.trim() : ''
}

/**
 * Strip a leading copy of the ability title from its description body.
 *
 * Wahapedia / BSData ability descriptions sometimes open with the rule name
 * as a header (e.g. "Deep Strike\nDEEP STRIKE\n<rule text>"). When the
 * RenderAbility renderer already prints the title above the body, leaving it
 * inside the body produces the visible "Deep StrikeDeep StrikeDEEP STRIKE"
 * triplication on the unit card.
 *
 * Matches a few common variants conservatively — exact title, uppercase
 * title, or **bold** title — and only at the very start of the description.
 */
function stripLeadingTitle(description: string, title: string): string {
  if (!description || !title) return description
  const trimmedTitle = title.trim()
  if (!trimmedTitle) return description

  let out = description
  let changed = true
  // Iterate a couple of times so we strip both "Deep Strike\n" and a
  // following "DEEP STRIKE\n" in one pass.
  let iterations = 0
  while (changed && iterations < 3) {
    changed = false
    iterations++
    const escaped = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const variants = [
      // Bolded markdown header: **Deep Strike**
      new RegExp(`^\\s*\\*\\*${escaped}\\*\\*\\s*\\n?`, 'i'),
      // Plain header (case-insensitive): Deep Strike / DEEP STRIKE
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

// ── Datasheet layout builder ───────────────────────────────────────────────

interface UnitParts {
  datasheet: Node
  weapons: Node[]
  abilities: Node[]
}

const WEAPON_COLS = ['Weapon', 'Range', 'A', 'BS/WS', 'S', 'AP', 'D']

function buildWeaponTable(
  wList: Node[],
  label: string,
  accentColor: 'amber' | 'red',
): CardLayoutNode | null {
  if (wList.length === 0) return null

  const rows = wList.map((w) => {
    const ws = w.weaponStats
    const range = ws?.range ?? parseWeaponField(w.content, 'Range')
    const attacks = ws?.A ?? parseWeaponField(w.content, 'A')
    const skill = ws?.skill ?? parseWeaponField(w.content, 'BS/WS')
    const strength = ws ? String(ws.S) : parseWeaponField(w.content, 'S')
    const ap = ws ? String(ws.AP) : parseWeaponField(w.content, 'AP')
    const damage = ws?.D ?? parseWeaponField(w.content, 'D')

    // Pull ability tags from the summary (which already has them in [TAG] format)
    const tagSource = w.summary?.match(/\[([^\]]+)\]/g)?.join(' ') ?? ''
    const tags = parseAbilityTags(tagSource)

    return {
      cells: [w.title, range, attacks, skill, strength, ap, damage],
      tags: tags.length > 0 ? tags : undefined,
    }
  })

  return { type: 'table', label, accentColor, columns: WEAPON_COLS, rows }
}

/**
 * Build a `CardLayout` descriptor for a datasheet node and its child weapon /
 * ability nodes.  The result is serialised to JSON and returned by the
 * `/browse/unit/:id` endpoint alongside the raw node data.
 */
export function buildDatasheetLayout({ datasheet, weapons, abilities }: UnitParts): CardLayout {
  const layoutNodes: CardLayoutNode[] = []

  // 1. Header
  const points = formatPoints(datasheet)
  const factionName = formatFactionName(datasheet)
  layoutNodes.push({
    type: 'header',
    title: datasheet.title,
    subtitle: factionName || undefined,
    badge: points || undefined,
    badgeColor: 'amber',
  })

  // 2. Stat bar
  const s = datasheet.stats
  const statList: Array<{ label: string; value: string }> = [
    { label: 'M', value: s?.M ?? '-' },
    { label: 'T', value: s ? String(s.T) : '-' },
    { label: 'SV', value: s?.SV ?? '-' },
    { label: 'W', value: s ? String(s.W) : '-' },
    { label: 'LD', value: s?.LD ?? '-' },
    { label: 'OC', value: s ? String(s.OC) : '-' },
  ]
  if (s?.invSv) statList.push({ label: 'INV', value: s.invSv })

  const fnpKw = (datasheet.keywords ?? []).find((k) => /^fnp-\d$/.test(k))
  if (fnpKw) statList.push({ label: 'FNP', value: `${fnpKw.replace('fnp-', '')}++` })

  layoutNodes.push({ type: 'stat-bar', stats: statList })

  // 3. Two-column body: weapons | abilities
  const rangedWeapons = weapons.filter(
    (w) => w.content.includes('**Type:** Ranged') || (w.summary ?? '').includes('(Ranged)'),
  )
  const meleeWeapons = weapons.filter(
    (w) => !w.content.includes('**Type:** Ranged') && !(w.summary ?? '').includes('(Ranged)'),
  )

  const rangedTable = buildWeaponTable(rangedWeapons, 'RANGED WEAPONS', 'amber')
  const meleeTable = buildWeaponTable(meleeWeapons, 'MELEE WEAPONS', 'red')

  const weaponColNodes: CardLayoutNode[] = []
  if (rangedTable) weaponColNodes.push(rangedTable)
  if (meleeTable) weaponColNodes.push(meleeTable)

  const { display: displayKws, faction: factionKws, coreAbilities } = filterKeywords(datasheet)

  const abilityColNodes: CardLayoutNode[] = [
    { type: 'heading', text: 'ABILITIES', accentColor: 'green' },
  ]

  if (coreAbilities.length > 0) {
    abilityColNodes.push({
      type: 'pill-list',
      pills: coreAbilities.map((ca) => ({ text: ca, variant: 'green' as const })),
    })
  }

  for (const ab of abilities) {
    abilityColNodes.push({
      type: 'ability',
      name: ab.title,
      description: stripLeadingTitle(ab.content || ab.summary, ab.title),
    })
  }

  layoutNodes.push({
    type: 'box',
    direction: 'row',
    children: [
      { type: 'box', direction: 'column', children: weaponColNodes },
      { type: 'box', direction: 'column', children: abilityColNodes },
    ],
  })

  // 4. Keywords bar
  const allKeywordPills = [
    ...displayKws
      .filter((kw) => !kw.startsWith('type:'))
      .map((kw) => ({
        text: kw.toLowerCase() === 'characters' ? 'Character' : kw,
        variant: 'default' as const,
      })),
    ...factionKws.map((fk) => ({ text: fk.toUpperCase(), variant: 'faction' as const })),
  ]

  if (allKeywordPills.length > 0) {
    layoutNodes.push({
      type: 'pill-list',
      label: 'Keywords',
      pills: allKeywordPills,
    })
  }

  // 5. Footer: composition, loadout, wargear options
  const footerNodes: CardLayoutNode[] = []
  const content = datasheet.content || ''

  const composition = extractContentField(content, 'Composition')
  const loadout = extractContentField(content, 'Loadout')
  const wargearOptions = extractContentField(content, 'Wargear Options')

  if (composition) footerNodes.push({ type: 'key-value', label: 'Composition', value: composition })
  if (loadout) footerNodes.push({ type: 'key-value', label: 'Loadout', value: loadout })
  if (wargearOptions)
    footerNodes.push({ type: 'key-value', label: 'Wargear Options', value: wargearOptions })

  if (footerNodes.length > 0) {
    layoutNodes.push({ type: 'divider' })
    layoutNodes.push({ type: 'box', direction: 'column', children: footerNodes })
  }

  return { version: 1, nodes: layoutNodes }
}
