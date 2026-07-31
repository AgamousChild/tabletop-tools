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
const clientDir = (app: string) => join(REPO_ROOT, 'apps', app, 'client')

/**
 * Cloudflare Pages project for an app's client.
 *
 * Confirmed against `wrangler pages project list`: every app client is
 * `tabletop-tools-{app}` serving `{app}.tabletop-tools.net`. The bare
 * `tabletop-tools` project is the gateway.
 *
 * This has to be passed explicitly. There is no wrangler.toml in any client
 * directory, so `wrangler pages deploy dist` fails with "Must specify a project
 * name" — which is exactly what the repo's own `deploy:new-meta` npm script
 * does, so that script has never worked either.
 */
export const pagesProject = (app: string) => `tabletop-tools-${app}`

/**
 * The Pages branch that publishes to PRODUCTION.
 *
 * Without this, `wrangler pages deploy` uses the current git branch, and any
 * branch other than the project's production branch lands as a PREVIEW on a
 * throwaway hash URL while the real domain keeps serving the old build. It
 * still exits 0.
 *
 * That is not hypothetical: tabletop-tools-new-meta's production deployment was
 * five months old and on `main`, while a fresh deploy from a feature branch
 * reported success and changed nothing users could see.
 */
export const PAGES_PRODUCTION_BRANCH = 'main'

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

// ── Client ──────────────────────────────────────────────────────────────────

/**
 * Build and deploy one app's client to Pages.
 *
 * The build is not optional: `wrangler pages deploy dist` ships whatever is
 * already in dist, so skipping it silently republishes the previous bundle.
 */
export async function appDeployClient(
  app: string,
  opts: { skipBuild?: boolean; branch?: string } = {},
): Promise<{ build?: RunResult; deploy: RunResult }> {
  assertDeployableApp(app)
  const cwd = clientDir(app)
  const build = opts.skipBuild
    ? undefined
    : await runCmd('npx', ['vite', 'build'], { cwd, timeoutMs: 15 * 60 * 1000, tailLines: 30 })
  const deploy = await runCmd(
    'npx',
    [
      'wrangler',
      'pages',
      'deploy',
      'dist',
      '--project-name',
      pagesProject(app),
      // Explicit, because the default is the current git branch — which
      // silently produces a preview deployment nobody is looking at.
      '--branch',
      opts.branch ?? PAGES_PRODUCTION_BRANCH,
    ],
    { cwd, timeoutMs: 15 * 60 * 1000, tailLines: 40 },
  )
  return { build, deploy }
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
  clientBuild?: RunResult
  clientDeploy?: RunResult
  purge: PurgeResult
  totalDurationMs: number
  /** True when every step that ran reported success. */
  ok: boolean
}

/**
 * Worker → client → purge, in that order.
 *
 * The purge runs LAST and runs even if a step failed, because a partial deploy
 * plus a warm CDN is the worst state to leave: some responses new, some old,
 * and no way to tell which from the outside.
 */
export async function appDeployFull(
  app: string,
  opts: { skipWorker?: boolean; skipClient?: boolean; skipBuild?: boolean; branch?: string } = {},
): Promise<AppDeployFullResult> {
  assertDeployableApp(app)
  const started = Date.now()

  const worker = opts.skipWorker ? undefined : await appDeployWorker(app)
  let clientBuild: RunResult | undefined
  let clientDeploy: RunResult | undefined
  if (!opts.skipClient) {
    const r = await appDeployClient(app, { skipBuild: opts.skipBuild, branch: opts.branch })
    clientBuild = r.build
    clientDeploy = r.deploy
  }
  const purge = await appPurgeCache()

  return {
    app,
    worker,
    clientBuild,
    clientDeploy,
    purge,
    totalDurationMs: Date.now() - started,
    ok:
      (worker?.code ?? 0) === 0 &&
      (clientBuild?.code ?? 0) === 0 &&
      (clientDeploy?.code ?? 0) === 0 &&
      purge.ok,
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
 * Deploy every app Worker + client, then the gateway, then purge ONCE.
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
  opts: { apps?: readonly string[]; skipGateway?: boolean; skipClients?: boolean } = {},
): Promise<DeployEverythingResult> {
  const started = Date.now()
  const targets = opts.apps ?? DEPLOYABLE_APPS
  const results: DeployEverythingResult['apps'] = []

  for (const app of targets) {
    const worker = await appDeployWorker(app)
    let clientBuild: RunResult | undefined
    let clientDeploy: RunResult | undefined
    if (!opts.skipClients) {
      const r = await appDeployClient(app)
      clientBuild = r.build
      clientDeploy = r.deploy
    }
    results.push({
      app,
      worker,
      clientBuild,
      clientDeploy,
      totalDurationMs: 0,
      ok: worker.code === 0,
    })
  }

  const gateway = opts.skipGateway
    ? undefined
    : await runCmd('bash', ['scripts/deploy-gateway.sh'], {
        cwd: REPO_ROOT,
        timeoutMs: 20 * 60 * 1000,
        tailLines: 40,
      })

  const purge = await appPurgeCache()

  return {
    apps: results,
    gateway,
    purge,
    totalDurationMs: Date.now() - started,
    ok: results.every((r) => r.ok) && (gateway?.code ?? 0) === 0 && purge.ok,
  }
}
