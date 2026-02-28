import { useState, useEffect, useCallback } from 'react'
import { HelpTip } from '@tabletop-tools/ui'
import { Dashboard } from './pages/Dashboard'
import { FactionDetail } from './pages/FactionDetail'
import { PlayerRanking } from './pages/PlayerRanking'
import { PlayerProfile } from './pages/PlayerProfile'
import { SourceData } from './pages/SourceData'
import { TournamentDetail } from './pages/TournamentDetail'
import { Admin } from './pages/Admin'

type Page =
  | { id: 'dashboard' }
  | { id: 'faction'; faction: string }
  | { id: 'players' }
  | { id: 'player'; playerId: string }
  | { id: 'source' }
  | { id: 'tournament'; importId: string }
  | { id: 'admin' }

function parseHash(hash: string): Page {
  if (hash.startsWith('#/faction/')) {
    return { id: 'faction', faction: decodeURIComponent(hash.slice('#/faction/'.length)) }
  }
  if (hash.startsWith('#/player/')) {
    const playerId = hash.slice('#/player/'.length)
    if (playerId) return { id: 'player', playerId }
    return { id: 'players' }
  }
  if (hash === '#/players') return { id: 'players' }
  if (hash.startsWith('#/tournament/')) {
    return { id: 'tournament', importId: hash.slice('#/tournament/'.length) }
  }
  if (hash === '#/source') return { id: 'source' }
  if (hash === '#/admin') return { id: 'admin' }
  return { id: 'dashboard' }
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
  const [page, setPage] = useState<Page>(() => parseHash(window.location.hash))

  const onHashChange = useCallback(() => {
    setPage(parseHash(window.location.hash))
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
        <a href="/" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors" title="Back to Home">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
          </svg>
          Home
        </a>
        <a href="/" className="text-amber-400 font-bold text-sm tracking-wider hover:text-amber-300 transition-colors">NEW META</a>
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

      <p className="text-[10px] text-slate-500 px-6 pt-2">Win rates, matchups, and Glicko-2 player ratings from GT+ tournament results.<HelpTip text="All data is sourced from imported tournament CSVs and completed in-app tournaments" /></p>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {page.id === 'dashboard' && (
          <Dashboard onFactionSelect={(faction) => navigate(`#/faction/${encodeURIComponent(faction)}`)} />
        )}
        {page.id === 'faction' && (
          <FactionDetail
            faction={page.faction}
            onBack={() => navigate('#/')}
          />
        )}
        {page.id === 'players' && (
          <PlayerRanking onPlayerSelect={(id) => navigate(`#/player/${id}`)} />
        )}
        {page.id === 'player' && (
          <PlayerProfile
            playerId={page.playerId}
            onBack={() => navigate('#/players')}
          />
        )}
        {page.id === 'source' && (
          <SourceData
            onTournamentSelect={(importId) => navigate(`#/tournament/${importId}`)}
          />
        )}
        {page.id === 'tournament' && (
          <TournamentDetail
            importId={page.importId}
            onBack={() => navigate('#/source')}
          />
        )}
        {page.id === 'admin' && <Admin />}
      </main>
    </div>
  )
}
