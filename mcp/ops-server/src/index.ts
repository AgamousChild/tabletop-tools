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
  appDeployClient,
  appDeployFull,
  appDeployWorker,
  appPurgeCache,
  DEPLOYABLE_APPS,
  deployEverything,
} from './lib/app-ops.js'
import {
  bcpBackfillDetachments,
  bcpEnumerateCombos,
  bcpParseLists,
  bcpPipelineFull,
  bcpScrapeEvents,
  bcpScrapeLists,
  bcpSyncDetachmentDims,
} from './lib/bcp-ops.js'
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

// ── BCP scraper ─────────────────────────────────────────────────────────────

server.tool(
  'bcp_scrape_events',
  [
    'Scrape BCP events + pairings for the rolling 7-day window via the BCP REST API.',
    '',
    'Writes to meta_events, meta_event_players, meta_pairings, bcp_scrape_jobs.',
    'Also stores source_list_id on meta_event_players so bcp_scrape_lists can',
    'follow up with army list text.',
    '',
    'Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN, BCP_EMAIL, BCP_PASSWORD (from .env).',
    '',
    'For a custom date window (backfill), run scripts/scrape-jun-jul.ts directly',
    'as a template — this tool uses the default 7-day window.',
    '',
    'What to run next: bcp_scrape_lists to fetch army list text for new players.',
  ].join('\n'),
  {},
  async () => {
    const r = await bcpScrapeEvents()
    const lines = [
      `bcp_scrape_events exit ${r.code} in ${Math.round(r.durationMs / 1000)}s`,
      r.eventsScraped !== undefined ? `events scraped: ${r.eventsScraped}` : '',
      r.pairingsScraped !== undefined ? `pairings scraped: ${r.pairingsScraped}` : '',
      '',
      '--- stdout tail ---',
      r.stdout,
      r.stderr ? '\n--- stderr tail ---\n' + r.stderr : '',
    ]
    return textResult(lines.filter(Boolean).join('\n'))
  },
)

server.tool(
  'bcp_scrape_lists',
  [
    'Fetch army list text for meta_event_players rows that have source_list_id',
    'set but no list_text yet.',
    '',
    'Idempotent: skips rows where list_text is already populated.',
    '',
    'Scope params (all optional):',
    '  since   — ISO date string, e.g. "2026-06-01" (filter by event date)',
    '  until   — ISO date string, e.g. "2026-07-31"',
    '  eventId — restrict to one BCP event source_id',
    '',
    'Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN, BCP_EMAIL, BCP_PASSWORD (from .env).',
    'BCP list REST API returns 403 without auth — Cognito token required.',
    'Prerequisite: migration 0014_bcp_source_list_id.sql must have run,',
    'AND at least one bcp_scrape_events run must have populated source_list_id.',
    '',
    'What to run next: nothing — list_text is immediately available for cube/parse.',
  ].join('\n'),
  {
    since: z.string().optional().describe('ISO date start, e.g. "2026-06-01"'),
    until: z.string().optional().describe('ISO date end, e.g. "2026-07-31"'),
    eventId: z.string().optional().describe('BCP event source_id to restrict to'),
  },
  async ({ since, until, eventId }) => {
    const r = await bcpScrapeLists({ since, until, eventId })
    const lines = [
      `bcp_scrape_lists exit ${r.code} in ${Math.round(r.durationMs / 1000)}s`,
      r.fetched !== undefined ? `lists fetched: ${r.fetched}` : '',
      r.skipped !== undefined ? `skipped (no list): ${r.skipped}` : '',
      r.errors !== undefined ? `errors: ${r.errors}` : '',
      '',
      '--- stdout tail ---',
      r.stdout,
      r.stderr ? '\n--- stderr tail ---\n' + r.stderr : '',
    ]
    return textResult(lines.filter(Boolean).join('\n'))
  },
)

server.tool(
  'bcp_parse_lists',
  [
    'STEP 3 of 4. Parse fetched list_text into the structured list_ttt blob.',
    '',
    'Only touches rows that have list_text and no list_ttt. Chunked at 100 rows',
    'per underlying call; the script loops until the queue drains.',
    '',
    'Note: the parser has a hardcoded 2026-01-01 event-date floor, so older',
    'events are never queued no matter how much list_text they have.',
    '',
    'retryFailed=true clears list_ttt on rows whose stored parse FAILED so they',
    'are re-attempted. Use only after changing the parser — not routinely.',
    '',
    'Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN. No BCP credentials needed.',
    'Prerequisite: bcp_scrape_lists must have populated list_text.',
    '',
    'What to run next: bcp_backfill_detachments — parsing alone puts the',
    'detachment in list_ttt, which no analytics query reads.',
  ].join('\n'),
  {
    retryFailed: z
      .boolean()
      .optional()
      .default(false)
      .describe('Re-attempt rows whose stored parse failed (use after a parser change)'),
  },
  async ({ retryFailed }) => {
    const r = await bcpParseLists({ retryFailed })
    const lines = [
      `bcp_parse_lists exit ${r.code} in ${Math.round(r.durationMs / 1000)}s`,
      r.parsed !== undefined ? `parsed=${r.parsed} partial=${r.partial} failed=${r.failed}` : '',
      '',
      '--- stdout tail ---',
      r.stdout,
      r.stderr ? '\n--- stderr tail ---\n' + r.stderr : '',
    ]
    return textResult(lines.filter(Boolean).join('\n'))
  },
)

server.tool(
  'bcp_sync_detachment_dims',
  [
    'STEP 4 of 6. Sync dim_detachment against the brain: add detachments the dim',
    'lacks and populate the 11e Detachment Points cost (dp).',
    '',
    'WHY THIS STEP EXISTS: dp is what makes a combo judgeable. The enumerator',
    'skips any detachment with no dp, so a stale dim silently shrinks the legal',
    'combo set instead of failing — and the backfill then records real armies as',
    'illegal builds because no legal combo exists to match them.',
    '',
    'Rows with no 11e cost keep dp NULL (10e-era) — distinct from a cost of 0.',
    '',
    'Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN, plus the brain cube export on disk.',
    '',
    'What to run next: bcp_enumerate_combos.',
  ].join('\n'),
  {
    dryRun: z.boolean().optional().default(false).describe('Report the plan without writing'),
  },
  async ({ dryRun }) => {
    const r = await bcpSyncDetachmentDims({ dryRun })
    const lines = [
      `bcp_sync_detachment_dims exit ${r.code} in ${Math.round(r.durationMs / 1000)}s`,
      r.dimRows !== undefined ? `dim_detachment rows: ${r.dimRows}` : '',
      r.withDp !== undefined ? `with dp: ${r.withDp}` : '',
      '',
      '--- stdout tail ---',
      r.stdout,
      r.stderr ? '\n--- stderr tail ---\n' + r.stderr : '',
    ]
    return textResult(lines.filter(Boolean).join('\n'))
  },
)

server.tool(
  'bcp_enumerate_combos',
  [
    'STEP 5 of 6. Enumerate every legal 11e detachment combination into',
    'dim_detachment_combo.',
    '',
    'WHY THIS STEP EXISTS: 11e armies take MULTIPLE detachments under a',
    'Detachment Points budget (each costs 1-3 DP; 2 DP at Incursion, 3 at Strike',
    'Force). Combos are written whether or not anyone has played them, which is',
    'what makes "which legal pairing is nobody playing" answerable instead of a',
    'guess from observed data alone.',
    '',
    'Subfactions inherit the parent faction pool — a marine chapter can field the',
    'generic Space Marine detachments, which is where dim_detachment keeps them.',
    'Without that, no chapter gets any combos and every real chapter army lands',
    'in the backfill as an illegal build (measured: 103 of 110 distinct).',
    '',
    'Idempotent, and never downgrades a legal combo to illegal.',
    '',
    'Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN. No BCP credentials needed.',
    'Prerequisite: bcp_sync_detachment_dims must have populated dp.',
    '',
    'What to run next: bcp_backfill_detachments.',
  ].join('\n'),
  {
    budget: z.number().int().min(1).optional().describe('DP budget (default 3 = Strike Force)'),
    dryRun: z.boolean().optional().default(false).describe('Enumerate and report without writing'),
  },
  async ({ budget, dryRun }) => {
    const r = await bcpEnumerateCombos({ budget, dryRun })
    const lines = [
      `bcp_enumerate_combos exit ${r.code} in ${Math.round(r.durationMs / 1000)}s`,
      r.combos !== undefined ? `combos: ${r.combos}` : '',
      r.members !== undefined ? `membership rows: ${r.members}` : '',
      '',
      '--- stdout tail ---',
      r.stdout,
      r.stderr ? '\n--- stderr tail ---\n' + r.stderr : '',
    ]
    return textResult(lines.filter(Boolean).join('\n'))
  },
)

server.tool(
  'bcp_backfill_detachments',
  [
    "STEP 6 of 6. Populate a player's detachments from the parsed list blob —",
    'the meta_event_player_detachment bridge, combo_id and detachment_id — then',
    'rebuild the cube for the events touched.',
    '',
    'WHY THIS STEP EXISTS: the analytics cube reads the dimension columns, but',
    'the list parser only ever writes list_ttt. Without this bridge,',
    'fact_game_results carries NO detachment at all regardless of how many lists',
    'were scraped — measured 2026-07-28: 0 of 33,744 fact rows had a detachment',
    'while 4,938 parsed lists named one.',
    '',
    'Resolution is registry-driven, in this order: the WHOLE declaration as one',
    'detachment, then a cover of the declaration by known detachment names, then',
    'the split parts. That order is load-bearing — real detachment names contain',
    '"and" ("Penitents and Pilgrims" is ONE detachment), so splitting first',
    'invents detachments that do not exist. Measured: 10,056 of 10,178 parsed',
    'rows resolve, 2,453 of them to more than one detachment.',
    '',
    'Matching is faction-scoped (plus the parent faction for a subfaction) and',
    'normalizes both slug conventions (dim_detachment turns punctuation into "-",',
    'the list parser keeps apostrophes), strips a faction name baked into or',
    'glued onto the declaration, and tolerates trailing battle-size noise.',
    '',
    'Unresolved values are REPORTED, never guessed. They usually mean either',
    'dim_detachment lacks the entry, or the player row has the wrong faction',
    '(e.g. an aeldari row naming a Death Guard detachment).',
    '',
    'Watch declared-DP mismatches in the output: the members resolved cost a',
    'different total than the list declared, which is the best available signal',
    'that a split went wrong.',
    '',
    'The cube rebuild is part of the step, not a nicety: skip it and',
    'fact_game_results keeps serving the pre-backfill NULLs. Use skipCube only',
    'when you will rebuild yourself.',
    '',
    'dryRun=true resolves and reports without writing.',
    '',
    'Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN. No BCP credentials needed.',
    'Prerequisite: bcp_parse_lists (list_ttt) AND bcp_enumerate_combos, so a',
    'legal combo is not recorded as illegal merely because it was never',
    'enumerated.',
    '',
    'What to run next: nothing — the cube is current for these events.',
  ].join('\n'),
  {
    since: z.string().optional().describe('ISO date start, e.g. "2026-06-01"'),
    until: z.string().optional().describe('ISO date end, e.g. "2026-07-31"'),
    dryRun: z.boolean().optional().default(false).describe('Resolve and report without writing'),
    skipCube: z
      .boolean()
      .optional()
      .default(false)
      .describe('Skip the cube rebuild — leaves fact_game_results stale'),
  },
  async ({ since, until, dryRun, skipCube }) => {
    const r = await bcpBackfillDetachments({ since, until, dryRun, skipCube })
    const lines = [
      `bcp_backfill_detachments exit ${r.code} in ${Math.round(r.durationMs / 1000)}s`,
      r.updated !== undefined ? `players written: ${r.updated}` : '',
      r.detachmentRows !== undefined ? `detachment rows: ${r.detachmentRows}` : '',
      r.multiDetachment !== undefined ? `multi-detachment armies: ${r.multiDetachment}` : '',
      r.eventsTouched !== undefined ? `events rebuilt: ${r.eventsTouched}` : '',
      r.unresolved !== undefined ? `unresolved rows: ${r.unresolved}` : '',
      '',
      '--- stdout tail ---',
      r.stdout,
      r.stderr ? '\n--- stderr tail ---\n' + r.stderr : '',
    ]
    return textResult(lines.filter(Boolean).join('\n'))
  },
)

server.tool(
  'bcp_pipeline_full',
  [
    'The whole BCP pipeline in dependency order:',
    '',
    '  1. bcp_scrape_events        events + pairings → meta_events,',
    '                              meta_event_players, meta_pairings,',
    '                              and source_list_id',
    '  2. bcp_scrape_lists         army list text    → list_text',
    '  3. bcp_parse_lists          structured parse  → list_ttt',
    '  4. bcp_sync_detachment_dims brain → dim       → dim_detachment(.dp)',
    '  5. bcp_enumerate_combos     DP rules → dim    → dim_detachment_combo',
    '  6. bcp_backfill_detachments detachments+cube  → meta_event_player_detachment,',
    '                              combo_id, detachment_id, fact_game_results',
    '',
    'Each step feeds the next, so running a prefix leaves the tail STALE, not',
    'merely incomplete. Stop after 2 and the lists are unparsed; stop after 3',
    'and the cube reports no detachments at all. Steps 4 and 5 precede 6 because',
    'the backfill resolves against dim_detachment and only records a combo as',
    'illegal when enumeration has NOT already produced it — running the backfill',
    'against a stale dim marks legal builds illegal.',
    '',
    'Every step is idempotent — safe to re-run after an interruption.',
    '',
    'Scope the list-fetch and detachment passes with since/until (ISO dates).',
    'The events scrape always uses its own rolling 7-day window; for an',
    'arbitrary backfill window run scripts/scrape-jun-jul.ts --refresh instead.',
    '',
    'skipLists / skipParse / skipDims / skipCombos / skipDetachments each drop',
    'their step.',
    '',
    'Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN, BCP_EMAIL, BCP_PASSWORD.',
  ].join('\n'),
  {
    since: z.string().optional().describe('ISO date start for list-fetch + detachment scope'),
    until: z.string().optional().describe('ISO date end for list-fetch + detachment scope'),
    skipLists: z.boolean().optional().default(false),
    skipParse: z.boolean().optional().default(false),
    skipDims: z.boolean().optional().default(false),
    skipCombos: z.boolean().optional().default(false),
    skipDetachments: z.boolean().optional().default(false),
  },
  async ({ since, until, skipLists, skipParse, skipDims, skipCombos, skipDetachments }) => {
    const r = await bcpPipelineFull({
      since,
      until,
      skipLists,
      skipParse,
      skipDims,
      skipCombos,
      skipDetachments,
    })
    const lines = [
      `bcp_pipeline_full done in ${Math.round(r.totalDurationMs / 1000)}s`,
      `1. events:      exit ${r.events.code}`,
      r.lists
        ? `2. lists:       exit ${r.lists.code} — fetched=${r.lists.fetched ?? '?'}, errors=${r.lists.errors ?? '?'}`
        : '2. lists:       skipped',
      r.parse
        ? `3. parse:       exit ${r.parse.code} — parsed=${r.parse.parsed ?? '?'}, failed=${r.parse.failed ?? '?'}`
        : '3. parse:       skipped',
      r.dims
        ? `4. dims:        exit ${r.dims.code} — dim_detachment=${r.dims.dimRows ?? '?'}, with dp=${r.dims.withDp ?? '?'}`
        : '4. dims:        skipped — dp may be stale, which mislabels legal combos',
      r.combos
        ? `5. combos:      exit ${r.combos.code} — combos=${r.combos.combos ?? '?'}, members=${r.combos.members ?? '?'}`
        : '5. combos:      skipped — legal combos may be missing',
      r.detachments
        ? `6. detachments: exit ${r.detachments.code} — players=${r.detachments.updated ?? '?'}, detachment rows=${r.detachments.detachmentRows ?? '?'}, multi=${r.detachments.multiDetachment ?? '?'}, events rebuilt=${r.detachments.eventsTouched ?? '?'}, unresolved=${r.detachments.unresolved ?? '?'}`
        : '6. detachments: skipped — cube detachments are STALE',
    ]
    return textResult(lines.join('\n'))
  },
)

// ── App deploys (Worker + client + cache purge) ─────────────────────────────

server.tool(
  'app_deploy',
  [
    'Deploy ONE app: server Worker, then client to Pages, then purge the CDN.',
    '',
    'WHY THE PURGE IS PART OF THIS: a Worker deploy starts a fresh isolate, but',
    'the CDN in front of it keeps serving the old response. `wrangler deploy`',
    'exits 0 and the site stays stale. new-meta served pre-fix data (3 games in',
    'a near-empty future quarter) while the fixed code returns 1,449 for the',
    'same query. A deploy is not done until the cache is purged.',
    '',
    'The client build is not optional: `wrangler pages deploy dist` ships',
    'whatever is already in dist, so skipping it republishes the old bundle.',
    '',
    'The brain deploys via brain_deploy_full instead — it also uploads to R2',
    'and re-indexes, and purges for itself.',
    '',
    'Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID for the purge.',
  ].join('\n'),
  {
    app: z.string().describe(`One of: ${DEPLOYABLE_APPS.join(', ')}`),
    skipWorker: z.boolean().optional().default(false),
    skipClient: z.boolean().optional().default(false),
    skipBuild: z.boolean().optional().default(false).describe('Reuse the existing dist/ bundle'),
  },
  async ({ app, skipWorker, skipClient, skipBuild }) => {
    const r = await appDeployFull(app, { skipWorker, skipClient, skipBuild })
    const lines = [
      `app_deploy ${r.app} ${r.ok ? 'OK' : 'FAILED'} in ${Math.round(r.totalDurationMs / 1000)}s`,
      r.worker ? `worker:       exit ${r.worker.code}` : 'worker:       skipped',
      r.clientBuild ? `client build: exit ${r.clientBuild.code}` : 'client build: skipped',
      r.clientDeploy ? `client:       exit ${r.clientDeploy.code}` : 'client:       skipped',
      `purge:        ${r.purge.ok ? 'purged' : `FAILED — ${r.purge.message}`}`,
      r.purge.ok ? '' : 'WITHOUT THE PURGE THE SITE STILL SERVES THE OLD RESPONSE.',
    ]
    return textResult(lines.filter(Boolean).join('\n'))
  },
)

server.tool(
  'app_deploy_worker',
  [
    'Deploy just one app server Worker. Does NOT purge the CDN, so the change',
    'may still be invisible — prefer app_deploy unless you will purge yourself.',
  ].join('\n'),
  { app: z.string().describe(`One of: ${DEPLOYABLE_APPS.join(', ')}`) },
  async ({ app }) => {
    const r = await appDeployWorker(app)
    return textResult(
      [
        `app_deploy_worker ${app} exit ${r.code} in ${Math.round(r.durationMs / 1000)}s`,
        '',
        r.stdout,
      ].join('\n'),
    )
  },
)

server.tool(
  'app_deploy_client',
  [
    'Build and deploy one app client to Pages. Does NOT purge the CDN.',
    'skipBuild reuses dist/, which republishes the previous bundle — only use',
    'it when you have just built.',
  ].join('\n'),
  {
    app: z.string().describe(`One of: ${DEPLOYABLE_APPS.join(', ')}`),
    skipBuild: z.boolean().optional().default(false),
  },
  async ({ app, skipBuild }) => {
    const r = await appDeployClient(app, { skipBuild })
    return textResult(
      [
        `app_deploy_client ${app}`,
        r.build ? `build:  exit ${r.build.code}` : 'build:  skipped (reused dist/)',
        `deploy: exit ${r.deploy.code}`,
        '',
        r.deploy.stdout,
      ].join('\n'),
    )
  },
)

server.tool(
  'purge_cache',
  [
    'Purge the whole Cloudflare zone cache.',
    '',
    'Use after ANY deploy that did not purge for itself, and whenever the live',
    'site disagrees with the deployed code. Zone-wide, so once is enough no',
    'matter how many things were deployed.',
    '',
    'Requires CLOUDFLARE_ZONE_ID (or CF_ZONE_ID) and CLOUDFLARE_API_TOKEN.',
  ].join('\n'),
  {},
  async () => {
    const r = await appPurgeCache()
    return textResult(r.ok ? 'purge_cache OK — purged' : `purge_cache FAILED — ${r.message}`)
  },
)

server.tool(
  'deploy_everything',
  [
    'Deploy every app Worker + client, then the gateway, then purge ONCE.',
    '',
    'The purge is zone-wide, so per-app purging would be N redundant requests.',
    'This runs it at the end, after everything is in place — the only point at',
    'which a purge is meaningful.',
    '',
    'The brain is NOT included; it deploys via brain_deploy_full.',
    '',
    'Long-running. Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID.',
  ].join('\n'),
  {
    apps: z.array(z.string()).optional().describe('Subset of apps; defaults to all'),
    skipGateway: z.boolean().optional().default(false),
    skipClients: z.boolean().optional().default(false),
  },
  async ({ apps, skipGateway, skipClients }) => {
    const r = await deployEverything({ apps, skipGateway, skipClients })
    const lines = [
      `deploy_everything ${r.ok ? 'OK' : 'FAILED'} in ${Math.round(r.totalDurationMs / 1000)}s`,
    ]
    for (const a of r.apps) {
      lines.push(
        `  ${a.app.padEnd(14)} worker=${a.worker?.code ?? '-'} client=${a.clientDeploy?.code ?? 'skipped'}`,
      )
    }
    lines.push(r.gateway ? `  gateway        exit ${r.gateway.code}` : '  gateway        skipped')
    lines.push(`  purge          ${r.purge.ok ? 'purged' : `FAILED — ${r.purge.message}`}`)
    return textResult(lines.join('\n'))
  },
)

// ── Boot ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`ops-mcp-server started (brain dir: ${resolveBrainDir()})`)
