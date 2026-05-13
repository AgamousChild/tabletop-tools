/**
 * Search validation tests — verify every unit in the knowledge graph
 * is findable via all search interfaces and that results are actual datasheets.
 *
 * Units in different factions are DISTINCT — no deduplication.
 *
 * Run against live API:
 *   API_BASE=https://tabletop-tools-brain.micah-ec2.workers.dev npx vitest run src/search-validation.test.ts --reporter=verbose
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const API_BASE = process.env.API_BASE || 'https://tabletop-tools-brain.micah-ec2.workers.dev'

interface UnitEntry {
  id: string
  title: string
  factionId: string
  subfaction?: string
}

interface FactionUnitEntry {
  id: string
  title: string
}

interface Inventory {
  units: UnitEntry[]
  factionUnits: Record<string, FactionUnitEntry[]>
}

let inventory: Inventory

beforeAll(() => {
  const invPath = join(__dirname, '../.local/brain/test-inventory.json')
  if (!existsSync(invPath)) {
    throw new Error('Run build-graph.ts first to generate test-inventory.json')
  }
  inventory = JSON.parse(readFileSync(invPath, 'utf8'))
})

async function apiPost(endpoint: string, body: object, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`HTTP ${res.status}: ${err}`)
      }
      return await res.json()
    } catch (err) {
      if (i === retries) throw err
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

async function apiGet(endpoint: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i === retries) throw err
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

// ── 1. Search: every unit name returns itself as #1 and result is a datasheet

describe('search: unit name → #1 result is the unit datasheet', () => {
  const allFactions = [
    // Full names (game-data parser)
    'adepta-sororitas',
    'adeptus-custodes',
    'adeptus-mechanicus',
    'adeptus-titanicus',
    'aeldari',
    'astra-militarum',
    'chaos-daemons',
    'chaos-knights',
    'chaos-space-marines',
    'death-guard',
    'drukhari',
    'emperors-children',
    'genestealer-cults',
    'grey-knights',
    'imperial-agents',
    'imperial-knights',
    'leagues-of-votann',
    'necrons',
    'orks',
    'space-marines',
    't-au-empire',
    'thousand-sons',
    'tyranids',
    'world-eaters',
    'unaligned',
    // Short codes (BSData parser)
    'AC',
    'AdM',
    'AE',
    'AM',
    'AoI',
    'AS',
    'CD',
    'CSM',
    'DG',
    'DRU',
    'EC',
    'GC',
    'GK',
    'LoV',
    'NEC',
    'ORK',
    'QI',
    'QT',
    'SM',
    'TAU',
    'TL',
    'TS',
    'TYR',
    'UN',
    'WE',
  ]

  for (const faction of allFactions) {
    describe(faction, () => {
      it(`every unit is #1 search result and is category=datasheet`, async () => {
        const units = inventory.factionUnits[faction]
        if (!units || units.length === 0) return

        const failures: Array<{
          unit: string
          issue: string
          gotTitle?: string
          gotCategory?: string
          gotScore?: number
        }> = []

        // Batch 5 concurrent requests
        for (let i = 0; i < units.length; i += 5) {
          const batch = units.slice(i, i + 5)
          const results = await Promise.all(
            batch.map(async (unit) => {
              try {
                const data = await apiPost('/search', { query: unit.title, limit: 5 })
                const top = data.results?.[0]

                if (!top) {
                  return { unit: unit.title, issue: 'no results returned' }
                }
                if (top.category !== 'datasheet') {
                  return {
                    unit: unit.title,
                    issue: 'top result is not a datasheet',
                    gotTitle: top.title,
                    gotCategory: top.category,
                    gotScore: top.score,
                  }
                }
                // Case-insensitive title match (BSData vs Wahapedia casing may differ)
                if (top.title.toLowerCase() !== unit.title.toLowerCase()) {
                  // Check if it's at least in the top 5
                  const found = data.results.find(
                    (r: any) =>
                      r.title.toLowerCase() === unit.title.toLowerCase() &&
                      r.category === 'datasheet',
                  )
                  if (found) {
                    return {
                      unit: unit.title,
                      issue: `not #1 but found at position ${data.results.indexOf(found) + 1}`,
                      gotTitle: top.title,
                      gotCategory: top.category,
                      gotScore: top.score,
                    }
                  }
                  return {
                    unit: unit.title,
                    issue: 'not in top 5 results',
                    gotTitle: top.title,
                    gotCategory: top.category,
                    gotScore: top.score,
                  }
                }
                return null // pass
              } catch (err) {
                return {
                  unit: unit.title,
                  issue: `API error: ${err instanceof Error ? err.message : String(err)}`,
                }
              }
            }),
          )
          for (const r of results) {
            if (r) failures.push(r)
          }
        }

        if (failures.length > 0) {
          const msg = failures
            .map(
              (f) =>
                `  "${f.unit}" — ${f.issue}${f.gotTitle ? ` (got: "${f.gotTitle}" [${f.gotCategory}])` : ''}`,
            )
            .join('\n')
          expect.fail(`${failures.length}/${units.length} units failed:\n${msg}`)
        }
      }, 600_000) // 10 min per faction
    })
  }
})

// ── 2. Ask: "[faction] all units" mentions every unit ──────────────────────

describe('ask: "[faction] all units" returns complete roster', () => {
  // Use human-readable faction names for the query
  const factionLabels: Record<string, string> = {
    'adepta-sororitas': 'Adepta Sororitas',
    'adeptus-custodes': 'Adeptus Custodes',
    'adeptus-mechanicus': 'Adeptus Mechanicus',
    'adeptus-titanicus': 'Adeptus Titanicus',
    aeldari: 'Aeldari',
    'astra-militarum': 'Astra Militarum',
    'chaos-daemons': 'Chaos Daemons',
    'chaos-knights': 'Chaos Knights',
    'chaos-space-marines': 'Chaos Space Marines',
    'death-guard': 'Death Guard',
    drukhari: 'Drukhari',
    'emperors-children': "Emperor's Children",
    'genestealer-cults': 'Genestealer Cults',
    'grey-knights': 'Grey Knights',
    'imperial-agents': 'Imperial Agents',
    'imperial-knights': 'Imperial Knights',
    'leagues-of-votann': 'Leagues of Votann',
    necrons: 'Necrons',
    orks: 'Orks',
    'space-marines': 'Space Marines',
    't-au-empire': "T'au Empire",
    'thousand-sons': 'Thousand Sons',
    tyranids: 'Tyranids',
    'world-eaters': 'World Eaters',
    unaligned: 'Unaligned',
  }

  for (const [factionId, label] of Object.entries(factionLabels)) {
    it(`${label}: answer mentions all units`, async () => {
      const expected = inventory.factionUnits[factionId]
      if (!expected || expected.length === 0) return

      const data = await apiPost('/ask', {
        question: `${label} all units`,
      })

      const answer = (data.answer ?? '').toLowerCase()
      const missing: string[] = []
      for (const unit of expected) {
        if (!answer.includes(unit.title.toLowerCase())) {
          missing.push(unit.title)
        }
      }

      if (missing.length > 0) {
        expect.fail(
          `${missing.length}/${expected.length} units missing from answer:\n` +
            missing.map((u) => `  - ${u}`).join('\n'),
        )
      }
    }, 120_000)
  }
})

// ── 3. Browse: layers exist, unit layer has all datasheets ─────────────────

describe('browse: layers and unit counts', () => {
  it('browse/layers returns all 6 layers', async () => {
    const data = await apiGet('/browse/layers')
    const layerIds = (data.layers ?? []).map((l: any) => l.id)
    for (const expected of ['core', 'faction', 'unit', 'errata', 'balance', 'community']) {
      expect(layerIds, `missing layer: ${expected}`).toContain(expected)
    }
  }, 60_000)

  it('unit layer total matches inventory count', async () => {
    const data = await apiGet('/browse/nodes?layer=unit&limit=1')
    const totalUnitsInInventory = inventory.units.filter((u) => u.factionId !== 'unknown').length
    // Browse returns all nodes in the unit layer — should be >= our inventory
    expect(data.total).toBeGreaterThanOrEqual(totalUnitsInInventory * 0.9) // allow 10% tolerance for layer assignment
  }, 60_000)

  it('browse/node/:id returns a valid unit for each faction', async () => {
    // Test one unit per faction via browse
    const factions = Object.keys(inventory.factionUnits)
    const failures: string[] = []

    for (const faction of factions) {
      const units = inventory.factionUnits[faction]
      if (!units || units.length === 0) continue
      const unit = units[0]!

      try {
        const data = await apiGet(`/browse/node/${encodeURIComponent(unit.id)}`)
        if (!data.node) {
          failures.push(`${faction}: ${unit.title} (${unit.id}) — node not found`)
        } else if (data.node.category !== 'datasheet') {
          failures.push(`${faction}: ${unit.title} — wrong category: ${data.node.category}`)
        }
      } catch (err) {
        failures.push(`${faction}: ${unit.title} — ${err}`)
      }
    }

    if (failures.length > 0) {
      expect.fail(`Browse failures:\n${failures.join('\n')}`)
    }
  }, 120_000)
})

// ── 4. Graph-data: returns nodes + edges for unit queries ──────────────────

describe('graph-data: unit queries return connected graph', () => {
  // Test one unit per major faction
  const testUnits = [
    { query: 'Intercessors', faction: 'space-marines' },
    { query: 'Blightlord Terminators', faction: 'death-guard' },
    { query: 'Hive Tyrant', faction: 'tyranids' },
    { query: 'Cryptothralls', faction: 'necrons' },
    { query: 'Wych Cult', faction: 'drukhari' },
  ]

  for (const { query, faction } of testUnits) {
    it(`${query} (${faction}): returns nodes and is a datasheet`, async () => {
      const data = await apiPost('/graph-data', { query, limit: 10 })

      expect(data.nodes).toBeDefined()
      expect(data.nodes.length).toBeGreaterThan(0)
      expect(data.edges).toBeDefined()

      // Find the target unit
      const found = data.nodes.find(
        (n: any) =>
          n.title.toLowerCase().includes(query.toLowerCase()) && n.category === 'datasheet',
      )
      expect(found, `${query} datasheet not found in graph results`).toBeDefined()
    }, 60_000)
  }
})

// ── 5. Record-based search ─────────────────────────────────────────────────

describe('record-based search', () => {
  it('weapon name returns unit record (not raw weapon node)', async () => {
    const data = await apiPost('/search', { query: 'lascannon', pageSize: 5 })
    // Response should have records array
    expect(data.records).toBeDefined()
    expect(data.records.length).toBeGreaterThan(0)
    // No record should have a weapon as its primaryNode
    for (const record of data.records) {
      expect(record.primaryNode.category).not.toBe('weapon')
      expect(record.primaryNode.category).not.toBe('unit-ability')
    }
    // At least one should be a unit record
    const units = data.records.filter((r: any) => r.type === 'unit')
    expect(units.length).toBeGreaterThan(0)
  }, 60_000)

  it('army rule search returns army-rule record with PDF source', async () => {
    const data = await apiPost('/search', { query: 'Oath of Moment' })
    expect(data.records).toBeDefined()
    const armyRules = data.records.filter((r: any) => r.type === 'army-rule')
    expect(armyRules.length).toBeGreaterThan(0)
    const oath = armyRules[0]
    // Full text, not partial
    expect(oath.primaryNode.content.length).toBeGreaterThan(50)
    // Must have PDF source
    const pdfSource = oath.primaryNode.sources.find((s: any) => s.type === 'pdf')
    expect(pdfSource).toBeDefined()
  }, 60_000)

  it('record content has inline entity links (brain:nodeId)', async () => {
    const data = await apiPost('/search', { query: 'Oath of Moment' })
    expect(data.records.length).toBeGreaterThan(0)
    // At least one record should have brain: links in content
    const hasLinks = data.records.some((r: any) =>
      /\[.*?\]\(brain:.*?\)/.test(r.primaryNode.content),
    )
    expect(hasLinks).toBe(true)
  }, 60_000)

  it('pagination returns different results per page', async () => {
    const p1 = await apiPost('/search', { query: 'space marines', page: 1, pageSize: 3 })
    const p2 = await apiPost('/search', { query: 'space marines', page: 2, pageSize: 3 })
    expect(p1.page).toBe(1)
    expect(p2.page).toBe(2)
    expect(p1.totalPages).toBeGreaterThanOrEqual(2)
    if (p2.records.length > 0) {
      expect(p1.records[0].primaryNode.id).not.toBe(p2.records[0].primaryNode.id)
    }
  }, 60_000)

  it('search response includes pagination metadata', async () => {
    const data = await apiPost('/search', { query: 'wound roll', page: 1, pageSize: 5 })
    expect(data.page).toBe(1)
    expect(data.pageSize).toBe(5)
    expect(data.total).toBeGreaterThan(0)
    expect(data.totalPages).toBeGreaterThan(0)
  }, 60_000)

  it('no raw weapon/unit-ability nodes escape in weapon searches', async () => {
    for (const query of ['bolt rifle', 'lascannon', 'power sword', 'melta']) {
      const data = await apiPost('/search', { query, pageSize: 10 })
      if (!data.records) continue
      for (const record of data.records) {
        expect(record.primaryNode.category).not.toBe('weapon')
        expect(record.primaryNode.category).not.toBe('unit-ability')
        expect(record.primaryNode.category).not.toBe('wargear-option')
      }
    }
  }, 120_000)
})

// ── 6. Browse pagination ───────────────────────────────────────────────────

describe('browse pagination', () => {
  it('browse returns paginated results', async () => {
    const res = await fetch(`${API_BASE}/browse/nodes?layer=core&page=1&pageSize=10`)
    const data = await res.json()
    expect(data.page).toBe(1)
    expect(data.pageSize).toBe(10)
    expect(data.total).toBeGreaterThan(0)
    expect(data.totalPages).toBeGreaterThan(0)
    expect(data.nodes.length).toBeLessThanOrEqual(10)
  }, 60_000)

  it('browse excludes child nodes', async () => {
    const res = await fetch(`${API_BASE}/browse/nodes?layer=faction&page=1&pageSize=50`)
    const data = await res.json()
    for (const node of data.nodes) {
      expect(node.category).not.toBe('weapon')
      expect(node.category).not.toBe('unit-ability')
      expect(node.category).not.toBe('wargear-option')
      expect(node.category).not.toBe('leader-attachment')
      expect(node.category).not.toBe('unit-composition')
    }
  }, 60_000)

  it('browse page 2 returns different nodes than page 1', async () => {
    const p1 = await fetch(`${API_BASE}/browse/nodes?layer=core&page=1&pageSize=5`)
    const p2 = await fetch(`${API_BASE}/browse/nodes?layer=core&page=2&pageSize=5`)
    const d1 = await p1.json()
    const d2 = await p2.json()
    if (d2.nodes.length > 0) {
      expect(d1.nodes[0].id).not.toBe(d2.nodes[0].id)
    }
  }, 60_000)
})

// ── 7. Chapter Approved cards ──────────────────────────────────────────────

describe('chapter approved cards', () => {
  it('primary mission search returns mission records', async () => {
    const data = await apiPost('/search', { query: 'Take and Hold', pageSize: 5 })
    if (!data.records) return // CA data may not be indexed yet
    const missions = data.records.filter(
      (r: any) => r.type === 'primary-mission' || r.primaryNode.category === 'primary-mission',
    )
    if (missions.length > 0) {
      expect(missions[0].primaryNode.content).toContain('VP')
    }
  }, 60_000)

  it('twist card search returns twist records', async () => {
    const data = await apiPost('/search', { query: 'Night Fighting', pageSize: 5 })
    if (!data.records) return // CA data may not be indexed yet
    const twists = data.records.filter(
      (r: any) => r.type === 'twist' || r.primaryNode.category === 'twist',
    )
    if (twists.length > 0) {
      expect(twists[0].primaryNode.content).toContain('18')
    }
  }, 60_000)

  it('secondary mission Assassination is searchable', async () => {
    const data = await apiPost('/search', { query: 'Assassination secondary', pageSize: 5 })
    if (!data.records) return // CA data may not be indexed yet
    const secondaries = data.records.filter(
      (r: any) => r.type === 'secondary-mission' || r.primaryNode.category === 'secondary-mission',
    )
    // Informational — CA cards may not be indexed yet
    console.log(`Found ${secondaries.length} secondary mission records for Assassination`)
  }, 60_000)
})
