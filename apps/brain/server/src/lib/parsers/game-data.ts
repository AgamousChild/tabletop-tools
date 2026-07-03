/**
 * Convert Wahapedia/BSData game data into brain Nodes and NodeRefs.
 *
 * Takes the existing game-data-store types (already in IndexedDB) and produces
 * brain-compatible nodes for the unit and faction layers.
 *
 * Data sources:
 * - Datasheets → unit/datasheet nodes
 * - DatasheetWargear → unit/weapon nodes (with part_of refs to datasheet)
 * - UnitAbilities → unit/unit-ability nodes (with part_of refs to datasheet)
 * - Detachments → faction/detachment-rule nodes
 * - DetachmentAbilities → faction/faction-ability nodes (with part_of refs to detachment)
 * - Stratagems → faction/stratagem nodes (with part_of refs to detachment)
 * - Enhancements → faction/enhancement nodes (with part_of refs to detachment)
 * - Abilities (core) → faction/faction-ability nodes (army rules like Oath of Moment)
 * - DatasheetStratagems/Enhancements/DetachmentAbilities → modifies refs
 */
import { deriveUnitType } from '../derive-unit-type'
import { normalizeFactionId } from '../faction-codes'
import { isBoardingAction, isLegends, stripHtml, truncate } from '../filters'
import type { Node, NodeRef, Source } from '../model'
import { slugify } from '../slugify'
import { bsdataSubfactionKey } from './bsdata-subfactions'

// ── Input types (matching game-data-store) ──────────────────────────────────

export interface GameDataInput {
  datasheets: DatasheetRecord[]
  datasheetWargear: DatasheetWargearRecord[]
  datasheetModels: DatasheetModelRecord[]
  unitAbilities: UnitAbilityRecord[]
  abilities: AbilityRecord[]
  detachments: DetachmentRecord[]
  detachmentAbilities: DetachmentAbilityRecord[]
  stratagems: StratagemRecord[]
  enhancements: EnhancementRecord[]
  unitKeywords: UnitKeywordRecord[]
  unitCompositions: UnitCompositionRecord[]
  unitCosts: UnitCostRecord[]
  wargearOptions: WargearOptionRecord[]
  leaderAttachments: LeaderAttachmentRecord[]
  // Junction tables → become refs
  datasheetStratagems: JunctionRecord[]
  datasheetEnhancements: JunctionRecord[]
  datasheetDetachmentAbilities: JunctionRecord[]
}

export interface DatasheetRecord {
  /**
   * Internal join key. Wahapedia ships as a 9-digit numeric string
   * (`"000000135"`); the BSData-aligned snapshot in
   * `apps/data-import/client/public/wahapedia/` rewrites this to a hash GUID
   * (`"5e35-ae82-23e4-bcef"`) and carries the original numeric on
   * `wahapediaId`. Sibling tables (datasheet_wargear, unit_abilities, etc.)
   * always reference this hash — it is the only join key inside this parser.
   */
  id: string
  /**
   * Stable Wahapedia numeric ID. When present, this becomes the brain node's
   * surface `id` (e.g. `"000000135"`) so bookmarks, vectorize entries, and
   * brain:links survive future BSData re-hashings. Sources that don't carry
   * a Wahapedia ID (e.g. test fixtures) fall back to `id`.
   */
  wahapediaId?: string
  name: string
  factionId: string
  role: string
  legend: string
  transport: string
  loadout: string
  damagedW: string
  damagedDescription: string
  isLegends?: boolean
  move?: string
  toughness?: string
  save?: string
  wounds?: string
  leadership?: string
  oc?: string
  invSv?: string
}

export interface DatasheetWargearRecord {
  id: number
  datasheetId: string
  name: string
  description: string
  range: string
  type: string
  attacks: string
  skill: string
  strength: string
  ap: string
  damage: string
}

export interface DatasheetModelRecord {
  id: number
  datasheetId: string
  name: string
  move: string
  toughness: string
  save: string
  wounds: string
  leadership: string
  oc: string
  invSv: string
  invSvDescription: string
}

export interface UnitAbilityRecord {
  id: string
  datasheetId: string
  name: string
  description: string
  type: string
  parameter?: string
}

export interface AbilityRecord {
  id: string
  name: string
  legend: string
  factionId: string
  description: string
}

export interface DetachmentRecord {
  id: string
  factionId: string
  name: string
  legend: string
  type: string
}

export interface DetachmentAbilityRecord {
  id: string
  detachmentId: string
  factionId: string
  name: string
  legend: string
  description: string
}

export interface StratagemRecord {
  id: string
  factionId: string
  detachmentId: string
  name: string
  type: string
  cpCost: string
  turn: string
  phase: string
  legend: string
  description: string
}

export interface EnhancementRecord {
  id: string
  factionId: string
  detachmentId: string
  name: string
  legend: string
  description: string
  cost: string
}

export interface UnitKeywordRecord {
  id: string
  datasheetId: string
  keyword: string
  isFactionKeyword: boolean
}

export interface UnitCompositionRecord {
  id: string
  datasheetId: string
  line: string
  description: string
}

export interface UnitCostRecord {
  id: string
  datasheetId: string
  line: string
  description: string
  cost: string
}

export interface WargearOptionRecord {
  id: string
  datasheetId: string
  line: string
  description: string
}

export interface LeaderAttachmentRecord {
  id: string
  leaderId: string
  attachedId: string
  /**
   * 11e introduces SUPPORT as an alternative to LEADER attachment. Wahapedia
   * is expected to flag this either as `type: 'support'` on the row, or via
   * a parallel datasheet-ability line "SUPPORT: <unit>". When the field is
   * absent or 'leader', the row emits a `can_lead` ref; when 'support', a
   * `can_support` ref. Forward-compatible with current 10e data which omits
   * the field entirely (every row is treated as `can_lead`).
   */
  type?: 'leader' | 'support'
}

export interface JunctionRecord {
  datasheetId: string
  stratagemId?: string
  enhancementId?: string
  detachmentAbilityId?: string
}

import { getSaveTier, getStrengthTier, getToughnessTier, usefulApCap } from '../combat-tiers'

// ── HTML Stripping ──────────────────────────────────────────────────────────

/** Extract targeting keywords from rules text (CAPS words that are unit type keywords). */
function extractTargetingKeywords(text: string): string[] {
  const TARGETING_KEYWORDS = [
    'infantry',
    'vehicle',
    'monster',
    'character',
    'mounted',
    'beast',
    'fly',
    'walker',
    'dreadnought',
    'terminator',
    'battleline',
    'psyker',
    'titanic',
    'transport',
    'aircraft',
    'jump pack',
    'grenades',
    'smoke',
    'epic hero',
    'daemon',
    'swarm',
    'cavalry',
  ]
  const lower = text.toLowerCase()
  return TARGETING_KEYWORDS.filter((k) => lower.includes(k))
}

/** Strip HTML tags and convert basic HTML to markdown. */

/**
 * Detect whether an enhancement attaches to the leader (the CHARACTER model)
 * or the bearer's whole unit, sniffing the rules text.
 *
 * Heuristics in priority order:
 *   - "Bearer's unit ..." / "the bearer's unit" / "models in the bearer's unit"
 *     → 'unit'
 *   - "model only" / "Chaplain model only" / "the bearer ..." (CHARACTER attach)
 *     → 'leader'
 * Returns undefined when the text doesn't carry enough signal — the card
 * will then omit the chip.
 */
export function detectEnhancementAttachesTo(text: string): 'leader' | 'unit' | undefined {
  if (!text) return undefined
  const lower = text.toLowerCase()
  // "model only" is the canonical leader-attach phrase. "Bearer's unit" /
  // "models in the bearer's unit" is the canonical unit-attach phrase.
  if (/\bmodel only\b/.test(lower)) return 'leader'
  if (/bearer'?s\s+unit\b/.test(lower)) return 'unit'
  if (/models? in the bearer'?s? unit\b/.test(lower)) return 'unit'
  // Final fallback: "the bearer" alone — typically a leader attach (the
  // enhancement modifies the bearer's stats / wargear, no unit-wide effect).
  if (/\bthe bearer\b/.test(lower)) return 'leader'
  return undefined
}

/** Core / Universal-Special-Rule keyword vocabulary. Match against the
 * Wahapedia ability NAME (case-insensitive) to decide whether an ability is a
 * core ability rendered as a collapsed chip on UnitCard or a unit-specific
 * ability rendered with full text.
 *
 * Includes the unit-deployment USRs ("DEEP STRIKE", "SCOUTS"), keyword
 * combat USRs ("FEEL NO PAIN", "DEADLY DEMISE", "FIRING DECK"), and weapon
 * USRs that sometimes appear on the datasheet ability list ("SUSTAINED HITS",
 * "LETHAL HITS", etc.). The set is the union of what UnitCard.tsx renders as
 * collapsed chips plus the GW 11e USR list.
 */
const CORE_ABILITY_NAMES = new Set<string>(
  [
    'deep strike',
    'scouts',
    'infiltrators',
    'lone operative',
    'stealth',
    'fly',
    'leader',
    'feel no pain',
    'deadly demise',
    'firing deck',
    'sustained hits',
    'lethal hits',
    'devastating wounds',
    'twin-linked',
    'blast',
    'ignores cover',
    'torrent',
    'anti',
    'melta',
    'rapid fire',
    'heavy',
    'assault',
    'hazardous',
    'one shot',
    'precision',
    'pistol',
    'fights first',
    'hover',
    'smoke', // datasheet ability granting SMOKESCREEN access
  ].map((s) => s.toLowerCase()),
)

/**
 * Decide whether a Wahapedia ability is a core / universal special rule
 * (renders as a collapsed chip on UnitCard) or a unit-specific ability
 * (renders with full text). Match by name only; the description is the rules
 * text that's universal across datasheets.
 *
 * Also extracts an optional value string from the keyword name itself
 * (e.g. "FEEL NO PAIN 5+" → value "5+"; "FIRING DECK 2" → "2";
 * "DEADLY DEMISE D3" → "D3"; "SCOUTS 6\"" → '6"'; "ANTI-INFANTRY 4+" → '4+').
 */
export function classifyCoreAbility(
  name: string,
  parameter?: string,
): { keyword: string; value?: string } | undefined {
  if (!name) return undefined
  const cleaned = name.trim()
  // Try matching against the core vocabulary. We compare the leading word(s)
  // up to (but not including) any trailing number / D-die / inches / +.
  const lower = cleaned.toLowerCase()
  // Strip trailing value-ish suffix when matching the keyword. The D-die
  // pattern MUST run before the bare-number pattern — otherwise "d3" gets
  // truncated to "d" by the latter and the keyword lookup fails.
  const stripped = lower
    .replace(/\s*d\d+\s*$/i, '') // "deadly demise d3" → "deadly demise"
    .replace(/\s*\d+\+?\s*$/, '') // "feel no pain 5+" → "feel no pain"
    .replace(/\s*\d+["”]?\s*$/, '') // 'scouts 6"' → "scouts"
    .replace(/-[a-z]+(?:\s+\d\+)?$/, '') // "anti-infantry 4+" → "anti"
    .trim()

  if (!CORE_ABILITY_NAMES.has(stripped)) return undefined

  // Now extract the value, preferring the explicit parameter from Wahapedia
  // (e.g. type="Core", parameter="5+" for FNP).
  let value: string | undefined
  const param = parameter?.trim()
  if (param && param.length > 0) {
    value = param
  } else {
    // Sniff from the keyword name itself
    const valMatch = cleaned.match(/\s+([\dD][\d+"”-]*\+?)\s*$/i)
    if (valMatch) value = valMatch[1]
  }

  return value ? { keyword: stripped.toUpperCase(), value } : { keyword: stripped.toUpperCase() }
}

/**
 * Words that BSData/Wahapedia tag as a "keyword" on a datasheet but which the
 * card-display layer wants surfaced as ABILITIES (collapsed chips), not as
 * plain keyword chips in the KEYWORDS row. SMOKE is the canonical example:
 * GW tags a Rhino with the `SMOKE` keyword so it gets access to the
 * SMOKESCREEN stratagem, but visually it belongs in the abilities band.
 *
 * Keep this list small and explicit — most unit keywords are correct in the
 * KEYWORDS row.
 */
const ABILITY_LIKE_KEYWORDS = new Set<string>(
  ['smoke', 'scout', 'scouts', 'infiltrate', 'infiltrators', 'grenades'].map((s) =>
    s.toLowerCase(),
  ),
)

/**
 * Return true when a unit-keyword string should be promoted out of the
 * KEYWORDS chip row and into the ABILITIES section. See ABILITY_LIKE_KEYWORDS.
 */
export function isAbilityLikeKeyword(kw: string): boolean {
  return ABILITY_LIKE_KEYWORDS.has(kw.trim().toLowerCase())
}

/**
 * Deduplicate keyword chips by lowercase + trailing-`s` stripped. Keeps the
 * first occurrence verbatim — e.g. ["dedicated transport", "dedicated transports"]
 * → ["dedicated transport"]. Stable: preserves input order otherwise.
 */
export function dedupeKeywordList(kws: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const kw of kws) {
    const key = kw
      .toLowerCase()
      .replace(/s$/, '') // singularize
      .trim()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(kw)
  }
  return result
}

// ── Converter ───────────────────────────────────────────────────────────────

export interface GameDataParseResult {
  nodes: Node[]
  refs: NodeRef[]
  /**
   * Map from BSData hash GUID (the internal join key in this parser) to the
   * surface node id (Wahapedia numeric ID when available, else fallback to the
   * hash). Downstream consumers — most importantly `duplicateEleventh()` and
   * the MFM-points re-keying in `build-graph.ts` — use this to translate from
   * BSData-keyed source data (MFM rows, BSData unit lookups) into the brain's
   * surface ID space.
   *
   * Only datasheet ids are populated. Detachment/stratagem/enhancement/ability
   * ids in Wahapedia already are the Wahapedia numeric IDs, so no translation
   * is required for those.
   */
  bsdataIdToSurfaceId: Map<string, string>
}

/**
 * Optional knobs for `convertGameData`. Additive — every field defaults to "no
 * effect" so existing callers don't need to change.
 */
export interface ConvertGameDataOptions {
  /**
   * BSData-derived subfaction lookup. Key shape:
   * `${factionSlug}::${normalizedName}` (see
   * `apps/brain/server/src/lib/parsers/bsdata-subfactions.ts`).
   *
   * When a datasheet's `(factionSlug, name)` matches an entry here, the
   * resulting node's `subfaction` field uses BSData's value in preference to
   * any Wahapedia-keyword-derived subfaction — BSData chapter catalogs are
   * the authoritative source for chapter membership.
   */
  bsdataSubfactionByKey?: Map<string, string>
}

const wahapediaSource: Source = {
  type: 'wahapedia',
  title: 'Wahapedia 10th Edition',
  retrievedAt: new Date().toISOString(),
}

function mapPhase(phase: string): Node['phase'] {
  const p = phase.toLowerCase()
  if (p.includes('command')) return 'command'
  if (p.includes('movement')) return 'movement'
  if (p.includes('shooting')) return 'shooting'
  if (p.includes('charge')) return 'charge'
  if (p.includes('fight')) return 'fight'
  if (p.includes('any') || p.includes('either')) return 'any'
  return undefined
}

export function convertGameData(
  input: GameDataInput,
  retrievedAt?: string,
  options: ConvertGameDataOptions = {},
): GameDataParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []
  const source: Source = {
    ...wahapediaSource,
    retrievedAt: retrievedAt ?? new Date().toISOString(),
  }

  // Build the BSData-hash → surface-id translation map up front so every
  // emit site can use it without conditionals. Wahapedia rows carry the
  // stable numeric id on `wahapediaId`; older test fixtures and any row that
  // is missing it fall back to the hash itself. The surface id is what
  // becomes the brain node's `id`, the `node.datasheetId` field, and the
  // target/source of every ref that points at a datasheet.
  const bsdataIdToSurfaceId = new Map<string, string>()
  for (const ds of input.datasheets) {
    bsdataIdToSurfaceId.set(ds.id, ds.wahapediaId ?? ds.id)
  }
  const surfaceIdOf = (bsdataId: string): string => bsdataIdToSurfaceId.get(bsdataId) ?? bsdataId

  // Filter out Boarding Actions — different game mode
  const boardingDetIds = new Set(input.detachments.filter(isBoardingAction).map((d) => d.id))
  const filteredDetachments = input.detachments.filter((d) => !boardingDetIds.has(d.id))
  const filteredStratagems = input.stratagems.filter((s) => !boardingDetIds.has(s.detachmentId))
  const filteredEnhancements = input.enhancements.filter((e) => !boardingDetIds.has(e.detachmentId))
  const filteredDetAbilities = input.detachmentAbilities.filter(
    (da) => !boardingDetIds.has(da.detachmentId),
  )

  // Filter out Legends — discontinued units not legal in matched play
  const legendsIds = new Set(input.datasheets.filter(isLegends).map((d) => d.id))
  const filteredDatasheets = input.datasheets.filter((d) => !isLegends(d))
  const filteredWargear = input.datasheetWargear.filter((w) => !legendsIds.has(w.datasheetId))
  const filteredModels = input.datasheetModels.filter((m) => !legendsIds.has(m.datasheetId))
  const filteredUnitAbilities = input.unitAbilities.filter((a) => !legendsIds.has(a.datasheetId))
  const filteredUnitKeywords = input.unitKeywords.filter((k) => !legendsIds.has(k.datasheetId))
  const filteredCompositions = input.unitCompositions.filter((c) => !legendsIds.has(c.datasheetId))
  const filteredCosts = input.unitCosts.filter((c) => !legendsIds.has(c.datasheetId))
  const filteredWargearOptions = input.wargearOptions.filter((w) => !legendsIds.has(w.datasheetId))
  const filteredLeaderAttachments = input.leaderAttachments.filter(
    (l) => !legendsIds.has(l.leaderId) && !legendsIds.has(l.attachedId),
  )
  const filteredDsStratagems = input.datasheetStratagems.filter(
    (j) => !legendsIds.has(j.datasheetId),
  )
  const filteredDsEnhancements = input.datasheetEnhancements.filter(
    (j) => !legendsIds.has(j.datasheetId),
  )
  // datasheetDetachmentAbilities filtered but not yet consumed — reserved for future detachment↔unit linking

  // Build lookup maps (using filtered data — no legends, no boarding)
  const modelsByDatasheet = groupBy(filteredModels, (r) => r.datasheetId)
  const keywordsByDatasheet = groupBy(filteredUnitKeywords, (r) => r.datasheetId)
  const compositionsByDatasheet = groupBy(filteredCompositions, (r) => r.datasheetId)
  const costsByDatasheet = groupBy(filteredCosts, (r) => r.datasheetId)
  const wargearByDatasheet = groupBy(filteredWargear, (r) => r.datasheetId)
  const wargearOptionsByDatasheet = groupBy(filteredWargearOptions, (r) => r.datasheetId)
  const abilitiesByDatasheet = groupBy(filteredUnitAbilities, (r) => r.datasheetId)
  const stratagemsByDetachment = groupBy(filteredStratagems, (r) => r.detachmentId)
  const enhancementsByDetachment = groupBy(filteredEnhancements, (r) => r.detachmentId)
  const abilitiesByDetachment = groupBy(filteredDetAbilities, (r) => r.detachmentId)

  // Build datasheet → factionId and subfaction lookups
  const dsFactionMap = new Map<string, string>()
  for (const ds of filteredDatasheets) {
    dsFactionMap.set(ds.id, normalizeFactionId(ds.factionId))
  }

  const SUBFACTION_KEYWORDS = [
    // Space Marines chapters
    'Blood Angels',
    'Dark Angels',
    'Space Wolves',
    'Black Templars',
    'Ultramarines',
    'Deathwatch',
    'Imperial Fists',
    'Iron Hands',
    'Salamanders',
    'Raven Guard',
    'White Scars',
    'Crimson Fists',
    'Blood Ravens',
    // Aeldari
    'Ynnari',
    'Harlequins',
    'Asuryani',
    // Chaos Space Marines cult legions — these are independent factions in
    // their own right, but Wahapedia files some of their datasheets under the
    // CSM faction with the cult name as a faction keyword (e.g. Plague Marines
    // shows up under CSM tagged Death Guard). Tagging the subfaction keeps
    // those units filterable for a cult-focused army.
    'Death Guard',
    'Thousand Sons',
    'World Eaters',
    'Emperor’s Children',
    // Chaos Daemons greater-daemon legions
    'Plague Legions',
    'Scintillating Legions',
    'Legions of Excess',
    'Blood Legions',
    'Damned',
  ]
  const dsSubfactionMap = new Map<string, string>()
  const keywordsByDs = groupBy(
    filteredUnitKeywords.filter((k) => k.isFactionKeyword),
    (k) => k.datasheetId,
  )
  for (const [dsId, kws] of keywordsByDs) {
    for (const kw of kws) {
      const match = SUBFACTION_KEYWORDS.find((sf) => sf === kw.keyword)
      if (match) {
        dsSubfactionMap.set(dsId, match.toLowerCase())
        break
      }
    }
  }

  // Pull subfaction from BSData chapter catalogs. PR #46 made
  // `rollupChapterFaction()` emit `subfaction: 'ultramarines'` on every unit in
  // a chapter catalog — that's a much higher-quality signal than Wahapedia's
  // per-unit keyword list, which only tags chapter-iconic units. Where both
  // sources fire, BSData wins (the SM keyword loop above used `match.toLowerCase()`
  // so its values are equivalent for chapter subfactions, but BSData is the
  // canonical chapter-membership source).
  //
  // See docs/superpowers/plans/2026-06-27-data-problems-followup.md step 7.
  if (options.bsdataSubfactionByKey && options.bsdataSubfactionByKey.size > 0) {
    for (const ds of filteredDatasheets) {
      const factionSlug = normalizeFactionId(ds.factionId)
      const key = bsdataSubfactionKey(factionSlug, ds.name)
      const sub = options.bsdataSubfactionByKey.get(key)
      if (sub) {
        dsSubfactionMap.set(ds.id, sub)
      }
    }
  }

  // ── 0. Faction parent nodes ────────────────────────────────────────────────
  // Create a top-level node for each faction so detachments, army rules, and
  // datasheets can link up to it via part_of.
  const factionSlugs = new Set<string>()
  for (const ds of filteredDatasheets) factionSlugs.add(normalizeFactionId(ds.factionId))
  for (const det of filteredDetachments) factionSlugs.add(normalizeFactionId(det.factionId))

  // Faction nodes are created by buildFactionNodes in combo-detection.ts
  // Do NOT create placeholder faction nodes here — it causes duplicates

  // ── 1. Datasheets → unit/datasheet nodes ──────────────────────────────────

  for (const ds of filteredDatasheets) {
    const models = modelsByDatasheet.get(ds.id) ?? []
    const keywords = keywordsByDatasheet.get(ds.id) ?? []
    const compositions = compositionsByDatasheet.get(ds.id) ?? []
    const costs = costsByDatasheet.get(ds.id) ?? []

    const statBlock =
      models.length > 0
        ? models
            .map(
              (m) =>
                `${m.name}: M${m.move} T${m.toughness} Sv${m.save} W${m.wounds} Ld${m.leadership} OC${m.oc}${m.invSv ? ` ${m.invSv}++` : ''}`,
            )
            .join('\n')
        : ''

    const keywordList = keywords.map((k) => k.keyword).join(', ')
    const factionKeywords = keywords
      .filter((k) => k.isFactionKeyword)
      .map((k) => k.keyword)
      .join(', ')
    const compositionText = compositions.map((c) => stripHtml(c.description)).join('\n')
    const costText = costs.map((c) => `${stripHtml(c.description)}: ${c.cost}pts`).join(', ')

    const wargearOpts = wargearOptionsByDatasheet.get(ds.id) ?? []
    const wargearOptsText = wargearOpts.map((w) => `• ${stripHtml(w.description)}`).join('\n')

    const content = [
      statBlock,
      ds.role ? `**Role:** ${ds.role}` : '',
      keywordList ? `**Keywords:** ${keywordList}` : '',
      factionKeywords ? `**Faction Keywords:** ${factionKeywords}` : '',
      compositionText ? `**Composition:** ${compositionText}` : '',
      costText ? `**Points:** ${costText}` : '',
      ds.transport ? `**Transport:** ${stripHtml(ds.transport)}` : '',
      ds.loadout ? `**Loadout:** ${stripHtml(ds.loadout)}` : '',
      wargearOptsText ? `**Wargear Options:**\n${wargearOptsText}` : '',
      ds.damagedW ? `**Damaged (${ds.damagedW}W):** ${stripHtml(ds.damagedDescription)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    // Build structured points costs
    const unitPoints =
      costs.length > 0
        ? costs.map((c) => ({ models: c.description || '1 model', cost: parseInt(c.cost) || 0 }))
        : undefined

    // Build structured stat line from Wahapedia data.
    // `ds.invSv` is sometimes the literal "-" (no invulnerable save) — don't
    // concatenate "+" onto a placeholder. Only include INV when the value is
    // a real numeric save (e.g. "4" → "4+", "4+" stays "4+").
    const rawInvSv = ds.invSv?.trim() ?? ''
    const hasInvSv = rawInvSv.length > 0 && rawInvSv !== '-' && /\d/.test(rawInvSv)
    const formattedInvSv = hasInvSv
      ? rawInvSv.endsWith('+')
        ? rawInvSv
        : `${rawInvSv}+`
      : undefined
    // Some upstream sources hand us raw "2" and others hand us "2+" already
    // (e.g. Terminator Armour SV via BSData). Append "+" only when missing
    // so we don't ship "2++" / "6++" rows. Same defensive pattern as the
    // invSv handling above. See Bug-4b in the round-2 verification report.
    const appendPlus = (raw: string | undefined): string => {
      const t = (raw ?? '').trim()
      if (!t) return '-'
      return t.endsWith('+') ? t : `${t}+`
    }
    const unitStats =
      ds.move || ds.toughness || ds.save || ds.wounds
        ? {
            M: ds.move || '-',
            T: parseInt(ds.toughness ?? '0') || 0,
            SV: appendPlus(ds.save),
            W: parseInt(ds.wounds ?? '0') || 0,
            LD: appendPlus(ds.leadership),
            OC: parseInt(ds.oc ?? '0') || 0,
            ...(formattedInvSv ? { invSv: formattedInvSv } : {}),
          }
        : undefined

    // Structured wargear options — lift the wargear_options rows onto the
    // datasheet Node so cards don't have to re-parse the markdown block.
    // The Wahapedia row format is "{name}: {description}" or just a free-form
    // description; treat the substring before the first ':' as the name when
    // present so the card can render a definition list.
    const structuredWargearOptions =
      wargearOpts.length > 0
        ? wargearOpts.map((w) => {
            const clean = stripHtml(w.description ?? '').trim()
            const colonIdx = clean.indexOf(':')
            if (colonIdx > 0 && colonIdx < 60) {
              return {
                name: clean.slice(0, colonIdx).trim(),
                description: clean.slice(colonIdx + 1).trim() || undefined,
              }
            }
            return { name: clean }
          })
        : undefined

    // Structured damaged block — Wahapedia exposes the threshold and the
    // ability text on every datasheet that bracket-degrades.
    const damagedThreshold = (ds.damagedW ?? '').trim()
    const damagedEffectText = stripHtml(ds.damagedDescription ?? '').trim()
    const structuredDamaged =
      damagedThreshold && damagedEffectText
        ? { threshold: damagedThreshold, effect: damagedEffectText }
        : undefined

    // Wahapedia is the 10e source-of-truth (Rule 5 + the parallel-dataset
    // restructure). The brain surfaces datasheets at their Wahapedia numeric
    // id (e.g. "000000135"). The hash on `ds.id` stays the internal join key
    // for sibling tables (wargear, abilities, etc.) — see surfaceIdOf above.
    const datasheetSurfaceId = surfaceIdOf(ds.id)
    const node: Node = {
      id: datasheetSurfaceId,
      layer: 'unit',
      category: 'datasheet',
      title: ds.name,
      content,
      summary: `${ds.name} — ${ds.role}${costs.length ? `, ${costText}` : ''}.`,
      factionId: normalizeFactionId(ds.factionId),
      subfaction: dsSubfactionMap.get(ds.id),
      datasheetId: datasheetSurfaceId,
      edition: '10th',
      ...(unitStats ? { stats: unitStats } : {}),
      ...(unitPoints ? { points: unitPoints } : {}),
      ...(structuredWargearOptions ? { wargearOptions: structuredWargearOptions } : {}),
      ...(structuredDamaged ? { damaged: structuredDamaged } : {}),
      sources: [source],
      refs: [],
      version: 1,
      keywords: [
        ...new Set(
          [
            // Route ability-like keywords (SMOKE, etc.) out of the chip row
            // so they don't pollute the KEYWORDS band. They're picked up by
            // the coreAbilities classifier below.
            ...keywords
              .map((k) => k.keyword.toLowerCase())
              .filter((kw) => !isAbilityLikeKeyword(kw)),
            ...(ds.role.toLowerCase() !== 'other' ? [ds.role.toLowerCase()] : []),
          ].filter(Boolean),
        ),
      ],
    }

    // Capture the routed-out ability-like keywords so coreAbilities still
    // surfaces them (a SMOKE Rhino should still get a SMOKE chip on the
    // abilities side of the card).
    const abilityLikeKeywords = keywords
      .map((k) => k.keyword)
      .filter((kw) => isAbilityLikeKeyword(kw))

    // Add combat profile to keywords for combat-relevant queries
    const primaryModel = models[0]
    if (primaryModel) {
      const t = parseInt(primaryModel.toughness)
      if (!isNaN(t)) {
        const tier = getToughnessTier(t)
        if (tier) {
          node.keywords.push(`t${t}`, tier.name, `toughness-${t}`)
        }
      }

      const sv = parseInt(primaryModel.save)
      if (!isNaN(sv)) {
        const saveTier = getSaveTier(sv)
        if (saveTier) {
          node.keywords.push(`sv${sv}+`, saveTier.name, `save-${sv}`)
        }
      }

      // Invulnerable save — critical for AP effectiveness
      const invSv = parseInt(primaryModel.invSv)
      if (!isNaN(invSv) && invSv > 0) {
        node.keywords.push(`invuln-${invSv}++`, `invulnerable`)
        // Calculate AP cap — AP beyond this is wasted
        if (!isNaN(sv)) {
          const apCap = usefulApCap(sv, invSv)
          if (apCap > 0) {
            node.keywords.push(`ap-cap-${apCap}`)
          }
        }
      }

      // Wounds — relevant for bracket/degradation and kill efficiency
      const w = parseInt(primaryModel.wounds)
      if (!isNaN(w)) {
        node.keywords.push(`w${w}`, `wounds-${w}`)
      }
    }

    // Points cost — from unit_costs data
    const unitCosts = costsByDatasheet.get(ds.id) ?? []
    if (unitCosts.length > 0) {
      // Parse the lowest cost option (minimum squad size)
      const costValues = unitCosts.map((c) => parseInt(c.cost)).filter((c) => !isNaN(c))
      if (costValues.length > 0) {
        const minCost = Math.min(...costValues)
        node.keywords.push(`pts-${minCost}`)

        // Points tier for budget queries
        if (minCost <= 50) node.keywords.push('cheap')
        else if (minCost <= 100) node.keywords.push('moderate-cost')
        else if (minCost <= 200) node.keywords.push('expensive')
        else node.keywords.push('premium')

        // Points per wound efficiency (using primary model)
        const w = parseInt(primaryModel?.wounds ?? '0')
        const modelCount = compositions.length > 0 ? parseInt(compositions[0]!.description) || 1 : 1
        if (w > 0 && modelCount > 0) {
          const totalWounds = w * modelCount
          const ptsPerWound = Math.round(minCost / totalWounds)
          node.keywords.push(`ppw-${ptsPerWound}`)
        }
      }
    }

    // Elevate key weapon capabilities to datasheet level
    const unitWeapons = wargearByDatasheet.get(ds.id) ?? []
    const allWeaponDescs = unitWeapons.map((w) => (w.description ?? '').toLowerCase()).join(' ')
    if (allWeaponDescs.includes('indirect fire')) node.keywords.push('indirect fire')
    if (allWeaponDescs.includes('torrent')) node.keywords.push('torrent')
    if (allWeaponDescs.includes('blast')) node.keywords.push('blast')
    if (allWeaponDescs.includes('melta')) node.keywords.push('melta')
    if (allWeaponDescs.includes('sustained hits')) node.keywords.push('sustained hits')
    if (allWeaponDescs.includes('lethal hits')) node.keywords.push('lethal hits')
    if (allWeaponDescs.includes('devastating wounds')) node.keywords.push('devastating wounds')
    if (allWeaponDescs.includes('anti-')) node.keywords.push('anti')
    if (allWeaponDescs.includes('hazardous')) node.keywords.push('hazardous')
    if (allWeaponDescs.includes('twin-linked')) node.keywords.push('twin-linked')
    if (allWeaponDescs.includes('ignores cover')) node.keywords.push('ignores cover')
    if (allWeaponDescs.includes('one shot')) node.keywords.push('one shot')

    // Unit-level ability capabilities
    const unitAbs = abilitiesByDatasheet.get(ds.id) ?? []
    const allAbilityText = unitAbs.map((a) => `${a.name} ${a.description}`.toLowerCase()).join(' ')
    if (allAbilityText.includes('deep strike')) node.keywords.push('deep strike')
    if (allAbilityText.includes('lone operative')) node.keywords.push('lone operative')
    if (allAbilityText.includes('stealth')) node.keywords.push('stealth')
    if (allAbilityText.includes('scouts')) node.keywords.push('scouts')
    if (allAbilityText.includes('infiltrator')) node.keywords.push('infiltrators')
    // Deadly Demise — extract value from ability parameter or description
    if (allAbilityText.includes('deadly demise')) {
      let ddValue = ''
      // Check core ability parameter first (e.g. parameter="D3")
      for (const ab of unitAbs) {
        if (/deadly demise/i.test(ab.name) && ab.parameter) {
          ddValue = ab.parameter.toUpperCase()
          break
        }
      }
      // Fallback: check ability text for "Deadly Demise D3" pattern
      if (!ddValue) {
        const ddMatch = allAbilityText.match(/deadly demise\s+(d\d+)/i)
        if (ddMatch) ddValue = ddMatch[1]!.toUpperCase()
      }
      node.keywords.push(ddValue ? `deadly demise ${ddValue}` : 'deadly demise')
    }
    // Feel No Pain — check ability descriptions AND core ability parameters
    const fnpValues: number[] = []
    // From ability text (e.g. "have the Feel No Pain 5+ ability")
    const fnpTextMatches = allAbilityText.match(/feel no pain (\d)\+/g)
    if (fnpTextMatches) {
      for (const m of fnpTextMatches) {
        const v = parseInt(m.match(/(\d)\+/)![1]!)
        if (!isNaN(v)) fnpValues.push(v)
      }
    }
    // From core ability parameter (e.g. type="Core", parameter="5+")
    // FNP is the only core ability with a bare "X+" parameter format
    for (const ab of unitAbs) {
      if (ab.type === 'Core' && ab.parameter && /^\d\+$/.test(ab.parameter)) {
        fnpValues.push(parseInt(ab.parameter))
      }
    }
    if (fnpValues.length > 0) {
      const bestFnp = Math.min(...fnpValues)
      node.keywords.push('feel no pain', `fnp-${bestFnp}`)
    }
    if (allAbilityText.includes('fights first')) node.keywords.push('fights first')
    if (allAbilityText.includes('firing deck')) node.keywords.push('firing deck')

    if (ds.isLegends) {
      node.keywords.push('legends')
    }

    // Derive unit type from keywords — stored as content field + keyword
    const derivedType = deriveUnitType(node.keywords)
    if (derivedType) {
      node.content = `**Derived Type:** ${derivedType}\n\n${node.content}`
      node.keywords.push(`type:${slugify(derivedType)}`)
    }

    // Final dedup — abilities scan may have pushed duplicates of existing keywords.
    // Use dedupeKeywordList so chip variants like "dedicated transport" and
    // "dedicated transports" collapse onto one entry (Set-uniq alone preserves
    // both since they're distinct strings).
    node.keywords = dedupeKeywordList([...new Set(node.keywords)])

    // Structured core abilities — split USR / keyword-style abilities off the
    // unit-ability list so UnitCard can render them as collapsed chips with
    // their values. Each entry carries the keyword (uppercase) and an optional
    // value (e.g. "5+", "D3", '6"'). Source of truth: Wahapedia ability rows
    // tagged type==="Core" plus any name we recognise from the USR vocabulary.
    const coreAbilityEntries: Array<{ keyword: string; value?: string }> = []
    const seenCoreKeywords = new Set<string>()
    for (const ab of unitAbs) {
      // Trust Wahapedia's type column when it says Core.
      if (ab.type !== 'Core') {
        // Even non-Core may still match the USR vocab — fall through to the
        // name-classifier below so e.g. SMOKE that's filed as a unit ability
        // still gets bucketed correctly.
      }
      const classified = classifyCoreAbility(ab.name, ab.parameter)
      if (!classified) continue
      if (seenCoreKeywords.has(classified.keyword)) continue
      seenCoreKeywords.add(classified.keyword)
      coreAbilityEntries.push(classified)
    }
    // Ability-like keywords that came in via the unit_keywords table (SMOKE on
    // a Rhino, etc.) — promote them to coreAbilities so the chip shows up
    // under ABILITIES instead of in the KEYWORDS row.
    for (const kw of abilityLikeKeywords) {
      const classified = classifyCoreAbility(kw)
      const entry = classified ?? { keyword: kw.toUpperCase() }
      if (seenCoreKeywords.has(entry.keyword)) continue
      seenCoreKeywords.add(entry.keyword)
      coreAbilityEntries.push(entry)
    }
    if (coreAbilityEntries.length > 0) {
      node.coreAbilities = coreAbilityEntries
    }

    nodes.push(node)

    // Datasheet → faction parent ref
    refs.push({
      sourceId: datasheetSurfaceId,
      targetId: `faction-root:${normalizeFactionId(ds.factionId)}`,
      rel: 'part_of',
      context: `${ds.name} belongs to ${normalizeFactionId(ds.factionId)}.`,
    })
  }

  // ── 2. Weapons → unit/weapon nodes ────────────────────────────────────────
  const seenWeaponIds = new Set<string>()
  for (const wg of filteredWargear) {
    // Differentiate melee/ranged profiles with the same name on the same datasheet
    const parentSurfaceId = surfaceIdOf(wg.datasheetId)
    let weaponNodeId = `weapon:${parentSurfaceId}:${slugify(wg.name)}`
    if (seenWeaponIds.has(weaponNodeId)) {
      weaponNodeId = `weapon:${parentSurfaceId}:${slugify(wg.name)}-${slugify(wg.type)}`
    }
    if (seenWeaponIds.has(weaponNodeId)) {
      weaponNodeId = `weapon:${parentSurfaceId}:${slugify(wg.name)}-${wg.id}`
    }
    seenWeaponIds.add(weaponNodeId)

    const cleanDesc = stripHtml(wg.description ?? '')

    const content = [
      `**Range:** ${wg.range} | **Type:** ${wg.type}`,
      `**A:** ${wg.attacks} | **BS/WS:** ${wg.skill} | **S:** ${wg.strength} | **AP:** ${wg.ap} | **D:** ${wg.damage}`,
      cleanDesc ? `\n${cleanDesc}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    nodes.push({
      id: weaponNodeId,
      layer: 'unit',
      category: 'weapon',
      title: wg.name,
      content,
      summary: `${wg.name} (${wg.type}) — ${wg.range}, ${wg.attacks}A, S${wg.strength}, AP${wg.ap}, D${wg.damage}.${cleanDesc ? ` [${cleanDesc}]` : ''}`,
      factionId: dsFactionMap.get(wg.datasheetId),
      subfaction: dsSubfactionMap.get(wg.datasheetId),
      datasheetId: parentSurfaceId,
      edition: '10th',
      weaponStats: {
        range: wg.range || 'Melee',
        A: wg.attacks || '1',
        skill: wg.skill || '-',
        S: parseInt(wg.strength) || 0,
        AP: parseInt(wg.ap) || 0,
        D: wg.damage || '1',
      },
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractWeaponKeywords(wg),
    })

    // Add strength tier and damage info to weapon keywords
    const s = parseInt(wg.strength)
    if (!isNaN(s)) {
      const tier = getStrengthTier(s)
      if (tier) {
        nodes[nodes.length - 1]!.keywords.push(`s${s}`, tier.name, `strength-${s}`)
      }
    }
    const d = parseInt(wg.damage)
    if (!isNaN(d) && d > 1) {
      nodes[nodes.length - 1]!.keywords.push(`damage-${d}`, `d${d}`)
    }
    const ap = parseInt(wg.ap)
    if (!isNaN(ap) && ap !== 0) {
      const absAp = Math.abs(ap)
      nodes[nodes.length - 1]!.keywords.push(`ap-${absAp}`, `ap${absAp}`)
    }

    // part_of ref to datasheet
    refs.push({
      sourceId: weaponNodeId,
      targetId: parentSurfaceId,
      rel: 'part_of',
      context: `${wg.name} is a weapon equipped by this unit.`,
      bidirectional: true,
    })
  }

  // ── 3. Unit abilities → unit/unit-ability nodes ───────────────────────────

  /** Split multi-option abilities into separate sub-entries. */
  function splitSubRules(description: string): Array<{ name: string; text: string }> {
    const lines = description.split('\n')
    const subRules: Array<{ name: string; text: string }> = []
    let currentName = ''
    let currentLines: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (
        /^[A-Z][A-Z\s'-]{4,}$/.test(trimmed) &&
        !trimmed.includes('ADEPTUS') &&
        !trimmed.includes('ASTARTES') &&
        !trimmed.includes('HERETIC') &&
        !trimmed.includes('INFANTRY')
      ) {
        if (currentName && currentLines.length > 0) {
          subRules.push({ name: currentName, text: currentLines.join('\n').trim() })
        }
        currentName = trimmed
        currentLines = []
      } else {
        currentLines.push(line)
      }
    }
    if (currentName && currentLines.length > 0) {
      subRules.push({ name: currentName, text: currentLines.join('\n').trim() })
    }
    return subRules
  }

  // Build set of faction ability names — these are army rules, not unit abilities.
  // Skip unit abilities that duplicate a faction ability (e.g. Blessings of Khorne
  // appears on every WE datasheet but is one army rule, handled in section 4).
  // Only include abilities that are actual army rules (non-empty factionId, not Designer's Note).
  const factionAbilityNames = new Set(
    input.abilities
      .filter((a) => {
        const fSlug = normalizeFactionId(a.factionId)
        if (!fSlug) return false
        if (/^designer'?s?\s*note$/i.test(a.name)) return false
        return true
      })
      .map((a) => a.name.toLowerCase()),
  )

  // For army rules that appear as unit abilities: instead of creating duplicate nodes,
  // create refs from the faction ability node to each datasheet that has the keyword.
  const armyRuleRefs = new Map<string, Set<string>>() // ability name → set of datasheet IDs
  for (const ab of filteredUnitAbilities) {
    if (factionAbilityNames.has(ab.name.toLowerCase())) {
      const dsIds = armyRuleRefs.get(ab.name.toLowerCase()) ?? new Set()
      dsIds.add(ab.datasheetId)
      armyRuleRefs.set(ab.name.toLowerCase(), dsIds)
    }
  }
  // Primary faction for shared army rules. When multiple factions list the same rule,
  // only the primary faction's version gets created. Others are skipped.
  const PRIMARY_FACTION: Record<string, string> = {
    'oath-of-moment': 'space-marines',
    'dark-pacts': 'chaos-space-marines',
    'blessings-of-khorne': 'world-eaters',
    'cabal-of-sorcerers': 'thousand-sons',
    'nurgles-gift-aura': 'death-guard',
    synapse: 'tyranids',
    'shadow-in-the-warp': 'tyranids',
    'battle-focus': 'aeldari',
    'disparate-paths': 'aeldari',
    'assigned-agents': 'imperial-agents',
    'kill-team': 'imperial-agents',
    'kill-teams': 'imperial-agents',
    'doctrina-imperatives': 'adeptus-mechanicus',
    'super-heavy-walker': 'imperial-knights',
    'thrill-seekers': 'emperors-children',
  }

  // Create modifies refs from faction ability → datasheets
  for (const [abilityName, dsIds] of armyRuleRefs) {
    // Find the faction ability node ID — use primary faction if shared
    const factionAb = input.abilities.find((a) => a.name.toLowerCase() === abilityName)
    if (!factionAb) continue
    const ruleSlug = slugify(factionAb.name)
    const primaryFaction = PRIMARY_FACTION[ruleSlug] || normalizeFactionId(factionAb.factionId)
    const factionAbNodeId = `faction:${primaryFaction}:${ruleSlug}`
    for (const dsId of dsIds) {
      const dsName = filteredDatasheets.find((d) => d.id === dsId)?.name ?? dsId
      refs.push({
        sourceId: factionAbNodeId,
        targetId: surfaceIdOf(dsId),
        rel: 'modifies',
        context: `${factionAb.name} applies to ${dsName}.`,
      })
    }
  }

  const seenAbilityIds = new Map<string, number>()
  for (const ab of filteredUnitAbilities) {
    // Skip if this is a faction ability (army rule) — handled above with refs
    if (factionAbilityNames.has(ab.name.toLowerCase())) continue
    const abilityParentSurfaceId = surfaceIdOf(ab.datasheetId)
    const baseId = `ability:${abilityParentSurfaceId}:${slugify(ab.name)}`
    const count = seenAbilityIds.get(baseId) ?? 0
    seenAbilityIds.set(baseId, count + 1)
    const abilityNodeId = count === 0 ? baseId : `${baseId}-${count}`

    const cleanAbDesc = stripHtml(ab.description)
    const dsName = filteredDatasheets.find((d) => d.id === ab.datasheetId)?.name ?? ''

    // Split multi-option abilities
    const subRules = splitSubRules(cleanAbDesc)
    const hasSubRules = subRules.length >= 2

    const preamble = hasSubRules
      ? cleanAbDesc.substring(0, cleanAbDesc.indexOf(subRules[0]!.name)).trim()
      : cleanAbDesc

    // Main ability node
    nodes.push({
      id: abilityNodeId,
      layer: 'unit',
      category: 'unit-ability',
      title: ab.name,
      content: hasSubRules ? preamble : cleanAbDesc,
      summary: `${ab.name} (${ab.type}) on ${dsName} — ${truncate(preamble || cleanAbDesc, 120)}`,
      factionId: dsFactionMap.get(ab.datasheetId),
      subfaction: dsSubfactionMap.get(ab.datasheetId),
      datasheetId: abilityParentSurfaceId,
      edition: '10th',
      sources: [source],
      refs: [],
      version: 1,
      keywords: [
        ab.type.toLowerCase(),
        ...extractTerms(ab.description),
        ...extractTargetingKeywords(ab.description),
      ],
    })

    refs.push({
      sourceId: abilityNodeId,
      targetId: abilityParentSurfaceId,
      rel: 'part_of',
      context: `${ab.name} is a ${ab.type} ability of ${dsName}.`,
      bidirectional: true,
    })

    // Sub-rule nodes for each option
    if (hasSubRules) {
      for (const sub of subRules) {
        const subId = `${abilityNodeId}:${slugify(sub.name)}`

        nodes.push({
          id: subId,
          layer: 'unit',
          category: 'unit-ability',
          title: `${sub.name} (${ab.name})`,
          content: sub.text,
          summary: `${sub.name}, option of ${ab.name} on ${dsName} — ${truncate(sub.text, 120)}`,
          factionId: dsFactionMap.get(ab.datasheetId),
          subfaction: dsSubfactionMap.get(ab.datasheetId),
          datasheetId: abilityParentSurfaceId,
          edition: '10th',
          sources: [source],
          refs: [],
          version: 1,
          keywords: [
            ab.type.toLowerCase(),
            slugify(sub.name),
            ...extractTerms(sub.text),
            ...extractTargetingKeywords(sub.text),
          ],
        })

        refs.push({
          sourceId: subId,
          targetId: abilityNodeId,
          rel: 'part_of',
          context: `${sub.name} is an option within ${ab.name} on ${dsName}.`,
          bidirectional: true,
        })

        // Create requires refs from sub-rules to core mechanic nodes
        // e.g. MARTIAL EXCELLENCE → core:sustained-hits
        const subText = `${sub.name} ${sub.text}`.toLowerCase()
        const SUB_RULE_CORE_LINKS: Array<{ pattern: string; coreSlug: string; label: string }> = [
          { pattern: 'sustained hits', coreSlug: 'sustained-hits', label: 'Sustained Hits' },
          { pattern: 'lethal hits', coreSlug: 'lethal-hits', label: 'Lethal Hits' },
          {
            pattern: 'devastating wounds',
            coreSlug: 'devastating-wounds',
            label: 'Devastating Wounds',
          },
          { pattern: 'feel no pain', coreSlug: 'feel-no-pain', label: 'Feel No Pain' },
          { pattern: 'hazardous', coreSlug: 'hazardous', label: 'Hazardous' },
          { pattern: 'deep strike', coreSlug: 'deep-strike', label: 'Deep Strike' },
          { pattern: 'stealth', coreSlug: 'stealth', label: 'Stealth' },
        ]
        for (const { pattern, coreSlug, label } of SUB_RULE_CORE_LINKS) {
          if (subText.includes(pattern)) {
            refs.push({
              sourceId: subId,
              targetId: `core:${coreSlug}`,
              rel: 'requires',
              context: `${sub.name} grants ${label}.`,
            })
          }
        }
      }
    }
  }

  // ── 4. Faction abilities (army rules) → faction/faction-ability nodes ─────

  // Skip abilities with empty factionId — these are core/basic rules (Deep Strike,
  // Deadly Demise, Feel No Pain, etc.) already handled by the core rules parser.
  // Also skip "Designer's Note" entries which are clarifications, not army rules.
  const factionAbilities = input.abilities.filter((ab) => {
    const fSlug = normalizeFactionId(ab.factionId)
    if (!fSlug) return false
    if (/^designer['\u2019]?s?\s*note$/i.test(ab.name)) return false
    return true
  })

  // Chapter-specific rules that belong to a subfaction, not generic SM
  const RULE_SUBFACTION: Record<string, string> = {
    'templar-vows': 'black templars',
    'heirs-of-sigismund': 'black templars',
    'the-unforgiven': 'dark angels',
    'the-ravenwing': 'dark angels',
    'the-deathwing': 'dark angels',
    'the-sons-of-sanguinius': 'blood angels',
    'curse-of-the-wulfen': 'space wolves',
    'sons-of-russ': 'space wolves',
    sagas: 'space wolves',
    'mission-tactics': 'deathwatch',
    deathwatch: 'deathwatch',
    'kill-teams': 'deathwatch',
    'kill-team': 'deathwatch',
  }

  const seenArmyRuleNames = new Set<string>()
  const seenFactionAbIds = new Set<string>()
  for (const ab of factionAbilities) {
    const ruleNameKey = slugify(ab.name)
    const fSlugCheck = normalizeFactionId(ab.factionId)
    const primaryFaction = PRIMARY_FACTION[ruleNameKey]
    // If this rule has a designated primary faction and this isn't it, skip
    if (primaryFaction && fSlugCheck !== primaryFaction) continue
    // If we've already seen this rule name (non-primary shared rule), skip
    if (seenArmyRuleNames.has(ruleNameKey)) continue
    seenArmyRuleNames.add(ruleNameKey)

    let factionAbId = `faction:${normalizeFactionId(ab.factionId)}:${slugify(ab.name)}`
    if (seenFactionAbIds.has(factionAbId)) {
      factionAbId = `faction:${normalizeFactionId(ab.factionId)}:${slugify(ab.name)}-${ab.id}`
    }
    seenFactionAbIds.add(factionAbId)
    // Wahapedia ability descriptions are already markdown — preserve formatting
    const cleanFaDesc = ab.description
    const fSlug = normalizeFactionId(ab.factionId)

    // Classify: construction/mustering restrictions vs actual gameplay army rules
    const lower = cleanFaDesc.toLowerCase()
    // Chapter-specific rules override construction detection
    const hasSubfaction = !!RULE_SUBFACTION[ruleNameKey]
    const isConstruction =
      !hasSubfaction &&
      (lower.startsWith('when mustering') ||
        lower.startsWith('- your army') ||
        lower.startsWith('- if an') ||
        lower.startsWith('- if a ') ||
        lower.startsWith('the following') ||
        lower.startsWith('you can') ||
        lower.includes('you cannot select') ||
        lower.startsWith('- you can') ||
        lower.startsWith('if every model in your army') ||
        lower.startsWith('each detachment rule') ||
        lower.startsWith('some imperial') ||
        lower.startsWith('while this unit'))
    const categoryForRule = isConstruction ? ('army-ability' as const) : ('army-rule' as const)

    // Split multi-option faction abilities
    const subRules = splitSubRules(cleanFaDesc)
    const hasSubRules = subRules.length >= 2
    const preamble = hasSubRules
      ? cleanFaDesc.substring(0, cleanFaDesc.indexOf(subRules[0]!.name)).trim()
      : cleanFaDesc

    const ruleSubfaction = RULE_SUBFACTION[ruleNameKey]
    nodes.push({
      id: factionAbId,
      layer: 'faction',
      category: categoryForRule,
      title: ab.name,
      content: hasSubRules ? preamble : cleanFaDesc,
      summary: `${ab.name} — army rule for ${ruleSubfaction || fSlug}. ${truncate(preamble || cleanFaDesc, 100)}`,
      factionId: fSlug,
      subfaction: ruleSubfaction,
      edition: '10th',
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractTerms(ab.description),
    })

    // Faction ability → faction parent ref
    if (fSlug) {
      refs.push({
        sourceId: factionAbId,
        targetId: `faction-root:${fSlug}`,
        rel: 'part_of',
        context: `${ab.name} is an army rule for ${fSlug}.`,
        bidirectional: true,
      })
    }

    if (hasSubRules) {
      for (const sub of subRules) {
        const subId = `${factionAbId}:${slugify(sub.name)}`
        nodes.push({
          id: subId,
          layer: 'faction',
          category: 'army-ability',
          title: `${sub.name} (${ab.name})`,
          content: sub.text,
          summary: `${sub.name}, option of ${ab.name} for ${fSlug} — ${truncate(sub.text, 120)}`,
          factionId: fSlug,
          edition: '10th',
          sources: [source],
          refs: [],
          version: 1,
          keywords: [slugify(sub.name), ...extractTerms(sub.text)],
        })
        refs.push({
          sourceId: subId,
          targetId: factionAbId,
          rel: 'part_of',
          context: `${sub.name} is an option within ${ab.name}.`,
          bidirectional: true,
        })

        // Create requires refs from faction ability sub-rules to core mechanic nodes
        const subText = `${sub.name} ${sub.text}`.toLowerCase()
        const FA_SUB_CORE_LINKS: Array<{ pattern: string; coreSlug: string; label: string }> = [
          { pattern: 'sustained hits', coreSlug: 'sustained-hits', label: 'Sustained Hits' },
          { pattern: 'lethal hits', coreSlug: 'lethal-hits', label: 'Lethal Hits' },
          {
            pattern: 'devastating wounds',
            coreSlug: 'devastating-wounds',
            label: 'Devastating Wounds',
          },
          { pattern: 'feel no pain', coreSlug: 'feel-no-pain', label: 'Feel No Pain' },
          { pattern: 'hazardous', coreSlug: 'hazardous', label: 'Hazardous' },
          { pattern: 'deep strike', coreSlug: 'deep-strike', label: 'Deep Strike' },
          { pattern: 'stealth', coreSlug: 'stealth', label: 'Stealth' },
        ]
        for (const { pattern, coreSlug, label } of FA_SUB_CORE_LINKS) {
          if (subText.includes(pattern)) {
            refs.push({
              sourceId: subId,
              targetId: `core:${coreSlug}`,
              rel: 'requires',
              context: `${sub.name} grants ${label}.`,
            })
          }
        }
      }
    }
  }

  // ── 5. Detachments → faction/detachment-rule nodes ────────────────────────

  // Chapter membership is no longer inferred from detachment ability text.
  // Structured chapter data (Wahapedia datasheet_keywords, BSData catalog
  // membership) will be wired in PR B of the scalar-to-ref refactor plan
  // (docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md).
  const seenDetIds = new Set<string>()
  for (const det of filteredDetachments) {
    let detNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}`
    if (seenDetIds.has(detNodeId)) {
      detNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}-${det.id}`
    }
    seenDetIds.add(detNodeId)
    const detAbilities = abilitiesByDetachment.get(det.id) ?? []
    const detStratagems = stratagemsByDetachment.get(det.id) ?? []
    const detEnhancements = enhancementsByDetachment.get(det.id) ?? []

    const content = [
      det.legend ? `*${stripHtml(det.legend)}*` : '',
      detAbilities.length > 0
        ? `**Detachment Ability:** ${detAbilities.map((a) => `${a.name} — ${truncate(stripHtml(a.description), 200)}`).join('\n\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    nodes.push({
      id: detNodeId,
      layer: 'faction',
      category: 'detachment-rule',
      title: det.name,
      content,
      summary: `${det.name} detachment for ${normalizeFactionId(det.factionId)}. ${detAbilities[0]?.name ?? ''}`,
      factionId: normalizeFactionId(det.factionId),
      // subfaction inference from ability text removed in PR A of scalar-to-ref
      // refactor. Structured chapter data lands in PR B.
      detachmentId: detNodeId,
      edition: '10th',
      sources: [source],
      refs: [],
      version: 1,
      keywords: [...extractTerms(content)],
    })

    // Detachment → faction parent ref
    refs.push({
      sourceId: detNodeId,
      targetId: `faction-root:${normalizeFactionId(det.factionId)}`,
      rel: 'part_of',
      context: `${det.name} is a detachment for ${normalizeFactionId(det.factionId)}.`,
      bidirectional: true,
    })

    // ── 5a. Detachment abilities → faction/faction-ability ─────────────────

    for (const da of detAbilities) {
      const daNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(da.name)}`

      const cleanDaDesc = stripHtml(da.description)
      // subfaction inference from ability text removed in PR A of scalar-to-ref
      // refactor. Structured chapter data lands in PR B.

      nodes.push({
        id: daNodeId,
        layer: 'faction',
        category: 'faction-ability',
        title: da.name,
        content: cleanDaDesc,
        summary: `${da.name} — detachment ability for ${det.name}. ${truncate(cleanDaDesc, 100)}`,
        factionId: normalizeFactionId(det.factionId),
        detachmentId: detNodeId,
        edition: '10th',
        sources: [source],
        refs: [],
        version: 1,
        keywords: [...extractTerms(da.description), ...extractTargetingKeywords(da.description)],
      })

      refs.push({
        sourceId: daNodeId,
        targetId: detNodeId,
        rel: 'part_of',
        context: `${da.name} is the detachment ability of ${det.name}.`,
        bidirectional: true,
      })
    }

    // ── 5b. Stratagems → faction/stratagem ────────────────────────────────

    for (const strat of detStratagems) {
      const stratNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(strat.name)}`

      const cleanStratDesc = stripHtml(strat.description)
      // subfaction inheritance from parent-detachment chapter lock removed
      // in PR A of scalar-to-ref refactor. Structured chapter data lands in PR B.

      // Try to extract WHEN/TARGET/EFFECT blocks from Wahapedia's description.
      // Wahapedia ships them as <b>WHEN:</b> in HTML, which stripHtml() reduces
      // to a plain "WHEN:" label. Match against the cleaned text so both raw
      // markdown (**WHEN:**) and the HTML-stripped form work.
      const matchSection = (label: string) => {
        const re = new RegExp(
          `\\b${label}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:WHEN|TARGET|EFFECT|RESTRICTIONS?):|$)`,
          'i',
        )
        return (cleanStratDesc.match(re)?.[1] ?? '').trim()
      }
      const stratWhen = matchSection('WHEN')
      const stratTarget = matchSection('TARGET')
      const stratEffect = matchSection('EFFECT')
      const stratCpNumber = Number.parseInt(strat.cpCost ?? '', 10)

      nodes.push({
        id: stratNodeId,
        layer: 'faction',
        category: 'stratagem',
        title: strat.name,
        content: `**Type:** ${strat.type}\n**CP:** ${strat.cpCost}\n**Turn:** ${strat.turn}\n**Phase:** ${strat.phase}\n\n${cleanStratDesc}`,
        summary: `${strat.name} (${strat.cpCost}CP, ${strat.phase}) — ${truncate(cleanStratDesc, 100)}`,
        factionId: normalizeFactionId(det.factionId),
        detachmentId: detNodeId,
        edition: '10th',
        phase: mapPhase(strat.phase),
        ...(Number.isFinite(stratCpNumber) ? { cpCost: stratCpNumber } : {}),
        ...(strat.turn ? { turn: strat.turn } : {}),
        ...(stratWhen ? { when: stratWhen } : {}),
        ...(stratTarget ? { target: stratTarget } : {}),
        ...(stratEffect ? { effect: stratEffect } : {}),
        ...(strat.type ? { stratType: strat.type } : {}),
        sources: [source],
        refs: [],
        version: 1,
        keywords: [
          'stratagem',
          strat.type.toLowerCase(),
          ...extractTerms(strat.description),
          ...extractTargetingKeywords(strat.description),
        ],
      })

      refs.push({
        sourceId: stratNodeId,
        targetId: detNodeId,
        rel: 'part_of',
        context: `${strat.name} is a ${strat.type} stratagem in the ${det.name} detachment.`,
        bidirectional: true,
      })
    }

    // ── 5c. Enhancements → faction/enhancement ───────────────────────────

    for (const enh of detEnhancements) {
      const enhNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(enh.name)}`

      const cleanEnhDesc = stripHtml(enh.description)
      // subfaction inheritance from parent-detachment chapter lock removed
      // in PR A of scalar-to-ref refactor. Structured chapter data lands in PR B.

      const enhCostNumber = Number.parseInt(enh.cost ?? '', 10)
      const enhAttachesTo = detectEnhancementAttachesTo(cleanEnhDesc)

      nodes.push({
        id: enhNodeId,
        layer: 'faction',
        category: 'enhancement',
        title: enh.name,
        content: `**Cost:** ${enh.cost}\n\n${cleanEnhDesc}`,
        summary: `${enh.name} (${enh.cost}pts) — ${truncate(cleanEnhDesc, 100)}`,
        factionId: normalizeFactionId(det.factionId),
        detachmentId: detNodeId,
        edition: '10th',
        ...(Number.isFinite(enhCostNumber) ? { cost: enhCostNumber } : {}),
        ...(enhAttachesTo ? { attachesTo: enhAttachesTo } : {}),
        sources: [source],
        refs: [],
        version: 1,
        keywords: [
          'enhancement',
          ...extractTerms(enh.description),
          ...extractTargetingKeywords(enh.description),
        ],
      })

      refs.push({
        sourceId: enhNodeId,
        targetId: detNodeId,
        rel: 'part_of',
        context: `${enh.name} is an enhancement in the ${det.name} detachment.`,
        bidirectional: true,
      })
    }
  }

  // ── 6. Junction tables → modifies refs ────────────────────────────────────

  for (const j of filteredDsStratagems) {
    if (j.stratagemId) {
      // Find the stratagem node
      const strat = filteredStratagems.find((s) => s.id === j.stratagemId)
      if (strat) {
        const det = input.detachments.find((d) => d.id === strat.detachmentId)
        if (det) {
          const stratNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(strat.name)}`
          refs.push({
            sourceId: stratNodeId,
            targetId: surfaceIdOf(j.datasheetId),
            rel: 'modifies',
            context: `${strat.name} stratagem can be used with this unit.`,
          })
        }
      }
    }
  }

  for (const j of filteredDsEnhancements) {
    if (j.enhancementId) {
      const enh = filteredEnhancements.find((e) => e.id === j.enhancementId)
      if (enh) {
        const det = input.detachments.find((d) => d.id === enh.detachmentId)
        if (det) {
          const enhNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(enh.name)}`
          refs.push({
            sourceId: enhNodeId,
            targetId: surfaceIdOf(j.datasheetId),
            rel: 'modifies',
            context: `${enh.name} enhancement can be given to a model in this unit.`,
          })
        }
      }
    }
  }

  // ── 7. Weapon ability → core rule requires refs ────────────────────────────
  //
  // Weapon abilities (Sustained Hits, Lethal Hits, etc.) are properties of
  // each unit's specific weapon records. The link chain is:
  //   datasheet ←[part_of]— weapon —[requires]→ core mechanic
  //
  // Each weapon node already has a part_of ref to its datasheet (created in
  // section 2). Here we add the requires ref from the weapon to the core
  // rules node that defines the mechanic.

  const WEAPON_ABILITY_CORE_NODES: Array<{ pattern: string; coreSlug: string; label: string }> = [
    { pattern: 'sustained hits', coreSlug: 'sustained-hits', label: 'Sustained Hits' },
    { pattern: 'lethal hits', coreSlug: 'lethal-hits', label: 'Lethal Hits' },
    { pattern: 'devastating wounds', coreSlug: 'devastating-wounds', label: 'Devastating Wounds' },
    { pattern: 'hazardous', coreSlug: 'hazardous', label: 'Hazardous' },
    { pattern: 'blast', coreSlug: 'blast', label: 'Blast' },
    { pattern: 'torrent', coreSlug: 'torrent', label: 'Torrent' },
    { pattern: 'twin-linked', coreSlug: 'twin-linked', label: 'Twin-linked' },
    { pattern: 'rapid fire', coreSlug: 'rapid-fire', label: 'Rapid Fire' },
    { pattern: 'pistol', coreSlug: 'pistol', label: 'Pistol' },
    { pattern: 'melta', coreSlug: 'melta', label: 'Melta' },
    { pattern: 'lance', coreSlug: 'lance', label: 'Lance' },
    { pattern: 'anti-', coreSlug: 'anti', label: 'Anti' },
    { pattern: 'ignores cover', coreSlug: 'ignores-cover', label: 'Ignores Cover' },
    { pattern: 'indirect fire', coreSlug: 'indirect-fire', label: 'Indirect Fire' },
  ]

  for (const wg of filteredWargear) {
    const weaponNodeId = `weapon:${surfaceIdOf(wg.datasheetId)}:${slugify(wg.name)}`
    const desc = (wg.description ?? '').toLowerCase()

    for (const { pattern, coreSlug, label } of WEAPON_ABILITY_CORE_NODES) {
      if (desc.includes(pattern)) {
        refs.push({
          sourceId: weaponNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'requires',
          context: `${wg.name} has the ${label} ability. See the core rules for how ${label} works.`,
        })
      }
    }
  }

  // ── 8. Unit ability → core rule requires refs ─────────────────────────────
  //
  // Unit abilities like Feel No Pain, Deep Strike, Stealth, etc. are on the
  // datasheet, not the weapon. Scan unitAbilities descriptions for refs to
  // core mechanic nodes.

  const UNIT_ABILITY_CORE_NODES: Array<{ pattern: string; coreSlug: string; label: string }> = [
    { pattern: 'feel no pain', coreSlug: 'feel-no-pain', label: 'Feel No Pain' },
    { pattern: 'deadly demise', coreSlug: 'deadly-demise', label: 'Deadly Demise' },
    { pattern: 'deep strike', coreSlug: 'deep-strike', label: 'Deep Strike' },
    { pattern: 'lone operative', coreSlug: 'lone-operative', label: 'Lone Operative' },
    { pattern: 'stealth', coreSlug: 'stealth', label: 'Stealth' },
    { pattern: 'scouts', coreSlug: 'scouts', label: 'Scouts' },
    { pattern: 'infiltrator', coreSlug: 'infiltrators', label: 'Infiltrators' },
    { pattern: 'battle-shock', coreSlug: 'battle-shock', label: 'Battle-shock' },
    { pattern: 'fights first', coreSlug: 'fights-first', label: 'Fights First' },
    { pattern: 'overwatch', coreSlug: 'fire-overwatch', label: 'Fire Overwatch' },
    { pattern: 'firing deck', coreSlug: 'firing-deck', label: 'Firing Deck' },
  ]

  const ALL_CORE_PATTERNS = [...WEAPON_ABILITY_CORE_NODES, ...UNIT_ABILITY_CORE_NODES]

  for (const ab of filteredUnitAbilities) {
    // Use the deduplicated ID from section 3
    const baseId = `ability:${surfaceIdOf(ab.datasheetId)}:${slugify(ab.name)}`
    const existingCount = seenAbilityIds.get(baseId) ?? 0
    const abilityNodeId = existingCount <= 1 ? baseId : `${baseId}-${existingCount - 1}`

    const text = `${ab.name} ${ab.description}`.toLowerCase()

    for (const { pattern, coreSlug, label } of ALL_CORE_PATTERNS) {
      if (text.includes(pattern)) {
        refs.push({
          sourceId: abilityNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'requires',
          context: `${ab.name} references ${label}. See the core rules for how ${label} works.`,
        })
      }
    }
  }

  // ── 9. Stratagem/enhancement → core rule requires refs ────────────────────
  //
  // Stratagems and enhancements that grant abilities (e.g., "weapons in this
  // unit gain [SUSTAINED HITS 1]") need refs to those core mechanic nodes.
  // This is how you answer "who has sustained hits" — not just weapons that
  // natively have it, but stratagems that can grant it.

  // ALL_CORE_PATTERNS already defined above

  for (const strat of filteredStratagems) {
    const det = input.detachments.find((d) => d.id === strat.detachmentId)
    if (!det) continue
    const stratNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(strat.name)}`
    const text = `${strat.name} ${strat.description}`.toLowerCase()

    for (const { pattern, coreSlug, label } of ALL_CORE_PATTERNS) {
      if (text.includes(pattern)) {
        refs.push({
          sourceId: stratNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'interacts_with',
          context: `${strat.name} stratagem references ${label}. It may grant or interact with this ability.`,
        })
      }
    }
  }

  for (const enh of filteredEnhancements) {
    const det = input.detachments.find((d) => d.id === enh.detachmentId)
    if (!det) continue
    const enhNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(enh.name)}`
    const text = `${enh.name} ${enh.description}`.toLowerCase()

    for (const { pattern, coreSlug, label } of ALL_CORE_PATTERNS) {
      if (text.includes(pattern)) {
        refs.push({
          sourceId: enhNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'interacts_with',
          context: `${enh.name} enhancement references ${label}. It may grant or interact with this ability.`,
        })
      }
    }
  }

  // Detachment abilities too
  for (const da of filteredDetAbilities) {
    const det = input.detachments.find((d) => d.id === da.detachmentId)
    if (!det) continue
    const daNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(da.name)}`
    const text = `${da.name} ${da.description}`.toLowerCase()

    for (const { pattern, coreSlug, label } of ALL_CORE_PATTERNS) {
      if (text.includes(pattern)) {
        refs.push({
          sourceId: daNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'interacts_with',
          context: `${da.name} detachment ability references ${label}. It may grant or interact with this ability.`,
        })
      }
    }
  }

  // ── 10. Leader attachments → interacts_with refs ──────────────────────────

  for (const la of filteredLeaderAttachments) {
    const isSupport = la.type === 'support'
    refs.push({
      sourceId: surfaceIdOf(la.leaderId),
      targetId: surfaceIdOf(la.attachedId),
      rel: isSupport ? 'can_support' : 'can_lead',
      context: isSupport
        ? `This character can SUPPORT this unit.`
        : `This leader can be attached to this unit.`,
      bidirectional: true,
    })
  }

  // NOTE: stacks_with combo detection moved to lib/combo-detection.ts
  // It runs post-merge+massage in build-graph.ts where all nodes have final factionId/subfaction.

  return { nodes, refs, bsdataIdToSurfaceId }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const arr = map.get(k) ?? []
    arr.push(item)
    map.set(k, arr)
  }
  return map
}

function extractWeaponKeywords(wg: DatasheetWargearRecord): string[] {
  const kw: string[] = []
  const desc = (wg.description ?? '').toLowerCase()
  const type = (wg.type ?? '').toLowerCase()

  if (type.includes('melee')) kw.push('melee')
  if (type.includes('ranged')) kw.push('ranged')
  if (desc.includes('pistol')) kw.push('pistol')
  if (desc.includes('heavy')) kw.push('heavy')
  if (desc.includes('assault')) kw.push('assault')
  if (desc.includes('rapid fire')) kw.push('rapid fire')
  if (desc.includes('blast')) kw.push('blast')
  if (desc.includes('torrent')) kw.push('torrent')
  if (desc.includes('melta')) kw.push('melta')
  if (desc.includes('twin-linked')) kw.push('twin-linked')
  if (desc.includes('sustained hits')) kw.push('sustained hits')
  if (desc.includes('lethal hits')) kw.push('lethal hits')
  if (desc.includes('devastating wounds')) kw.push('devastating wounds')
  if (desc.includes('anti-')) kw.push('anti')
  if (desc.includes('lance')) kw.push('lance')
  if (desc.includes('ignores cover')) kw.push('ignores cover')

  return kw
}

function extractTerms(text: string): string[] {
  const lower = text.toLowerCase()
  const terms = [
    'wound',
    'hit',
    'save',
    'strength',
    'toughness',
    'leadership',
    'charge',
    'shoot',
    'fight',
    'advance',
    'fall back',
    'overwatch',
    'battle-shock',
    'deep strike',
    'stratagem',
    'engagement range',
    'cover',
    'terrain',
    'objective',
    'damage',
    'mortal wound',
    'feel no pain',
    'invulnerable',
    'transport',
    'character',
    'infantry',
    'vehicle',
    'monster',
    'leader',
    'attached',
    'lone operative',
    'stealth',
    'scouts',
    'deadly demise',
    // Weapon abilities — also appear in unit abilities, stratagems, enhancements
    'sustained hits',
    'lethal hits',
    'devastating wounds',
    'hazardous',
    'blast',
    'torrent',
    'twin-linked',
    'rapid fire',
    'pistol',
    'melta',
    'lance',
    'anti-',
    'ignores cover',
    'indirect fire',
  ]
  return terms.filter((t) => lower.includes(t))
}
