/**
 * Build the full brain graph locally from all sources.
 * Writes partitioned JSON files to .local/brain/ for inspection.
 *
 * Run: cd apps/brain/server && npx tsx src/build-graph.ts
 *
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-indexeddb-brain.md — Brain knowledge graph schema
 */
import { createDb } from '@tabletop-tools/db'
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
import { duplicateEleventh, rekeyByEleventhSurfaceId } from './lib/duplicate-eleventh'
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
import { detectFactionPackEdition, parseFactionPack } from './lib/parsers/faction-pack'
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
import { parseTournamentCompanion } from './lib/parsers/tournament-companion'
import { loadTwistsFromFile } from './lib/parsers/twists'
import { mapNodesToPages } from './lib/pdf-positions'
import { slugify } from './lib/slugify'
import { buildManifest, partitionNodes, partitionRefs } from './lib/sync'

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
  const mdFileToUrl = new Map<string, string>()
  for (const entry of Object.values(fpMetadata)) {
    if (entry.markdownFile) mdFileToUrl.set(entry.markdownFile, entry.url)
  }

  // Build the MFM detachment → {dp, forceDisposition} lookup map for the
  // faction-pack parser. MFM is the 11e source of truth for DP cost and
  // Force Disposition; faction-pack markdown doesn't carry these. The
  // parser stamps them on its emitted detachment-rule node by matching
  // `${factionId}::${slugify(name)}`. Step 5b emits the standalone MFM
  // detachment nodes separately — this map is just for the field copy.
  const mfmDetachmentLookup = new Map<string, { dp?: number; forceDisposition?: string }>()
  try {
    if (existsSync(MFM_DETACHMENTS_PATH)) {
      const mfmRaw = JSON.parse(readFileSync(MFM_DETACHMENTS_PATH, 'utf-8')) as Array<{
        factionSlug?: string
        name?: string
        dp?: number | null
        objective?: string | null
      }>
      for (const row of mfmRaw) {
        if (!row?.factionSlug || !row?.name) continue
        const key = `${normalizeFactionId(row.factionSlug)}::${slugify(row.name)}`
        mfmDetachmentLookup.set(key, {
          ...(typeof row.dp === 'number' ? { dp: row.dp } : {}),
          ...(row.objective ? { forceDisposition: row.objective } : {}),
        })
      }
      console.log(`   MFM detachment lookup: ${mfmDetachmentLookup.size} entries`)
    } else {
      console.log(`   MFM detachment lookup: skipped (no file at ${MFM_DETACHMENTS_PATH})`)
    }
  } catch (err) {
    console.log(`   WARN: could not build MFM detachment lookup, continuing without: ${err}`)
  }

  let fpNodes = 0,
    fpRefs = 0,
    fpErrors = 0,
    fpEleventh = 0
  for (const file of mdFiles) {
    const factionSlug = file.replace('faction-pack-', '').replace('.md', '')
    try {
      const raw = readFileSync(join(MD_DIR, file), 'utf-8')
      const url = mdFileToUrl.get(file) ?? ''
      const edition = detectFactionPackEdition(url)
      if (edition === '11th') fpEleventh++
      const result = parseFactionPack(raw, factionSlug, RETRIEVED_AT, edition, mfmDetachmentLookup)
      // Faction packs published with the 10e launch use the 10e core-rules
      // date; 11e packs were published Feb 2026 (eng_11-02_*) or Jul 2026
      // (eng_07-01_*). Stamp the appropriate publishedAt.
      const publishedAt = edition === '11th' ? '2026-02-11' : SOURCE_DATES['core-rules']!
      stampPublishedAt(result.nodes, publishedAt)
      allNodes.push(...result.nodes)
      allRefs.push(...result.refs)
      fpNodes += result.nodes.length
      fpRefs += result.refs.length
    } catch (err) {
      fpErrors++
      errors.push(`Faction ${factionSlug}: ${err}`)
    }
  }
  console.log(
    `   ${mdFiles.length} faction packs → ${fpNodes} nodes, ${fpRefs} refs, ${fpErrors} errors (${fpEleventh} packs as 11th edition)`,
  )

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
  allNodes.push(...gameResult.nodes)
  allRefs.push(...gameResult.refs)
  console.log(`   ${gameResult.nodes.length} nodes, ${gameResult.refs.length} refs`)

  // ── 5a. Parallel 11e duplicate of the Wahapedia 10e graph ─────────────────
  // Per docs/superpowers/plans/parallel-10e-11e-datasets.md (and the
  // post-mortem in the same task): a previous deploy promoted Wahapedia
  // nodes from 10e → 11e wholesale, which broke every bookmark / brain:link
  // pointing at a Wahapedia numeric id. The fix is to keep 10e frozen and
  // build an 11e parallel dataset by duplicating the 10e graph with an
  // `11e:` id prefix. The 11e duplicates are what the MFM 11e points pass
  // and (eventually) the faction-pack unit-level patches mutate.
  const eleventhDup = duplicateEleventh(gameResult.nodes, gameResult.refs)
  stampPublishedAt(eleventhDup.nodes, SOURCE_DATES['wahapedia']!)
  allNodes.push(...eleventhDup.nodes)
  allRefs.push(...eleventhDup.refs)
  console.log(`   ${eleventhDup.nodes.length} 11e duplicates, ${eleventhDup.refs.length} 11e refs`)

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
      console.log(
        `\n5b. MFM detachments: ${mfmDetResult.nodes.length} nodes ` +
          `(${mfmDetResult.totalDetachments} detachments, ` +
          `${mfmDetResult.totalEnhancements} enhancements), ` +
          `${mfmDetResult.refs.length} refs`,
      )
      allNodes.push(...mfmDetResult.nodes)
      allRefs.push(...mfmDetResult.refs)
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
  const mfmCostingFor11e = rekeyByEleventhSurfaceId(
    mfmResult.byDatasheetId,
    gameResult.bsdataIdToSurfaceId,
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

  allNodes.length = 0
  allNodes.push(...mergeResult.nodes)
  allRefs.length = 0
  allRefs.push(...mergeResult.refs)

  // ── Massage: clean phantom nodes, validate content, flag issues ──────────
  console.log('\n6b. Data massage')
  const massageResult = massage(allNodes)
  allNodes.length = 0
  allNodes.push(...massageResult.nodes)

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
  const TENTH_LAUNCH = '2024-06-01'
  let stamped10th = 0,
    stamped9th = 0
  for (const node of allNodes) {
    if (node.edition) continue // already set (e.g., 11th edition nodes)

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
  console.log(`\n9. Edition: ${stamped10th} nodes → 10th, ${stamped9th} nodes → 9th`)

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
