import { useState } from 'react'

import { authClient } from '../lib/auth'
import { trpc } from '../lib/trpc'
import { useUnits, useGameFactions } from '../lib/useGameData'
import { SimulationResult } from './SimulationResult'
import { UnitSelector } from './UnitSelector'

type Props = {
  onSignOut: () => void
}

export function SimulatorScreen({ onSignOut }: Props) {
  const [attackerFaction, setAttackerFaction] = useState<string | undefined>()
  const [defenderFaction, setDefenderFaction] = useState<string | undefined>()
  const [attackerQuery, setAttackerQuery] = useState('')
  const [defenderQuery, setDefenderQuery] = useState('')
  const [attackerId, setAttackerId] = useState<string | null>(null)
  const [defenderId, setDefenderId] = useState<string | null>(null)
  const [defenderModelCount] = useState(5)

  const { data: factions = [] } = useGameFactions()

  const { data: attackerUnits = [], isLoading: loadingAttackers } = useUnits({
    faction: attackerFaction,
    name: attackerQuery || undefined,
  })

  const { data: defenderUnits = [], isLoading: loadingDefenders } = useUnits({
    faction: defenderFaction,
    name: defenderQuery || undefined,
  })

  const { data: simResult, isLoading: simLoading } = trpc.simulate.run.useQuery(
    { attackerId: attackerId!, defenderId: defenderId!, defenderModelCount },
    { enabled: !!attackerId && !!defenderId },
  )

  const saveMutation = trpc.simulate.save.useMutation()

  const attackerName =
    attackerUnits.find((u) => u.id === attackerId)?.name ?? attackerId ?? ''
  const defenderName =
    defenderUnits.find((u) => u.id === defenderId)?.name ?? defenderId ?? ''

  async function handleSignOut() {
    await authClient.signOut()
    onSignOut()
  }

  function handleSave() {
    if (!simResult || !attackerId || !defenderId) return
    saveMutation.mutate({
      attackerId,
      attackerName,
      defenderId,
      defenderName,
      result: simResult,
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-amber-400">Versus</h1>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Sign out
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Unit selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UnitSelector
            label="Attacker"
            factions={factions}
            units={attackerUnits}
            selectedUnitId={attackerId}
            isLoadingUnits={loadingAttackers}
            onFactionChange={setAttackerFaction}
            onQueryChange={setAttackerQuery}
            onSelect={setAttackerId}
          />
          <UnitSelector
            label="Defender"
            factions={factions}
            units={defenderUnits}
            selectedUnitId={defenderId}
            isLoadingUnits={loadingDefenders}
            onFactionChange={setDefenderFaction}
            onQueryChange={setDefenderQuery}
            onSelect={setDefenderId}
          />
        </div>

        {/* Run button */}
        <button
          disabled={!attackerId || !defenderId || simLoading}
          className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {simLoading ? 'Calculating…' : 'Run Simulation'}
        </button>

        {/* Result */}
        {simResult && (
          <SimulationResult
            attackerName={attackerName}
            defenderName={defenderName}
            result={simResult}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  )
}
