import { useState } from 'react'
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

const NAV: { id: Page['id']; label: string }[] = [
  { id: 'dashboard', label: 'Meta' },
  { id: 'players',   label: 'Players' },
  { id: 'source',    label: 'Source Data' },
  { id: 'admin',     label: 'Admin' },
]

export default function App() {
  const [page, setPage] = useState<Page>({ id: 'dashboard' })

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
          <button
            key={nav.id}
            onClick={() => setPage({ id: nav.id } as Page)}
            className={`text-sm ${
              activeNav === nav.id
                ? 'text-slate-100 font-medium'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            {nav.label}
          </button>
        ))}
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {page.id === 'dashboard' && (
          <Dashboard onFactionSelect={(faction) => setPage({ id: 'faction', faction })} />
        )}
        {page.id === 'faction' && (
          <FactionDetail
            faction={page.faction}
            onBack={() => setPage({ id: 'dashboard' })}
          />
        )}
        {page.id === 'players' && <PlayerRanking />}
        {page.id === 'source' && (
          <SourceData
            onTournamentSelect={(importId) => setPage({ id: 'tournament', importId })}
          />
        )}
        {page.id === 'tournament' && (
          <TournamentDetail
            importId={page.importId}
            onBack={() => setPage({ id: 'source' })}
          />
        )}
        {page.id === 'admin' && <Admin />}
      </main>
    </div>
  )
}
