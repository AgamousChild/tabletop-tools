import { AuthScreen } from '@tabletop-tools/ui'
import { SimulatorScreen } from './components/SimulatorScreen'
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
    return <AuthScreen title="Versus" subtitle="40K combat simulator" authClient={authClient} onAuthenticated={() => refetch()} />
  }

  return <SimulatorScreen onSignOut={() => refetch()} />
}
