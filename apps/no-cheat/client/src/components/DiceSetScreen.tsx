import { useState } from 'react'

import { authClient } from '../lib/auth'
import { trpc } from '../lib/trpc'
import { ActiveSessionScreen } from './ActiveSessionScreen'
import { CreateDiceSetForm } from './CreateDiceSetForm'
import { DiceSetDetailScreen } from './DiceSetDetailScreen'
import { DiceSetList } from './DiceSetList'
import { SessionDetailScreen } from './SessionDetailScreen'

type DiceSet = { id: string; name: string }

type Screen =
  | { name: 'list' }
  | { name: 'detail'; diceSet: DiceSet }
  | { name: 'session'; diceSet: DiceSet }
  | { name: 'sessionDetail'; diceSet: DiceSet; sessionId: string }

type Props = {
  onSignOut: () => void
}

export function DiceSetScreen({ onSignOut }: Props) {
  const [screen, setScreen] = useState<Screen>({ name: 'list' })
  const { data: diceSets = [], refetch } = trpc.diceSet.list.useQuery()
  const createMutation = trpc.diceSet.create.useMutation({
    onSuccess: () => refetch(),
  })

  async function handleSignOut() {
    await authClient.signOut()
    onSignOut()
  }

  if (screen.name === 'session') {
    return (
      <ActiveSessionScreen
        diceSet={screen.diceSet}
        onDone={() => setScreen({ name: 'detail', diceSet: screen.diceSet })}
      />
    )
  }

  if (screen.name === 'sessionDetail') {
    return (
      <SessionDetailScreen
        sessionId={screen.sessionId}
        onBack={() => setScreen({ name: 'detail', diceSet: screen.diceSet })}
      />
    )
  }

  if (screen.name === 'detail') {
    return (
      <DiceSetDetailScreen
        diceSet={screen.diceSet}
        onBack={() => setScreen({ name: 'list' })}
        onStartSession={() => setScreen({ name: 'session', diceSet: screen.diceSet })}
        onSelectSession={(sessionId) =>
          setScreen({ name: 'sessionDetail', diceSet: screen.diceSet, sessionId })
        }
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-amber-400">no-cheat</h1>
          <button
            onClick={handleSignOut}
            className="text-slate-400 hover:text-slate-100 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>

        <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-3">
          Your Dice Sets
        </h2>

        <DiceSetList
          diceSets={diceSets}
          onSelect={(ds) => setScreen({ name: 'detail', diceSet: ds })}
        />

        <div className="mt-6">
          <CreateDiceSetForm onCreate={(name) => createMutation.mutate({ name })} />
          {createMutation.error && (
            <p className="text-red-400 text-sm mt-2">{createMutation.error.message}</p>
          )}
        </div>
      </div>
    </div>
  )
}
