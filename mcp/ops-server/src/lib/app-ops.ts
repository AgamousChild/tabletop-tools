/**
 * App Worker + client deploys, with the cache purge built in.
 *
 * Every app server (no-cheat, versus, list-builder, game-tracker, tournament,
 * new-meta, admin) deploys the same way: `wrangler deploy` for the Worker,
 * build + `wrangler pages deploy` for the client. Only the brain had a codified
 * deploy, and only the brain purged the cache afterwards.
 *
 * That gap is why a fix could be merged, deployed and still invisible:
 * new-meta served pre-fix responses (3 games) while the fixed code returns
 * 1,449. A Worker deploy starts a fresh isolate, but the CDN in front of it
 * does not care — the purge is the step that makes a deploy real.
 *
 * Rule 4: importable functions first, MCP tools are a thin wrapper.
 */
import { join } from 'node:path'

import { purgeCloudflareCache, type PurgeResult } from './cf.js'
import { REPO_ROOT, runCmd, type RunResult } from './util.js'

/** Apps with a deployable server Worker. Derived from the repo layout. */
export const DEPLOYABLE_APPS = [
  'no-cheat',
  'versus',
  'list-builder',
  'game-tracker',
  'tournament',
  'new-meta',
  'admin',
] as const

export type DeployableApp = (typeof DEPLOYABLE_APPS)[number]

export function assertDeployableApp(app: string): asserts app is DeployableApp {
  if (!(DEPLOYABLE_APPS as readonly string[]).includes(app)) {
    throw new Error(`Unknown app "${app}". Deployable: ${DEPLOYABLE_APPS.join(', ')}`)
  }
}

const serverDir = (app: string) => join(REPO_ROOT, 'apps', app, 'server')

/**
 * There is exactly ONE Pages project: `tabletop-tools`, the gateway, serving
 * tabletop-tools.net. Clients are not deployed individually.
 *
 * There used to be a `tabletop-tools-{app}` project per app, bound to
 * {app}.tabletop-tools.net. The February 2026 consolidation (ece8879) replaced
 * them with the gateway and deleted their wrangler.toml files — but not the
 * Cloudflare projects, which kept serving a frozen copy of every app for the
 * next five months. This module then found them via `wrangler pages project
 * list` and made them the deploy target, so client deploys landed on abandoned
 * infrastructure while the real site went stale.
 *
 * They are gone now (deleted 2026-08-05, after confirming six of seven served a
 * different bundle from the gateway and that auth was CORS-blocked on all of
 * them — the auth Worker only ever allowed the gateway origin). Client code
 * reaches users through deployGateway and nowhere else.
 */

// ── Worker ──────────────────────────────────────────────────────────────────

/** Deploy one app's server Worker. Does NOT purge — see appDeployFull. */
export async function appDeployWorker(app: string): Promise<RunResult> {
  assertDeployableApp(app)
  return runCmd('npx', ['wrangler', 'deploy'], {
    cwd: serverDir(app),
    timeoutMs: 15 * 60 * 1000,
    tailLines: 40,
  })
}

// ── Gateway ─────────────────────────────────────────────────────────────────

/**
 * Deploy the gateway — the Pages project behind tabletop-tools.net itself.
 *
 * This is the surface users are actually on. tabletop-tools.net/{app}/ is
 * served by the `tabletop-tools` project, which bundles all nine SPAs under
 * their base paths; `tabletop-tools-{app}` only serves {app}.tabletop-tools.net.
 *
 * Deploying an app client without this leaves the canonical path on the old
 * bundle while every step reports success — measured 2026-08-04: app_deploy
 * new-meta returned "worker exit 0 / client build exit 0 / client exit 0 /
 * purged" and tabletop-tools.net/new-meta/ went on serving a five-commit-old
 * bundle. The give-away was the request payload:
 * factionId="genestealer-cults?frame=quarter:2026:3" — the query string being
 * swallowed into the id, which only the pre-fix router did.
 *
 * scripts/deploy-gateway.sh rebuilds every app client from source (it wipes
 * dist first, so it cannot be narrowed to one app) and purges for itself.
 */
export async function deployGateway(): Promise<RunResult> {
  return runCmd('bash', ['scripts/deploy-gateway.sh'], {
    cwd: REPO_ROOT,
    timeoutMs: 20 * 60 * 1000,
    tailLines: 40,
  })
}

// ── Purge ───────────────────────────────────────────────────────────────────

/** Purge the CDN cache. Re-exported so callers need not know where it lives. */
export async function appPurgeCache(): Promise<PurgeResult> {
  return purgeCloudflareCache()
}

// ── Full deploy ─────────────────────────────────────────────────────────────

export interface AppDeployFullResult {
  app: string
  worker?: RunResult
  gateway?: RunResult
  purge: PurgeResult
  totalDurationMs: number
  /** True when every step that ran reported success. */
  ok: boolean
}

/**
 * Worker → gateway → purge, in that order.
 *
 * There is no per-app client step. The gateway builds every client from source
 * and is the only Pages project serving users, so "deploy this app's client"
 * and "deploy the gateway" are the same operation.
 *
 * skipGateway is for deploying several apps in a row: the gateway rebuilds all
 * nine clients, so running it per app is N times the same work. deployEverything
 * uses it and runs the gateway once at the end.
 *
 * The purge runs LAST and runs even if a step failed, because a partial deploy
 * plus a warm CDN is the worst state to leave: some responses new, some old,
 * and no way to tell which from the outside.
 */
export async function appDeployFull(
  app: string,
  opts: { skipWorker?: boolean; skipGateway?: boolean } = {},
): Promise<AppDeployFullResult> {
  assertDeployableApp(app)
  const started = Date.now()

  const worker = opts.skipWorker ? undefined : await appDeployWorker(app)
  const gateway = opts.skipGateway ? undefined : await deployGateway()
  const purge = await appPurgeCache()

  return {
    app,
    worker,
    gateway,
    purge,
    totalDurationMs: Date.now() - started,
    ok: (worker?.code ?? 0) === 0 && (gateway?.code ?? 0) === 0 && purge.ok,
  }
}

// ── Everything ──────────────────────────────────────────────────────────────

export interface DeployEverythingResult {
  apps: Array<Omit<AppDeployFullResult, 'purge'> & { purge?: PurgeResult }>
  gateway?: RunResult
  purge: PurgeResult
  totalDurationMs: number
  ok: boolean
}

/**
 * Deploy every app Worker, then the gateway once, then purge ONCE.
 *
 * Every client ships in the single gateway build, so this loop is Workers only.
 * It used to also run a per-app client build+deploy, which meant every client
 * was built twice — once here and once inside the gateway build — and the first
 * copy went to a Pages project nobody was served from.
 *
 * The purge is a whole-zone operation, so doing it per app would be N redundant
 * requests. Each app therefore skips its own purge and the sweep does it at the
 * end — after everything is in place, which is the only point at which a purge
 * is meaningful.
 *
 * The brain deploys on its own path (brain_deploy_full) because it also uploads
 * to R2 and re-indexes; it purges for itself.
 */
export async function deployEverything(
  opts: { apps?: readonly string[]; skipGateway?: boolean } = {},
): Promise<DeployEverythingResult> {
  const started = Date.now()
  const targets = opts.apps ?? DEPLOYABLE_APPS
  const results: DeployEverythingResult['apps'] = []

  for (const app of targets) {
    const worker = await appDeployWorker(app)
    results.push({ app, worker, totalDurationMs: 0, ok: worker.code === 0 })
  }

  // Once, at the end — the gateway rebuilds every client, so per-app gateway
  // deploys inside this loop would repeat the same work N times.
  const gateway = opts.skipGateway ? undefined : await deployGateway()

  const purge = await appPurgeCache()

  return {
    apps: results,
    gateway,
    purge,
    totalDurationMs: Date.now() - started,
    ok: results.every((r) => r.ok) && (gateway?.code ?? 0) === 0 && purge.ok,
  }
}
