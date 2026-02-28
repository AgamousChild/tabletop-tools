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
  const deleteDiceSet = trpc.diceSet.delete.useMutation({
    onSuccess: () => void refetch(),
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
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors" title="Back to Home">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
              </svg>
              Home
            </a>
            <a href="/" className="text-2xl font-bold text-amber-400 hover:text-amber-300 transition-colors">no-cheat</a>
          </div>
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
        <p className="text-xs text-slate-500 mb-4">
          Select a dice set to view its sessions and start recording, or create a new set below.
        </p>

        <DiceSetList
          diceSets={diceSets}
          onSelect={(ds) => setScreen({ name: 'detail', diceSet: ds })}
          onDelete={(ds) => deleteDiceSet.mutate({ id: ds.id })}
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
