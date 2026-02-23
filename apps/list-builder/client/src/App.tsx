import { authClient } from './lib/auth'
import { AuthScreen } from './components/AuthScreen'
import { ListBuilderScreen } from './components/ListBuilderScreen'

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
    return <AuthScreen onAuthenticated={() => void refetch()} />
  }

  return <ListBuilderScreen onSignOut={() => void refetch()} />
}
