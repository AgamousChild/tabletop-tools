/**
 * Brain pipeline operations — build, deploy, reindex, diagnostic reports.
 *
 * Every function here is directly callable (importable from anywhere) per
 * project Rule 4 (Everything is a callable function). The MCP tool layer in
 * ../index.ts is a thin wrapper.
 *
 * Full happy-path deploy sequence:
 *   1. brainBuild()                — parse sources → .local/brain/
 *   2. brainUploadR2()             — push nodes + refs + manifest to R2
 *   3. brainDeployWorker()         — wrangler deploy
 *   4. brainReindex()              — Vectorize embed, chunked per shard
 *   5. brainPurgeCache()           — CDN purge so users see the new build
 *
 * `brainDetachmentsReport()` is a read-only diagnostic against .local/brain/.
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { REPO_ROOT, runCmd, type RunResult } from './util.js'

export const BRAIN_SERVER_DIR = join(REPO_ROOT, 'apps', 'brain', 'server')
export const BRAIN_LOCAL_DIR = join(BRAIN_SERVER_DIR, '.local', 'brain')
export const DEFAULT_BRAIN_URL = 'https://tabletop-tools.net/brain/api'

// Shards larger than this get chunked in brainReindex. Sized so a single
// index-vectors invocation stays under the Worker CPU cap (Rule 9).
export const REINDEX_SHARD_LIMIT = 1000

// ── Local build ─────────────────────────────────────────────────────────────

export interface BuildResult extends RunResult {
  totalNodes: number
  nodeFileCount: number
  detachments11e: number
  detachments10e: number
}

export async function brainBuild(): Promise<BuildResult> {
  const result = await runCmd('npx', ['tsx', 'src/build-graph.ts'], {
    cwd: BRAIN_SERVER_DIR,
    timeoutMs: 20 * 60 * 1000,
    tailLines: 200,
    env: { NODE_OPTIONS: '--dns-result-order=ipv4first' },
  })
  const stats = collectLocalStats()
  return { ...result, ...stats }
}

interface LocalStats {
  totalNodes: number
  nodeFileCount: number
  detachments11e: number
  detachments10e: number
}

function collectLocalStats(): LocalStats {
  const nodeDir = join(BRAIN_LOCAL_DIR, 'nodes')
  if (!existsSync(nodeDir)) {
    return { totalNodes: 0, nodeFileCount: 0, detachments11e: 0, detachments10e: 0 }
  }
  let totalNodes = 0
  let detachments11e = 0
  let detachments10e = 0
  const files = readdirSync(nodeDir).filter((f) => f.endsWith('.json'))
  for (const f of files) {
    const nodes = JSON.parse(readFileSync(join(nodeDir, f), 'utf-8')) as Array<{
      category?: string
      edition?: string
    }>
    totalNodes += nodes.length
    for (const n of nodes) {
      if (n.category === 'detachment' && n.edition === '11th') detachments11e++
      if ((n.category === 'detachment-rule' || n.category === 'detachment') && n.edition === '10th')
        detachments10e++
    }
  }
  return { totalNodes, nodeFileCount: files.length, detachments11e, detachments10e }
}

// ── R2 upload ───────────────────────────────────────────────────────────────

export async function brainUploadR2(): Promise<RunResult> {
  return await runCmd('npx', ['tsx', 'src/upload-graph.ts'], {
    cwd: BRAIN_SERVER_DIR,
    timeoutMs: 15 * 60 * 1000,
    tailLines: 60,
  })
}

// ── Worker deploy ───────────────────────────────────────────────────────────

export async function brainDeployWorker(buildVersion?: string): Promise<RunResult> {
  const version = buildVersion ?? new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return await runCmd('npx', ['wrangler', 'deploy', '--var', `BUILD_VERSION:${version}`], {
    cwd: BRAIN_SERVER_DIR,
    timeoutMs: 5 * 60 * 1000,
    tailLines: 40,
  })
}

// ── Vectorize reindex (chunked) ────────────────────────────────────────────

export interface ReindexResult {
  brainUrl: string
  shards: ReindexShardResult[]
  totalIndexed: number
  totalErrors: number
  durationMs: number
}

export interface ReindexShardResult {
  shard: string
  nodeCount: number
  chunkCount: number
  indexed: number
  errors: number
  errorMessages: string[]
}

/**
 * Fetch the R2 manifest, walk every shard, and call /index-vectors per-shard.
 * Shards larger than REINDEX_SHARD_LIMIT are split with `?offset=&limit=` so
 * no single Worker invocation exceeds its CPU budget (Rule 9). Curl on the
 * bash script did the same thing but silently died on exit 56; a fetch loop
 * gives us structured retries + per-chunk error accumulation.
 */
export async function brainReindex(
  opts: {
    brainUrl?: string
    syncSecret?: string
    targetFile?: string
    shardLimit?: number
    timeoutMs?: number
  } = {},
): Promise<ReindexResult> {
  const started = Date.now()
  const brainUrl = opts.brainUrl ?? DEFAULT_BRAIN_URL
  const syncSecret = opts.syncSecret ?? process.env.SYNC_SECRET
  if (!syncSecret) {
    throw new Error('SYNC_SECRET not set — cannot call /index-vectors')
  }
  const shardLimit = opts.shardLimit ?? REINDEX_SHARD_LIMIT
  const perChunkTimeout = opts.timeoutMs ?? 8 * 60 * 1000

  const manifest = await fetchManifest(brainUrl)
  const shardFiles = Object.keys(manifest.files).filter((f) => f.startsWith('nodes/'))
  if (opts.targetFile) {
    const file = opts.targetFile.startsWith('nodes/') ? opts.targetFile : `nodes/${opts.targetFile}`
    if (!shardFiles.includes(file)) {
      throw new Error(`shard ${file} not in manifest (${shardFiles.length} available)`)
    }
    shardFiles.splice(0, shardFiles.length, file)
  }

  const shards: ReindexShardResult[] = []
  let totalIndexed = 0
  let totalErrors = 0

  for (const shard of shardFiles) {
    const nodeCount = await countShardNodes(brainUrl, shard)
    const chunks = planChunks(nodeCount, shardLimit)
    const shardResult: ReindexShardResult = {
      shard,
      nodeCount,
      chunkCount: chunks.length,
      indexed: 0,
      errors: 0,
      errorMessages: [],
    }
    for (const [offset, limit] of chunks) {
      const params = new URLSearchParams({ file: shard })
      if (chunks.length > 1) {
        params.set('offset', String(offset))
        params.set('limit', String(limit))
      }
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), perChunkTimeout)
        const resp = await fetch(`${brainUrl}/index-vectors?${params.toString()}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${syncSecret}` },
          signal: controller.signal,
        })
        clearTimeout(timer)
        const body = (await resp.json().catch(() => null)) as {
          indexed?: number
          errors?: number
          errorMessages?: string[]
        } | null
        if (!resp.ok || !body) {
          shardResult.errors++
          shardResult.errorMessages.push(`chunk ${offset}+${limit} → HTTP ${resp.status}`)
          continue
        }
        shardResult.indexed += body.indexed ?? 0
        shardResult.errors += body.errors ?? 0
        if (body.errorMessages?.length) {
          shardResult.errorMessages.push(...body.errorMessages.slice(0, 3))
        }
      } catch (err) {
        shardResult.errors++
        shardResult.errorMessages.push(
          `chunk ${offset}+${limit} → ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    totalIndexed += shardResult.indexed
    totalErrors += shardResult.errors
    shards.push(shardResult)
  }

  return { brainUrl, shards, totalIndexed, totalErrors, durationMs: Date.now() - started }
}

async function fetchManifest(brainUrl: string): Promise<{ files: Record<string, string> }> {
  const resp = await fetch(`${brainUrl}/manifest.json`)
  if (!resp.ok) throw new Error(`GET /manifest.json failed: ${resp.status}`)
  return (await resp.json()) as { files: Record<string, string> }
}

async function countShardNodes(brainUrl: string, shard: string): Promise<number> {
  // /data/:path streams the raw shard JSON. Cheaper than a HEAD in that we get
  // the exact node count without needing a dedicated count endpoint.
  const resp = await fetch(`${brainUrl}/data/${shard}`)
  if (!resp.ok) return 0
  const arr = (await resp.json()) as unknown[]
  return Array.isArray(arr) ? arr.length : 0
}

function planChunks(nodeCount: number, chunkSize: number): Array<[number, number]> {
  if (nodeCount <= chunkSize) return [[0, 0]]
  const chunks: Array<[number, number]> = []
  for (let offset = 0; offset < nodeCount; offset += chunkSize) {
    chunks.push([offset, chunkSize])
  }
  return chunks
}

// ── CDN purge ──────────────────────────────────────────────────────────────

export async function brainPurgeCache(): Promise<{ ok: boolean; message: string }> {
  const zone = process.env.CLOUDFLARE_ZONE_ID
  const token = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_FULL_API_TOKEN
  if (!zone || !token) {
    return {
      ok: false,
      message: 'CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN required',
    }
  }
  const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ purge_everything: true }),
  })
  const body = (await resp.json().catch(() => ({}))) as { success?: boolean; errors?: unknown[] }
  return {
    ok: resp.ok && !!body.success,
    message: resp.ok && body.success ? 'purged' : `HTTP ${resp.status} ${JSON.stringify(body)}`,
  }
}

// ── Detachments diagnostic ──────────────────────────────────────────────────

export interface DetachmentsReport {
  totalDetachmentNodes: number
  byCategoryEdition: Array<{ category: string; edition: string; count: number }>
  byIdPrefix: Array<{ prefix: string; count: number }>
  refIncomingByPrefix: Array<{ prefix: string; targets: number; incoming: number }>
  suspects: string[]
  fromDir: string
}

/**
 * Walk .local/brain/ and produce a snapshot of the detachment population.
 * The report identifies "suspect" states — e.g. `11e:det:*` clones outnumbering
 * `det:*` canonical, or `mfm:det:*` nodes surviving into the shipped graph
 * (they should have merged into `det:*`).
 *
 * Purely local — never hits R2. Use this to verify a build BEFORE upload.
 */
export function brainDetachmentsReport(): DetachmentsReport {
  const nodeDir = join(BRAIN_LOCAL_DIR, 'nodes')
  const refsPath = join(BRAIN_LOCAL_DIR, 'refs', 'reverse-index.json')
  const catEd = new Map<string, number>()
  const pfx = new Map<string, number>()
  let total = 0

  if (existsSync(nodeDir)) {
    for (const f of readdirSync(nodeDir)) {
      if (!f.endsWith('.json')) continue
      const nodes = JSON.parse(readFileSync(join(nodeDir, f), 'utf-8')) as Array<{
        id?: string
        category?: string
        edition?: string
      }>
      for (const n of nodes) {
        if (n.category !== 'detachment' && n.category !== 'detachment-rule') continue
        total++
        const key = `${n.category}|${n.edition ?? '?'}`
        catEd.set(key, (catEd.get(key) ?? 0) + 1)
        const prefix = n.id?.split(':')[0] ?? '(none)'
        pfx.set(prefix, (pfx.get(prefix) ?? 0) + 1)
      }
    }
  }

  const refPrefixes = new Map<string, { targets: number; incoming: number }>()
  if (existsSync(refsPath)) {
    const rev = JSON.parse(readFileSync(refsPath, 'utf-8')) as Record<string, unknown[]>
    for (const k of Object.keys(rev)) {
      const p = k.split(':')[0] ?? '(none)'
      if (!['detachment', '11e', 'det', 'mfm'].includes(p)) continue
      const bucket = refPrefixes.get(p) ?? { targets: 0, incoming: 0 }
      bucket.targets++
      bucket.incoming += rev[k]!.length
      refPrefixes.set(p, bucket)
    }
  }

  const byIdPrefix = [...pfx.entries()]
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => b.count - a.count)
  const suspects: string[] = []
  const p11e = pfx.get('11e') ?? 0
  const pdet = pfx.get('det') ?? 0
  const pmfm = pfx.get('mfm') ?? 0
  const pdetachment = pfx.get('detachment') ?? 0
  if (p11e > pdet)
    suspects.push(
      `11e:det:* clones (${p11e}) outnumber det:* canonical (${pdet}) — duplicate-eleventh shadowing real 11e faction-pack nodes`,
    )
  if (pmfm > 0)
    suspects.push(
      `mfm:det:* survived the merge (${pmfm}) — merge-sources 2b1 collapse failed for these`,
    )
  if (pdetachment > 0 && pdet === 0)
    suspects.push(
      `detachment:* (10e) present without det:* (11e) — 11e faction-pack ingest missing`,
    )

  return {
    totalDetachmentNodes: total,
    byCategoryEdition: [...catEd.entries()].map(([k, count]) => {
      const [category, edition] = k.split('|')
      return { category: category!, edition: edition!, count }
    }),
    byIdPrefix,
    refIncomingByPrefix: [...refPrefixes.entries()]
      .map(([prefix, v]) => ({ prefix, ...v }))
      .sort((a, b) => b.incoming - a.incoming),
    suspects,
    fromDir: BRAIN_LOCAL_DIR,
  }
}

// ── Full deploy (glue) ──────────────────────────────────────────────────────

export interface FullDeployResult {
  build?: BuildResult
  upload?: RunResult
  worker?: RunResult
  reindex?: ReindexResult
  purge?: { ok: boolean; message: string }
  skipped: string[]
  totalDurationMs: number
}

export async function brainDeployFull(
  opts: {
    skipBuild?: boolean
    skipReindex?: boolean
  } = {},
): Promise<FullDeployResult> {
  const started = Date.now()
  const result: FullDeployResult = { skipped: [], totalDurationMs: 0 }
  if (!opts.skipBuild) result.build = await brainBuild()
  else result.skipped.push('build')
  result.upload = await brainUploadR2()
  result.worker = await brainDeployWorker()
  if (!opts.skipReindex) result.reindex = await brainReindex()
  else result.skipped.push('reindex')
  result.purge = await brainPurgeCache()
  result.totalDurationMs = Date.now() - started
  return result
}

// ── Small util re-exported for the tool layer ──────────────────────────────

export function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

export function resolveBrainDir(): string {
  return resolve(BRAIN_LOCAL_DIR)
}
