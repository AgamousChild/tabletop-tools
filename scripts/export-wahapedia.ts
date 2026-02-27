/**
 * export-wahapedia.ts
 *
 * Reads the Wahapedia SQLite database and exports JSON files for use by
 * the data-import app. Output goes to apps/data-import/client/public/wahapedia/.
 *
 * Usage:
 *   npx tsx scripts/export-wahapedia.ts [path-to-wahapedia-db]
 *
 * Default DB path: C:/R/sync-data/tools/wahapedia-sync/.local/wahapedia/data.db
 *
 * No GW content is committed — this script is run locally and the output
 * directory is gitignored. Users import the data at runtime via the data-import app.
 */

import { createClient } from '@libsql/client'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB = 'C:/R/sync-data/tools/wahapedia-sync/.local/wahapedia/data.db'
const dbPath = process.argv[2] || DEFAULT_DB
const outDir = resolve(__dirname, '..', 'apps', 'data-import', 'client', 'public', 'wahapedia')

mkdirSync(outDir, { recursive: true })

const client = createClient({ url: `file:${dbPath}` })

async function query(sql: string) {
  const result = await client.execute(sql)
  return result.rows
}

function writeJson(filename: string, data: unknown) {
  const path = resolve(outDir, filename)
  writeFileSync(path, JSON.stringify(data))
  const count = Array.isArray(data) ? data.length : 'N/A'
  console.log(`  ${filename}: ${count} records`)
}

const CHAPTER_APPROVED_DIR = 'C:/R/sync-data/.local/chapter-approved/markdown'

interface Mission {
  id: string
  name: string
  type: string
  description: string
}

/**
 * Extracts missions from Chapter Approved markdown files.
 * Missions are identified by known patterns in the PDF-extracted text.
 */
function extractMissions(): Mission[] {
  if (!existsSync(CHAPTER_APPROVED_DIR)) {
    console.log('  Chapter Approved markdown not found — skipping missions export')
    return []
  }

  const missions: Mission[] = []
  let nextId = 1

  function addMission(name: string, type: string, description: string) {
    missions.push({
      id: `mission-${nextId++}`,
      name: name.trim(),
      type,
      description: description.trim(),
    })
  }

  // Helper to clean mission name from continuous PDF text —
  // removes prefix garbage like "SECOND BATTLE ROUND ONWARDS VP", scoring text, etc.
  function cleanMissionName(raw: string): string {
    return raw
      // Strip everything up to the LAST "VP" (greedy) — handles chained VP prefixes
      .replace(/^.*\bVP\s+/g, '')
      // Strip "FOR PLAYERS USING TACTICAL/FIXED MISSIONS" prefixes (twist cards)
      .replace(/(?:FOR PLAYERS USING (?:TACTICAL|FIXED) MISSIONS\s*)+/gi, '')
      // Strip AND/OR connectors and arrows
      .replace(/^(?:AND|OR)\s+/g, '')
      .replace(/^\s*↑↓\s*/g, '')
      .trim()
  }

  // Known stratagem names that appear on challenger cards between mission name and "CHALLENGER MISSION"
  const challengerStrategems = [
    'PIVOTAL MOMENT', 'HARBORED POWER', 'RENEWED FOCUS', 'BURST OF SPEED',
    'GREAT HASTE', 'FORCE A BREACH', 'ALL IN', 'OPPORTUNISTIC STRIKE', 'STRATEGIC RETREAT',
  ]

  function cleanChallengerName(raw: string): string {
    let cleaned = cleanMissionName(raw)
    // Strip trailing stratagem names
    for (const s of challengerStrategems) {
      cleaned = cleaned.replace(new RegExp(`\\s+${s}$`, 'i'), '')
    }
    return cleaned.trim()
  }

  // Primary missions
  const primaryFile = resolve(CHAPTER_APPROVED_DIR, 'primary-missions.md')
  if (existsSync(primaryFile)) {
    const text = readFileSync(primaryFile, 'utf8')
    const re = /([A-Z][A-Z '\u2019]+?)\s+PRIMARY MISSION/g
    let m
    while ((m = re.exec(text)) !== null) {
      const name = cleanMissionName(m[1]!)
      if (name && name.length > 2) {
        addMission(titleCase(name), 'primary', '')
      }
    }
  }

  // Secondary missions (attacker file has all standard secondaries)
  const secondaryFile = resolve(CHAPTER_APPROVED_DIR, 'secondary-missions-attacker.md')
  if (existsSync(secondaryFile)) {
    const text = readFileSync(secondaryFile, 'utf8')
    const re = /([A-Z][A-Z '\u2019]+?)\s+(?:FIXED - )?SECONDARY MISSION/g
    let m
    while ((m = re.exec(text)) !== null) {
      const name = cleanMissionName(m[1]!)
      if (name && name.length > 2) {
        addMission(titleCase(name), 'secondary', '')
      }
    }
  }

  // Deployment zones
  const deploymentFile = resolve(CHAPTER_APPROVED_DIR, 'deployment-zones.md')
  if (existsSync(deploymentFile)) {
    const text = readFileSync(deploymentFile, 'utf8')
    // Each deployment zone name appears before "INCURSION" or "STRIKE FORCE" or "ASYMMETRIC WAR"
    const seen = new Set<string>()
    const re = /([A-Z][A-Z\s]+?)(?:\s+(?:INCURSION|STRIKE FORCE|ASYMMETRIC WAR))/g
    let m
    while ((m = re.exec(text)) !== null) {
      const name = titleCase(m[1]!.trim())
      if (!seen.has(name) && !name.startsWith('#')) {
        seen.add(name)
        addMission(name, 'deployment_zone', '')
      }
    }
  }

  // Twist cards
  const twistFile = resolve(CHAPTER_APPROVED_DIR, 'twist-cards.md')
  if (existsSync(twistFile)) {
    const text = readFileSync(twistFile, 'utf8')
    const re = /([A-Z][A-Z '\u2019]+?)\s+TWIST\b/g
    let m
    while ((m = re.exec(text)) !== null) {
      const name = cleanMissionName(m[1]!)
      if (name && name.length > 2) {
        addMission(titleCase(name), 'twist', '')
      }
    }
  }

  // Challenger cards — mission name precedes optional stratagem name + "CHALLENGER MISSION"
  const challengerFile = resolve(CHAPTER_APPROVED_DIR, 'challenger-cards.md')
  if (existsSync(challengerFile)) {
    const text = readFileSync(challengerFile, 'utf8')
    const re = /([A-Z][A-Z '\u2019]+?)\s+CHALLENGER MISSION/g
    const seen = new Set<string>()
    let m
    while ((m = re.exec(text)) !== null) {
      const name = cleanChallengerName(m[1]!)
      if (name && name.length > 2) {
        const tc = titleCase(name)
        if (!seen.has(tc)) {
          seen.add(tc)
          addMission(tc, 'challenger', '')
        }
      }
    }
  }

  return missions
}

function titleCase(s: string): string {
  return s
    .replace(/[\u2018\u2019\u2032]/g, "'") // normalize curly/prime apostrophes
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, c => c.toUpperCase())
    .trim()
}

async function main() {
  console.log(`Reading Wahapedia DB: ${dbPath}`)
  console.log(`Output directory: ${outDir}`)
  console.log()

  // Factions
  const factions = await query('SELECT id, name FROM factions ORDER BY name')
  writeJson('factions.json', factions)

  // Detachments
  const detachments = await query(`
    SELECT id, faction_id AS factionId, name, legend, type
    FROM detachments ORDER BY faction_id, name
  `)
  writeJson('detachments.json', detachments)

  // Detachment abilities
  const detachmentAbilities = await query(`
    SELECT id, detachment_id AS detachmentId, faction_id AS factionId,
           name, legend, description
    FROM detachment_abilities ORDER BY detachment_id
  `)
  writeJson('detachment_abilities.json', detachmentAbilities)

  // Stratagems
  const stratagems = await query(`
    SELECT id, faction_id AS factionId, detachment_id AS detachmentId,
           name, type, cp_cost AS cpCost, turn, phase, legend, description
    FROM stratagems ORDER BY faction_id, name
  `)
  writeJson('stratagems.json', stratagems)

  // Enhancements
  const enhancements = await query(`
    SELECT id, faction_id AS factionId, detachment_id AS detachmentId,
           name, legend, description, cost
    FROM enhancements ORDER BY faction_id, name
  `)
  writeJson('enhancements.json', enhancements)

  // Leader attachments
  const leaderAttachments = await query(`
    SELECT id, leader_id AS leaderId, attached_id AS attachedId
    FROM datasheet_leaders ORDER BY leader_id
  `)
  writeJson('leader_attachments.json', leaderAttachments)

  // Unit compositions
  const unitCompositions = await query(`
    SELECT id, datasheet_id AS datasheetId, line, description
    FROM datasheet_unit_composition ORDER BY datasheet_id, line
  `)
  writeJson('unit_compositions.json', unitCompositions)

  // Unit costs
  const unitCosts = await query(`
    SELECT id, datasheet_id AS datasheetId, line, description, cost
    FROM datasheet_models_cost ORDER BY datasheet_id, line
  `)
  writeJson('unit_costs.json', unitCosts)

  // Wargear options
  const wargearOptions = await query(`
    SELECT id, datasheet_id AS datasheetId, line, description
    FROM datasheet_options ORDER BY datasheet_id, line
  `)
  writeJson('wargear_options.json', wargearOptions)

  // Unit keywords
  const unitKeywords = await query(`
    SELECT id, datasheet_id AS datasheetId, keyword,
           CASE WHEN is_faction_keyword = 'true' THEN 1 ELSE 0 END AS isFactionKeyword
    FROM datasheet_keywords ORDER BY datasheet_id, keyword
  `)
  // Convert isFactionKeyword from 0/1 to boolean
  const keywordsTyped = (unitKeywords as Array<Record<string, unknown>>).map(k => ({
    ...k,
    isFactionKeyword: k.isFactionKeyword === 1,
  }))
  writeJson('unit_keywords.json', keywordsTyped)

  // Unit abilities
  const unitAbilities = await query(`
    SELECT id, datasheet_id AS datasheetId, name, description, type
    FROM datasheet_abilities ORDER BY datasheet_id, line
  `)
  writeJson('unit_abilities.json', unitAbilities)

  // Datasheets (master unit reference — needed for ID mapping to BSData)
  const datasheets = await query(`
    SELECT id, name, faction_id AS factionId, role, legend, transport, loadout,
           damaged_w AS damagedW, damaged_description AS damagedDescription
    FROM datasheets ORDER BY faction_id, name
  `)
  writeJson('datasheets.json', datasheets)

  // Datasheet wargear (weapon profiles with full stats)
  const datasheetWargear = await query(`
    SELECT id, datasheet_id AS datasheetId, name, description,
           range, type, A AS attacks, BS_WS AS skill,
           S AS strength, AP AS ap, D AS damage
    FROM datasheet_wargear ORDER BY datasheet_id, line
  `)
  writeJson('datasheet_wargear.json', datasheetWargear)

  // Datasheet models (model stat lines — M/T/Sv/W/Ld/OC)
  const datasheetModels = await query(`
    SELECT id, datasheet_id AS datasheetId, name,
           M AS move, T AS toughness, Sv AS save, W AS wounds,
           Ld AS leadership, OC AS oc, inv_sv AS invSv,
           inv_sv_descr AS invSvDescription, base_size AS baseSize
    FROM datasheet_models ORDER BY datasheet_id, line
  `)
  writeJson('datasheet_models.json', datasheetModels)

  // Missions (from Chapter Approved markdown)
  console.log()
  console.log('Extracting missions from Chapter Approved:')
  const missions = extractMissions()
  writeJson('missions.json', missions)

  console.log('\nDone! JSON files written to:', outDir)
  console.log('These files are gitignored and will be served as static assets by data-import.')

  client.close()
}

main().catch(err => {
  console.error('Export failed:', err)
  process.exit(1)
})
