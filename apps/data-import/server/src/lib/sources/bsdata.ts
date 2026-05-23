/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 */
import { parseBSDataXml } from '@tabletop-tools/game-content/src/adapters/bsdata/parser'
import type { UnitProfile } from '@tabletop-tools/game-content/src/types'

const DEFAULT_REPO = 'BSData/wh40k-10e'
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
}

/** Strip BSData catalog prefixes for consistency with Wahapedia faction names */
function normalizeFactionName(name: string): string {
  return name.replace(/^(Imperium|Chaos)\s*-\s*/, '')
}

export async function fetchAndProcessBSData(
  previousCommitSha?: string,
  repo = DEFAULT_REPO,
  branch = DEFAULT_BRANCH,
  githubToken?: string,
): Promise<BSDataResult> {
  const ghHeaders: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'tabletop-tools',
  }
  if (githubToken) ghHeaders['Authorization'] = `token ${githubToken}`

  // Get latest commit SHA
  const commitResp = await fetch(
    `https://api.github.com/repos/${repo}/commits/${branch}`,
    { headers: ghHeaders },
  )
  if (!commitResp.ok) throw new Error(`GitHub commit API: HTTP ${commitResp.status}`)
  const commitData = await commitResp.json() as { sha: string }
  const commitSha = commitData.sha

  if (previousCommitSha && commitSha === previousCommitSha) {
    return { skipped: true, commitSha, units: [] }
  }

  // Get file tree
  const treeResp = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${commitSha}?recursive=1`,
    { headers: ghHeaders },
  )
  if (!treeResp.ok) throw new Error(`GitHub tree API: HTTP ${treeResp.status}`)
  const treeData = await treeResp.json() as { tree: GitHubTreeItem[] }

  // Filter to .cat files only
  const catFiles = treeData.tree.filter(item =>
    item.type === 'blob' && item.path.endsWith('.cat')
  )

  // Fetch and parse each catalog
  const allUnits: BSDataResult['units'] = []
  const errors: string[] = []

  for (const file of catFiles) {
    const faction = normalizeFactionName(
      file.path.replace(/\.cat$/, '').replace(/.*\//, '')
    )

    try {
      const rawResp = await fetch(
        `https://raw.githubusercontent.com/${repo}/${branch}/${file.path}`,
        { headers: { 'User-Agent': 'tabletop-tools' } },
      )
      if (!rawResp.ok) throw new Error(`HTTP ${rawResp.status}`)
      const xml = await rawResp.text()

      const { units, errors: parseErrors } = parseBSDataXml(xml, faction)
      allUnits.push(...units)
      errors.push(...parseErrors)
    } catch (err) {
      errors.push(`${faction}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (errors.length > 0) {
    console.log(`BSData parse warnings: ${errors.length}`)
  }

  return { skipped: false, commitSha, units: allUnits }
}
