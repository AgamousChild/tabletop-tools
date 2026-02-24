import { useState, useEffect, useCallback } from 'react'
import { Dashboard } from './pages/Dashboard'
import { FactionDetail } from './pages/FactionDetail'
import { PlayerRanking } from './pages/PlayerRanking'
import { SourceData } from './pages/SourceData'
import { TournamentDetail } from './pages/TournamentDetail'
import { Admin } from './pages/Admin'

type Page =
  | { id: 'dashboard' }
  | { id: 'faction'; faction: string }
  | { id: 'players' }
  | { id: 'source' }
  | { id: 'tournament'; importId: string }
  | { id: 'admin' }

function parseHash(hash: string): Page {
  if (hash.startsWith('#/faction/')) {
    return { id: 'faction', faction: decodeURIComponent(hash.slice('#/faction/'.length)) }
  }
  if (hash.startsWith('#/player/') || hash === '#/players') {
    return { id: 'players' }
  }
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
      : page.id

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="border-b border-slate-800 px-6 py-3 flex items-center gap-6">
        <span className="text-amber-400 font-bold text-sm tracking-wider">NEW META</span>
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
        {page.id === 'players' && <PlayerRanking />}
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
