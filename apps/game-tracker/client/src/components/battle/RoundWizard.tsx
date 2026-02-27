import { useState } from 'react'
import type { Stratagem } from '@tabletop-tools/game-data-store'
import type { SecondaryMission } from './SecondaryPicker'
import type { TurnData } from './types'
import { createEmptyTurnData } from './types'
import { TurnFlow } from './TurnFlow'
import { RoundSummary } from './RoundSummary'

type Step = 'your-turn' | 'their-turn' | 'summary'

type AvailableUnit = {
  contentId: string
  name: string
}

type Props = {
  roundNumber: number
  opponentName: string
  requirePhotos: boolean
  yourSecondaries: SecondaryMission[]
  theirSecondaries: SecondaryMission[]
  onAddSecondary: (player: 'YOUR' | 'THEIRS', name: string) => void
  onRemoveSecondary: (id: string) => void
  onScoreSecondary: (id: string, roundNumber: number, vp: number) => void
  onSave: (yourTurn: TurnData, theirTurn: TurnData) => void
  isSaving: boolean
  whoGoesFirst: 'YOU' | 'THEM' | null
  yourStratagems?: Stratagem[]
  theirStratagems?: Stratagem[]
  yourArmyUnits?: AvailableUnit[]
  opponentArmyUnits?: AvailableUnit[]
  availableSecondaries?: Array<{ id: string; name: string }>
}

export function RoundWizard({
  roundNumber,
  opponentName,
  requirePhotos,
  yourSecondaries,
  theirSecondaries,
  onAddSecondary,
  onRemoveSecondary,
  onScoreSecondary,
  onSave,
  isSaving,
  whoGoesFirst,
  yourStratagems,
  theirStratagems,
  yourArmyUnits,
  opponentArmyUnits,
  availableSecondaries,
}: Props) {
  const [step, setStep] = useState<Step>(
    whoGoesFirst === 'THEM' ? 'their-turn' : 'your-turn',
  )
  const [yourTurn, setYourTurn] = useState<TurnData>(createEmptyTurnData())
  const [theirTurn, setTheirTurn] = useState<TurnData>(createEmptyTurnData())

  const firstPlayer = whoGoesFirst === 'THEM' ? 'their-turn' : 'your-turn'
  const secondPlayer = whoGoesFirst === 'THEM' ? 'your-turn' : 'their-turn'

  function handleFirstTurnComplete() {
    setStep(secondPlayer as Step)
  }

  function handleSecondTurnComplete() {
    setStep('summary')
  }

  if (step === 'your-turn') {
    return (
      <TurnFlow
        key="your-turn"
        player="You"
        turnData={yourTurn}
        onUpdate={(data) => setYourTurn((prev) => ({ ...prev, ...data }))}
        onComplete={step === firstPlayer ? handleFirstTurnComplete : handleSecondTurnComplete}
        requirePhotos={requirePhotos}
        secondaries={yourSecondaries}
        onAddSecondary={(name) => onAddSecondary('YOUR', name)}
        onRemoveSecondary={onRemoveSecondary}
        onScoreSecondary={onScoreSecondary}
        currentRound={roundNumber}
        availableStratagems={yourStratagems}
        availableUnits={opponentArmyUnits}
        availableSecondaries={availableSecondaries}
      />
    )
  }

  if (step === 'their-turn') {
    return (
      <TurnFlow
        key="their-turn"
        player={opponentName}
        turnData={theirTurn}
        onUpdate={(data) => setTheirTurn((prev) => ({ ...prev, ...data }))}
        onComplete={step === firstPlayer ? handleFirstTurnComplete : handleSecondTurnComplete}
        requirePhotos={requirePhotos}
        secondaries={theirSecondaries}
        onAddSecondary={(name) => onAddSecondary('THEIRS', name)}
        onRemoveSecondary={onRemoveSecondary}
        onScoreSecondary={onScoreSecondary}
        currentRound={roundNumber}
        availableStratagems={theirStratagems}
        availableUnits={yourArmyUnits}
        availableSecondaries={availableSecondaries}
      />
    )
  }

  return (
    <RoundSummary
      roundNumber={roundNumber}
      yourTurn={yourTurn}
      theirTurn={theirTurn}
      opponentName={opponentName}
      onConfirm={() => onSave(yourTurn, theirTurn)}
      onBack={() => setStep(secondPlayer as Step)}
      isSaving={isSaving}
    />
  )
}
