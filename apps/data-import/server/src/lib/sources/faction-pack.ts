/**
 * Faction-pack source (v2 parser → UnitProfile deltas).
 *
 * Uses the shared `parseFactionPackV2` from `@tabletop-tools/game-content` to
 * pull structured datasheet, weapon, and ability data out of GW's faction
 * pack markdown. Produces two outputs:
 *
 *   - **patches**: partial UnitProfiles keyed by BSData `id` for units that
 *     already exist in the BSData source. Only the fields the pack updates
 *     are set (name, stats, weapons, abilities); the merge/upsert step in
 *     `sync.ts` is responsible for shallow-merging over the BSData row.
 *
 *   - **newUnits**: full UnitProfile rows for datasheets that appear in a
 *     pack but not in the existing BSData set. Emitted with a stable id of
 *     `factionpack:<factionSlug>:<slug(name)>` so a later BSData refresh
 *     with a matching real id can rekey them without breaking references.
 *
 * **Scope limit for this PR:** only UnitProfile-shaped output flows to
 * game-data-store. Detachments, stratagems, enhancements, errata, FAQs, and
 * army-rule content from the pack are ignored here — they remain brain-only
 * via `apps/brain/server/src/lib/parsers/faction-pack-v2-to-nodes.ts`.
 * A follow-up game-data-store schema extension (see PR body) will carry the
 * detachment-level content.
 */
import {
  type Datasheet as PackDatasheet,
  type PackExtract,
  parseFactionPackV2,
} from '@tabletop-tools/game-content/src/adapters/faction-pack/parser'
import type {
  UnitProfile,
  WeaponAbility,
  WeaponProfile,
} from '@tabletop-tools/game-content/src/types'
import { slugify } from '@tabletop-tools/server-core'

/** Existing-unit row we look up against (subset of BSData UnitProfile). */
export interface ExistingUnitLookup {
  id: string
  name: string
  faction: string // BSData faction name (post-rollup, e.g. "Space Marines")
  subfaction?: string
}

export interface FactionPackInput {
  /** Canonical faction slug matching brain / MFM (e.g. "orks", "space-marines"). */
  factionSlug: string
  /** Faction-pack markdown produced by gw-sync. */
  markdown: string
}

export interface FactionPackUnitPatch {
  /** BSData unit id this patch targets. */
  id: string
  /** Fields to overlay on the existing UnitProfile. */
  patch: Partial<
    Pick<
      UnitProfile,
      | 'name'
      | 'move'
      | 'toughness'
      | 'save'
      | 'wounds'
      | 'leadership'
      | 'oc'
      | 'invulnSave'
      | 'weapons'
      | 'abilities'
      | 'abilityDescriptions'
      | 'isLegends'
    >
  >
  /** Free-text categories the datasheet advertises (KEYWORDS / FACTION KEYWORDS). */
  keywords?: string[]
  /** Human-readable source note for logging. */
  sourceNote: string
}

export interface FactionPackResult {
  patches: FactionPackUnitPatch[]
  newUnits: UnitProfile[]
  /** Faction-pack datasheet names that didn't map to any BSData unit and were emitted as new. */
  unmatched: Array<{ factionSlug: string; datasheet: string; newUnitId: string }>
}

/** Slugify matching brain + game-data-store convention. */
function slug(s: string): string {
  return slugify(s, { stripChars: /['‘’′"'"]/g })
}

/** BSData catalog faction-name convention for a canonical slug. */
function factionSlugToBsdataName(factionSlug: string): string {
  // Special-case the slugs where BSData's post-rollup name differs from a
  // naive Title Case of the slug.
  const map: Record<string, string> = {
    'space-marines': 'Space Marines',
    'chaos-space-marines': 'Chaos Space Marines',
    'chaos-daemons': 'Chaos Daemons',
    'chaos-knights': 'Chaos Knights',
    'imperial-agents': 'Agents of the Imperium',
    'imperial-knights': 'Imperial Knights',
    'blood-angels': 'Space Marines',
    'dark-angels': 'Space Marines',
    'black-templars': 'Space Marines',
    deathwatch: 'Space Marines',
    'space-wolves': 'Space Marines',
    'grey-knights': 'Grey Knights',
    orks: 'Orks',
    tyranids: 'Tyranids',
    necrons: 'Necrons',
    aeldari: 'Aeldari',
    drukhari: 'Drukhari',
    'thousand-sons': 'Thousand Sons',
    'world-eaters': 'World Eaters',
    'death-guard': 'Death Guard',
    'astra-militarum': 'Astra Militarum',
    'adepta-sororitas': 'Adepta Sororitas',
    'adeptus-custodes': 'Adeptus Custodes',
    'adeptus-mechanicus': 'Adeptus Mechanicus',
    'genestealer-cults': 'Genestealer Cults',
    'leagues-of-votann': 'Leagues of Votann',
    'tau-empire': "T'au Empire",
    't-au-empire': "T'au Empire",
    'emperors-children': "Emperor's Children",
    'emperor-s-children': "Emperor's Children",
  }
  if (map[factionSlug]) return map[factionSlug]!
  return factionSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Convert a v2 `Datasheet.rangedWeapons` / `meleeWeapons` entry into a
 * `WeaponProfile` matching the game-content type. Ranges default to 0 for
 * melee. Skills / strengths / damage are best-effort numeric parses; when
 * they can't be numerically resolved (e.g. "D6"), the string form is kept
 * to preserve dice notation.
 */
function toWeapon(
  w: PackDatasheet['rangedWeapons'][number] | PackDatasheet['meleeWeapons'][number],
  isMelee: boolean,
): WeaponProfile {
  const nOrString = (s?: string): number | string => {
    if (!s) return 0
    const n = parseInt(s.replace(/\+$/, ''), 10)
    return Number.isFinite(n) ? n : s
  }
  const numOr = (s?: string, dflt = 0): number => {
    if (!s) return dflt
    const n = parseInt(s.replace(/[^\d-]/g, ''), 10)
    return Number.isFinite(n) ? n : dflt
  }
  const abilities: WeaponAbility[] = []
  for (const kw of w.keywords) {
    const upper = kw.toUpperCase()
    if (upper === 'LETHAL HITS') abilities.push({ type: 'LETHAL_HITS' })
    else if (upper === 'DEVASTATING WOUNDS') abilities.push({ type: 'DEVASTATING_WOUNDS' })
    else if (upper === 'TORRENT') abilities.push({ type: 'TORRENT' })
    else if (upper === 'TWIN-LINKED' || upper === 'TWIN LINKED')
      abilities.push({ type: 'TWIN_LINKED' })
    else if (upper === 'BLAST') abilities.push({ type: 'BLAST' })
    else if (upper === 'HAZARDOUS') abilities.push({ type: 'HAZARDOUS' })
    else if (upper === 'PRECISION') abilities.push({ type: 'PRECISION' })
    else if (upper === 'INDIRECT FIRE') abilities.push({ type: 'INDIRECT_FIRE' })
    else if (upper === 'ASSAULT') abilities.push({ type: 'ASSAULT' })
    else if (upper === 'PISTOL') abilities.push({ type: 'PISTOL' })
    else if (upper === 'ONE SHOT') abilities.push({ type: 'ONE_SHOT' })
    else if (upper === 'IGNORES COVER') abilities.push({ type: 'IGNORES_COVER' })
    else {
      const sustained = upper.match(/^SUSTAINED HITS\s+(\d+)$/)
      if (sustained) {
        abilities.push({ type: 'SUSTAINED_HITS', value: parseInt(sustained[1]!, 10) })
        continue
      }
      const anti = upper.match(/^ANTI-?\s*([A-Z]+)\s+(\d+)\+?$/)
      if (anti) {
        abilities.push({ type: 'ANTI', keyword: anti[1]!, value: parseInt(anti[2]!, 10) })
        continue
      }
      const melta = upper.match(/^MELTA\s+(\d+)$/)
      if (melta) {
        abilities.push({ type: 'MELTA', value: parseInt(melta[1]!, 10) })
        continue
      }
    }
  }
  const rangeStr = 'range' in w ? w.range : undefined
  const rangeNumeric = rangeStr && !isMelee ? numOr(rangeStr, 0) : 0
  return {
    name: w.name,
    range: isMelee ? 'melee' : rangeNumeric,
    attacks: nOrString(w.A),
    skill: numOr((w as { BS?: string; WS?: string }).BS ?? (w as { WS?: string }).WS, 0),
    strength: numOr(w.S, 0),
    ap: numOr(w.AP, 0),
    damage: nOrString(w.D),
    abilities,
  }
}

/**
 * Build a UnitProfile from a v2 datasheet. The `id` is temporary
 * (`factionpack:<slug>`) unless an existing BSData id is supplied.
 */
function datasheetToUnitProfile(
  ds: PackDatasheet,
  factionSlug: string,
  bsdataFaction: string,
  bsdataId: string,
  subfaction?: string,
): UnitProfile {
  const invulnSave =
    ds.stats.invSv !== undefined ? parseInt(ds.stats.invSv.replace(/\+$/, ''), 10) : undefined
  const numeric = (s?: string, dflt = 0): number => {
    if (!s) return dflt
    const n = parseInt(s.replace(/[^\d-]/g, ''), 10)
    return Number.isFinite(n) ? n : dflt
  }
  const abilityDescriptions: Record<string, string> = {}
  for (const a of ds.abilities) {
    if (a.body) abilityDescriptions[a.name] = a.body
  }
  return {
    id: bsdataId,
    faction: bsdataFaction,
    ...(subfaction ? { subfaction } : {}),
    name: ds.name,
    move: numeric(ds.stats.M, 0),
    toughness: numeric(ds.stats.T, 0),
    save: numeric(ds.stats.SV, 0),
    wounds: numeric(ds.stats.W, 0),
    leadership: numeric(ds.stats.LD, 0),
    oc: numeric(ds.stats.OC, 0),
    ...(invulnSave !== undefined && Number.isFinite(invulnSave) ? { invulnSave } : {}),
    weapons: [
      ...ds.rangedWeapons.map((w) => toWeapon(w, false)),
      ...ds.meleeWeapons.map((w) => toWeapon(w, true)),
    ],
    abilities: ds.abilities.map((a) => a.name),
    abilityDescriptions,
    points: 0,
    isLegends: ds.isLegends,
    // factionSlug is preserved on `faction`; consumers key by this + name.
    // subfaction stays undefined here; brain and BSData both compute it separately.
  }
}

/**
 * Match a datasheet by name against the existing BSData set. Case-insensitive
 * on the name, filtered by canonical faction slug (mapped via
 * `factionSlugToBsdataName`). Returns the first exact match; the caller
 * decides whether zero matches means "new unit" vs "match miss".
 */
function findBsdataUnit(
  datasheetName: string,
  factionSlug: string,
  existingUnits: ExistingUnitLookup[],
): ExistingUnitLookup | undefined {
  const bsdataFaction = factionSlugToBsdataName(factionSlug)
  const targetSlug = slug(datasheetName)
  return existingUnits.find((u) => u.faction === bsdataFaction && slug(u.name) === targetSlug)
}

/**
 * Pure function: given faction-pack markdown per faction + the existing
 * BSData unit set, produce patches + new units.
 */
export function processFactionPacks(
  packs: FactionPackInput[],
  existingUnits: ExistingUnitLookup[],
): FactionPackResult {
  const patches: FactionPackUnitPatch[] = []
  const newUnits: UnitProfile[] = []
  const unmatched: FactionPackResult['unmatched'] = []

  for (const pack of packs) {
    let extract: PackExtract
    try {
      extract = parseFactionPackV2(pack.markdown, { faction: pack.factionSlug })
    } catch {
      // Skip a pack that fails to parse — the caller keeps ingesting others.
      continue
    }

    const allDatasheets = [
      ...extract.datasheets.map((d) => ({ ds: d, isLegends: false })),
      ...extract.legendsDatasheets.map((d) => ({ ds: d, isLegends: true })),
    ]

    for (const { ds } of allDatasheets) {
      const existing = findBsdataUnit(ds.name, pack.factionSlug, existingUnits)

      if (existing) {
        // Emit a patch — only the fields the pack updates. Points isn't in
        // faction packs, so leave that to MFM/BSData.
        const invulnSave =
          ds.stats.invSv !== undefined ? parseInt(ds.stats.invSv.replace(/\+$/, ''), 10) : undefined
        const numeric = (s?: string, dflt = 0): number => {
          if (!s) return dflt
          const n = parseInt(s.replace(/[^\d-]/g, ''), 10)
          return Number.isFinite(n) ? n : dflt
        }
        const abilityDescriptions: Record<string, string> = {}
        for (const a of ds.abilities) {
          if (a.body) abilityDescriptions[a.name] = a.body
        }
        const patch: FactionPackUnitPatch['patch'] = {
          name: ds.name,
          ...(ds.stats.M ? { move: numeric(ds.stats.M) } : {}),
          ...(ds.stats.T ? { toughness: numeric(ds.stats.T) } : {}),
          ...(ds.stats.SV ? { save: numeric(ds.stats.SV) } : {}),
          ...(ds.stats.W ? { wounds: numeric(ds.stats.W) } : {}),
          ...(ds.stats.LD ? { leadership: numeric(ds.stats.LD) } : {}),
          ...(ds.stats.OC ? { oc: numeric(ds.stats.OC) } : {}),
          ...(invulnSave !== undefined && Number.isFinite(invulnSave) ? { invulnSave } : {}),
          ...(ds.rangedWeapons.length + ds.meleeWeapons.length > 0
            ? {
                weapons: [
                  ...ds.rangedWeapons.map((w) => toWeapon(w, false)),
                  ...ds.meleeWeapons.map((w) => toWeapon(w, true)),
                ],
              }
            : {}),
          ...(ds.abilities.length > 0
            ? {
                abilities: ds.abilities.map((a) => a.name),
                abilityDescriptions,
              }
            : {}),
          ...(ds.isLegends ? { isLegends: true } : {}),
        }
        patches.push({
          id: existing.id,
          patch,
          keywords: ds.keywords,
          sourceNote: `faction-pack ${pack.factionSlug} → ${ds.name}`,
        })
      } else {
        // New unit — emit a full UnitProfile with a stable pack-scoped id.
        const newId = `factionpack:${pack.factionSlug}:${slug(ds.name)}`
        newUnits.push(
          datasheetToUnitProfile(
            ds,
            pack.factionSlug,
            factionSlugToBsdataName(pack.factionSlug),
            newId,
          ),
        )
        unmatched.push({
          factionSlug: pack.factionSlug,
          datasheet: ds.name,
          newUnitId: newId,
        })
      }
    }
  }

  return { patches, newUnits, unmatched }
}
