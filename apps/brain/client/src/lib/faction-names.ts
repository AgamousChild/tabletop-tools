/**
 * Faction display name mapping.
 * Fetches display names from the brain server's faction nodes on first use.
 * Falls back to slug-to-uppercase conversion while loading or if fetch fails.
 */

const API_BASE = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'

/** Server-sourced faction display names: factionId slug -> display name */
const serverFactionNames = new Map<string, string>()
/** Server-sourced subfaction display names: lowercase subfaction -> display name */
const serverSubfactionNames = new Map<string, string>()

let fetchStarted = false

/**
 * Kick off a background fetch of faction display names from the server.
 * Safe to call multiple times — only fetches once.
 */
export function initFactionNames(): void {
  if (fetchStarted) return
  fetchStarted = true

  fetch(`${API_BASE}/browse/nodes?layer=factions&pageSize=100`)
    .then((res) => (res.ok ? res.json() : null))
    .then(
      (
        data: {
          nodes: Array<{ factionId?: string; factionName?: string; subfaction?: string }>
        } | null,
      ) => {
        if (!data?.nodes) return
        for (const node of data.nodes) {
          if (node.factionId && node.factionName) {
            serverFactionNames.set(node.factionId, node.factionName)
          }
          if (node.subfaction && node.factionName) {
            serverSubfactionNames.set(node.subfaction.toLowerCase(), node.factionName)
          }
        }
      },
    )
    .catch(() => {
      // Silently fall back to slug-based names
    })
}

/** Convert a faction slug or name to the preferred ALL CAPS display name */
export function factionDisplayName(slugOrName: string): string {
  if (!slugOrName) return ''

  // Ensure fetch is started on first use
  initFactionNames()

  // Check server-sourced faction names (by slug)
  const fromServer = serverFactionNames.get(slugOrName)
  if (fromServer) return fromServer

  // Check server-sourced subfaction names (by lowercase name)
  const fromSub = serverSubfactionNames.get(slugOrName.toLowerCase())
  if (fromSub) return fromSub

  // Fallback: already looks like a display name (has spaces, no hyphens)
  if (slugOrName.includes(' ') && !slugOrName.includes('-')) return slugOrName.toUpperCase()

  // Fallback: unknown slug — best effort
  return slugOrName.replace(/-/g, ' ').toUpperCase()
}
