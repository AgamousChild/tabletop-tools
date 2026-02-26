import { useState } from 'react'
import type { SecondaryMission } from './SecondaryPicker'
import type { TurnData } from './types'
import { CommandPhaseScreen } from './CommandPhaseScreen'
import { ActionPhaseScreen } from './ActionPhaseScreen'
import { PhotoCaptureScreen } from './PhotoCaptureScreen'

type Phase = 'command' | 'action' | 'photo'

type Props = {
  player: 'You' | string
  turnData: TurnData
  onUpdate: (data: Partial<TurnData>) => void
  onComplete: () => void
  requirePhotos: boolean
  secondaries: SecondaryMission[]
  onAddSecondary: (name: string) => void
  onRemoveSecondary: (id: string) => void
  onScoreSecondary: (id: string, roundNumber: number, vp: number) => void
  currentRound: number
}

export function TurnFlow({
  player,
  turnData,
  onUpdate,
  onComplete,
  requirePhotos,
  secondaries,
  onAddSecondary,
  onRemoveSecondary,
  onScoreSecondary,
  currentRound,
}: Props) {
  const [phase, setPhase] = useState<Phase>('command')

  if (phase === 'command') {
    return (
      <CommandPhaseScreen
        player={player}
        turnData={turnData}
        onUpdate={onUpdate}
        onNext={() => setPhase('action')}
        secondaries={secondaries}
        onAddSecondary={onAddSecondary}
        onRemoveSecondary={onRemoveSecondary}
        onScoreSecondary={onScoreSecondary}
        currentRound={currentRound}
      />
    )
  }

  if (phase === 'action') {
    return (
      <ActionPhaseScreen
        player={player}
        turnData={turnData}
        onUpdate={onUpdate}
        onNext={() => {
          if (requirePhotos) {
            setPhase('photo')
          } else {
            onComplete()
          }
        }}
      />
    )
  }

  return (
    <PhotoCaptureScreen
      onCapture={(dataUrl) => {
        onUpdate({ photoDataUrl: dataUrl })
        onComplete()
      }}
      required={requirePhotos}
      label={player === 'You' ? 'Your Board Photo' : `${player}'s Board Photo`}
    />
  )
}
