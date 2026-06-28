/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 */
import {
  type CatalogRegistry,
  parseBSDataXml,
  type Subfaction,
} from '@tabletop-tools/game-content/src/adapters/bsdata/parser'
import type { UnitProfile } from '@tabletop-tools/game-content/src/types'

const DEFAULT_REPO = 'fmoraldo-mithraw/wh40k-11e'
const DEFAULT_BRANCH = 'main'

interface GitHubTreeItem {
  path: string
  type: string
  url: string
  sha: string
}

export interface BSDataResult {
  skipped: boolean
  commitSha: string
  units: UnitProfile[]
  subfactions: Subfaction[]
}

/** Strip BSData catalog prefixes for consistency with Wahapedia faction names */
function normalizeFactionName(name: string): string {
  return name.replace(/^(Imperium|Chaos)\s*-\s*/, '')
}

/**
 * BSData ships 11 Space Marines chapter catalogs as separate factions:
 * Ultramarines, Imperial Fists, Iron Hands, Raven Guard, Salamanders,
 * White Scars, Space Wolves, Black Templars, Blood Angels, Dark Angels,
 * Deathwatch. Downstream consumers (versus, list-builder via game-data-store)
 * see those 11 names as distinct factions — but per the brain's existing
 * SUBFACTION_KEYWORDS rule and the `sync.ts` `CATALOG_FACTION_ALIASES` table,
 * they all roll up to `Space Marines` + a `subfaction` slug.
 *
 * This table mirrors the parent rollup keys used by `sync.ts`'s
 * `CATALOG_FACTION_ALIASES` — kept here instead of imported because the
 * BSData source layer maps catalog-name → human-readable parent faction
 * ("Space Marines"), while sync.ts maps catalog-name → canonical slug
 * ("space-marines"). One change per layer; don't conflate them.
 */
const SM_CHAPTER_TO_SUBFACTION: Record<string, string> = {
  'Black Templars': 'black-templars',
  'Blood Angels': 'blood-angels',
  'Dark Angels': 'dark-angels',
  Deathwatch: 'deathwatch',
  'Imperial Fists': 'imperial-fists',
  'Iron Hands': 'iron-hands',
  'Raven Guard': 'raven-guard',
  Salamanders: 'salamanders',
  'Space Wolves': 'space-wolves',
  Ultramarines: 'ultramarines',
  'White Scars': 'white-scars',
}

const SPACE_MARINES_FACTION_NAME = 'Space Marines'

/**
 * Roll up BSData chapter catalogs to `Space Marines` + a `subfaction` slug.
 * For non-chapter catalogs returns `{ faction: <input>, subfaction: undefined }`.
 *
 * Exported so the sync.ts and tests can verify chapter handling without
 * re-implementing the table.
 */
export function rollupChapterFaction(faction: string): {
  faction: string
  subfaction?: string
} {
  const subfaction = SM_CHAPTER_TO_SUBFACTION[faction]
  if (subfaction) {
    return { faction: SPACE_MARINES_FACTION_NAME, subfaction }
  }
  return { faction }
}

export async function fetchAndProcessBSData(
  previousCommitSha?: string,
  repo = DEFAULT_REPO,
  branch = DEFAULT_BRANCH,
  githubToken?: string,
): Promise<BSDataResult> {
  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'tabletop-tools',
  }
  if (githubToken) ghHeaders['Authorization'] = `token ${githubToken}`

  // Get latest commit SHA
  const commitResp = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`, {
    headers: ghHeaders,
  })
  if (!commitResp.ok) throw new Error(`GitHub commit API: HTTP ${commitResp.status}`)
  const commitData = (await commitResp.json()) as { sha: string }
  const commitSha = commitData.sha

  if (previousCommitSha && commitSha === previousCommitSha) {
    return { skipped: true, commitSha, units: [], subfactions: [] }
  }

  // Get file tree
  const treeResp = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${commitSha}?recursive=1`,
    { headers: ghHeaders },
  )
  if (!treeResp.ok) throw new Error(`GitHub tree API: HTTP ${treeResp.status}`)
  const treeData = (await treeResp.json()) as { tree: GitHubTreeItem[] }

  // Filter to .cat files only
  const catFiles = treeData.tree.filter(
    (item) => item.type === 'blob' && item.path.endsWith('.cat'),
  )

  const allUnits: BSDataResult['units'] = []
  const allSubfactions: BSDataResult['subfactions'] = []
  const errors: string[] = []

  // Phase 1: fetch every .cat file. We need the full set in hand before parsing
  // because 11e splits sub-faction content (Craftworlds, SM chapters, …) into a
  // wrapper file that catalogueLinks a parent library catalog by id. Without the
  // library xml available at parse time, the sub-faction file parses to 0 units.
  const fetchResults = await Promise.all(
    catFiles.map(async (file) => {
      const faction = normalizeFactionName(file.path.replace(/\.cat$/, '').replace(/.*\//, ''))
      try {
        const rawResp = await fetch(
          `https://raw.githubusercontent.com/${repo}/${branch}/${file.path}`,
          { headers: { 'User-Agent': 'tabletop-tools' } },
        )
        if (!rawResp.ok) throw new Error(`HTTP ${rawResp.status}`)
        const xml = await rawResp.text()
        return { ok: true as const, path: file.path, faction, xml }
      } catch (err) {
        return {
          ok: false as const,
          path: file.path,
          faction,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )

  // Phase 2: build catalog registry by extracting `<catalogue id="...">` from
  // each successfully-fetched file. The id is the key catalogueLink uses to
  // refer between files.
  const registry: CatalogRegistry = new Map()
  const fetched: Array<{ path: string; faction: string; xml: string }> = []
  for (const r of fetchResults) {
    if (!r.ok) {
      errors.push(`${r.faction}: ${r.error}`)
      continue
    }
    fetched.push({ path: r.path, faction: r.faction, xml: r.xml })
    const idMatch = /<catalogue\b[^>]*?\bid="([^"]+)"/i.exec(r.xml)
    if (idMatch?.[1]) registry.set(idMatch[1], { name: r.path, xml: r.xml })
  }

  // Phase 3: parse each file with the registry, so catalogueLinks resolve.
  // Chapter-catalog rollup happens here too — Ultramarines / Imperial Fists /
  // … rewrite to `faction: "Space Marines"` + `subfaction: <slug>` so
  // downstream consumers (versus, list-builder) don't see 11 SM factions.
  for (const f of fetched) {
    try {
      const { units, subfactions, errors: parseErrors } = parseBSDataXml(f.xml, f.faction, registry)
      for (const u of units) {
        const { faction: rolled, subfaction } = rollupChapterFaction(u.faction)
        if (subfaction) {
          allUnits.push({ ...u, faction: rolled, subfaction })
        } else {
          allUnits.push(u)
        }
      }
      for (const s of subfactions) {
        const { faction: rolled } = rollupChapterFaction(s.faction)
        if (rolled !== s.faction) {
          allSubfactions.push({ ...s, faction: rolled })
        } else {
          allSubfactions.push(s)
        }
      }
      errors.push(...parseErrors)
    } catch (err) {
      errors.push(`${f.faction}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (errors.length > 0) {
    console.log(`BSData parse warnings: ${errors.length}`)
  }

  return { skipped: false, commitSha, units: allUnits, subfactions: allSubfactions }
}
