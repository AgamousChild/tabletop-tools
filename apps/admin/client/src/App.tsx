import { useState } from 'react'
import { AuthScreen } from '@tabletop-tools/ui'
import { authClient } from './lib/auth'
import { Dashboard } from './pages/Dashboard'
import { UsersPage } from './pages/UsersPage'
import { SessionsPage } from './pages/SessionsPage'
import { ActivityPage } from './pages/ActivityPage'
import { ImportsPage } from './pages/ImportsPage'

type Page = 'dashboard' | 'users' | 'sessions' | 'activity' | 'imports'

const NAV: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'activity', label: 'Activity' },
  { id: 'imports', label: 'Imports' },
]

export default function App() {
  const { data: session, isPending, refetch } = authClient.useSession()
  const [page, setPage] = useState<Page>('dashboard')

  if (isPending) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return <AuthScreen title="Admin Dashboard" authClient={authClient} onAuthenticated={() => refetch()} />
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="border-b border-slate-800 px-6 py-3 flex items-center gap-6">
        <a href="/" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors" title="Back to Home">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
          </svg>
          Home
        </a>
        <a href="/" className="text-amber-400 font-bold text-sm tracking-wider hover:text-amber-300 transition-colors">ADMIN</a>
        {NAV.map((nav) => (
          <button
            key={nav.id}
            onClick={() => setPage(nav.id)}
            className={`text-sm ${
              page === nav.id
                ? 'text-slate-100 font-medium'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            {nav.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-slate-400">{session.user.name}</span>
          <button
            onClick={() => authClient.signOut().then(() => refetch())}
            className="text-sm text-slate-500 hover:text-slate-300"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {page === 'dashboard' && <Dashboard />}
        {page === 'users' && <UsersPage />}
        {page === 'sessions' && <SessionsPage />}
        {page === 'activity' && <ActivityPage />}
        {page === 'imports' && <ImportsPage />}
      </main>
    </div>
  )
}
