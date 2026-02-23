import { useEffect, useState } from 'react'

import { trpc } from '../lib/trpc'
import { Camera } from './Camera'
import { ResultScreen } from './ResultScreen'

type DiceSet = { id: string; name: string }

type Props = {
  diceSet: DiceSet
  onDone: () => void
}

type CloseResult = {
  zScore: number
  isLoaded: boolean
  outlierFace: number
  observedRate: number
  rollCount: number
}

type Phase =
  | { name: 'starting' }
  | { name: 'active'; sessionId: string; rollCount: number; zScore: number | null }
  | { name: 'closing'; sessionId: string; rollCount: number }
  | { name: 'result'; sessionId: string; result: CloseResult }
  | { name: 'evidence'; sessionId: string }

export function ActiveSessionScreen({ diceSet, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: 'starting' })
  const [error, setError] = useState<string | null>(null)

  const startMutation = trpc.session.start.useMutation()
  const addRollMutation = trpc.session.addRoll.useMutation()
  const closeMutation = trpc.session.close.useMutation()
  const savePhotoMutation = trpc.session.savePhoto.useMutation()

  useEffect(() => {
    startMutation.mutate(
      { diceSetId: diceSet.id },
      {
        onSuccess: (session) => {
          setPhase({ name: 'active', sessionId: session.id, rollCount: 0, zScore: null })
        },
        onError: (err) => setError(err.message),
      },
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleCapture(pipValues: number[]) {
    if (phase.name !== 'active') return
    const { sessionId } = phase
    addRollMutation.mutate(
      { sessionId, pipValues },
      {
        onSuccess: ({ rollCount, zScore }) => {
          setPhase({ name: 'active', sessionId, rollCount, zScore })
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  function handleDone() {
    if (phase.name !== 'active') return
    const { sessionId, rollCount } = phase
    setPhase({ name: 'closing', sessionId, rollCount })
    closeMutation.mutate(
      { sessionId },
      {
        onSuccess: (result) => {
          setPhase({ name: 'result', sessionId, result })
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  function handleSavePhoto() {
    if (phase.name !== 'result') return
    setPhase({ name: 'evidence', sessionId: phase.sessionId })
  }

  function handleCaptureEvidence(dataUrl: string) {
    if (phase.name !== 'evidence') return
    const imageData = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    savePhotoMutation.mutate(
      { sessionId: phase.sessionId, imageData },
      {
        onSuccess: () => onDone(),
        onError: (err) => setError(err.message),
      },
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <button onClick={onDone} className="text-slate-400 hover:text-slate-100 text-sm">
            ← Back
          </button>
        </div>
      </div>
    )
  }

  if (phase.name === 'starting') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">Starting session…</p>
      </div>
    )
  }

  if (phase.name === 'closing') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">Analyzing {phase.rollCount} rolls…</p>
      </div>
    )
  }

  if (phase.name === 'result') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 flex items-center justify-center">
        <ResultScreen result={phase.result} onSavePhoto={handleSavePhoto} onDismiss={onDone} />
      </div>
    )
  }

  if (phase.name === 'evidence') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
        <div className="max-w-md mx-auto space-y-4">
          <p className="text-slate-300 text-center text-sm">
            Point at the dice and capture your evidence photo.
          </p>
          <Camera
            onCapture={() => {}}
            onCaptureFrame={handleCaptureEvidence}
            captureOnly
            captureLabel="Capture Evidence"
          />
          {savePhotoMutation.isPending && (
            <p className="text-center text-slate-400 text-sm">Uploading…</p>
          )}
        </div>
      </div>
    )
  }

  // phase === 'active'
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{diceSet.name}</h2>
            {phase.rollCount > 0 ? (
              <p className="text-sm text-slate-400">
                {phase.rollCount} {phase.rollCount === 1 ? 'roll' : 'rolls'}
                {phase.zScore !== null && ` · Z: ${phase.zScore.toFixed(2)}`}
              </p>
            ) : (
              <p className="text-sm text-slate-400">Point at a die and capture each roll</p>
            )}
          </div>
          <button
            onClick={handleDone}
            disabled={addRollMutation.isPending || phase.rollCount === 0}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors disabled:opacity-50 text-sm"
          >
            Done
          </button>
        </div>

        <Camera onCapture={handleCapture} diceSetId={diceSet.id} />

        {addRollMutation.isPending && (
          <p className="text-center text-slate-400 text-sm">Recording roll…</p>
        )}
      </div>
    </div>
  )
}
