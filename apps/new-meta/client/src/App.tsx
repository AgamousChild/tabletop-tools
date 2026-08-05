import { HelpTip } from '@tabletop-tools/ui'
import { useCallback, useEffect, useState } from 'react'

import { Admin } from './pages/Admin'
import { Dashboard } from './pages/Dashboard'
import { FactionDetail } from './pages/FactionDetail'
import { PlayerProfile } from './pages/PlayerProfile'
import { PlayerRanking } from './pages/PlayerRanking'
import { SourceData } from './pages/SourceData'
import { TournamentDetail } from './pages/TournamentDetail'

type Page =
  | { id: 'dashboard' }
  | { id: 'faction'; faction: string }
  | { id: 'players' }
  | { id: 'player'; playerId: string }
  | { id: 'source' }
  | { id: 'tournament'; importId: string }
  | { id: 'admin' }

/**
 * The meta window and granularity the user picked, alongside the page.
 *
 * These used to live in Dashboard's own useState, which meant navigating to a
 * faction page unmounted the component holding them and the detail page queried
 * with no frame at all — so it silently fell back to the server's default frame
 * and showed all-time data next to a dashboard scoped to one quarter. The URL
 * owns them now, which also makes a scoped faction page shareable.
 */
interface Route {
  page: Page
  frame?: string
  granularityId?: number
}

function parsePath(path: string): Page {
  if (path.startsWith('#/faction/')) {
    return { id: 'faction', faction: decodeURIComponent(path.slice('#/faction/'.length)) }
  }
  if (path.startsWith('#/player/')) {
    const playerId = path.slice('#/player/'.length)
    if (playerId) return { id: 'player', playerId }
    return { id: 'players' }
  }
  if (path === '#/players') return { id: 'players' }
  if (path.startsWith('#/tournament/')) {
    return { id: 'tournament', importId: path.slice('#/tournament/'.length) }
  }
  if (path === '#/source') return { id: 'source' }
  if (path === '#/admin') return { id: 'admin' }
  return { id: 'dashboard' }
}

function parseHash(hash: string): Route {
  const queryAt = hash.indexOf('?')
  const path = queryAt === -1 ? hash : hash.slice(0, queryAt)
  const params = new URLSearchParams(queryAt === -1 ? '' : hash.slice(queryAt + 1))

  const frame = params.get('frame') ?? undefined
  const rawGranularity = params.get('g')
  const granularityId =
    rawGranularity && Number.isFinite(Number(rawGranularity)) ? Number(rawGranularity) : undefined

  return { page: parsePath(path), frame, granularityId }
}

/** Build a hash that carries the current meta window forward to the next page. */
export function buildHash(path: string, frame?: string, granularityId?: number): string {
  const params = new URLSearchParams()
  if (frame) params.set('frame', frame)
  if (granularityId != null) params.set('g', String(granularityId))
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export function navigate(hash: string) {
  window.location.hash = hash
}

const NAV: { hash: string; id: Page['id']; label: string }[] = [
  { hash: '#/', id: 'dashboard', label: 'Meta' },
  { hash: '#/players', id: 'players', label: 'Players' },
  { hash: '#/source', id: 'source', label: 'Source Data' },
  { hash: '#/admin', id: 'admin', label: 'Admin' },
]

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const { page, frame, granularityId } = route

  const onHashChange = useCallback(() => {
    setRoute(parseHash(window.location.hash))
  }, [])

  useEffect(() => {
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [onHashChange])

  const activeNav = ['faction', 'dashboard'].includes(page.id)
    ? 'dashboard'
    : page.id === 'tournament'
      ? 'source'
      : page.id === 'player'
        ? 'players'
        : page.id

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="border-b border-slate-800 px-6 py-3 flex items-center gap-6">
        <a
          href="/"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          title="Back to Home"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              fillRule="evenodd"
              d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
              clipRule="evenodd"
            />
          </svg>
          Home
        </a>
        <a
          href="/"
          className="text-amber-400 font-bold text-sm tracking-wider hover:text-amber-300 transition-colors"
        >
          NEW META
        </a>
        {NAV.map((nav) => (
          <a
            key={nav.id}
            href={nav.hash}
            className={`text-sm ${
              activeNav === nav.id
                ? 'text-slate-100 font-medium'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            {nav.label}
          </a>
        ))}
      </nav>

      <p className="text-[10px] text-slate-500 px-6 pt-2">
        Win rates, matchups, and Glicko-2 player ratings from GT+ tournament results.
        <HelpTip text="All data is sourced from imported tournament CSVs and completed in-app tournaments" />
      </p>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {page.id === 'dashboard' && (
          <Dashboard
            frame={frame}
            granularityId={granularityId}
            onFrameChange={(next) => navigate(buildHash('#/', next, granularityId))}
            onGranularityChange={(next) => navigate(buildHash('#/', frame, next))}
            onFactionSelect={(factionId) =>
              navigate(
                buildHash(`#/faction/${encodeURIComponent(factionId)}`, frame, granularityId),
              )
            }
          />
        )}
        {page.id === 'faction' && (
          <FactionDetail
            factionId={page.faction}
            frame={frame}
            granularityId={granularityId}
            onBack={() => navigate(buildHash('#/', frame, granularityId))}
          />
        )}
        {page.id === 'players' && (
          <PlayerRanking onPlayerSelect={(id) => navigate(`#/player/${id}`)} />
        )}
        {page.id === 'player' && (
          <PlayerProfile playerId={page.playerId} onBack={() => navigate('#/players')} />
        )}
        {page.id === 'source' && (
          <SourceData onTournamentSelect={(eventId) => navigate(`#/tournament/${eventId}`)} />
        )}
        {page.id === 'tournament' && (
          <TournamentDetail importId={page.importId} onBack={() => navigate('#/source')} />
        )}
        {page.id === 'admin' && <Admin />}
      </main>
    </div>
  )
}
