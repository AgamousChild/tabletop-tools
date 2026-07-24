/**
 * Build the full brain graph locally from all sources.
 * Writes partitioned JSON files to .local/brain/ for inspection.
 *
 * Run: cd apps/brain/server && npx tsx src/build-graph.ts
 *
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-indexeddb-brain.md — Brain knowledge graph schema
 */
import { createDb, getSubfactions } from '@tabletop-tools/db'
import { parseFactionPackV2 } from '@tabletop-tools/game-content/src/adapters/faction-pack/parser'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import { build11thEditionNodes } from './data/11th-edition-detachments'
import { buildCommunityNodes } from './lib/combat-knowledge'
import {
  buildComboRefs,
  buildDetachmentNodes,
  buildEligibleForRefs,
  buildFactionNodes,
} from './lib/combo-detection'
import {
  duplicateEleventh,
  type MfmAllowlist,
  mfmAllowlistKey,
  rekeyByEleventhSurfaceIds,
} from './lib/duplicate-eleventh'
import { EDITION_AGNOSTIC_CATEGORIES } from './lib/edition'
import { extractStructuredFields } from './lib/extract-fields'
import { loadFactionCodes, normalizeFactionId } from './lib/faction-codes'
import { massage } from './lib/massage'
import { mergeSources } from './lib/merge-sources'
import type { Node, NodeRef } from './lib/model'
import { normalizeMarkdown } from './lib/normalize/normalize'
import { parseBalanceDataslate } from './lib/parsers/balance-dataslate'
import {
  type BsdataSubfactionParseResult,
  loadBsdataSubfactionsFromFile,
} from './lib/parsers/bsdata-subfactions'
import { parseSecondaryMissions, parseTwistCards } from './lib/parsers/chapter-approved'
import { parseCoreRules } from './lib/parsers/core-rules'
import { buildDeploymentZoneNodes } from './lib/parsers/deployment-zones'
import {
  applyFactionPackPatches,
  convertPackExtractToNodes,
  type DatasheetPatch,
  detectFactionPackEdition,
} from './lib/parsers/faction-pack-v2-to-nodes'
import {
  buildForceDispositionNodes,
  buildPrimaryMissionNodes,
} from './lib/parsers/force-dispositions'
import type { GameDataInput } from './lib/parsers/game-data'
import { convertGameData } from './lib/parsers/game-data'
import { loadMfmCostingFromFile, type MfmCostingParseResult } from './lib/parsers/mfm-costing'
import { loadMfmDetachmentsFromFile } from './lib/parsers/mfm-detachments'
import { loadMissionCardOcr, parseMissionCards } from './lib/parsers/mission-cards'
import { parseRulesCommentary } from './lib/parsers/rules-commentary'
import { loadSecondaryBodiesFromFile } from './lib/parsers/secondary-mission-bodies'
import { buildTerrainLayoutNodes } from './lib/parsers/terrain-layouts'
import { parseTournamentCompanion } from './lib/parsers/tournament-companion'
import { loadTwistsFromFile } from './lib/parsers/twists'
import { mapNodesToPages } from './lib/pdf-positions'
import { slugify } from './lib/slugify'
import { buildManifest, partitionNodes, partitionRefs } from './lib/sync'
import { emitChaosTitanLegionsVariants } from './lib/titan-legions-chaos-swap'

const MD_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/markdown'
const GAME_DATA_DIR = '../../data-import/client/public/wahapedia'
const OUTPUT_DIR = '.local/brain'
const RETRIEVED_AT = new Date().toISOString()

// MFM 11e costing — read from a local cache so the build is deterministic and
// offline-capable. The data-import worker publishes `mfm-unit-costing.json` to
// R2; the brain build expects it copied to `<repo>/.local/brain-input/`. If
// missing the build still runs and falls back to Wahapedia points (10e).
const MFM_COSTING_PATH = '.local/brain-input/mfm-unit-costing.json'

// MFM 11e detachments + enhancements — same local-cache convention as the
// costing file. Loaded ahead of the merge so MFM detachment nodes flow through
// the same dedup/normalize pipeline as every other source.
const MFM_DETACHMENTS_PATH = '.local/brain-input/mfm-detachments.json'

// BSData 11e units — same staging convention. Used here purely to pick up the
// `subfaction` field that `rollupChapterFaction()` (PR #46) puts on every
// chapter-catalog unit, so brain datasheets get a chapter tag even when
// Wahapedia keywords don't carry one (per
// docs/superpowers/plans/2026-06-27-data-problems-followup.md step 7).
const BSDATA_UNITS_PATH = '.local/brain-input/bsdata-units.json'

// Known publication dates for GW source documents
const SOURCE_DATES: Record<string, string> = {
  'core-rules': '2024-06-01', // 10th Edition launch
  'rules-commentary': '2025-01-01', // Updated with each dataslate
  'balance-dataslate': '2025-04-14', // April 2025 dataslate
  // July 2026 replacement for the monolithic Balance Dataslate — GW split
  // per-faction changes into 28 Faction Packs and left only cross-faction
  // core rules updates in this doc. See universal-rules-updates.md.
  'universal-rules-updates': '2026-07-22',
  'chapter-approved': '2025-01-01', // Chapter Approved 2025
  'pariah-nexus-tournament-companion': '2024-10-01', // Pariah Nexus launch
  'chapter-approved-tournament-companion': '2025-01-01',
  wahapedia: '2025-04-20', // Last Wahapedia sync
}

function loadJson<T>(file: string): T[] {
  return JSON.parse(readFileSync(join(GAME_DATA_DIR, file), 'utf-8')) as T[]
}

/** Stamp publishedAt on all sources of every node in the array */
function stampPublishedAt(nodes: Node[], publishedAt: string): void {
  for (const node of nodes) {
    for (const src of node.sources) {
      if (!src.publishedAt) src.publishedAt = publishedAt
    }
  }
}

async function main() {
  console.log('Building full brain graph...\n')

  // Load faction code → slug mappings from DB (must happen before any normalizeFactionId calls)
  const db = createDb({
    url: process.env.TURSO_DB_URL ?? 'file:.local/dev.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  await loadFactionCodes(db)
  console.log('Faction codes loaded from DB\n')

  const allNodes: Node[] = []
  const allRefs: NodeRef[] = []
  const errors: string[] = []

  // ── 1. Core Rules ──────────────────────────────────────────────────────────
  console.log('1. Core Rules')
  const coreRulesRaw = readFileSync(join(MD_DIR, 'core-rules.md'), 'utf-8')
  const coreRulesNorm = normalizeMarkdown(coreRulesRaw)
  const coreResult = parseCoreRules(coreRulesNorm, RETRIEVED_AT)
  stampPublishedAt(coreResult.nodes, SOURCE_DATES['core-rules']!)
  allNodes.push(...coreResult.nodes)
  allRefs.push(...coreResult.refs)
  console.log(`   ${coreResult.nodes.length} nodes, ${coreResult.refs.length} refs`)

  // ── 2. Rules Commentary ────────────────────────────────────────────────────
  console.log('2. Rules Commentary')
  try {
    const raw = readFileSync(join(MD_DIR, 'core-rules-updates-and-rules-commentary.md'), 'utf-8')
    const norm = normalizeMarkdown(raw)
    const result = parseRulesCommentary(norm, RETRIEVED_AT)
    stampPublishedAt(result.nodes, SOURCE_DATES['rules-commentary']!)
    allNodes.push(...result.nodes)
    allRefs.push(...result.refs)
    console.log(`   ${result.nodes.length} nodes, ${result.refs.length} refs`)
  } catch (err) {
    console.log(`   ERROR: ${err instanceof Error ? err.message : err}`)
    errors.push(`Rules commentary: ${err}`)
  }

  // ── 3. Balance Dataslate ───────────────────────────────────────────────────
  console.log('3. Balance Dataslate')
  try {
    const raw = readFileSync(join(MD_DIR, 'balance-dataslate.md'), 'utf-8')
    const norm = normalizeMarkdown(raw)
    const result = parseBalanceDataslate(norm, RETRIEVED_AT)
    stampPublishedAt(result.nodes, SOURCE_DATES['balance-dataslate']!)
    allNodes.push(...result.nodes)
    allRefs.push(...result.refs)
    console.log(`   ${result.nodes.length} nodes, ${result.refs.length} refs`)
  } catch (err) {
    console.log(`   ERROR: ${err instanceof Error ? err.message : err}`)
    errors.push(`Balance dataslate: ${err}`)
  }

  // ── 3b. Universal Rules Updates (July 2026 dataslate replacement) ──────────
  // GW split the old monolithic Balance Dataslate into (a) this small
  // cross-faction rules doc and (b) 28 per-faction Faction Packs. Same
  // parser structure (H4 section headers, H5 individual changes), so we
  // reuse parseBalanceDataslate — but tag the source distinctly so
  // consumers can tell June 2025 changes from July 2026 changes without
  // dropping the historical record.
  console.log('3b. Universal Rules Updates')
  try {
    const raw = readFileSync(join(MD_DIR, 'universal-rules-updates.md'), 'utf-8')
    const norm = normalizeMarkdown(raw)
    const result = parseBalanceDataslate(norm, RETRIEVED_AT, 'Universal Rules Updates')
    stampPublishedAt(result.nodes, SOURCE_DATES['universal-rules-updates']!)
    allNodes.push(...result.nodes)
    allRefs.push(...result.refs)
    console.log(`   ${result.nodes.length} nodes, ${result.refs.length} refs`)
  } catch (err) {
    console.log(`   ERROR: ${err instanceof Error ? err.message : err}`)
    errors.push(`Universal rules updates: ${err}`)
  }

  // ── 4. Faction Packs (errata/FAQ sections) ─────────────────────────────────
  console.log('4. Faction Packs')
  const mdFiles = readdirSync(MD_DIR).filter(
    (f) => f.startsWith('faction-pack-') && f.endsWith('.md'),
  )
  // Look up the source URL for each faction pack from gw-sync metadata so we
  // can detect 11th edition packs (URLs starting `eng_11-02_` for the Feb 2026
  // launch wave, `eng_07-01_` for the July 2026 wave). Everything else falls
  // back to 10th (the default at the bottom of this file).
  let fpMetadata: Record<string, { url: string; markdownFile: string }> = {}
  try {
    const metaRaw = readFileSync('C:/R/sync-data/tools/gw-sync/.local/gw/metadata.json', 'utf-8')
    const meta = JSON.parse(metaRaw) as {
      pdfs: Record<string, { url: string; markdownFile: string }>
    }
    fpMetadata = meta.pdfs
  } catch (err) {
    console.log(`   WARN: could not read gw-sync metadata, defaulting all packs to 10th: ${err}`)
  }
  // Build a markdownFile → url lookup so we can match the file we're reading.
  // A single markdown file can be referenced by multiple PDFs (gw-sync stores
  // every URL that ever mapped to the same content-addressed markdown, so the
  // Orks pack has 4 entries — 3 legacy 10e URLs and 1 current 11e URL). Naive
  // last-write-wins would let a stale 10e URL clobber the 11e one and force
  // `detectFactionPackEdition` back to 10th even when the markdown content is
  // already the 11e pack. Prefer any URL that carries an 11e prefix
  // (`eng_11-02_`, `eng_07-01_`) so the edition tag matches the actual body.
  const mdFileToUrl = new Map<string, string>()
  // All 11e pack URL prefixes — keep in sync with detectFactionPackEdition() in
  // faction-pack-v2-to-nodes.ts.
  const ELEVEN_URL_PREFIXES = [
    'eng_11-02_',
    'eng_07-01_',
    'eng_08-06_',
    'eng_09-06_',
    'eng_10-06_',
    'eng_11-06_',
  ]
  const isElevenUrl = (u: string): boolean => ELEVEN_URL_PREFIXES.some((p) => u.includes(p))
  for (const entry of Object.values(fpMetadata)) {
    if (!entry.markdownFile) continue
    const existing = mdFileToUrl.get(entry.markdownFile)
    // If we already have an 11e URL for this file, keep it — a later 10e URL
    // must not win. Otherwise take whatever comes in; the last non-11e URL
    // wins over earlier non-11e URLs (same behaviour as before) until an 11e
    // URL shows up and locks it in.
    if (existing && isElevenUrl(existing) && !isElevenUrl(entry.url)) continue
    mdFileToUrl.set(entry.markdownFile, entry.url)
  }

  // Build the MFM detachment → {dp, forceDisposition} lookup map for the
  // faction-pack parser. MFM is the 11e source of truth for DP cost and
  // Force Disposition; faction-pack markdown doesn't carry these. The
  // parser stamps them on its emitted detachment-rule node by matching
  // `${factionId}::${slugify(name)}`. Step 5b emits the standalone MFM
  // detachment nodes separately — this map is just for the field copy.
  //
  // Also build the MFM allow-list used by duplicateEleventh to gate which
  // 10e Wahapedia detachments get promoted to 11e. Only detachments that
  // appear in the MFM (currently legal) get a 11e twin. The 25 retired-for-
  // 11e detachments (Wahapedia-only, no MFM row) stay as 10e-only nodes.
  //
  // Allow-list keys: `${canonicalFactionId}::${normalizedTitle}` where
  // normalizedTitle = lower-case, all non-alphanumeric stripped.
  // NOTE: the allow-list is UNSCOPED by chapter — SM shared detachments appear
  // under `space-marines` in MFM, plus redundantly under chapter factionSlugs.
  // Wahapedia emits all SM detachments under `space-marines` too, so the key
  // is always `space-marines::${normalizedTitle}` for shared SM detachments.
  // Chapter-specific detachments (e.g. 'blood-angels::angelic-inheritors')
  // appear only under their chapter factionSlug in MFM. The allow-list must
  // cover BOTH so that:
  //   - shared SM detachments match `space-marines::${title}`
  //   - chapter-specific detachments match `${chapter}::${title}`
  // We achieve this by adding all MFM rows with their normalized factionSlug
  // as-is. For chapter rows that repeat a SM-shared detachment, we skip them
  // (the SM row already covers it) to keep the allow-list lean.
  const mfmDetachmentLookup = new Map<string, { dp?: number; forceDisposition?: string }>()
  let mfmAllowlist: MfmAllowlist | undefined
  // SM chapter routing: Wahapedia stores every SM chapter-specific detachment
  // (Angelic Inheritors, Marshal's Household, etc.) under `factionId: "Space
  // Marines"`. MFM lists them under their chapter factionSlug. We route the
  // Wahapedia node onto the chapter shard at ingest, so the SM shard only
  // carries shared library detachments (Gladius Task Force, etc.).
  // Chapter classification:
  //   - `smSharedTitles`: normalized titles that appear under
  //     `factionSlug='space-marines'` in MFM — these are the truly shared
  //     library; keep them at `space-marines`.
  //   - `chapterOwnership`: normalized title → chapter factionId. Populated
  //     for MFM rows under a chapter factionSlug whose title is NOT in
  //     `smSharedTitles`. This is the router map used below.
  const smSharedTitles = new Set<string>()
  const chapterOwnership = new Map<string, string>()
  const SM_CHAPTER_SLUGS = new Set([
    'blood-angels',
    'dark-angels',
    'black-templars',
    'space-wolves',
    'deathwatch',
    'imperial-fists',
    'iron-hands',
    'raven-guard',
    'salamanders',
    'ultramarines',
    'white-scars',
  ])
  const normalizeTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  try {
    if (existsSync(MFM_DETACHMENTS_PATH)) {
      const mfmRaw = JSON.parse(readFileSync(MFM_DETACHMENTS_PATH, 'utf-8')) as Array<{
        factionSlug?: string
        name?: string
        dp?: number | null
        objective?: string | null
      }>
      // Pass 1: collect SM shared titles (factionSlug='space-marines').
      for (const row of mfmRaw) {
        if (!row?.factionSlug || !row?.name) continue
        if (normalizeFactionId(row.factionSlug) === 'space-marines') {
          smSharedTitles.add(normalizeTitle(row.name))
        }
      }
      // Pass 2: chapter rows whose title is NOT in the SM shared set are the
      // chapter's own detachments — record the ownership map so the ingest
      // can route the Wahapedia SM-tagged node to the correct chapter.
      for (const row of mfmRaw) {
        if (!row?.factionSlug || !row?.name) continue
        const canonicalFaction = normalizeFactionId(row.factionSlug)
        if (!SM_CHAPTER_SLUGS.has(canonicalFaction)) continue
        const norm = normalizeTitle(row.name)
        if (smSharedTitles.has(norm)) continue
        chapterOwnership.set(norm, canonicalFaction)
      }
      // Pass 3: build the allow-list + points/objective lookup.
      // Chapter rows for SM-shared detachments are skipped entirely — the
      // SM row already covers dp/objective, and the chapter shard shouldn't
      // emit a redundant node (chapters reach shared SM via subfaction
      // expansion at retrieval time).
      const allowlistSet = new Set<string>()
      for (const row of mfmRaw) {
        if (!row?.factionSlug || !row?.name) continue
        const canonicalFaction = normalizeFactionId(row.factionSlug)
        const norm = normalizeTitle(row.name)
        // Skip chapter rows that duplicate an SM shared title (inheritance).
        if (SM_CHAPTER_SLUGS.has(canonicalFaction) && smSharedTitles.has(norm)) {
          continue
        }
        // For chapter-specific rows, keep the chapter as the canonical
        // faction. For SM-shared rows and every non-SM row, use the row's
        // own factionSlug as-is.
        const emitFaction = chapterOwnership.get(norm) ?? canonicalFaction
        const key = `${emitFaction}::${slugify(row.name)}`
        mfmDetachmentLookup.set(key, {
          ...(typeof row.dp === 'number' ? { dp: row.dp } : {}),
          ...(row.objective ? { forceDisposition: row.objective } : {}),
        })
        allowlistSet.add(mfmAllowlistKey(emitFaction, row.name))
      }
      mfmAllowlist = allowlistSet
      console.log(
        `   MFM detachment lookup: ${mfmDetachmentLookup.size} entries, allow-list: ${allowlistSet.size} keys, chapter-owned: ${chapterOwnership.size}`,
      )
    } else {
      console.log(`   MFM detachment lookup: skipped (no file at ${MFM_DETACHMENTS_PATH})`)
    }
  } catch (err) {
    console.log(`   WARN: could not build MFM detachment lookup, continuing without: ${err}`)
  }

  // 11e faction-pack overlays land on the Wahapedia 11e duplicate (see step
  // 5a below) — collect them here and apply once `duplicateEleventh` has
  // produced the twin nodes we're patching into.
  const elevenPackPatches: DatasheetPatch[] = []
  const elevenPackPublishedAt = '2026-02-11'
  // Pack-declared Legends → 11e retire set (`${faction}::${normTitle}`).
  // A unit named in a pack's Legends section is NOT 11e-playable even when
  // the Wahapedia 10e snapshot still carries it as legal (e.g. Venerable
  // Dreadnought). Names in the pack's REGULAR datasheet section take
  // precedence — MUTILATORS returns from Legends in the 11e CSM pack and
  // appears in both sections.
  const packLegendsRetire = new Set<string>()
  let fpNodes = 0,
    fpRefs = 0,
    fpErrors = 0,
    fpEleventh = 0,
    fpPatches = 0
  for (const file of mdFiles) {
    const factionSlug = file.replace('faction-pack-', '').replace('.md', '')
    try {
      const raw = readFileSync(join(MD_DIR, file), 'utf-8')
      const url = mdFileToUrl.get(file) ?? ''
      const edition = detectFactionPackEdition(url)
      if (edition === '11th') fpEleventh++
      // v2 pipeline: parse markdown → structured PackExtract → convert to
      // brain nodes with v1-compatible IDs. In 11e mode overlapping shapes
      // (datasheets, detachment rules, stratagems, enhancements) come back
      // as `DatasheetPatch[]` — we accumulate them and apply them onto the
      // 11e Wahapedia twin after step 5a below. Non-overlapping shapes
      // (army-rules, errata, FAQs, Legends) still emit as nodes at
      // `11e:*`-prefixed IDs.
      const extract = parseFactionPackV2(raw, { faction: factionSlug })
      const result = convertPackExtractToNodes(
        extract,
        factionSlug,
        RETRIEVED_AT,
        edition,
        mfmDetachmentLookup,
      )
      // Faction packs published with the 10e launch use the 10e core-rules
      // date; 11e packs were published Feb 2026 (eng_11-02_*) or Jul 2026
      // (eng_07-01_*). Stamp the appropriate publishedAt.
      const publishedAt = edition === '11th' ? elevenPackPublishedAt : SOURCE_DATES['core-rules']!
      stampPublishedAt(result.nodes, publishedAt)
      allNodes.push(...result.nodes)
      allRefs.push(...result.refs)
      fpNodes += result.nodes.length
      fpRefs += result.refs.length
      if (edition === '11th' && result.patches.length > 0) {
        elevenPackPatches.push(...result.patches)
        fpPatches += result.patches.length
      }
      if (edition === '11th') {
        const packFaction = normalizeFactionId(factionSlug)
        const regularNames = new Set(
          extract.datasheets.filter((d) => !d.isLegends).map((d) => normalizeTitle(d.name)),
        )
        for (const d of [
          ...extract.legendsDatasheets,
          ...extract.datasheets.filter((d) => d.isLegends),
        ]) {
          const key = normalizeTitle(d.name)
          if (!regularNames.has(key)) packLegendsRetire.add(`${packFaction}::${key}`)
        }
      }
    } catch (err) {
      fpErrors++
      errors.push(`Faction ${factionSlug}: ${err}`)
    }
  }
  console.log(
    `   ${mdFiles.length} faction packs → ${fpNodes} nodes, ${fpRefs} refs, ${fpErrors} errors (${fpEleventh} packs as 11th edition, ${fpPatches} overlays queued)`,
  )

  // ── 4b. Imperial Armour: Titans ────────────────────────────────────────────
  // `imperial-armour-titans.md` is the Titan supplement — army rules
  // (TOWERING EXAMPLE, TITANIC SUPPORT, TITANICUS TRAITORIS) + 4 datasheets
  // (Warhound, Reaver, Warbringer Nemesis, Warlord). It is NOT a faction pack
  // by filename (no `faction-pack-` prefix) so the loop above skips it, but
  // it is STRUCTURALLY a faction pack — same v2 parser handles it.
  //
  // The current `eng_24.09_` PDF is 10e content; the 11e Adeptus Titanicus
  // faction pack (processed above via `faction-pack-adeptus-titanicus.md`,
  // sourced from an `eng_11-06_` URL) already carries the same 4 datasheets
  // with the newer "Frame" keyword. Emit here at `edition: '10th'`; the
  // merge pass dedupes by id when the faction pack has already produced the
  // same slug node, and the `duplicateEleventh` pass will produce an 11e
  // twin for the Wahapedia surface ids. What this loop adds is the redundant
  // ingest bridge so if the faction pack goes away, imperial-armour still
  // supplies content.
  const IMPERIAL_ARMOUR_TITANS_FILE = 'imperial-armour-titans.md'
  // Micah's directive 2026-07-05: Adeptus Titanicus IS Titan Legions —
  // route this and the Adeptus Titanicus faction-pack to `titan-legions`
  // so both feed a single dim_faction entry (see
  // apps/brain/server/scripts/count-factions.mjs `dimSlugs`).
  const IMPERIAL_ARMOUR_TITANS_FACTION = 'titan-legions'
  const imperialArmourTitansPath = join(MD_DIR, IMPERIAL_ARMOUR_TITANS_FILE)
  let imperialArmourTitansNodesAdded = 0
  if (existsSync(imperialArmourTitansPath)) {
    console.log('4b. Imperial Armour: Titans')
    try {
      const raw = readFileSync(imperialArmourTitansPath, 'utf-8')
      const extract = parseFactionPackV2(raw, { faction: IMPERIAL_ARMOUR_TITANS_FACTION })
      // Force 10th edition — the current PDF is dated 24.09 (September 2024,
      // 10e-era). If GW republishes for 11e we can flip the URL prefix in
      // the metadata + let `detectFactionPackEdition` route it 11e.
      const result = convertPackExtractToNodes(
        extract,
        IMPERIAL_ARMOUR_TITANS_FACTION,
        RETRIEVED_AT,
        '10th',
        mfmDetachmentLookup,
      )
      stampPublishedAt(result.nodes, SOURCE_DATES['core-rules']!)
      allNodes.push(...result.nodes)
      allRefs.push(...result.refs)
      imperialArmourTitansNodesAdded = result.nodes.length
      console.log(
        `   Imperial Armour: Titans → ${result.nodes.length} nodes, ${result.refs.length} refs`,
      )
    } catch (err) {
      errors.push(`Imperial Armour: Titans: ${err}`)
      console.log(`   ERROR: ${err instanceof Error ? err.message : err}`)
    }
  } else {
    console.log(`4b. Imperial Armour: Titans — skipped (no ${imperialArmourTitansPath})`)
  }
  void imperialArmourTitansNodesAdded

  // ── 5. Wahapedia/BSData Game Data ──────────────────────────────────────────
  console.log('4. Wahapedia/BSData Game Data')
  const gameData: GameDataInput = {
    datasheets: loadJson('datasheets.json'),
    datasheetWargear: loadJson('datasheet_wargear.json'),
    datasheetModels: loadJson('datasheet_models.json'),
    unitAbilities: loadJson('unit_abilities.json'),
    abilities: loadJson('abilities.json'),
    detachments: loadJson('detachments.json'),
    detachmentAbilities: loadJson('detachment_abilities.json'),
    stratagems: loadJson('stratagems.json'),
    enhancements: loadJson('enhancements.json'),
    unitKeywords: loadJson('unit_keywords.json'),
    unitCompositions: loadJson('unit_compositions.json'),
    unitCosts: loadJson('unit_costs.json'),
    wargearOptions: loadJson('wargear_options.json'),
    leaderAttachments: loadJson('leader_attachments.json'),
    datasheetStratagems: loadJson('datasheet_stratagems.json'),
    datasheetEnhancements: loadJson('datasheet_enhancements.json'),
    datasheetDetachmentAbilities: loadJson('datasheet_detachment_abilities.json'),
  }

  // BSData chapter-catalog subfactions (optional source) — load before
  // convertGameData so chapter membership lands on every brain datasheet that
  // matches a BSData unit, not just the chapter-iconic ones Wahapedia tags.
  let bsdataSubfactionResult: BsdataSubfactionParseResult = {
    byKey: new Map(),
    totalRows: 0,
    taggedRows: 0,
  }
  try {
    bsdataSubfactionResult = loadBsdataSubfactionsFromFile(BSDATA_UNITS_PATH)
    if (bsdataSubfactionResult.totalRows > 0) {
      console.log(
        `   BSData subfactions: ${bsdataSubfactionResult.taggedRows}/${bsdataSubfactionResult.totalRows} rows carry a subfaction tag`,
      )
    } else {
      console.log(`   BSData subfactions: skipped (no file at ${BSDATA_UNITS_PATH})`)
    }
  } catch (err) {
    console.log(`   WARN: could not load BSData subfactions, continuing without: ${err}`)
  }

  const gameResult = convertGameData(gameData, RETRIEVED_AT, {
    bsdataSubfactionByKey: bsdataSubfactionResult.byKey,
  })
  stampPublishedAt(gameResult.nodes, SOURCE_DATES['wahapedia']!)

  // ── 4c. Route SM chapter-specific detachments to the right chapter ─────────
  // Wahapedia files every SM detachment under `factionId: "Space Marines"`,
  // including chapter-specific ones (Angelic Inheritors, Marshal's Household,
  // etc.). Route them to their chapter now, before duplicateEleventh — so the
  // 11e twin lands under the chapter shard and the MFM chapter row can merge
  // with it cleanly.
  //
  // Also rewrite children (stratagems, enhancements, faction-abilities) whose
  // detachmentId matches a chapter-routed detachment. Without this, the pack
  // emits the same stratagem under both `factionId=space-marines` (via
  // Wahapedia+11e-duplicate path) and `factionId=<chapter>` (via MFM),
  // merge-sources' faction-scoped dedup key keeps them separate, and the
  // detachment endpoint returns doubled lists with mismatched titles/costs.
  let smChapterRewrites = 0
  const chapterOwnedDetachmentIds = new Map<string, string>() // detachmentId slug → chapter factionId
  for (const node of gameResult.nodes) {
    if (node.category !== 'detachment-rule') continue
    if (node.factionId !== 'space-marines') continue
    const chapter = chapterOwnership.get(normalizeTitle(node.title))
    if (chapter && chapter !== 'space-marines') {
      node.factionId = chapter
      smChapterRewrites++
      if (node.detachmentId) chapterOwnedDetachmentIds.set(node.detachmentId, chapter)
    }
  }
  let smChapterChildRewrites = 0
  const CHILD_CATEGORIES = new Set(['stratagem', 'enhancement', 'faction-ability'])
  for (const node of gameResult.nodes) {
    if (!CHILD_CATEGORIES.has(node.category)) continue
    if (node.factionId !== 'space-marines') continue
    if (!node.detachmentId) continue
    const chapter = chapterOwnedDetachmentIds.get(node.detachmentId)
    if (chapter) {
      node.factionId = chapter
      smChapterChildRewrites++
    }
  }
  if (smChapterRewrites > 0) {
    console.log(
      `   Routed ${smChapterRewrites} SM chapter-specific detachments + ${smChapterChildRewrites} child nodes to chapter shards`,
    )
  }

  for (const n of gameResult.nodes) allNodes.push(n)
  for (const r of gameResult.refs) allRefs.push(r)
  console.log(`   ${gameResult.nodes.length} nodes, ${gameResult.refs.length} refs`)

  // ── 5a. Parallel 11e duplicate of the Wahapedia 10e graph ─────────────────
  // Per docs/superpowers/plans/parallel-10e-11e-datasets.md (and the
  // post-mortem in the same task): a previous deploy promoted Wahapedia
  // nodes from 10e → 11e wholesale, which broke every bookmark / brain:link
  // pointing at a Wahapedia numeric id. The fix is to keep 10e frozen and
  // build an 11e parallel dataset by duplicating the 10e graph with an
  // `11e:` id prefix. The 11e duplicates are what the MFM 11e points pass
  // and (eventually) the faction-pack unit-level patches mutate.
  const eleventhDup = duplicateEleventh(gameResult.nodes, gameResult.refs, mfmAllowlist)
  stampPublishedAt(eleventhDup.nodes, SOURCE_DATES['wahapedia']!)
  for (const n of eleventhDup.nodes) allNodes.push(n)
  for (const r of eleventhDup.refs) allRefs.push(r)
  console.log(`   ${eleventhDup.nodes.length} 11e duplicates, ${eleventhDup.refs.length} 11e refs`)

  // ── 5b. Apply v2 faction-pack overlays onto the 11e duplicates ─────────────
  // The 11e faction packs are the source of truth for 11e content on
  // datasheets, abilities, weapons, detachments, stratagems, enhancements.
  // We overlay their patches onto the Wahapedia twin so every 11e entity
  // lives at exactly ONE node — the twin — and no parallel slug node is
  // emitted for the same shape.
  if (elevenPackPatches.length > 0) {
    const patchResult = applyFactionPackPatches(
      eleventhDup.nodes,
      elevenPackPatches,
      elevenPackPublishedAt,
    )
    for (const r of patchResult.extraRefs) allRefs.push(r)
    // Unmatched patches are brand-new 11e entities that don't exist in the
    // 10e Wahapedia snapshot (e.g. Sororitas Chorus of Condemnation
    // detachment). Emit their fallback nodes at `11e:*`-prefixed ids so the
    // content still lands.
    for (const n of patchResult.fallbackNodes) allNodes.push(n)
    for (const r of patchResult.fallbackRefs) allRefs.push(r)
    console.log(
      `   Applied ${patchResult.applied}/${elevenPackPatches.length} 11e faction-pack overlays ` +
        `(${patchResult.unmatched.length} unmatched → ${patchResult.fallbackNodes.length} fallback nodes)`,
    )
    if (patchResult.unmatched.length > 0) {
      // Surface the first 20 unmatched keys so the operator can see which
      // slug lookups the twin index is missing. `patchResult.unmatched`
      // holds `${category}::${factionId}::${parentSlug ?? '_'}::${targetSlug}`.
      const preview = patchResult.unmatched.slice(0, 20).join(', ')
      const more =
        patchResult.unmatched.length > 20 ? ` ... (+${patchResult.unmatched.length - 20} more)` : ''
      console.log(`   WARN unmatched 11e overlays: ${preview}${more}`)
    }
  }

  // ── 6. Community Knowledge ─────────────────────────────────────────────────
  console.log('6. Community Knowledge')
  const communityResult = buildCommunityNodes()
  // Community nodes get publishedAt from their own sources (video dates, etc.)
  allNodes.push(...communityResult.nodes)
  allRefs.push(...communityResult.refs)
  console.log(`   ${communityResult.nodes.length} nodes, ${communityResult.refs.length} refs`)

  // ── 7. Chapter Approved 2025 cards ────────────────────────────────────────
  const CA_DIR = 'C:/R/sync-data/.local/chapter-approved/markdown'
  if (existsSync(CA_DIR)) {
    console.log('\n--- Chapter Approved 2025 ---')

    // Primary missions — use hand-transcribed structured data instead of markdown parsing
    const { PRIMARY_MISSIONS } = await import('./data/primary-missions')
    const primaryNodes: Node[] = PRIMARY_MISSIONS.map((m) => {
      const fullTitle = m.isAsymmetric ? `${m.name} - ASYMMETRIC WAR` : m.name
      const lines: string[] = []

      if (m.description) lines.push(m.description, '')
      if (m.setupNote) lines.push(`**Setup:** ${m.setupNote}`, '')

      if (m.action) {
        lines.push(`**ACTION: ${m.action.name}**`)
        lines.push(`- **Starts:** ${m.action.starts}`)
        lines.push(`- **Units:** ${m.action.units}`)
        lines.push(`- **Completes:** ${m.action.completes}`)
        lines.push(`- **If Completed:** ${m.action.ifCompleted}`)
        lines.push('')
      }

      for (const block of m.scoringBlocks) {
        lines.push(`**${block.timing}**`)
        lines.push(`**WHEN:** ${block.when}`)
        if (block.preamble) lines.push(block.preamble)
        for (let i = 0; i < block.conditions.length; i++) {
          const c = block.conditions[i]!
          const connector =
            i < block.conditions.length - 1 ? (block.connector === 'OR' ? ' *(OR)*' : '') : ''
          lines.push(`- ${c.condition} → **${c.vp}**${connector}`)
        }
        lines.push('')
      }

      if (m.maxVp) lines.push(`**Max VP:** ${m.maxVp}`)
      if (m.designerNote) lines.push('', `*Designer's Note: ${m.designerNote}*`)

      return {
        id: `ca:primary:${m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        layer: 'core' as const,
        category: 'primary-mission' as const,
        title: fullTitle,
        content: lines.join('\n').trim(),
        summary: `${fullTitle} — Primary Mission${m.maxVp ? ` (max ${m.maxVp})` : ''}`,
        sources: [
          {
            type: 'pdf' as const,
            title: 'Chapter Approved Primary Missions',
            publishedAt: SOURCE_DATES['chapter-approved'],
            retrievedAt: RETRIEVED_AT,
            page: m.page,
          },
        ],
        refs: [],
        version: 1,
        keywords: [
          'primary mission',
          m.name.toLowerCase(),
          ...(m.isAsymmetric ? ['asymmetric war'] : []),
          ...(m.action ? ['action'] : []),
        ],
      }
    })
    stampPublishedAt(primaryNodes, SOURCE_DATES['chapter-approved']!)
    console.log(`  Primary missions: ${primaryNodes.length} nodes`)
    allNodes.push(...primaryNodes)

    const secAtkMd = readFileSync(join(CA_DIR, 'secondary-missions-attacker.md'), 'utf8')
    const secAtkNodes = parseSecondaryMissions(secAtkMd, 'attacker', RETRIEVED_AT)
    stampPublishedAt(secAtkNodes, SOURCE_DATES['chapter-approved']!)
    console.log(`  Secondary missions (attacker): ${secAtkNodes.length} nodes`)
    allNodes.push(...secAtkNodes)

    const secDefMd = readFileSync(join(CA_DIR, 'secondary-missions-defender.md'), 'utf8')
    const secDefNodes = parseSecondaryMissions(secDefMd, 'defender', RETRIEVED_AT)
    stampPublishedAt(secDefNodes, SOURCE_DATES['chapter-approved']!)
    console.log(`  Secondary missions (defender): ${secDefNodes.length} nodes`)
    allNodes.push(...secDefNodes)

    const twistMd = readFileSync(join(CA_DIR, 'twist-cards.md'), 'utf8')
    const twistNodes = parseTwistCards(twistMd, RETRIEVED_AT)
    stampPublishedAt(twistNodes, SOURCE_DATES['chapter-approved']!)
    console.log(`  Twist cards: ${twistNodes.length} nodes`)
    allNodes.push(...twistNodes)

    // Challenger cards — use hand-transcribed structured data
    const { CHALLENGER_CARDS } = await import('./data/challenger-cards')
    const challengerNodes: Node[] = CHALLENGER_CARDS.map((c) => {
      const lines: string[] = []

      lines.push(`**${c.timing}**`)
      lines.push(`**WHEN:** ${c.when}`)
      lines.push(`- ${c.condition} → **${c.vp}**`)
      if (c.maxVp) lines.push(`- Max VP: ${c.maxVp}`)
      lines.push('')

      if (c.action) {
        lines.push(`**ACTION: ${c.action.name}**`)
        lines.push(`- **Starts:** ${c.action.starts}`)
        lines.push(`- **Units:** ${c.action.units}`)
        lines.push(`- **Completes:** ${c.action.completes}`)
        lines.push(`- **If Completed:** ${c.action.ifCompleted}`)
        lines.push('')
      }

      lines.push(
        `**PAIRED STRATAGEM: ${c.stratagem.name}** (${c.stratagem.type}, ${c.stratagem.cp} CP)`,
      )
      lines.push(`- **WHEN:** ${c.stratagem.when}`)
      lines.push(`- **TARGET:** ${c.stratagem.target}`)
      lines.push(`- **EFFECT:** ${c.stratagem.effect}`)

      return {
        id: `ca:challenger:${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        layer: 'core' as const,
        category: 'challenger' as const,
        title: c.name,
        content: lines.join('\n').trim(),
        summary: `${c.name} — Challenger Mission (${c.vp}${c.maxVp ? `, max ${c.maxVp}` : ''}) + ${c.stratagem.name} stratagem`,
        sources: [
          {
            type: 'pdf' as const,
            title: 'Chapter Approved Challenger Cards',
            publishedAt: SOURCE_DATES['chapter-approved'],
            retrievedAt: RETRIEVED_AT,
            page: c.page,
          },
        ],
        refs: [],
        version: 1,
        keywords: [
          'challenger',
          'challenger mission',
          c.name.toLowerCase(),
          c.stratagem.name.toLowerCase(),
          ...(c.action ? ['action'] : []),
        ],
      }
    })
    console.log(`  Challenger cards: ${challengerNodes.length} nodes`)
    allNodes.push(...challengerNodes)

    // Deployment zones — each zone has Incursion + Strike Force pages (or single Asymmetric page)
    const deployZones: Array<{
      name: string
      battleSizes: string[]
      pages: number[] // page numbers in the deployment zones PDF
      dimensions: string // key measurements from the diagram
    }> = [
      {
        name: 'CRUCIBLE OF BATTLE',
        battleSizes: ['Strike Force', 'Incursion'],
        pages: [2, 1],
        dimensions:
          'Diagonal split. Strike Force (2000pts): 10"/8" from corners, 20" depth. Incursion: 12"/10" from corners, 20" depth.',
      },
      {
        name: 'DAWN OF WAR',
        battleSizes: ['Strike Force', 'Incursion'],
        pages: [4, 3],
        dimensions:
          'Long edges. Strike Force (2000pts): 10" deep, 12" wide no-mans land. Incursion: 14" deep, 12" wide no-mans land.',
      },
      {
        name: 'HAMMER AND ANVIL',
        battleSizes: ['Strike Force', 'Incursion'],
        pages: [6, 5],
        dimensions:
          'Short edges. Strike Force (2000pts): 10" deep, 18" wide. Incursion: 14" deep, 18" wide.',
      },
      {
        name: 'SEARCH AND DESTROY',
        battleSizes: ['Strike Force', 'Incursion'],
        pages: [8, 7],
        dimensions:
          'Opposite corners. Strike Force (2000pts): 10" square corners, 14" diagonal. Incursion: 12" square corners, 16" diagonal.',
      },
      {
        name: 'SWEEPING ENGAGMENT',
        battleSizes: ['Strike Force', 'Incursion'],
        pages: [10, 9],
        dimensions:
          'Offset long edges. Strike Force (2000pts): 6"/10" staggered, 18" table edge. Incursion: 8"/14" staggered, 18" table edge.',
      },
      {
        name: 'TIPPING POINT',
        battleSizes: ['Strike Force', 'Incursion'],
        pages: [12, 11],
        dimensions:
          'L-shaped zones. Strike Force (2000pts): 22" long arm, 8"-14" widths. Incursion: 22" long arm, 10"-16" widths.',
      },
      {
        name: 'TIP OF THE SPEAR',
        battleSizes: ['Asymmetric War'],
        pages: [13],
        dimensions:
          'Attacker: wide triangle from short edge, 20" deep, 26" wide. Defender: opposite short edge, 22" deep with forward wedge.',
      },
      {
        name: 'DEFENSIVE LINE',
        battleSizes: ['Asymmetric War'],
        pages: [14],
        dimensions:
          'Attacker: central 28" wide band. Defender: two flanking 16" strips along long edges.',
      },
      {
        name: 'PINCER ATTACK',
        battleSizes: ['Asymmetric War'],
        pages: [15],
        dimensions:
          'Attacker: two corner zones, 18"/12" from short edges. Defender: central 28" wide strip.',
      },
      {
        name: 'BREAKOUT',
        battleSizes: ['Asymmetric War'],
        pages: [16],
        dimensions:
          'Attacker: large L-shaped zone. Defender: small corner zone, 12"/10" from corner.',
      },
      {
        name: 'LAST STAND',
        battleSizes: ['Asymmetric War'],
        pages: [17],
        dimensions:
          'Attacker: surrounds the table edges. Defender: central zone, 14"/12" from center.',
      },
    ]

    for (const zone of deployZones) {
      const battleSizeText = zone.battleSizes.join(', ')
      allNodes.push({
        id: `ca:deploy:${zone.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        layer: 'core',
        category: 'deployment-zone',
        title: zone.name,
        content: `**Battle Size:** ${battleSizeText}\n\n**Layout:** ${zone.dimensions}\n\nSee PDF page images for full diagram.`,
        summary: `${zone.name} — ${battleSizeText} deployment zone layout`,
        sources: zone.pages.map((page) => ({
          type: 'pdf' as const,
          title: 'Chapter Approved Deployment Zones',
          publishedAt: SOURCE_DATES['chapter-approved'],
          retrievedAt: RETRIEVED_AT,
          page,
        })),
        refs: [],
        version: 1,
        keywords: [
          'deployment',
          'deployment zone',
          zone.name.toLowerCase(),
          ...zone.battleSizes.map((s) => s.toLowerCase()),
        ],
      })
    }
    console.log(`  Deployment zones: ${deployZones.length} nodes`)

    // Terrain layouts — each layout is one page in the PDF
    // Legend: grey (>4") = large terrain, blue (<4") = small terrain, L-shapes = walls
    for (let i = 1; i <= 8; i++) {
      allNodes.push({
        id: `ca:terrain:layout-${i}`,
        layer: 'core',
        category: 'terrain-layout',
        title: `Terrain Layout ${i}`,
        content: `**Competitive terrain placement guide.**\n\nShows positions and measurements for all terrain pieces on a standard 44"×60" table. Grey pieces are >4" (large terrain), blue pieces are <4" (small terrain), L-shapes are walls. Orange measurements show distances from table edges and between pieces.`,
        summary: `Terrain Layout ${i} — competitive play terrain placement with measurements`,
        sources: [
          {
            type: 'pdf' as const,
            title: 'Chapter Approved Terrain Layouts',
            publishedAt: SOURCE_DATES['chapter-approved'],
            retrievedAt: RETRIEVED_AT,
            page: i,
          },
        ],
        refs: [],
        version: 1,
        keywords: ['terrain', 'terrain layout', 'competitive', `layout ${i}`],
      })
    }
    console.log(`  Terrain layouts: 8 nodes`)
  } else {
    console.log('\n--- Chapter Approved 2025: skipped (directory not found) ---')
  }

  // ── 7b. 11e Chapter Approved mission cards (OCR'd from gdmissions.app) ────
  // GW publishes no PDF for the 11e mission deck; the community site renders
  // the cards as PNG images. We download + OCR them offline (two scripts in
  // `apps/brain/server/scripts/`) and ingest the resulting `ocr.json` here.
  // The build is silent-skip when the OCR manifest isn't present — Micah's
  // local cache may not be populated on every machine.
  //
  // Secondary mission body text: when a higher-fidelity Canon transcript is
  // staged (`secondary-mission-bodies.txt` from Micah's local PDF, see
  // `scripts/stage-card-sources.ts`), it overrides the per-image OCR text so
  // each merged secondary node carries the cleaner body.
  const MISSION_CARDS_OCR = '.local/brain-input/mission-cards/11th/ocr.json'
  const SECONDARY_BODIES_PATH = '.local/brain-input/cards/secondary-mission-bodies.txt'
  const missionCardsManifest = loadMissionCardOcr(MISSION_CARDS_OCR)
  if (missionCardsManifest) {
    const secondaryBodies = loadSecondaryBodiesFromFile(SECONDARY_BODIES_PATH)
    const mcResult = parseMissionCards(missionCardsManifest, {
      secondaryBodyBySlug: secondaryBodies?.bodyBySlug,
    })
    allNodes.push(...mcResult.nodes)
    const sbNote = secondaryBodies
      ? `, secondary bodies: ${secondaryBodies.recognized.length}/18 matched (${secondaryBodies.missing.length} missing, ${secondaryBodies.unmatchedChunks} unmatched chunks)`
      : `, secondary bodies: skipped (no ${SECONDARY_BODIES_PATH})`
    console.log(
      `\n--- 11e mission cards (gdmissions.app OCR) ---\n  ${mcResult.primaries} primary, ${mcResult.secondaries} secondary, ${mcResult.skipped} skipped${sbNote}`,
    )
  } else {
    console.warn(
      `\n--- 11e mission cards: skipped (no ${MISSION_CARDS_OCR}; run download-mission-cards.ts + ocr-mission-cards.ts) ---`,
    )
  }

  // ── 7c. 11e Chapter Approved Twist cards (from local PDF transcript) ───────
  // Micah's local-only twists PDF (`C:/R/twists.pdf`) is staged into
  // `.local/brain-input/cards/twists.txt` by `stage-card-sources.ts`. Silent-
  // skip when absent.
  const TWISTS_PATH = '.local/brain-input/cards/twists.txt'
  const twistsResult = loadTwistsFromFile(TWISTS_PATH)
  if (twistsResult) {
    allNodes.push(...twistsResult.nodes)
    const missingNote =
      twistsResult.missing.length > 0 ? ` (missing: ${twistsResult.missing.join(', ')})` : ''
    console.log(`\n--- 11e twist cards ---\n  ${twistsResult.nodes.length}/6 nodes${missingNote}`)
  } else {
    console.warn(
      `\n--- 11e twist cards: skipped (no ${TWISTS_PATH}; run stage-card-sources.ts) ---`,
    )
  }

  // ── 7d. 11e Chapter Approved Deployment Zones ─────────────────────────────
  // Image-only nodes, matching the 10e deployment-zone shape. The 6 cards
  // live in R2 under `pages/ca11-deployment-zones/page-{1..6}.png`, uploaded
  // out-of-band via `scripts/upload-deployment-zone-images.ts` after a local
  // crop run (`scripts/crop-deployment-zone-images.ts`). No body text is
  // ingested — the image carries the rules content. Nothing to load from
  // disk here, the zone list is fixed.
  const dzNodes = buildDeploymentZoneNodes({ retrievedAt: RETRIEVED_AT })
  allNodes.push(...dzNodes)
  console.log(`\n--- 11e deployment zones ---\n  ${dzNodes.length}/6 nodes`)

  // ── 7e. 11e Chapter Approved Force Dispositions ───────────────────────────
  // 5 player-facing disposition cards (image-only nodes, mirrors 11e
  // deployment-zone shape) + 25 primary-mission stubs (one per matrix cell,
  // bodies pending — the physical primary mission cards have not been
  // scanned yet). Cards are emitted unconditionally; the build is data-only.
  const fdNodes = buildForceDispositionNodes({ retrievedAt: RETRIEVED_AT })
  for (const n of fdNodes) for (const r of n.refs) allRefs.push(r)
  allNodes.push(...fdNodes)
  const pmStubNodes = buildPrimaryMissionNodes({ retrievedAt: RETRIEVED_AT })
  for (const n of pmStubNodes) for (const r of n.refs) allRefs.push(r)
  allNodes.push(...pmStubNodes)
  console.log(
    `\n--- 11e force dispositions ---\n  ${fdNodes.length} disposition nodes, ${pmStubNodes.length} primary-mission stub nodes`,
  )

  // ── 7f. 11e Warhammer Event Companion terrain layouts (pages 14-53) ───────
  // 40 image-only nodes (one per PDF page). Images live in R2 under
  // `pages/ca11-terrain-layouts/page-{1..40}.png`, uploaded out-of-band by
  // `scripts/upload-terrain-layout-images.ts` after
  // `scripts/extract-terrain-layout-images.py` renders the Event Companion
  // PDF pages. Mission-name mapping (layout N ↔ "Purge the Foe A" etc.) is
  // deferred until the labelling text lands separately.
  const tlNodes = buildTerrainLayoutNodes({
    retrievedAt: RETRIEVED_AT,
    publishedAt: '2026-07-22',
  })
  allNodes.push(...tlNodes)
  console.log(`\n--- 11e terrain layouts ---\n  ${tlNodes.length}/40 nodes`)

  // ── 8. Tournament Companion rules ──────────────────────────────────────────
  const TC_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/markdown'
  const pnTcPath = join(TC_DIR, 'pariah-nexus-tournament-companion.md')
  const caTcPath = join(TC_DIR, 'chapter-approved-tournament-companion.md')

  if (existsSync(pnTcPath)) {
    console.log('\n--- Pariah Nexus Tournament Companion ---')
    const pnTc = parseTournamentCompanion(
      readFileSync(pnTcPath, 'utf8'),
      'pariah-nexus',
      RETRIEVED_AT,
    )
    stampPublishedAt(pnTc.nodes, SOURCE_DATES['pariah-nexus-tournament-companion']!)
    console.log(`  ${pnTc.nodes.length} nodes, ${pnTc.refs.length} refs`)
    allNodes.push(...pnTc.nodes)
    allRefs.push(...pnTc.refs)
  }

  if (existsSync(caTcPath)) {
    console.log('\n--- Chapter Approved Tournament Companion ---')
    const caTc = parseTournamentCompanion(
      readFileSync(caTcPath, 'utf8'),
      'chapter-approved',
      RETRIEVED_AT,
    )
    stampPublishedAt(caTc.nodes, SOURCE_DATES['chapter-approved-tournament-companion']!)
    console.log(`  ${caTc.nodes.length} nodes, ${caTc.refs.length} refs`)
    allNodes.push(...caTc.nodes)
    allRefs.push(...caTc.refs)
  }

  // ── MFM 11e costing (optional source) ──────────────────────────────────────
  // Loaded ahead of merge so we can override Wahapedia 10e points with MFM 11e
  // points on every datasheet MFM has mapped. See docs/superpowers/plans/
  // 2026-06-27-data-problems-followup.md step 5.
  let mfmResult: MfmCostingParseResult = { byDatasheetId: new Map(), totalRows: 0, mappedRows: 0 }
  try {
    mfmResult = loadMfmCostingFromFile(MFM_COSTING_PATH)
    if (mfmResult.totalRows > 0) {
      console.log(
        `\n5. MFM unit costing: ${mfmResult.mappedRows}/${mfmResult.totalRows} rows mapped to datasheets`,
      )
    } else {
      console.log(`\n5. MFM unit costing: skipped (no file at ${MFM_COSTING_PATH})`)
    }
  } catch (err) {
    console.log(`   WARN: could not load MFM costing, continuing without it: ${err}`)
  }

  // ── MFM 11e detachments + enhancements ─────────────────────────────────────
  // Same local-cache convention as the costing file above. The 10e
  // detachments emitted by `convertGameData` stay (Rule 5: 10e legacy
  // preserved); MFM detachments join the graph as 11th-edition nodes.
  try {
    const mfmDetResult = loadMfmDetachmentsFromFile(
      MFM_DETACHMENTS_PATH,
      RETRIEVED_AT,
      SOURCE_DATES['wahapedia'], // Best-available 11e publication date proxy.
    )
    if (mfmDetResult.totalDetachments > 0) {
      // Filter out MFM chapter rows that duplicate SM shared titles — those
      // are inheritance markers, not chapter-specific detachments. Chapters
      // reach shared SM library at retrieval time via subfaction expansion.
      // Track by detachment id so we can also drop the enhancement children
      // that hang off those detachments.
      const droppedDetIds = new Set<string>()
      const filteredNodes = mfmDetResult.nodes.filter((node) => {
        if (node.category !== 'detachment') return true
        if (!node.factionId || !SM_CHAPTER_SLUGS.has(node.factionId)) return true
        if (!smSharedTitles.has(normalizeTitle(node.title))) return true
        droppedDetIds.add(node.id)
        return false
      })
      // Second pass: drop enhancements attached to dropped detachments.
      const filteredNodes2 = filteredNodes.filter((node) => {
        if (node.category !== 'enhancement') return true
        return !node.detachmentId || !droppedDetIds.has(node.detachmentId)
      })
      const filteredRefs = mfmDetResult.refs.filter(
        (r) => !droppedDetIds.has(r.targetId) && !droppedDetIds.has(r.sourceId),
      )
      const dropped = mfmDetResult.nodes.length - filteredNodes2.length
      console.log(
        `\n5b. MFM detachments: ${filteredNodes2.length} nodes ` +
          `(${mfmDetResult.totalDetachments} detachments, ` +
          `${mfmDetResult.totalEnhancements} enhancements), ` +
          `${filteredRefs.length} refs` +
          (dropped > 0 ? ` — dropped ${dropped} SM inheritance rows` : ''),
      )
      for (const n of filteredNodes2) allNodes.push(n)
      for (const r of filteredRefs) allRefs.push(r)
    } else {
      console.log(`\n5b. MFM detachments: skipped (no file at ${MFM_DETACHMENTS_PATH})`)
    }
  } catch (err) {
    console.log(`   WARN: could not load MFM detachments, continuing without them: ${err}`)
  }

  // Re-key the MFM costing map onto the 11e surface ids so it applies to the
  // 11e duplicate datasheets, NOT the 10e originals. The 10e nodes keep their
  // Wahapedia points (frozen historical snapshot, per Rule 5). MFM rows are
  // keyed by BSData hash GUID; `bsdataIdToSurfaceId` translates that to the
  // Wahapedia numeric (surface id); `rekeyByEleventhSurfaceId` prepends the
  // `11e:` prefix.
  const mfmCostingFor11e = rekeyByEleventhSurfaceIds(
    mfmResult.byDatasheetId,
    gameResult.bsdataIdToSurfaceIds,
  )

  // ── Merge and deduplicate nodes from all sources ──────────────────────────
  const mergeResult = mergeSources(allNodes, allRefs, {
    mfmCostingByDatasheetId: mfmCostingFor11e,
  })
  console.log(`   Merged: ${mergeResult.stats.inputNodes} → ${mergeResult.stats.outputNodes} nodes`)
  console.log(`   MFM points applied to ${mergeResult.stats.mfmPointsApplied} datasheets`)
  console.log(
    `   ${mergeResult.stats.mergedByIdCount} deduped, ${mergeResult.stats.factionNormalizedCount} factions normalized`,
  )
  console.log(
    `   ${mergeResult.stats.summaryTagged} summaries tagged, ${mergeResult.stats.refsDeduped} refs deduped`,
  )

  // Replace contents in-place. `push(...arr)` blows the stack on large arrays
  // (V8 spread-as-call-args limit ~64k) once 10e+11e parallel data ~doubles
  // the node + ref counts. Use loops instead.
  allNodes.length = 0
  for (const n of mergeResult.nodes) allNodes.push(n)
  allRefs.length = 0
  for (const r of mergeResult.refs) allRefs.push(r)

  // ── 6a-early. Normalize detachmentId to slug form BEFORE any filtering ────
  // Wahapedia game-data writes detachmentId as full node id; the pack v2
  // parser writes slug. Later filters (phantom-stratagem, enhancement
  // allow-list) key on slug, so unify here first.
  {
    let n = 0
    for (const node of allNodes) {
      if (!node.detachmentId) continue
      if (!node.detachmentId.includes(':')) continue
      const parts = node.detachmentId.split(':')
      node.detachmentId = parts[parts.length - 1]!
      n++
    }
    if (n > 0) console.log(`   Pre-normalized ${n} detachmentId values to slug form`)
  }

  // ── 6a0. Filter parser-artifact stratagems ───────────────────────────────
  // The v2 pack parser occasionally emits a stratagem whose name is the
  // detachment name itself (Corsair Coterie has "CORSAIR COTERIE" × 5,
  // Court of the Phoenician has one "COURT OF THE PHOENICIAN"). These are
  // stratagem-type attribution tags (`*CORSAIR COTERIE STRATAGEM*`)
  // misinterpreted as stratagem names. Drop stratagems whose normalized
  // title equals their detachment's normalized title.
  const detTitleByslug = new Map<string, string>()
  for (const node of allNodes) {
    if (node.category !== 'detachment' && node.category !== 'detachment-rule') continue
    if (!node.detachmentId) continue
    detTitleByslug.set(node.detachmentId, normalizeTitle(node.title))
  }
  const stratsBefore = allNodes.length
  const stratFiltered: Node[] = []
  let phantomStratsFiltered = 0
  for (const node of allNodes) {
    if (node.category === 'stratagem' && node.edition === '11th' && node.detachmentId) {
      const detTitle = detTitleByslug.get(node.detachmentId)
      if (detTitle && normalizeTitle(node.title) === detTitle) {
        phantomStratsFiltered++
        continue
      }
    }
    stratFiltered.push(node)
  }
  if (phantomStratsFiltered > 0) {
    allNodes.length = 0
    for (const n of stratFiltered) allNodes.push(n)
    console.log(
      `   Filtered ${phantomStratsFiltered} phantom parser-artifact stratagems (${stratsBefore} → ${allNodes.length})`,
    )
  }

  // ── 6a1. Filter stale 10e-only enhancements from 11e ──────────────────────
  // Wahapedia files some 10e-era detachment "enhancements" that are actually
  // codex abilities (Devastator Doctrine, Tactical Doctrine, Biomancy
  // Discipline, etc.). Those don't survive into 11e — MFM's per-detachment
  // enhancement list is the authoritative 11e set. Filter every 11e
  // enhancement whose detachment has an MFM enhancement roster but whose
  // title isn't in that roster. Keep enhancements for detachments MFM has
  // no roster for (chapter-inherited or MFM-silent cases).
  const mfmEnhAllowByDet = new Map<string, Set<string>>()
  try {
    if (existsSync(MFM_DETACHMENTS_PATH)) {
      const mfmRaw = JSON.parse(readFileSync(MFM_DETACHMENTS_PATH, 'utf-8')) as Array<{
        factionSlug?: string
        name?: string
        enhancements?: Array<{ name?: string }>
      }>
      for (const row of mfmRaw) {
        if (!row.factionSlug || !row.name || !Array.isArray(row.enhancements)) continue
        const detSlug = slugify(row.name)
        if (!mfmEnhAllowByDet.has(detSlug)) mfmEnhAllowByDet.set(detSlug, new Set())
        const set = mfmEnhAllowByDet.get(detSlug)!
        for (const e of row.enhancements) {
          if (!e?.name) continue
          // MFM appends `(Upgrade)` / `(Aura)` to enhancement names; the
          // faction-pack parser emits the base name. Strip the suffix before
          // normalizing so pack `INTERRED EXPERTISE` matches MFM
          // `Interred Expertise (Upgrade)`.
          const stripped = e.name.replace(/(?:\s*\((?:upgrade|aura)\)\s*)+$/i, '')
          set.add(normalizeTitle(stripped))
        }
      }
    }
  } catch (err) {
    console.log(`   WARN: could not build MFM enhancement allow-list: ${err}`)
  }
  const enhBefore = allNodes.length
  const filtered: Node[] = []
  let enhFilteredOut = 0
  for (const node of allNodes) {
    if (node.category === 'enhancement' && node.edition === '11th' && node.detachmentId) {
      const allow = mfmEnhAllowByDet.get(node.detachmentId)
      if (allow && allow.size > 0 && !allow.has(normalizeTitle(node.title))) {
        enhFilteredOut++
        continue
      }
    }
    filtered.push(node)
  }
  if (enhFilteredOut > 0) {
    allNodes.length = 0
    for (const n of filtered) allNodes.push(n)
    console.log(
      `   Filtered ${enhFilteredOut} stale 10e-only enhancements from 11e (${enhBefore} → ${allNodes.length})`,
    )
  }

  // ── 6a1b. Retire pack-declared Legends datasheets from the 11e set ────────
  // The faction packs are the authoritative 11e Legends designation. A 10e
  // Wahapedia twin whose title appears in its pack's Legends section is not
  // 11e-playable (Venerable Dreadnought et al.) — drop the 11e twin and its
  // weapon/ability children. The 10e original stays (frozen history).
  // SM-family pooling: chapter shards share the SM pool, so a name retired
  // by any family pack retires it across the family.
  if (packLegendsRetire.size > 0) {
    const SM_FAMILY = [
      'space-marines',
      'black-templars',
      'blood-angels',
      'dark-angels',
      'deathwatch',
      'imperial-fists',
      'iron-hands',
      'raven-guard',
      'salamanders',
      'space-wolves',
      'ultramarines',
      'white-scars',
    ]
    const SM_FAMILY_SET = new Set(SM_FAMILY)
    const retiredIds = new Set<string>()
    const afterRetire: Node[] = []
    for (const node of allNodes) {
      if (node.category === 'datasheet' && node.edition === '11th' && node.factionId) {
        const title = normalizeTitle(node.title)
        const factions = SM_FAMILY_SET.has(node.factionId) ? SM_FAMILY : [node.factionId]
        if (factions.some((f) => packLegendsRetire.has(`${f}::${title}`))) {
          retiredIds.add(node.id)
          continue
        }
      }
      afterRetire.push(node)
    }
    if (retiredIds.size > 0) {
      const beforeChildren = afterRetire.length
      const afterChildren = afterRetire.filter(
        (n) =>
          !(
            (n.category === 'weapon' || n.category === 'unit-ability') &&
            n.datasheetId &&
            retiredIds.has(n.datasheetId)
          ),
      )
      allNodes.length = 0
      for (const n of afterChildren) allNodes.push(n)
      console.log(
        `   Retired ${retiredIds.size} pack-declared Legends datasheets from 11e (+${beforeChildren - afterChildren.length} children)`,
      )
    }
  }

  // ── 6a2. Normalize detachmentId on children to the detachment's slug ──────
  // Wahapedia's game-data parser writes `detachmentId` as the full node id
  // (e.g. `det:chaos-space-marines:devotees-of-destruction`), while the
  // faction-pack v2 parser writes just the slug (`devotees-of-destruction`).
  // The `/browse/detachment/:id` endpoint joins by matching the incoming id's
  // last segment against `n.detachmentId` — that match fails for Wahapedia
  // children when the requesting id came from an MFM-only detachment. Strip
  // to the trailing slug so both conventions resolve.
  let detIdNormalized = 0
  for (const node of allNodes) {
    if (!node.detachmentId) continue
    if (!node.detachmentId.includes(':')) continue
    const parts = node.detachmentId.split(':')
    node.detachmentId = parts[parts.length - 1]!
    detIdNormalized++
  }
  if (detIdNormalized > 0) {
    console.log(`   Normalized ${detIdNormalized} detachmentId values to slug form`)
  }

  // ── Massage: clean phantom nodes, validate content, flag issues ──────────
  console.log('\n6b. Data massage')
  const massageResult = massage(allNodes)
  allNodes.length = 0
  for (const n of massageResult.nodes) allNodes.push(n)

  // Fix refs that referenced re-attributed army rule nodes
  if (massageResult.renamedIds.size > 0) {
    for (const ref of allRefs) {
      const newSource = massageResult.renamedIds.get(ref.sourceId)
      if (newSource) ref.sourceId = newSource
      const newTarget = massageResult.renamedIds.get(ref.targetId)
      if (newTarget) ref.targetId = newTarget
    }
    console.log(`   Fixed ${massageResult.renamedIds.size} renamed node IDs in refs`)
  }

  // ── 6b2. Titanicus Traitoris (Chaos Titan Legions) variants ───────────────
  // GW publishes no separate datasheet for chaos titans. The Adeptus
  // Titanicus faction pack (and the Imperial Armour: Titans supplement)
  // include a rule saying "you may reuse these datasheets as Titanicus
  // Traitoris by swapping Imperium → Chaos and Adeptus Titanicus →
  // Titanicus Traitoris". Emit those swapped copies here so
  // `chaos-titan-legions` in the brain graph is non-empty (previously it
  // had zero datasheets in prod).
  //
  // Runs AFTER the merge + massage passes so:
  //  - the swap sees the normalized, dedup'd loyalist set (10e + 11e twins);
  //  - loyalist ability/weapon child nodes are already attached and their
  //    `datasheetId` fields resolve into the swap's id-map;
  //  - the merge factionId-gate has already validated `titan-legions`
  //    (so we can trust the swap's input set is real, not a shadow slug).
  //
  // The `chaos-titan-legions` id namespace is disjoint from every other
  // faction's id namespace by construction (fresh `chaos-titan-legions:`
  // prefix), so re-merging is unnecessary.
  console.log('\n6b2. Titanicus Traitoris swap → chaos-titan-legions')
  const chaosSwap = emitChaosTitanLegionsVariants(allNodes, allRefs)
  for (const n of chaosSwap.nodes) allNodes.push(n)
  for (const r of chaosSwap.refs) allRefs.push(r)
  const chaosDsCount = chaosSwap.nodes.filter((n) => n.category === 'datasheet').length
  console.log(
    `   ${chaosSwap.nodes.length} chaos-titan-legions nodes (${chaosDsCount} datasheets), ${chaosSwap.refs.length} refs`,
  )

  // ── 11th Edition detachments (must be before faction nodes so they get connected) ──
  console.log('\n6c. 11th Edition detachments')
  const eleventhResult = build11thEditionNodes()
  allNodes.push(...eleventhResult.nodes)
  allRefs.push(...eleventhResult.refs)
  console.log(`   ${eleventhResult.nodes.length} nodes, ${eleventhResult.refs.length} refs`)

  // ── Extract structured fields from content text ──
  console.log('\n6d. Extract structured fields')
  const fieldStats = extractStructuredFields(allNodes)
  console.log(`   Stratagems: ${fieldStats.stratagemsParsed} CP costs parsed`)
  console.log(`   Enhancements: ${fieldStats.enhancementsParsed} model restrictions parsed`)
  console.log(`   Detachment rules: ${fieldStats.detachmentRulesParsed} target keywords parsed`)
  console.log(`   Epic Heroes: ${fieldStats.epicHeroes} flagged`)

  // Reclassify removed — parser now assigns army-rule/army-ability/faction-ability correctly

  // ── Detachment container nodes ──
  console.log('\n6e. Detachment container nodes')
  const detResult = buildDetachmentNodes(allNodes)
  allNodes.push(...detResult.nodes)
  allRefs.push(...detResult.refs)
  console.log(`   ${detResult.nodes.length} detachment nodes, ${detResult.refs.length} refs`)

  // ── Faction & subfaction root nodes ──
  console.log('\n6f. Faction nodes')
  const factionResult = buildFactionNodes(allNodes)
  allNodes.push(...factionResult.nodes)
  allRefs.push(...factionResult.refs)
  console.log(
    `   ${factionResult.nodes.length} faction/subfaction nodes, ${factionResult.refs.length} refs`,
  )

  // ── Unit → Detachment eligibility (eligible_for refs) ──
  console.log('\n6d. Unit → Detachment eligibility')
  const eligibleRefs = buildEligibleForRefs(allNodes)
  allRefs.push(...eligibleRefs)
  console.log(`   ${eligibleRefs.length} eligible_for refs`)

  // ── Combo detection (stacks_with refs) — runs on final merged+massaged nodes ──
  console.log('\n6d. Combo detection (stacks_with)')
  const comboRefs = buildComboRefs(allNodes)
  allRefs.push(...comboRefs)
  console.log(`   ${comboRefs.length} stacks_with refs`)

  // ── Map nodes to PDF page positions (from gw-sync .positions.json sidecars) ──
  console.log('\n7. PDF position mapping')
  if (existsSync(MD_DIR)) {
    const posResult = await mapNodesToPages(allNodes, MD_DIR)
    console.log(`   Mapped: ${posResult.mapped}, Unmapped: ${posResult.unmapped}`)
    if (posResult.errors.length > 0) {
      for (const err of posResult.errors) console.log(`   ERROR: ${err}`)
    }
  } else {
    console.log(`   Markdown directory not found: ${MD_DIR} — skipping`)
  }

  // ── Final publishedAt stamp ─────────────────────────────────────────────────
  // Stamp publishedAt on ALL sources that don't have one, based on layer/source type
  const LAYER_DATES: Record<string, string> = {
    core: SOURCE_DATES['core-rules']!,
    errata: SOURCE_DATES['rules-commentary']!,
    balance: SOURCE_DATES['balance-dataslate']!,
    faction: SOURCE_DATES['core-rules']!,
    unit: SOURCE_DATES['wahapedia']!,
  }
  let stamped = 0
  for (const node of allNodes) {
    const layerDate = LAYER_DATES[node.layer]
    if (!layerDate) continue // community nodes keep their own dates (or none)
    for (const src of node.sources) {
      if (!src.publishedAt) {
        src.publishedAt = layerDate
        stamped++
      }
    }
  }
  console.log(`\n8. Source dates: stamped publishedAt on ${stamped} sources`)

  // ── 9. Edition stamping ────────────────────────────────────────────────────
  // 10th edition launched 2024-06-01. Community nodes (YouTube, etc.) with
  // source dates before that are 9th edition. Everything else is 10th.
  //
  // Edition-agnostic categories (currently just `faction`) are intentionally
  // skipped: an Orks faction identity spans every edition, so stamping it as
  // 10e would erase the Factions browse layer whenever the user filters to
  // 11e (30 faction nodes → 0 visible). See `EDITION_AGNOSTIC_CATEGORIES` in
  // `lib/edition.ts` — the retrieval helper also bypasses these categories.
  const TENTH_LAUNCH = '2024-06-01'
  let stamped10th = 0,
    stamped9th = 0,
    skippedAgnostic = 0
  for (const node of allNodes) {
    if (node.edition) continue // already set (e.g., 11th edition nodes)
    if (EDITION_AGNOSTIC_CATEGORIES.has(node.category)) {
      skippedAgnostic++
      continue
    }

    if (node.layer === 'community') {
      // Use the earliest source date to determine edition
      const sourceDates = node.sources
        .map((s) => s.publishedAt || s.retrievedAt)
        .filter(Boolean)
        .sort()
      const earliest = sourceDates[0]
      if (earliest && earliest < TENTH_LAUNCH) {
        node.edition = '9th'
        stamped9th++
      } else {
        node.edition = '10th'
        stamped10th++
      }
    } else {
      node.edition = '10th'
      stamped10th++
    }
  }
  console.log(
    `\n9. Edition: ${stamped10th} nodes → 10th, ${stamped9th} nodes → 9th, ${skippedAgnostic} edition-agnostic nodes left unset`,
  )

  // (11th Edition detachments already added at step 6c)
  console.log(`   ${eleventhResult.nodes.length} nodes, ${eleventhResult.refs.length} refs`)

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n=== TOTAL: ${allNodes.length} nodes, ${allRefs.length} refs ===`)

  // Check for dupes
  const idSet = new Set<string>()
  let dupes = 0
  for (const n of allNodes) {
    if (idSet.has(n.id)) dupes++
    idSet.add(n.id)
  }
  console.log(`Duplicate IDs: ${dupes}`)

  // Layer breakdown
  const layers: Record<string, number> = {}
  for (const n of allNodes) layers[n.layer] = (layers[n.layer] || 0) + 1
  console.log('By layer:', layers)

  // Category breakdown
  const cats: Record<string, number> = {}
  for (const n of allNodes) cats[n.category] = (cats[n.category] || 0) + 1
  console.log('By category:', cats)

  // Ref breakdown
  const refTypes: Record<string, number> = {}
  for (const r of allRefs) refTypes[r.rel] = (refTypes[r.rel] || 0) + 1
  console.log('Refs by type:', refTypes)

  // ── Dim exports: dump lookup tables the Worker needs at runtime ─────────
  // The Worker has no DB binding, so we snapshot dim_subfaction to R2 and
  // reload it lazily in lib/factions.ts (per Rule 6 — no hardcoded lookups
  // in .ts). Blood Angels retrieval walks this file to union its parent
  // faction's shared pool. See docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md.
  console.log('\nExporting dim/ lookup tables')
  const subfactionRows = await getSubfactions(db)
  mkdirSync(join(OUTPUT_DIR, 'dim'), { recursive: true })
  const subfactionsJson = JSON.stringify(subfactionRows)
  writeFileSync(join(OUTPUT_DIR, 'dim', 'subfactions.json'), subfactionsJson)
  console.log(`   dim/subfactions.json: ${subfactionRows.length} rows`)

  // ── Partition and write ────────────────────────────────────────────────────
  console.log('\nPartitioning and writing files...')

  const nodeFiles = partitionNodes(allNodes)
  const nodeFileMap = new Map<string, string>()
  for (const [filename, nodes] of Object.entries(nodeFiles)) {
    for (const node of nodes) nodeFileMap.set(node.id, filename)
  }
  const refFiles = partitionRefs(allRefs, nodeFileMap)

  // Write to disk
  mkdirSync(join(OUTPUT_DIR, 'nodes'), { recursive: true })
  mkdirSync(join(OUTPUT_DIR, 'refs'), { recursive: true })

  let totalBytes = 0
  for (const [filename, data] of Object.entries(nodeFiles)) {
    const json = JSON.stringify(data)
    writeFileSync(join(OUTPUT_DIR, filename), json)
    totalBytes += json.length
  }
  for (const [filename, data] of Object.entries(refFiles)) {
    const json = JSON.stringify(data)
    writeFileSync(join(OUTPUT_DIR, filename), json)
    totalBytes += json.length
  }

  // Build graph indexes for traversal
  const nodeMap = new Map<string, Node>()
  for (const n of allNodes) nodeMap.set(n.id, n)

  const reverseIndex: Record<
    string,
    Array<{ sourceId: string; rel: string; context: string; factionId?: string }>
  > = {}
  const forwardIndex: Record<string, Array<{ targetId: string; rel: string; context: string }>> = {}

  for (const ref of allRefs) {
    if (!reverseIndex[ref.targetId]) reverseIndex[ref.targetId] = []
    const sourceNode = nodeMap.get(ref.sourceId)
    reverseIndex[ref.targetId]!.push({
      sourceId: ref.sourceId,
      rel: ref.rel,
      context: ref.context.substring(0, 120),
      factionId: sourceNode?.factionId,
    })

    if (!forwardIndex[ref.sourceId]) forwardIndex[ref.sourceId] = []
    forwardIndex[ref.sourceId]!.push({
      targetId: ref.targetId,
      rel: ref.rel,
      context: ref.context.substring(0, 120),
    })
  }
  const revJson = JSON.stringify(reverseIndex)
  writeFileSync(join(OUTPUT_DIR, 'refs', 'reverse-index.json'), revJson)
  totalBytes += revJson.length

  const fwdJson = JSON.stringify(forwardIndex)
  writeFileSync(join(OUTPUT_DIR, 'refs', 'forward-index.json'), fwdJson)
  totalBytes += fwdJson.length

  console.log(
    `Reverse index: ${Object.keys(reverseIndex).length} targets, ${(revJson.length / 1024 / 1024).toFixed(1)} MB`,
  )
  console.log(
    `Forward index: ${Object.keys(forwardIndex).length} sources, ${(fwdJson.length / 1024 / 1024).toFixed(1)} MB`,
  )

  // Write manifest
  const allFiles: Record<string, unknown> = {
    ...nodeFiles,
    ...refFiles,
    'refs/reverse-index.json': reverseIndex,
    'refs/forward-index.json': forwardIndex,
    'dim/subfactions.json': subfactionRows,
  }
  const manifest = buildManifest(allFiles, null)
  writeFileSync(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(
    `\nWrote ${Object.keys(allFiles).length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`,
  )
  console.log(`Manifest: ${Object.keys(manifest.files).length} entries`)

  // ── Query tests ────────────────────────────────────────────────────────────
  console.log('\n\n=== QUERY TESTS ===\n')

  function findByRef(
    targetId: string,
    rel?: string,
  ): Array<{ source: Node | undefined; ref: NodeRef }> {
    return allRefs
      .filter((r) => r.targetId === targetId && (!rel || r.rel === rel))
      .map((r) => ({ source: allNodes.find((n) => n.id === r.sourceId), ref: r }))
  }

  function search(query: string, limit = 10): Node[] {
    const q = query.toLowerCase()
    return allNodes
      .filter((n) => n.title.toLowerCase().includes(q) || n.keywords.some((k) => k.includes(q)))
      .slice(0, limit)
  }

  // Query 1: Who has sustained hits?
  console.log('Q: "Who has sustained hits?"')
  const susRefs = findByRef('core:sustained-hits')
  const susWeapons = susRefs.filter((r) => r.source?.category === 'weapon')
  const susStrats = susRefs.filter((r) => r.source?.category === 'stratagem')
  const susAbilities = susRefs.filter(
    (r) => r.source?.category === 'faction-ability' || r.source?.category === 'unit-ability',
  )
  console.log(`  ${susWeapons.length} weapons natively have it`)
  console.log(`  ${susStrats.length} stratagems can grant it`)
  console.log(`  ${susAbilities.length} abilities reference it`)
  console.log(
    `  Sample weapons: ${susWeapons
      .slice(0, 3)
      .map((r) => r.source?.title)
      .join(', ')}`,
  )
  console.log(
    `  Sample stratagems: ${susStrats
      .slice(0, 3)
      .map((r) => r.source?.title)
      .join(', ')}`,
  )

  // Query 2: What's the wound roll rule?
  console.log('\nQ: "How does wound roll work?"')
  const woundNodes = search('wound roll')
  for (const n of woundNodes.slice(0, 3)) {
    console.log(`  ${n.title} (${n.layer}/${n.category}) — ${n.summary.substring(0, 100)}`)
  }

  // Query 3: What can a Space Marine Captain attach to?
  console.log('\nQ: "What can a Captain attach to?"')
  const captains = allNodes.filter(
    (n) => n.title.toLowerCase().includes('captain') && n.category === 'datasheet',
  )
  for (const cap of captains.slice(0, 3)) {
    const attachRefs = allRefs.filter((r) => r.sourceId === cap.id && r.rel === 'interacts_with')
    const targets = attachRefs
      .map((r) => allNodes.find((n) => n.id === r.targetId)?.title)
      .filter(Boolean)
    if (targets.length > 0) {
      console.log(
        `  ${cap.title}: can attach to ${targets.slice(0, 5).join(', ')}${targets.length > 5 ? ` (+${targets.length - 5} more)` : ''}`,
      )
    }
  }

  // Query 4: What stratagems affect the shooting phase?
  console.log('\nQ: "Shooting phase stratagems"')
  const shootingStrats = allNodes.filter(
    (n) => n.category === 'stratagem' && n.phase === 'shooting',
  )
  console.log(`  ${shootingStrats.length} stratagems in the shooting phase`)
  for (const s of shootingStrats.slice(0, 5)) {
    console.log(`  ${s.title} (${s.factionId})`)
  }

  if (errors.length > 0) {
    console.log('\n=== ERRORS ===')
    for (const e of errors) console.log(`  ${e}`)
  }

  console.log('\n✅ Done')
}

main().catch(console.error)
