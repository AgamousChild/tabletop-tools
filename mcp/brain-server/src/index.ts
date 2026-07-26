#!/usr/bin/env node
/**
 * Brain MCP Server — provides Claude Code with direct access to the 40K Brain knowledge graph.
 *
 * Tools:
 *   brain_search(query, limit?) — semantic text search across all nodes
 *   brain_get_rule(name) — get a specific rule/ability by exact name
 *   brain_get_unit(name) — get a unit datasheet by name
 *   brain_browse(category, page?, pageSize?) — browse a category
 *   brain_factions() — list all factions with unit counts
 *
 * Reads from the local .local/brain/ directory (built by build-graph.ts).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'

// ── Load all nodes from local build output ───────────────────────────────────

const BRAIN_DIR = join(import.meta.dirname || '.', '../../../apps/brain/server/.local/brain')

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
  detachmentId?: string
  datasheetId?: string
  phase?: string
  sources: any[]
  keywords: string[]
  qualityFlags?: string[]
}

let allNodes: Node[] = []
// Last-loaded manifest signature. When build-graph.ts rebuilds the brain we
// want a long-running MCP host to pick up the new nodes without a restart —
// otherwise queries return a snapshot frozen at first load.
let loadedUpdatedAt: string | null = null

function loadNodes(): void {
  const manifestPath = join(BRAIN_DIR, 'manifest.json')
  if (!existsSync(manifestPath)) {
    if (allNodes.length === 0) {
      console.error(`Brain data not found at ${BRAIN_DIR}. Run build-graph.ts first.`)
    }
    return
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
    files: Record<string, string>
    updatedAt?: string
  }
  // Cache hit only when the manifest hasn't been rewritten since the last load.
  // `updatedAt` changes on every rebuild; using it avoids re-reading 64MB of
  // node JSON on every query while still picking up new builds automatically.
  if (allNodes.length > 0 && manifest.updatedAt === loadedUpdatedAt) return

  allNodes = []
  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    const filePath = join(BRAIN_DIR, file)
    if (!existsSync(filePath)) continue
    const nodes = JSON.parse(readFileSync(filePath, 'utf-8')) as Node[]
    allNodes.push(...nodes)
  }
  loadedUpdatedAt = manifest.updatedAt ?? null

  console.error(`Loaded ${allNodes.length} brain nodes (updatedAt=${loadedUpdatedAt})`)
}

// ── Search ───────────────────────────────────────────────────────────────────

function searchNodes(query: string, limit: number = 10): Node[] {
  loadNodes()
  const q = query.toLowerCase()
  const terms = q.split(/\s+/).filter((t) => t.length > 1)

  // Score each node by how many terms match in title/content/keywords
  const scored = allNodes
    .map((node) => {
      const text = `${node.title} ${node.summary} ${node.keywords.join(' ')}`.toLowerCase()
      let score = 0

      // Exact title match = highest score
      if (node.title.toLowerCase() === q) score += 100

      // Title contains query
      if (node.title.toLowerCase().includes(q)) score += 50

      // Term matches
      for (const term of terms) {
        if (node.title.toLowerCase().includes(term)) score += 10
        if (text.includes(term)) score += 2
      }

      // Keyword exact matches
      for (const kw of node.keywords) {
        if (terms.includes(kw)) score += 5
      }

      return { node, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(({ node }) => node)
}

// ── Format node for display ──────────────────────────────────────────────────

function formatNode(node: Node, verbose: boolean = false): string {
  const lines: string[] = []
  lines.push(`## ${node.title}`)
  lines.push(
    `**Category:** ${node.category} | **Faction:** ${node.factionName || node.factionId || 'none'} | **Layer:** ${node.layer}`,
  )

  if (node.phase) lines.push(`**Phase:** ${node.phase}`)
  if (node.subfaction) lines.push(`**Subfaction:** ${node.subfaction}`)

  lines.push('')

  if (verbose) {
    lines.push(node.content)
  } else {
    lines.push(node.summary)
  }

  if (node.qualityFlags?.length) {
    lines.push('')
    lines.push(`⚠️ Quality flags: ${node.qualityFlags.join(', ')}`)
  }

  const pdfSource = node.sources.find((s: any) => s.type === 'pdf' && s.page)
  if (pdfSource) {
    lines.push(`📄 Source: ${pdfSource.title}, page ${pdfSource.page}`)
  }

  return lines.join('\n')
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'brain',
  version: '1.0.0',
})

server.tool(
  'brain_search',
  'Search the 40K Brain knowledge graph. Returns rules, units, stratagems, abilities, missions, etc.',
  {
    query: z.string().describe('Search query — unit name, rule name, keyword, or question'),
    limit: z.number().optional().default(10).describe('Max results (default 10)'),
  },
  async ({ query, limit }) => {
    const results = searchNodes(query, limit)
    if (results.length === 0) {
      return { content: [{ type: 'text' as const, text: `No results for "${query}"` }] }
    }
    const text = results
      .map(
        (n, i) => `### ${i + 1}. ${n.title} (${n.category})\n${n.factionName || ''}\n${n.summary}`,
      )
      .join('\n\n')
    return {
      content: [
        {
          type: 'text' as const,
          text: `Found ${results.length} results for "${query}":\n\n${text}`,
        },
      ],
    }
  },
)

server.tool(
  'brain_get_rule',
  'Get a specific rule, ability, or stratagem by exact name. Returns full content.',
  {
    name: z.string().describe('Exact rule/ability name (case-insensitive)'),
  },
  async ({ name }) => {
    loadNodes()
    const lower = name.toLowerCase()
    const node = allNodes.find(
      (n) =>
        n.title.toLowerCase() === lower &&
        ![
          'weapon',
          'unit-ability',
          'wargear-option',
          'leader-attachment',
          'unit-composition',
        ].includes(n.category),
    )
    if (!node) {
      // Try partial match
      const partial = allNodes.find(
        (n) =>
          n.title.toLowerCase().includes(lower) &&
          !['weapon', 'unit-ability', 'wargear-option'].includes(n.category),
      )
      if (partial) {
        return { content: [{ type: 'text' as const, text: formatNode(partial, true) }] }
      }
      return { content: [{ type: 'text' as const, text: `Rule "${name}" not found` }] }
    }
    return { content: [{ type: 'text' as const, text: formatNode(node, true) }] }
  },
)

server.tool(
  'brain_get_unit',
  'Get a unit datasheet by name. Returns stats, weapons, abilities, keywords.',
  {
    name: z.string().describe('Unit name (case-insensitive)'),
    faction: z.string().optional().describe('Faction filter (e.g., "space-marines")'),
  },
  async ({ name, faction }) => {
    loadNodes()
    const lower = name.toLowerCase()
    let datasheet = allNodes.find(
      (n) =>
        n.category === 'datasheet' &&
        n.title.toLowerCase() === lower &&
        (!faction || n.factionId === faction),
    )
    if (!datasheet) {
      datasheet = allNodes.find(
        (n) =>
          n.category === 'datasheet' &&
          n.title.toLowerCase().includes(lower) &&
          (!faction || n.factionId === faction),
      )
    }
    if (!datasheet) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Unit "${name}" not found${faction ? ` in ${faction}` : ''}`,
          },
        ],
      }
    }

    // Get weapons and abilities
    const weapons = allNodes.filter(
      (n) => n.datasheetId === datasheet!.id && n.category === 'weapon',
    )
    const abilities = allNodes.filter(
      (n) => n.datasheetId === datasheet!.id && n.category === 'unit-ability',
    )

    const lines: string[] = [formatNode(datasheet, true), '']

    if (weapons.length > 0) {
      lines.push('### Weapons')
      for (const w of weapons) {
        lines.push(`- **${w.title}**: ${w.summary}`)
      }
      lines.push('')
    }

    if (abilities.length > 0) {
      lines.push('### Abilities')
      for (const a of abilities) {
        lines.push(`- **${a.title}**: ${a.content}`)
      }
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

server.tool(
  'brain_browse',
  'Browse a category of rules. Categories: core-rules, errata, army-rules, detachments, enhancements, units, community, ca-primary-missions, ca-secondary-missions, ca-twists, ca-challengers, ca-deployments, ca-terrain',
  {
    category: z.string().describe('Category to browse'),
    page: z.number().optional().default(1).describe('Page number (default 1)'),
    pageSize: z.number().optional().default(20).describe('Items per page (default 20)'),
    faction: z.string().optional().describe('Filter by faction slug'),
  },
  async ({ category, page, pageSize, faction }) => {
    loadNodes()

    const filters: Record<string, (n: Node) => boolean> = {
      'core-rules': (n) =>
        n.layer === 'core' &&
        ![
          'faq',
          'commentary',
          'challenger',
          'primary-mission',
          'secondary-mission',
          'twist',
          'deployment-zone',
          'terrain-layout',
        ].includes(n.category) &&
        !n.id.startsWith('tc:'),
      errata: (n) => n.layer === 'errata' || n.category === 'faq' || n.category === 'commentary',
      'army-rules': (n) =>
        n.category === 'faction-ability' &&
        !n.detachmentId &&
        !n.summary?.endsWith(' faction.') &&
        !/\(.+\)\s*$/.test(n.title),
      detachments: (n) => n.category === 'detachment-rule',
      enhancements: (n) => n.category === 'enhancement' && !/^[\d\-\u2011]/.test(n.title),
      units: (n) => n.category === 'datasheet',
      community: (n) => n.layer === 'community',
      'ca-primary-missions': (n) => n.category === 'primary-mission',
      'ca-secondary-missions': (n) => n.category === 'secondary-mission' && !n.id.startsWith('tc:'),
      'ca-twists': (n) => n.category === 'twist',
      'ca-challengers': (n) => n.category === 'challenger',
      'ca-deployments': (n) => n.category === 'deployment-zone',
      'ca-terrain': (n) => n.category === 'terrain-layout',
    }

    const filter = filters[category]
    if (!filter) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Unknown category "${category}". Available: ${Object.keys(filters).join(', ')}`,
          },
        ],
      }
    }

    let nodes = allNodes.filter(filter)
    if (faction) nodes = nodes.filter((n) => n.factionId === faction)
    nodes.sort((a, b) => a.title.localeCompare(b.title))

    const total = nodes.length
    const start = (page - 1) * pageSize
    const paged = nodes.slice(start, start + pageSize)

    const lines = paged.map(
      (n, i) =>
        `${start + i + 1}. **${n.title}** (${n.factionName || n.factionId || ''}) — ${n.summary.substring(0, 80)}`,
    )
    const header = `**${category}** — ${total} items (page ${page}/${Math.ceil(total / pageSize)})`

    return { content: [{ type: 'text' as const, text: `${header}\n\n${lines.join('\n')}` }] }
  },
)

// ── /ask + /count passthrough (deployed brain endpoints) ────────────────────
// These hit the deployed Worker rather than the local brain files. They
// depend on the cube being deployed (build → upload → worker). See
// mcp/ops-server for the cube deploy pipeline.

const DEPLOYED_BRAIN_URL = process.env.BRAIN_URL ?? 'https://tabletop-tools.net/brain/api'

server.tool(
  'brain_ask',
  [
    'Ask the deployed brain a natural-language question. Runs RAG retrieval +',
    'the /ask query planner: count-shape questions get deterministic answers',
    'from the cube; free-form questions get LLM-formatted responses grounded',
    'in brain nodes.',
    '',
    'Prefer brain_count for pure count/list questions when you know the exact',
    'dimensions — /count is deterministic, cheaper, and has no LLM in the loop.',
    'Use brain_ask for questions that need prose framing or that span multiple',
    'concepts.',
  ].join('\n'),
  {
    question: z.string().describe('Natural-language question about 40K rules/units/factions'),
    edition: z
      .enum(['11th', '10th', '9th', 'any'])
      .optional()
      .default('11th')
      .describe('Rules edition scope (default 11th)'),
    model: z
      .string()
      .optional()
      .describe('Optional model override, e.g. "anthropic/claude-sonnet-4-5" or "claude"'),
  },
  async ({ question, edition, model }) => {
    const params = new URLSearchParams({ edition })
    if (model) params.set('model', model)
    const resp = await fetch(`${DEPLOYED_BRAIN_URL}/ask?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })
    if (!resp.ok) {
      return {
        content: [{ type: 'text' as const, text: `brain_ask failed: HTTP ${resp.status}` }],
      }
    }
    const body = (await resp.json()) as {
      answer?: string
      edition?: string
      answerPath?: string
      reference?: unknown[]
      webSources?: unknown[]
    }
    const lines = [
      body.answer ?? '(no answer)',
      '',
      `— edition=${body.edition ?? edition}, path=${body.answerPath ?? 'unknown'}, refs=${body.reference?.length ?? 0}, web=${body.webSources?.length ?? 0}`,
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

server.tool(
  'brain_count',
  [
    'Deterministic count/list query against the deployed brain cube. Returns',
    'raw structured numbers — no LLM, no prose, exact ground truth.',
    '',
    'Use for questions like "how many detachments does X have", "how many',
    'units with Y keyword", "count of stratagems per faction". The Strike',
    'Force combo count (formula (#3pt) + (#2pt × #1pt) + C(#1pt, 3)) is',
    'pre-computed and returned as combosStrikeForce on dpRollup rows.',
    '',
    'Chapter → parent expansion is baked into the fact table, so',
    'faction=dark-angels includes SM detachments/units accessible to DA.',
    '',
    'Response includes cubeVersion — use this to detect when data has changed',
    'between calls. Response is R2-cached; repeat queries are ~free.',
  ].join('\n'),
  {
    category: z
      .string()
      .optional()
      .describe(
        'Node category: detachment, stratagem, enhancement, datasheet, army-rule, faction-ability, weapon, unit-ability, mission',
      ),
    faction: z.string().optional().describe('Faction slug (e.g. dark-angels, orks, aeldari)'),
    edition: z.enum(['11th', '10th', '9th']).optional().describe('Edition filter'),
    keyword: z
      .string()
      .optional()
      .describe(
        'Ability/tag keyword filter (case-insensitive substring; e.g. "sustained hits", "deep strike")',
      ),
    dp: z.number().int().min(1).max(3).optional().describe('DP cost filter (11e detachments only)'),
    group: z
      .enum(['faction', 'category', 'edition', 'dp', 'faction_dp'])
      .optional()
      .describe('Group results by this dimension (per-group breakdown instead of a scalar)'),
    includePool: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include a list of matching node titles in the response'),
    poolLimit: z.number().int().positive().optional().describe('Max pool entries (default 500)'),
  },
  async (args) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined || v === null || v === false) continue
      params.set(k, String(v))
    }
    const resp = await fetch(`${DEPLOYED_BRAIN_URL}/count?${params.toString()}`)
    if (!resp.ok) {
      return {
        content: [{ type: 'text' as const, text: `brain_count failed: HTTP ${resp.status}` }],
      }
    }
    const body = (await resp.json()) as {
      count: number
      cubeVersion: string
      dpRollup?: Array<{
        factionId: string
        displayName: string
        total: number
        dp1: number
        dp2: number
        dp3: number
        combosStrikeForce: number
        isChapter?: boolean
        parentId?: string
      }>
      groups?: Array<Record<string, string | number>>
      pool?: Array<{ id: string; title: string; factionId?: string; dp?: number }>
    }
    const lines: string[] = [`brain_count → ${body.count} (cube ${body.cubeVersion})`]
    if (body.dpRollup && body.dpRollup.length > 0) {
      lines.push('', 'DP rollup:')
      for (const r of body.dpRollup) {
        lines.push(
          `  ${r.displayName.padEnd(24)} ${String(r.total).padStart(3)} total (${r.dp1}×1DP, ${r.dp2}×2DP, ${r.dp3}×3DP) → ${r.combosStrikeForce} Strike Force combos${r.isChapter ? ` (chapter of ${r.parentId})` : ''}`,
        )
      }
    } else if (body.groups && body.groups.length > 0) {
      lines.push('', 'Groups:')
      for (const g of body.groups.slice(0, 40)) {
        lines.push(`  ${JSON.stringify(g)}`)
      }
      if (body.groups.length > 40) lines.push(`  … +${body.groups.length - 40} more`)
    }
    if (body.pool && body.pool.length > 0) {
      lines.push('', `Pool (first ${Math.min(body.pool.length, 30)} of ${body.pool.length}):`)
      for (const p of body.pool.slice(0, 30)) {
        lines.push(
          `  - ${p.title}${p.factionId ? ` (${p.factionId})` : ''}${p.dp != null ? ` [${p.dp} DP]` : ''}`,
        )
      }
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

server.tool('brain_factions', 'List all factions with their unit counts.', {}, async () => {
  loadNodes()
  const counts = new Map<
    string,
    { name: string; units: number; armyRules: number; detachments: number }
  >()

  for (const node of allNodes) {
    if (!node.factionId) continue
    if (!counts.has(node.factionId)) {
      counts.set(node.factionId, {
        name: node.factionName || node.factionId,
        units: 0,
        armyRules: 0,
        detachments: 0,
      })
    }
    const entry = counts.get(node.factionId)!
    if (node.category === 'datasheet') entry.units++
    if (node.category === 'faction-ability' && !node.detachmentId) entry.armyRules++
    if (node.category === 'detachment-rule') entry.detachments++
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1].units - a[1].units)
  const lines = sorted.map(
    ([, data]) =>
      `**${data.name}** — ${data.units} units, ${data.armyRules} army rules, ${data.detachments} detachments`,
  )

  return {
    content: [
      { type: 'text' as const, text: `## Factions (${sorted.length})\n\n${lines.join('\n')}` },
    ],
  }
})

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Brain MCP server running')
}

main().catch(console.error)
