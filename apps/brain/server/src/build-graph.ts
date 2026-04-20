/**
 * Build the full brain graph locally from all sources.
 * Writes partitioned JSON files to .local/brain/ for inspection.
 *
 * Run: cd apps/brain/server && npx tsx src/build-graph.ts
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { normalizeMarkdown } from './lib/normalize/normalize'
import { parseCoreRules } from './lib/parsers/core-rules'
import { parseFactionPack } from './lib/parsers/faction-pack'
import { parseRulesCommentary } from './lib/parsers/rules-commentary'
import { parseBalanceDataslate } from './lib/parsers/balance-dataslate'
import { convertGameData } from './lib/parsers/game-data'
import { buildCommunityNodes } from './lib/combat-knowledge'
import { parsePrimaryMissions, parseSecondaryMissions, parseTwistCards, parseChallengerCards } from './lib/parsers/chapter-approved'
import { parseTournamentCompanion } from './lib/parsers/tournament-companion'
import { partitionNodes, partitionRefs, buildManifest } from './lib/sync'
import { mergeSources } from './lib/merge-sources'
import { mapNodesToPages } from './lib/pdf-positions'
import type { Node, NodeRef } from './lib/model'
import type { GameDataInput } from './lib/parsers/game-data'

const MD_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/markdown'
const GAME_DATA_DIR = '../../data-import/client/public/wahapedia'
const OUTPUT_DIR = '.local/brain'
const RETRIEVED_AT = new Date().toISOString()

function loadJson<T>(file: string): T[] {
  return JSON.parse(readFileSync(join(GAME_DATA_DIR, file), 'utf-8')) as T[]
}

async function main() {
  console.log('Building full brain graph...\n')

  const allNodes: Node[] = []
  const allRefs: NodeRef[] = []
  const errors: string[] = []

  // ── 1. Core Rules ──────────────────────────────────────────────────────────
  console.log('1. Core Rules')
  const coreRulesRaw = readFileSync(join(MD_DIR, 'core-rules.md'), 'utf-8')
  const coreRulesNorm = normalizeMarkdown(coreRulesRaw)
  const coreResult = parseCoreRules(coreRulesNorm, RETRIEVED_AT)
  allNodes.push(...coreResult.nodes)
  allRefs.push(...coreResult.refs)
  console.log(`   ${coreResult.nodes.length} nodes, ${coreResult.refs.length} refs`)

  // ── 2. Rules Commentary ────────────────────────────────────────────────────
  console.log('2. Rules Commentary')
  try {
    const raw = readFileSync(join(MD_DIR, 'core-rules-updates-and-rules-commentary.md'), 'utf-8')
    const norm = normalizeMarkdown(raw)
    const result = parseRulesCommentary(norm, RETRIEVED_AT)
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
    allNodes.push(...result.nodes)
    allRefs.push(...result.refs)
    console.log(`   ${result.nodes.length} nodes, ${result.refs.length} refs`)
  } catch (err) {
    console.log(`   ERROR: ${err instanceof Error ? err.message : err}`)
    errors.push(`Balance dataslate: ${err}`)
  }

  // ── 4. Faction Packs (errata/FAQ sections) ─────────────────────────────────
  console.log('4. Faction Packs')
  const mdFiles = readdirSync(MD_DIR).filter(f => f.startsWith('faction-pack-') && f.endsWith('.md'))
  let fpNodes = 0, fpRefs = 0, fpErrors = 0
  for (const file of mdFiles) {
    const factionSlug = file.replace('faction-pack-', '').replace('.md', '')
    try {
      const raw = readFileSync(join(MD_DIR, file), 'utf-8')
      const result = parseFactionPack(raw, factionSlug, RETRIEVED_AT)
      allNodes.push(...result.nodes)
      allRefs.push(...result.refs)
      fpNodes += result.nodes.length
      fpRefs += result.refs.length
    } catch (err) {
      fpErrors++
      errors.push(`Faction ${factionSlug}: ${err}`)
    }
  }
  console.log(`   ${mdFiles.length} faction packs → ${fpNodes} nodes, ${fpRefs} refs, ${fpErrors} errors`)

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
  const gameResult = convertGameData(gameData, RETRIEVED_AT)
  allNodes.push(...gameResult.nodes)
  allRefs.push(...gameResult.refs)
  console.log(`   ${gameResult.nodes.length} nodes, ${gameResult.refs.length} refs`)

  // ── 6. Community Knowledge ─────────────────────────────────────────────────
  console.log('6. Community Knowledge')
  const communityResult = buildCommunityNodes()
  allNodes.push(...communityResult.nodes)
  allRefs.push(...communityResult.refs)
  console.log(`   ${communityResult.nodes.length} nodes, ${communityResult.refs.length} refs`)

  // ── 7. Chapter Approved 2025 cards ────────────────────────────────────────
  const CA_DIR = 'C:/R/sync-data/.local/chapter-approved/markdown'
  if (existsSync(CA_DIR)) {
    console.log('\n--- Chapter Approved 2025 ---')

    const primaryMd = readFileSync(join(CA_DIR, 'primary-missions.md'), 'utf8')
    const primaryNodes = parsePrimaryMissions(primaryMd, RETRIEVED_AT)
    console.log(`  Primary missions: ${primaryNodes.length} nodes`)
    allNodes.push(...primaryNodes)

    const secAtkMd = readFileSync(join(CA_DIR, 'secondary-missions-attacker.md'), 'utf8')
    const secAtkNodes = parseSecondaryMissions(secAtkMd, 'attacker', RETRIEVED_AT)
    console.log(`  Secondary missions (attacker): ${secAtkNodes.length} nodes`)
    allNodes.push(...secAtkNodes)

    const secDefMd = readFileSync(join(CA_DIR, 'secondary-missions-defender.md'), 'utf8')
    const secDefNodes = parseSecondaryMissions(secDefMd, 'defender', RETRIEVED_AT)
    console.log(`  Secondary missions (defender): ${secDefNodes.length} nodes`)
    allNodes.push(...secDefNodes)

    const twistMd = readFileSync(join(CA_DIR, 'twist-cards.md'), 'utf8')
    const twistNodes = parseTwistCards(twistMd, RETRIEVED_AT)
    console.log(`  Twist cards: ${twistNodes.length} nodes`)
    allNodes.push(...twistNodes)

    const challengerMd = readFileSync(join(CA_DIR, 'challenger-cards.md'), 'utf8')
    const challengerNodes = parseChallengerCards(challengerMd, RETRIEVED_AT)
    console.log(`  Challenger cards: ${challengerNodes.length} nodes`)
    allNodes.push(...challengerNodes)

    // Deployment zones (visual — image-only nodes)
    const deployMd = join(CA_DIR, 'deployment-zones.md')
    if (existsSync(deployMd)) {
      const deployText = readFileSync(deployMd, 'utf8')
      const deployNames = [
        'CRUCIBLE OF BATTLE', 'DAWN OF WAR', 'HAMMER AND ANVIL',
        'SEARCH AND DESTROY', 'SWEEPING ENGAGMENT', 'TIPPING POINT',
        'TIP OF THE SPEAR', 'DEFENSIVE LINE', 'PINCER ATTACK',
        'BREAKOUT', 'LAST STAND',
      ]
      for (const name of deployNames) {
        if (deployText.includes(name)) {
          allNodes.push({
            id: `ca:deploy:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            layer: 'core',
            category: 'deployment-zone',
            title: name,
            content: `Deployment zone layout. See PDF page image for diagram.`,
            summary: `${name} deployment zone layout`,
            sources: [{ type: 'pdf', title: 'Chapter Approved Deployment Zones', retrievedAt: RETRIEVED_AT }],
            refs: [],
            version: 1,
            keywords: ['deployment', 'deployment zone', name.toLowerCase()],
          })
        }
      }
      console.log(`  Deployment zones: ${deployNames.filter(n => deployText.includes(n)).length} nodes`)
    }

    // Terrain layouts (visual — image-only nodes)
    const terrainMd = join(CA_DIR, 'terrain-layouts.md')
    if (existsSync(terrainMd)) {
      const terrainText = readFileSync(terrainMd, 'utf8')
      const layoutCount = (terrainText.match(/Terrain Layout \d/g) || []).length
      for (let i = 1; i <= Math.min(layoutCount, 8); i++) {
        allNodes.push({
          id: `ca:terrain:layout-${i}`,
          layer: 'core',
          category: 'terrain-layout',
          title: `Terrain Layout ${i}`,
          content: `Terrain layout diagram. See PDF page image for measurements and placement.`,
          summary: `Terrain Layout ${i} — competitive play terrain placement guide`,
          sources: [{ type: 'pdf', title: 'Chapter Approved Terrain Layouts', retrievedAt: RETRIEVED_AT }],
          refs: [],
          version: 1,
          keywords: ['terrain', 'terrain layout', 'competitive'],
        })
      }
      console.log(`  Terrain layouts: ${layoutCount} nodes`)
    }
  } else {
    console.log('\n--- Chapter Approved 2025: skipped (directory not found) ---')
  }

  // ── 8. Tournament Companion rules ──────────────────────────────────────────
  const TC_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/markdown'
  const pnTcPath = join(TC_DIR, 'pariah-nexus-tournament-companion.md')
  const caTcPath = join(TC_DIR, 'chapter-approved-tournament-companion.md')

  if (existsSync(pnTcPath)) {
    console.log('\n--- Pariah Nexus Tournament Companion ---')
    const pnTc = parseTournamentCompanion(readFileSync(pnTcPath, 'utf8'), 'pariah-nexus', RETRIEVED_AT)
    console.log(`  ${pnTc.nodes.length} nodes, ${pnTc.refs.length} refs`)
    allNodes.push(...pnTc.nodes)
    allRefs.push(...pnTc.refs)
  }

  if (existsSync(caTcPath)) {
    console.log('\n--- Chapter Approved Tournament Companion ---')
    const caTc = parseTournamentCompanion(readFileSync(caTcPath, 'utf8'), 'chapter-approved', RETRIEVED_AT)
    console.log(`  ${caTc.nodes.length} nodes, ${caTc.refs.length} refs`)
    allNodes.push(...caTc.nodes)
    allRefs.push(...caTc.refs)
  }

  // ── Merge and deduplicate nodes from all sources ──────────────────────────
  const mergeResult = mergeSources(allNodes, allRefs)
  console.log(`   Merged: ${mergeResult.stats.inputNodes} → ${mergeResult.stats.outputNodes} nodes`)
  console.log(`   ${mergeResult.stats.mergedByIdCount} deduped, ${mergeResult.stats.factionNormalizedCount} factions normalized`)
  console.log(`   ${mergeResult.stats.summaryTagged} summaries tagged, ${mergeResult.stats.refsDeduped} refs deduped`)

  allNodes.length = 0
  allNodes.push(...mergeResult.nodes)
  allRefs.length = 0
  allRefs.push(...mergeResult.refs)

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

  const reverseIndex: Record<string, Array<{ sourceId: string; rel: string; context: string; factionId?: string }>> = {}
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

  console.log(`Reverse index: ${Object.keys(reverseIndex).length} targets, ${(revJson.length / 1024 / 1024).toFixed(1)} MB`)
  console.log(`Forward index: ${Object.keys(forwardIndex).length} sources, ${(fwdJson.length / 1024 / 1024).toFixed(1)} MB`)

  // Write manifest
  const allFiles: Record<string, unknown> = { ...nodeFiles, ...refFiles, 'refs/reverse-index.json': reverseIndex, 'refs/forward-index.json': forwardIndex }
  const manifest = buildManifest(allFiles, null)
  writeFileSync(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(`\nWrote ${Object.keys(allFiles).length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`Manifest: ${Object.keys(manifest.files).length} entries`)

  // ── Query tests ────────────────────────────────────────────────────────────
  console.log('\n\n=== QUERY TESTS ===\n')

  function findByRef(targetId: string, rel?: string): Array<{ source: Node | undefined; ref: NodeRef }> {
    return allRefs
      .filter(r => r.targetId === targetId && (!rel || r.rel === rel))
      .map(r => ({ source: allNodes.find(n => n.id === r.sourceId), ref: r }))
  }

  function search(query: string, limit = 10): Node[] {
    const q = query.toLowerCase()
    return allNodes
      .filter(n => n.title.toLowerCase().includes(q) || n.keywords.some(k => k.includes(q)))
      .slice(0, limit)
  }

  // Query 1: Who has sustained hits?
  console.log('Q: "Who has sustained hits?"')
  const susRefs = findByRef('core:sustained-hits')
  const susWeapons = susRefs.filter(r => r.source?.category === 'weapon')
  const susStrats = susRefs.filter(r => r.source?.category === 'stratagem')
  const susAbilities = susRefs.filter(r => r.source?.category === 'faction-ability' || r.source?.category === 'unit-ability')
  console.log(`  ${susWeapons.length} weapons natively have it`)
  console.log(`  ${susStrats.length} stratagems can grant it`)
  console.log(`  ${susAbilities.length} abilities reference it`)
  console.log(`  Sample weapons: ${susWeapons.slice(0, 3).map(r => r.source?.title).join(', ')}`)
  console.log(`  Sample stratagems: ${susStrats.slice(0, 3).map(r => r.source?.title).join(', ')}`)

  // Query 2: What's the wound roll rule?
  console.log('\nQ: "How does wound roll work?"')
  const woundNodes = search('wound roll')
  for (const n of woundNodes.slice(0, 3)) {
    console.log(`  ${n.title} (${n.layer}/${n.category}) — ${n.summary.substring(0, 100)}`)
  }

  // Query 3: What can a Space Marine Captain attach to?
  console.log('\nQ: "What can a Captain attach to?"')
  const captains = allNodes.filter(n => n.title.toLowerCase().includes('captain') && n.category === 'datasheet')
  for (const cap of captains.slice(0, 3)) {
    const attachRefs = allRefs.filter(r => r.sourceId === cap.id && r.rel === 'interacts_with')
    const targets = attachRefs.map(r => allNodes.find(n => n.id === r.targetId)?.title).filter(Boolean)
    if (targets.length > 0) {
      console.log(`  ${cap.title}: can attach to ${targets.slice(0, 5).join(', ')}${targets.length > 5 ? ` (+${targets.length - 5} more)` : ''}`)
    }
  }

  // Query 4: What stratagems affect the shooting phase?
  console.log('\nQ: "Shooting phase stratagems"')
  const shootingStrats = allNodes.filter(n => n.category === 'stratagem' && n.phase === 'shooting')
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
