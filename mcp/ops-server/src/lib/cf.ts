/**
 * Cloudflare cache purge, shared by every deploy path.
 *
 * A deploy is NOT done until the cache is purged. A new Worker isolate starts
 * with empty module-scope state, but the CDN in front of it keeps serving the
 * old response — so `wrangler deploy` exits 0 and the site is still stale.
 * That is how new-meta sat on pre-fix code showing 3 games where the fixed code
 * returns 1,449.
 *
 * Lived only inside brain-ops before this; the app Workers had no purge at all.
 */
export interface PurgeResult {
  ok: boolean
  message: string
}

export async function purgeCloudflareCache(): Promise<PurgeResult> {
  const zone = process.env.CLOUDFLARE_ZONE_ID ?? process.env.CF_ZONE_ID
  const token = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_FULL_API_TOKEN
  if (!zone || !token) {
    return {
      ok: false,
      message:
        'CLOUDFLARE_ZONE_ID (or CF_ZONE_ID) and CLOUDFLARE_API_TOKEN required — without them the ' +
        'deploy completes but the CDN keeps serving the old response.',
    }
  }
  const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ purge_everything: true }),
  })
  const body = (await resp.json().catch(() => ({}))) as { success?: boolean }
  return {
    ok: resp.ok && !!body.success,
    message: resp.ok && body.success ? 'purged' : `HTTP ${resp.status} ${JSON.stringify(body)}`,
  }
}
