import { AuthScreen } from '@tabletop-tools/ui'
import { TournamentScreen } from './components/TournamentScreen'
import { authClient } from './lib/auth'

export default function App() {
  const { data: session, isPending, refetch } = authClient.useSession()

  if (isPending) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <AuthScreen title="Tournament" subtitle="Run events. Play Swiss. Track ELO." authClient={authClient} onAuthenticated={() => void refetch()} />
  }

  return <TournamentScreen onSignOut={() => void refetch()} />
}
