import { AuthScreen } from '@tabletop-tools/ui'
import { GameTrackerScreen } from './components/GameTrackerScreen'
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
    return <AuthScreen title="Game Tracker" subtitle="40K match companion" authClient={authClient} onAuthenticated={() => void refetch()} />
  }

  return <GameTrackerScreen onSignOut={() => void refetch()} />
}
