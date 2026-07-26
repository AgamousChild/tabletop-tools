#!/usr/bin/env node
/**
 * Ops MCP Server — the process manual for the tabletop-tools pipeline.
 *
 * Everything the brain + content-ingestor pipeline needs is exposed here as
 * named tools. Each tool description states what it does AND what to run
 * next, so future-Claude / future-Micah can drive the pipeline without
 * grepping bash scripts.
 *
 * Add tools by:
 *   1. Writing the operation in src/lib/{brain,content}-ops.ts
 *   2. Registering it here with a rich description
 *
 * Registered with Claude Code via the user's MCP config
 * (see mcp/ops-server/README.md).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import {
  brainBuild,
  brainCubeReport,
  brainDeployFull,
  brainDeployWorker,
  brainDetachmentsReport,
  brainPurgeCache,
  brainReindex,
  brainReloadCube,
  brainUploadR2,
  resolveBrainDir,
} from './lib/brain-ops.js'
import {
  contentCommit,
  contentDiscover,
  contentFullCycle,
  contentPipelineStatus,
  contentProcess,
  contentQueueNewest,
} from './lib/content-ops.js'
import { ensureRepoEnv, textResult } from './lib/util.js'

ensureRepoEnv()

const server = new McpServer({ name: 'ops', version: '0.1.0' })

// ── Brain ────────────────────────────────────────────────────────────────────

server.tool(
  'brain_build',
  [
    'Rebuild the local brain graph from all source files. Runs build-graph.ts.',
    '',
    'Produces .local/brain/{nodes,refs,manifest.json}. Prints total node count',
    'plus a detachment sanity check (11e vs 10e).',
    '',
    'What to run next: brain_detachments_report to validate detachment shape,',
    'then brain_deploy_full to push to prod.',
  ].join('\n'),
  {},
  async () => {
    const result = await brainBuild()
    const status = result.code === 0 ? 'OK' : `FAILED (exit ${result.code})`
    const cubeLine = result.cube?.present
      ? `cube: ${result.cube.factCount} facts, ${result.cube.factionCount} factions, ${result.cube.dpRollupCount} DP rollups, ${result.cube.categoryEditionRollupCount} category rollups (${Math.round(result.cube.factNodeBytes / 1024)} KB fact_node.jsonl)`
      : 'cube: NOT EMITTED (build-graph must run cube step)'
    return textResult(
      [
        `brain_build ${status} in ${Math.round(result.durationMs / 1000)}s`,
        `nodes: ${result.totalNodes} across ${result.nodeFileCount} shard files`,
        `detachments: 11e=${result.detachments11e}, 10e=${result.detachments10e}`,
        cubeLine,
        '',
        '--- stdout tail ---',
        result.stdout,
        result.stderr ? '\n--- stderr tail ---\n' + result.stderr : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  },
)

server.tool(
  'brain_reload_cube',
  [
    'Force the deployed brain Worker to drop its in-memory cube cache AND',
    'purge the R2 response cache (cache/count/*). Use after brain_upload_r2',
    'when you want the new cube to take effect without a full worker redeploy',
    '(a redeploy already spins up a fresh isolate, so /reload-cube is only',
    'needed for cube-only uploads).',
    '',
    'Requires SYNC_SECRET in the environment.',
    '',
    'Response shows cubeVersion + fact/faction counts as the fresh cube sees them.',
  ].join('\n'),
  {},
  async () => {
    const r = await brainReloadCube()
    return textResult(
      r.ok
        ? [
            'brain_reload_cube OK',
            `cubeVersion: ${r.cubeVersion ?? 'unknown'}`,
            `facts: ${r.facts ?? '?'}, factions: ${r.factions ?? '?'}`,
            `response cache purged: ${r.responseCachePurged ?? 0} entries`,
          ].join('\n')
        : `brain_reload_cube FAILED — ${r.message ?? 'unknown error'}`,
    )
  },
)

server.tool(
  'brain_cube_report',
  [
    'Read-only diagnostic of the cube (fact + dim + rollup tables).',
    '',
    'Shows LIVE state from the deployed Worker (via /count) side-by-side with',
    'LOCAL state on disk (.local/brain/cube/). Use this to:',
    '  - confirm the deployed cube matches the local build',
    '  - sanity-check a rebuild before promoting via brain_deploy_full',
    '  - inspect the top faction rollups after a data change',
    '',
    'Never mutates state.',
  ].join('\n'),
  {},
  async () => {
    const r = await brainCubeReport()
    const lines: string[] = ['brain_cube_report', '', 'LIVE (deployed):']
    if (r.live.cubeVersion) {
      lines.push(`  cubeVersion: ${r.live.cubeVersion}`)
      lines.push(`  faction rollups: ${r.live.factionRollupCount ?? 0}`)
      lines.push('  sample factions (top 5 by rollup order):')
      for (const f of r.live.sampleFactions ?? []) {
        lines.push(
          `    ${f.displayName.padEnd(24)} total=${String(f.total).padStart(3)}, combos=${f.combosStrikeForce}`,
        )
      }
    } else {
      lines.push('  (unable to fetch — /count endpoint may not be deployed yet)')
    }
    lines.push('', 'LOCAL (.local/brain/cube/):')
    if (r.local?.present) {
      lines.push(`  dir: ${r.fromDir}`)
      lines.push(`  facts: ${r.local.factCount} (${Math.round(r.local.factNodeBytes / 1024)} KB)`)
      lines.push(`  factions: ${r.local.factionCount}, keywords: ${r.local.keywordCount}`)
      lines.push(
        `  DP rollups: ${r.local.dpRollupCount}, category-edition rollups: ${r.local.categoryEditionRollupCount}`,
      )
    } else {
      lines.push('  (no local cube — run brain_build)')
    }
    return textResult(lines.join('\n'))
  },
)

server.tool(
  'brain_detachments_report',
  [
    'Read-only diagnostic of detachment nodes in the LOCAL build (.local/brain/).',
    '',
    'Reports total detachment nodes, breakdown by category+edition, breakdown',
    'by id-prefix (detachment: / 11e:det: / det: / mfm:det:), and reverse-index',
    'incoming refs per prefix. Emits "suspects" — states that indicate the',
    'merge collapsed or duplicated something.',
    '',
    'Run this before brain_deploy_full to catch regressions early. Also run it',
    'when investigating "graph is missing detachments" / "detachment content is',
    'wrong edition".',
  ].join('\n'),
  {},
  async () => {
    const r = brainDetachmentsReport()
    const lines: string[] = [
      `brain_detachments_report — ${r.fromDir}`,
      `total detachment nodes: ${r.totalDetachmentNodes}`,
      '',
      'by (category, edition):',
    ]
    for (const row of r.byCategoryEdition) {
      lines.push(`  ${row.category.padEnd(20)} ${row.edition.padEnd(6)} ${row.count}`)
    }
    lines.push('', 'by id-prefix:')
    for (const row of r.byIdPrefix) {
      lines.push(`  ${row.prefix.padEnd(20)} ${row.count}`)
    }
    lines.push('', 'incoming refs by id-prefix (reverse-index):')
    for (const row of r.refIncomingByPrefix) {
      lines.push(
        `  ${row.prefix.padEnd(20)} ${String(row.targets).padStart(4)} targets, ${row.incoming} incoming`,
      )
    }
    lines.push('', 'suspects:')
    if (r.suspects.length === 0) lines.push('  (none — shape looks healthy)')
    for (const s of r.suspects) lines.push(`  - ${s}`)
    return textResult(lines.join('\n'))
  },
)

server.tool(
  'brain_upload_r2',
  [
    'Push .local/brain/ (nodes, refs, manifest) to the tabletop-tools-brain R2 bucket.',
    '',
    'Idempotent — safe to re-run if a previous attempt was interrupted.',
    '',
    'What to run next: brain_deploy_worker to ship the Worker code, then',
    'brain_reindex to embed new/changed nodes into Vectorize.',
  ].join('\n'),
  {},
  async () => {
    const r = await brainUploadR2()
    return textResult(
      `brain_upload_r2 exit ${r.code} in ${Math.round(r.durationMs / 1000)}s\n\n${r.stdout}${r.stderr ? '\n--- stderr ---\n' + r.stderr : ''}`,
    )
  },
)

server.tool(
  'brain_deploy_worker',
  [
    'Deploy the brain Worker via wrangler.',
    '',
    'BUILD_VERSION is stamped automatically. What to run next: brain_reindex.',
  ].join('\n'),
  { buildVersion: z.string().optional().describe('Optional BUILD_VERSION override') },
  async ({ buildVersion }) => {
    const r = await brainDeployWorker(buildVersion)
    return textResult(
      `brain_deploy_worker exit ${r.code} in ${Math.round(r.durationMs / 1000)}s\n\n${r.stdout}`,
    )
  },
)

server.tool(
  'brain_reindex',
  [
    'Re-index Vectorize embeddings via prod /index-vectors. Chunked per-shard so',
    'no single Worker invocation exceeds the CPU budget (Rule 9). This is the',
    'step that failed on the last deploy — the community shard grew from 20 to',
    '11,969 nodes and blew the Worker cap; the chunked implementation fixes it.',
    '',
    'Requires SYNC_SECRET in the environment (from repo-root .env).',
    '',
    'What to run next: brain_purge_cache once reindex reports 0 errors.',
  ].join('\n'),
  {
    targetFile: z
      .string()
      .optional()
      .describe(
        'Reindex only this shard (e.g. "community.json" or "nodes/community.json"). Omit to reindex every shard.',
      ),
    shardLimit: z
      .number()
      .optional()
      .describe(
        'Chunk size when a shard exceeds it (default 1000). Lower this if 5xx errors appear.',
      ),
  },
  async ({ targetFile, shardLimit }) => {
    const r = await brainReindex({ targetFile, shardLimit })
    const lines: string[] = [
      `brain_reindex done in ${Math.round(r.durationMs / 1000)}s against ${r.brainUrl}`,
      `total: indexed=${r.totalIndexed}, errors=${r.totalErrors}`,
      '',
      'per shard:',
    ]
    for (const s of r.shards) {
      lines.push(
        `  ${s.shard.padEnd(40)} ${String(s.nodeCount).padStart(6)} nodes / ${String(s.chunkCount).padStart(3)} chunks → indexed=${s.indexed}, errors=${s.errors}`,
      )
      for (const em of s.errorMessages.slice(0, 3)) lines.push(`    ! ${em}`)
    }
    return textResult(lines.join('\n'))
  },
)

server.tool(
  'brain_purge_cache',
  [
    'Purge the Cloudflare CDN cache for the tabletop-tools zone.',
    '',
    'Run this after every deploy or R2 upload — stale HTML/JSON at the edge',
    'is a real regression source (see project CLAUDE.md operational gotchas).',
  ].join('\n'),
  {},
  async () => {
    const r = await brainPurgeCache()
    return textResult(`brain_purge_cache: ${r.ok ? 'OK' : 'FAILED'} — ${r.message}`)
  },
)

server.tool(
  'brain_deploy_full',
  [
    'Full happy-path brain deploy: build → upload R2 → deploy Worker → chunked',
    'reindex → CDN purge. Runs each step in sequence and short-circuits if any',
    'step fails.',
    '',
    'Set skipBuild=true if .local/brain/ is already fresh (last built <1h ago).',
    'Set skipReindex=true only if no node CONTENT changed (safe for pure ref',
    'or manifest changes).',
    '',
    'Prefer running individual tools when investigating; use this only when',
    "you're pushing a known-good build.",
  ].join('\n'),
  {
    skipBuild: z.boolean().optional().default(false),
    skipReindex: z.boolean().optional().default(false),
  },
  async ({ skipBuild, skipReindex }) => {
    const r = await brainDeployFull({ skipBuild, skipReindex })
    const lines: string[] = [
      `brain_deploy_full done in ${Math.round(r.totalDurationMs / 1000)}s`,
      r.skipped.length ? `skipped: ${r.skipped.join(', ')}` : '',
      r.build ? `build: exit ${r.build.code} — ${r.build.totalNodes} nodes` : '',
      r.upload ? `upload: exit ${r.upload.code}` : '',
      r.worker ? `worker: exit ${r.worker.code}` : '',
      r.reindex
        ? `reindex: indexed=${r.reindex.totalIndexed}, errors=${r.reindex.totalErrors}`
        : '',
      r.purge ? `purge: ${r.purge.ok ? 'OK' : 'FAIL — ' + r.purge.message}` : '',
    ]
    return textResult(lines.filter(Boolean).join('\n'))
  },
)

// ── Content ingestor ────────────────────────────────────────────────────────

server.tool(
  'content_pipeline_status',
  [
    'Snapshot of the content-ingestor pipeline queue in Turso.',
    '',
    'Shows pipeline_item counts by status (discovered / queued / processing /',
    'done / failed) and the last 5 pipeline_run entries.',
    '',
    'ALWAYS start here when investigating "community nodes not updating" or',
    '"pipeline seems stuck".',
  ].join('\n'),
  {},
  async () => {
    const s = await contentPipelineStatus()
    const lines: string[] = ['pipeline_item counts:']
    for (const t of s.totalsByStatus) lines.push(`  ${t.status.padEnd(15)} ${t.count}`)
    lines.push('', 'recent pipeline_run:')
    for (const r of s.latestRuns) {
      lines.push(
        `  ${r.startedAt} ${r.pipeline.padEnd(20)} ${r.status.padEnd(10)} processed=${r.processed} failed=${r.failed}`,
      )
    }
    return textResult(lines.join('\n'))
  },
)

server.tool(
  'content_discover',
  [
    'Manually run the discover step (find new URLs across all sources).',
    '',
    'A GH Actions cron runs this daily at 06:00 UTC — only invoke this if you',
    "need to catch up (source has new content and you don't want to wait).",
    '',
    "Adds rows to pipeline_item with status='discovered'. Doesn't process anything.",
    '',
    'What to run next: content_queue_newest to promote discovered → queued.',
  ].join('\n'),
  {},
  async () => {
    const r = await contentDiscover()
    return textResult(
      `content_discover exit ${r.code} in ${Math.round(r.durationMs / 1000)}s\n\n${r.stdout}`,
    )
  },
)

server.tool(
  'content_queue_newest',
  [
    "Promote the N newest 'discovered' items to 'queued' status.",
    '',
    'Iteration order: published_at DESC. This is a required step before',
    'content_process — the processor only reads items already queued.',
    '',
    'What to run next: content_process(n).',
  ].join('\n'),
  { n: z.number().describe('How many discovered items to promote') },
  async ({ n }) => {
    const r = await contentQueueNewest(n)
    return textResult(
      `content_queue_newest(${n}) exit ${r.code} in ${Math.round(r.durationMs / 1000)}s\n\n${r.stdout}`,
    )
  },
)

server.tool(
  'content_process',
  [
    'Process the N oldest queued items: fetch transcript / article body, run',
    'LLM extraction via local Ollama, write brain-node drafts to',
    'apps/content-ingestor/.local/drafts/.',
    '',
    'This is the slow step — expect ~20-60s per item. Ollama must be running',
    'locally. Failures set status=failed and are skipped.',
    '',
    'What to run next: content_commit to fold drafts into community.json.',
  ].join('\n'),
  { n: z.number().describe('Max queued items to process') },
  async ({ n }) => {
    const r = await contentProcess(n)
    return textResult(
      `content_process(${n}) exit ${r.code} in ${Math.round(r.durationMs / 1000)}s\n\n${r.stdout}`,
    )
  },
)

server.tool(
  'content_commit',
  [
    'Read all drafts under apps/content-ingestor/.local/drafts/, dedupe, and',
    'write apps/brain/server/src/data/community.json.',
    '',
    'This is the step that had drifted before — drafts were being produced but',
    'never committed, so community.json stayed frozen at 20 built-in nodes',
    'while ~12k drafts piled up unused.',
    '',
    'What to run next: brain_build to include the new community nodes, then',
    'brain_deploy_full.',
  ].join('\n'),
  {},
  async () => {
    const r = await contentCommit()
    return textResult(
      `content_commit exit ${r.code} in ${Math.round(r.durationMs / 1000)}s\n\n${r.stdout}`,
    )
  },
)

server.tool(
  'content_full_cycle',
  [
    'Convenience: content_queue_newest(n) + content_process(n) + content_commit,',
    'in sequence. Use when you want to catch up the ingest queue in one call.',
    '',
    'Takes ~20-60s * n for the process step. Prefer running individual tools',
    'when investigating so you can inspect stdout at each stage.',
  ].join('\n'),
  { n: z.number().describe('How many items to queue + process') },
  async ({ n }) => {
    const r = await contentFullCycle(n)
    const lines = [
      `content_full_cycle(${n}) done in ${Math.round(r.totalDurationMs / 1000)}s`,
      r.queue ? `queue:   exit ${r.queue.code}` : '',
      r.process ? `process: exit ${r.process.code}` : '',
      r.commit ? `commit:  exit ${r.commit.code}` : '',
    ]
    return textResult(lines.filter(Boolean).join('\n'))
  },
)

// ── Boot ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`ops-mcp-server started (brain dir: ${resolveBrainDir()})`)
