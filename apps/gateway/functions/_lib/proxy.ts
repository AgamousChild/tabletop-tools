// Shared proxy-handler factory for the gateway's Pages Functions.
//
// Each app's Worker is reached through a service binding (see
// ../../wrangler.toml's [[services]] entries). Every proxy strips the
// app's URL prefix and forwards the request to the bound Worker, catching
// thrown errors as a structured 503. Previously this ~18-line shape was
// hand-copied into 9 files (apps/gateway/functions/<app>/{trpc|api}/
// [[path]].ts); see wargame/w2/decisions/D2-02-deploy-topology-roster-manifest.md
// for why that drifted and why this factory replaces it.
//
// Consumers pass the binding's env key and the URL prefix to strip — both
// values already live in apps/gateway/apps.json (envKey / stripPrefix).

export interface ProxyHandlerOptions {
  /** Key of the service-binding Fetcher on the Pages Function's Env, e.g. "BRAIN_API". */
  envKey: string
  /** Leading URL path segment to strip before forwarding, e.g. "/brain/api". */
  stripPrefix: string
}

type ProxyEnv = Record<string, Fetcher>

export function createProxyHandler({
  envKey,
  stripPrefix,
}: ProxyHandlerOptions): PagesFunction<ProxyEnv> {
  const prefixPattern = new RegExp(`^${escapeRegExp(stripPrefix)}`)

  return async (context) => {
    const url = new URL(context.request.url)
    url.pathname = url.pathname.replace(prefixPattern, '')

    const binding = context.env[envKey]

    try {
      return await binding.fetch(new Request(url.toString(), context.request))
    } catch (err) {
      console.error(`[gateway proxy] ${envKey} unavailable:`, err)
      return new Response(
        JSON.stringify({
          error: { message: 'Service unavailable', binding: envKey },
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
