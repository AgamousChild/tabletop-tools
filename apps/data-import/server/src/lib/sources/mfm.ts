/**
 * MFM (Munitorum Field Manual) source.
 *
 * Pulls per-faction YAML snapshots from BSData/wh40k-11e-mfm — a daily scrape
 * of <https://mfm.warhammer-community.com/>. The YAML carries data BSData does
 * not surface cleanly: tiered costing ({models, points} per range like `[1,2]`
 * or `[3,)`), wargear costs, leader `attachTo` lists, and detachments with DP,
 * unique-detachment markers, and enhancement leader-grant lists.
 *
 * Costing churns roughly monthly (each MFM release), so MFM lands in its own
 * R2 files keyed to BSData datasheet ids rather than embedded in UnitProfile;
 * consumers join at read time and a re-ingest only rewrites the MFM files.
 *
 * Shape mirrors the upstream zod schema in BSData/wh40k-11e-mfm/src/model.ts;
 * we keep only the fields we actually consume.
 */
import { parse as parseYaml } from 'yaml'

const DEFAULT_REPO = 'BSData/wh40k-11e-mfm'
const DEFAULT_BRANCH = 'main'

interface GitHubTreeItem {
  path: string
  type: string
  url: string
  sha: string
}

export interface MfmCostOption {
  models: number
  points: number
  desc?: string
  addon?: true
}

export interface MfmCostingTier {
  /** Mathematical interval over unit copies, e.g. `[1,)` (always) or `[3,)` (3rd+). */
  range: string
  /** Verbatim heading from the source page (kept for display). */
  label: string
  costs: MfmCostOption[]
}

export interface MfmWargear {
  item: string
  points: number
}

export interface MfmUnit {
  name: string
  groupTitle?: string
  costing: MfmCostingTier[]
  role?: 'leader' | 'support'
  attachTo?: string[]
  wargear?: MfmWargear[]
  legends?: true
}

export interface MfmEnhancement {
  name: string
  points: number
  /** Units this enhancement unlocks the Leader ability for. */
  leaderTo?: string[]
  /**
   * Units this enhancement unlocks the Support ability for. New in 11e —
   * upstream BSData scraper started emitting this in PR #25 (22/7/2026) when
   * GW added the `SUPPORT:` grant annotation to enhancement cards, mirroring
   * `LEADER:`. Empty on 10e-shaped enhancements.
   */
  supportTo?: string[]
}

export interface MfmDetachment {
  name: string
  /** `null` when the source page omits a DP cost. */
  dp: number | null
  objective: string | null
  /** Sub-faction keyword the detachment is restricted to (UNIQUE banner). */
  unique?: string
  enhancements: MfmEnhancement[]
}

export interface MfmFactionContent {
  slug: string
  name: string
  version: string
  /**
   * Parent army for sub-factions — set on SM chapters that have their own
   * MFM YAML (e.g. Black Templars → "Space Marines"). Data-driven marker
   * from BSData PR #10; we capture but don't yet consume it (the
   * SM_CHAPTERS_WITHOUT_MFM set in sync.ts still handles chapter-rollup
   * routing hardcoded, since chapters WITH their own YAML don't need
   * routing).
   */
  parent?: string
  detachments: MfmDetachment[]
  units: MfmUnit[]
}

export interface MfmResult {
  skipped: boolean
  commitSha: string
  factions: MfmFactionContent[]
}

export async function fetchAndProcessMFM(
  previousCommitSha?: string,
  repo: string = DEFAULT_REPO,
  branch: string = DEFAULT_BRANCH,
  githubToken?: string,
): Promise<MfmResult> {
  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'tabletop-tools',
  }
  if (githubToken) ghHeaders['Authorization'] = `token ${githubToken}`

  const commitResp = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`, {
    headers: ghHeaders,
  })
  if (!commitResp.ok) throw new Error(`GitHub commit API: HTTP ${commitResp.status}`)
  const commitData = (await commitResp.json()) as { sha: string }
  const commitSha = commitData.sha

  if (previousCommitSha && commitSha === previousCommitSha) {
    return { skipped: true, commitSha, factions: [] }
  }

  const treeResp = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${commitSha}?recursive=1`,
    { headers: ghHeaders },
  )
  if (!treeResp.ok) throw new Error(`GitHub tree API: HTTP ${treeResp.status}`)
  const treeData = (await treeResp.json()) as { tree: GitHubTreeItem[] }

  // Per-faction YAMLs live in `data/`. `data/meta.yaml` is index + version info
  // we don't need to ingest as a faction.
  const factionFiles = treeData.tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path.startsWith('data/') &&
      item.path.endsWith('.yaml') &&
      item.path !== 'data/meta.yaml',
  )

  const fetched = await Promise.all(
    factionFiles.map(async (file) => {
      try {
        const rawResp = await fetch(
          `https://raw.githubusercontent.com/${repo}/${branch}/${file.path}`,
          { headers: { 'User-Agent': 'tabletop-tools' } },
        )
        if (!rawResp.ok) throw new Error(`HTTP ${rawResp.status}`)
        const yamlText = await rawResp.text()
        return { ok: true as const, path: file.path, yamlText }
      } catch (err) {
        return {
          ok: false as const,
          path: file.path,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )

  const factions: MfmFactionContent[] = []
  const errors: string[] = []
  for (const r of fetched) {
    if (!r.ok) {
      errors.push(`${r.path}: ${r.error}`)
      continue
    }
    try {
      const parsed = parseMfmFactionYaml(r.yamlText)
      factions.push(parsed)
    } catch (err) {
      errors.push(`${r.path}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (errors.length > 0) {
    console.log(`MFM parse warnings: ${errors.length}`)
  }

  return { skipped: false, commitSha, factions }
}

/**
 * Parse a single faction MFM YAML document. Throws on missing required fields.
 * Optional fields are coerced to the expected shape when present and omitted
 * otherwise, mirroring the upstream zod schema's behavior.
 */
export function parseMfmFactionYaml(yamlText: string): MfmFactionContent {
  const raw = parseYaml(yamlText) as Record<string, unknown>
  if (!raw || typeof raw !== 'object') throw new Error('YAML root is not an object')

  const requiredString = (k: string): string => {
    const v = raw[k]
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`Missing or invalid required string field: ${k}`)
    }
    return v
  }

  const result: MfmFactionContent = {
    slug: requiredString('slug'),
    name: requiredString('name'),
    version: requiredString('version'),
    detachments: normalizeDetachments(raw['detachments']),
    units: normalizeUnits(raw['units']),
  }
  if (typeof raw['parent'] === 'string' && raw['parent'].length > 0) {
    result.parent = raw['parent']
  }
  return result
}

function normalizeUnits(raw: unknown): MfmUnit[] {
  if (!Array.isArray(raw)) return []
  const out: MfmUnit[] = []
  for (const u of raw) {
    if (!u || typeof u !== 'object') continue
    const r = u as Record<string, unknown>
    if (typeof r['name'] !== 'string') continue
    // Upstream YAML key is `pricing`; we keep the internal model as `costing`
    // (rule-of-thumb wargaming vocabulary). This is the only place the names
    // diverge.
    const costing = normalizeCosting(r['pricing'])
    if (costing.length === 0) continue
    const unit: MfmUnit = { name: r['name'], costing }
    if (typeof r['groupTitle'] === 'string') unit.groupTitle = r['groupTitle']
    if (r['role'] === 'leader' || r['role'] === 'support') unit.role = r['role']
    if (Array.isArray(r['attachTo'])) {
      unit.attachTo = (r['attachTo'] as unknown[]).filter((x): x is string => typeof x === 'string')
    }
    if (Array.isArray(r['wargear'])) {
      const wg: MfmWargear[] = []
      for (const w of r['wargear'] as unknown[]) {
        if (!w || typeof w !== 'object') continue
        const wr = w as Record<string, unknown>
        if (typeof wr['item'] === 'string' && typeof wr['points'] === 'number') {
          wg.push({ item: wr['item'], points: wr['points'] })
        }
      }
      if (wg.length > 0) unit.wargear = wg
    }
    if (r['legends'] === true) unit.legends = true
    out.push(unit)
  }
  return out
}

function normalizeCosting(raw: unknown): MfmCostingTier[] {
  if (!Array.isArray(raw)) return []
  const out: MfmCostingTier[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const r = t as Record<string, unknown>
    if (typeof r['range'] !== 'string' || typeof r['label'] !== 'string') continue
    const costs: MfmCostOption[] = []
    if (Array.isArray(r['costs'])) {
      for (const c of r['costs'] as unknown[]) {
        if (!c || typeof c !== 'object') continue
        const cr = c as Record<string, unknown>
        if (typeof cr['models'] !== 'number' || typeof cr['points'] !== 'number') continue
        const opt: MfmCostOption = { models: cr['models'], points: cr['points'] }
        if (typeof cr['desc'] === 'string') opt.desc = cr['desc']
        if (cr['addon'] === true) opt.addon = true
        costs.push(opt)
      }
    }
    if (costs.length === 0) continue
    out.push({ range: r['range'], label: r['label'], costs })
  }
  return out
}

function normalizeDetachments(raw: unknown): MfmDetachment[] {
  if (!Array.isArray(raw)) return []
  const out: MfmDetachment[] = []
  for (const d of raw) {
    if (!d || typeof d !== 'object') continue
    const r = d as Record<string, unknown>
    if (typeof r['name'] !== 'string') continue
    const dp = typeof r['dp'] === 'number' ? r['dp'] : null
    const objective = typeof r['objective'] === 'string' ? r['objective'] : null
    const enhancements: MfmEnhancement[] = []
    if (Array.isArray(r['enhancements'])) {
      for (const e of r['enhancements'] as unknown[]) {
        if (!e || typeof e !== 'object') continue
        const er = e as Record<string, unknown>
        if (typeof er['name'] !== 'string' || typeof er['points'] !== 'number') continue
        const enh: MfmEnhancement = { name: er['name'], points: er['points'] }
        if (Array.isArray(er['leaderTo'])) {
          enh.leaderTo = (er['leaderTo'] as unknown[]).filter(
            (x): x is string => typeof x === 'string',
          )
        }
        if (Array.isArray(er['supportTo'])) {
          enh.supportTo = (er['supportTo'] as unknown[]).filter(
            (x): x is string => typeof x === 'string',
          )
        }
        enhancements.push(enh)
      }
    }
    const det: MfmDetachment = { name: r['name'], dp, objective, enhancements }
    if (typeof r['unique'] === 'string') det.unique = r['unique']
    out.push(det)
  }
  return out
}
