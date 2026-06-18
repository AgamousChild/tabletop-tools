/**
 * Full validation of brain data — checks EVERY unit, faction, detachment, browse result.
 * Not spot checks. Exhaustive.
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.join(__dirname, '../.local/brain')

interface Node {
  id: string
  layer: string
  category: string
  title: string
  content: string
  summary: string
  factionId?: string
  factionName?: string
  subfaction?: string
  datasheetId?: string
  detachmentId?: string
  keywords: string[]
  sources: any[]
}

// Load all nodes
function loadAllNodes(): Node[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8'))
  const allNodes: Node[] = []
  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    const filePath = path.join(DATA_DIR, file)
    const nodes = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Node[]
    allNodes.push(...nodes)
  }
  return allNodes
}

// ── VALIDATION CHECKS ─────────────────────────────────────────────────────────

interface Issue {
  severity: 'error' | 'warning'
  category: string
  nodeId: string
  title: string
  message: string
}

const issues: Issue[] = []

function error(cat: string, nodeId: string, title: string, msg: string) {
  issues.push({ severity: 'error', category: cat, nodeId, title, message: msg })
}
function warn(cat: string, nodeId: string, title: string, msg: string) {
  issues.push({ severity: 'warning', category: cat, nodeId, title, message: msg })
}

function validate() {
  console.log('Loading all nodes...')
  const allNodes = loadAllNodes()
  console.log(`Loaded ${allNodes.length} nodes\n`)

  const datasheets = allNodes.filter((n) => n.category === 'datasheet')
  const weapons = allNodes.filter((n) => n.category === 'weapon')
  const abilities = allNodes.filter((n) => n.category === 'unit-ability')
  const stratagems = allNodes.filter((n) => n.category === 'stratagem')
  const enhancements = allNodes.filter((n) => n.category === 'enhancement')
  const detachments = allNodes.filter((n) => n.category === 'detachment-rule')
  const factionAbilities = allNodes.filter((n) => n.category === 'faction-ability')

  console.log(`Datasheets: ${datasheets.length}`)
  console.log(`Weapons: ${weapons.length}`)
  console.log(`Abilities: ${abilities.length}`)
  console.log(`Stratagems: ${stratagems.length}`)
  console.log(`Enhancements: ${enhancements.length}`)
  console.log(`Detachments: ${detachments.length}`)
  console.log(`Faction Abilities: ${factionAbilities.length}`)
  console.log('')

  // ── 1. Faction Name Check ───────────────────────────────────────────────────
  console.log('=== CHECK 1: Faction Names ===')
  let missingFactionName = 0
  let rawSlugInFactionName = 0
  for (const n of allNodes) {
    if (n.factionId && !n.factionName) {
      missingFactionName++
    }
    if (n.factionName && n.factionName.includes('-')) {
      rawSlugInFactionName++
      error('faction-name', n.id, n.title, `factionName contains hyphens: "${n.factionName}"`)
    }
  }
  console.log(`  Nodes with factionId but no factionName: ${missingFactionName}`)
  console.log(`  Nodes with raw slug in factionName: ${rawSlugInFactionName}`)

  // ── 2. "Other" Keyword Check ────────────────────────────────────────────────
  console.log('\n=== CHECK 2: "Other" Keyword ===')
  let otherCount = 0
  for (const n of datasheets) {
    if (n.keywords.includes('other')) {
      otherCount++
      warn('keyword-other', n.id, n.title, `Has "other" keyword`)
    }
  }
  console.log(`  Datasheets with "other" keyword: ${otherCount}`)

  // ── 3. Deadly Demise Value Check ────────────────────────────────────────────
  console.log('\n=== CHECK 3: Deadly Demise Value ===')
  let ddNoValue = 0
  let ddWithValue = 0
  for (const n of datasheets) {
    const ddKw = n.keywords.find((k) => k.startsWith('deadly demise'))
    if (ddKw) {
      // Check if it has a value (e.g., "deadly demise D3" vs bare "deadly demise")
      if (ddKw.length > 'deadly demise'.length) {
        ddWithValue++
      } else {
        ddNoValue++
        warn('deadly-demise', n.id, n.title, `Has "deadly demise" keyword but no value`)
      }
    }
  }
  console.log(`  Deadly Demise with value: ${ddWithValue}`)
  console.log(`  Deadly Demise WITHOUT value: ${ddNoValue}`)

  // ── 4. Duplicate Keywords Check ─────────────────────────────────────────────
  console.log('\n=== CHECK 4: Duplicate Keywords ===')
  let dupKeywordCount = 0
  for (const n of datasheets) {
    const unique = new Set(n.keywords)
    if (unique.size < n.keywords.length) {
      dupKeywordCount++
      const dups = n.keywords.filter((k, i) => n.keywords.indexOf(k) !== i)
      warn('dup-keywords', n.id, n.title, `Duplicate keywords: ${[...new Set(dups)].join(', ')}`)
    }
  }
  console.log(`  Datasheets with duplicate keywords: ${dupKeywordCount}`)

  // ── 5. Multi-Faction Keywords Check ─────────────────────────────────────────
  console.log('\n=== CHECK 5: Multi-Faction Keywords ===')
  const FACTION_KW_LIST = [
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
  ]
  let multiFactionCount = 0
  for (const n of datasheets) {
    const factionKws = n.keywords.filter((k) => FACTION_KW_LIST.includes(k))
    if (factionKws.length > 2) {
      multiFactionCount++
      // Only warn for >2 (one parent + one subfaction is ok)
    }
  }
  console.log(`  Datasheets with >2 faction keywords: ${multiFactionCount}`)

  // ── 6. Weapon Completeness Check ───────────────────────────────────────────
  console.log('\n=== CHECK 6: Weapon Completeness ===')
  let dsNoWeapons = 0
  const weaponsByDs = new Map<string, Node[]>()
  for (const w of weapons) {
    if (!w.datasheetId) continue
    if (!weaponsByDs.has(w.datasheetId)) weaponsByDs.set(w.datasheetId, [])
    weaponsByDs.get(w.datasheetId)!.push(w)
  }
  for (const n of datasheets) {
    const dsWeapons = weaponsByDs.get(n.id) ?? []
    if (dsWeapons.length === 0) {
      dsNoWeapons++
      warn('no-weapons', n.id, n.title, `Datasheet has no weapons`)
    }
  }
  console.log(`  Datasheets with zero weapons: ${dsNoWeapons}`)

  // ── 7. Wargear Options Check ────────────────────────────────────────────────
  console.log('\n=== CHECK 7: Wargear Options ===')
  let dsWithOptions = 0
  let dsNoOptions = 0
  for (const n of datasheets) {
    if (n.content.includes('**Wargear Options:**')) {
      dsWithOptions++
    } else {
      dsNoOptions++
    }
  }
  console.log(`  Datasheets WITH wargear options: ${dsWithOptions}`)
  console.log(`  Datasheets without wargear options: ${dsNoOptions}`)

  // ── 8. Detachment Completeness Check ────────────────────────────────────────
  console.log('\n=== CHECK 8: Detachment Completeness ===')
  let detNoStratagems = 0
  let detNoEnhancements = 0
  const stratsByDet = new Map<string, Node[]>()
  const enhsByDet = new Map<string, Node[]>()
  for (const s of stratagems) {
    if (!s.detachmentId) continue
    if (!stratsByDet.has(s.detachmentId)) stratsByDet.set(s.detachmentId, [])
    stratsByDet.get(s.detachmentId)!.push(s)
  }
  for (const e of enhancements) {
    if (!e.detachmentId) continue
    if (!enhsByDet.has(e.detachmentId)) enhsByDet.set(e.detachmentId, [])
    enhsByDet.get(e.detachmentId)!.push(e)
  }
  for (const d of detachments) {
    // Stratagems link via short slug (e.g., "champions-of-faith"), not full node ID
    // Extract the slug from the detachment ID format: "det:faction:slug:slug"
    const detSlug = d.id.split(':')[2] || d.id
    const dStrats =
      stratsByDet.get(d.id) ?? stratsByDet.get(detSlug) ?? stratsByDet.get(d.title) ?? []
    const dEnhs = enhsByDet.get(d.id) ?? enhsByDet.get(detSlug) ?? enhsByDet.get(d.title) ?? []
    if (dStrats.length === 0) {
      detNoStratagems++
      warn('det-no-strats', d.id, d.title, `Detachment has no stratagems`)
    }
    if (dEnhs.length === 0) {
      detNoEnhancements++
    }
  }
  console.log(`  Detachments: ${detachments.length}`)
  console.log(`  Detachments with zero stratagems: ${detNoStratagems}`)
  console.log(`  Detachments with zero enhancements: ${detNoEnhancements}`)

  // ── 9. Faction Coverage Check ───────────────────────────────────────────────
  console.log('\n=== CHECK 9: Faction Coverage ===')
  const factionCounts = new Map<string, number>()
  for (const n of datasheets) {
    const f = n.factionId || 'NONE'
    factionCounts.set(f, (factionCounts.get(f) ?? 0) + 1)
  }
  const sortedFactions = [...factionCounts.entries()].sort((a, b) => b[1] - a[1])
  for (const [faction, count] of sortedFactions) {
    const displayName = allNodes.find((n) => n.factionId === faction)?.factionName || faction
    console.log(`  ${displayName}: ${count} datasheets`)
  }

  // ── 10. Browse Layer Check ──────────────────────────────────────────────────
  console.log('\n=== CHECK 10: Browse Layers ===')
  const layers = new Map<string, number>()
  for (const n of allNodes) {
    layers.set(n.layer, (layers.get(n.layer) ?? 0) + 1)
  }
  for (const [layer, count] of layers) {
    console.log(`  ${layer}: ${count} nodes`)
  }

  // ── 11. Armor Keyword Check ─────────────────────────────────────────────────
  console.log('\n=== CHECK 11: Armor Keywords on Datasheets ===')
  const armorKeywords = [
    'power armour',
    'power armor',
    'gravis',
    'terminator armour',
    'terminator armor',
    'phobos',
    'tacticus',
    'artificer armour',
  ]
  let armorKwCount = 0
  for (const n of datasheets) {
    const hasArmor = n.keywords.some((k) => armorKeywords.includes(k))
    if (hasArmor) armorKwCount++
  }
  console.log(`  Datasheets with armor-type keywords: ${armorKwCount}`)
  console.log(`  (These are hidden from display but still in data for mechanical use)`)

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  console.log('\n\n=== SUMMARY ===')
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  console.log(`Errors: ${errors.length}`)
  console.log(`Warnings: ${warnings.length}`)

  if (errors.length > 0) {
    console.log('\n--- ERRORS (must fix) ---')
    for (const e of errors.slice(0, 20)) {
      console.log(`  [${e.category}] ${e.title}: ${e.message}`)
    }
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`)
  }

  if (warnings.length > 0) {
    console.log('\n--- WARNINGS (top 30) ---')
    // Group warnings by category
    const byCat = new Map<string, Issue[]>()
    for (const w of warnings) {
      if (!byCat.has(w.category)) byCat.set(w.category, [])
      byCat.get(w.category)!.push(w)
    }
    for (const [cat, items] of byCat) {
      console.log(`\n  ${cat} (${items.length} issues):`)
      for (const item of items.slice(0, 5)) {
        console.log(`    ${item.title}: ${item.message}`)
      }
      if (items.length > 5) console.log(`    ... and ${items.length - 5} more`)
    }
  }

  // Return exit code
  return errors.length > 0 ? 1 : 0
}

const exitCode = validate()
process.exit(exitCode)
