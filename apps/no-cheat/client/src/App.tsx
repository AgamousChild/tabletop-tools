import { AuthScreen } from '@tabletop-tools/ui'
import { DiceSetScreen } from './components/DiceSetScreen'
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
    return <AuthScreen title="NoCheat" subtitle="Dice integrity for tabletop wargamers" authClient={authClient} onAuthenticated={() => refetch()} />
  }

  return <DiceSetScreen onSignOut={() => refetch()} />
}
