import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { RoiResult } from '../lib/cv/pipeline'
import { createPipeline } from '../lib/cv/pipeline'
import { HelpTip } from '@tabletop-tools/ui'
import { trpc } from '../lib/trpc'
import { CalibrationWizard } from './CalibrationWizard'
import { Camera } from './Camera'
import { ResultScreen } from './ResultScreen'
import { StatsOverlay } from './StatsOverlay'

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
  | { name: 'calibrating'; sessionId: string }
  | {
      name: 'recording'
      sessionId: string
      rollCount: number
      zScore: number | null
      chiSquared: number | null
      distribution: Map<number, number>
    }
  | { name: 'closing'; sessionId: string; rollCount: number }
  | { name: 'result'; sessionId: string; result: CloseResult }
  | { name: 'evidence'; sessionId: string }

/** How many consecutive stable frames before auto-capturing */
const STABLE_FRAMES = 20 // ~0.7s at 30fps
/** How many empty frames after a capture before allowing next detection */
const COOLDOWN_FRAMES = 10

export function ActiveSessionScreen({ diceSet, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: 'starting' })
  const [error, setError] = useState<string | null>(null)
  const [detectedResults, setDetectedResults] = useState<RoiResult[]>([])
  const [autoCapturing, setAutoCapturing] = useState(false)
  const [lastCapture, setLastCapture] = useState<{ pips: number[]; time: number } | null>(null)
  const [undoFeedback, setUndoFeedback] = useState<string | null>(null)

  const pipeline = useMemo(() => createPipeline(diceSet.id), [diceSet.id])

  // Refs for the recording loop
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const stableCountRef = useRef(0)
  const cooldownRef = useRef(0)
  const lastDiceCountRef = useRef(0)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const startMutation = trpc.session.start.useMutation()
  const addRollMutation = trpc.session.addRoll.useMutation()
  const undoMutation = trpc.session.undoLastRoll.useMutation()
  const closeMutation = trpc.session.close.useMutation()
  const savePhotoMutation = trpc.session.savePhoto.useMutation()

  // Ref to avoid stale closure in animation loop
  const addRollRef = useRef(addRollMutation)
  addRollRef.current = addRollMutation

  useEffect(() => {
    startMutation.mutate(
      { diceSetId: diceSet.id },
      {
        onSuccess: (session) => {
          setPhase({ name: 'calibrating', sessionId: session.id })
        },
        onError: (err) => setError(err.message),
      },
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleCalibrationComplete() {
    if (phaseRef.current.name !== 'calibrating') return
    setPhase({
      name: 'recording',
      sessionId: phaseRef.current.sessionId,
      rollCount: 0,
      zScore: null,
      chiSquared: null,
      distribution: new Map(),
    })
  }

  const submitRoll = useCallback(
    (pipValues: number[]) => {
      const p = phaseRef.current
      if (p.name !== 'recording') return
      if (addRollRef.current.isPending) return

      addRollRef.current.mutate(
        { sessionId: p.sessionId, pipValues },
        {
          onSuccess: ({ rollCount, zScore }) => {
            // Update distribution
            const newDist = new Map(
              (phaseRef.current as Extract<Phase, { name: 'recording' }>).distribution,
            )
            for (const pip of pipValues) {
              newDist.set(pip, (newDist.get(pip) ?? 0) + 1)
            }
            // Compute chi-squared from distribution
            const total = Array.from(newDist.values()).reduce((a, b) => a + b, 0)
            const expected = total / 6
            let chiSq = 0
            for (let i = 1; i <= 6; i++) {
              const obs = newDist.get(i) ?? 0
              chiSq += ((obs - expected) ** 2) / expected
            }

            setPhase({
              name: 'recording',
              sessionId: p.sessionId,
              rollCount,
              zScore,
              chiSquared: chiSq,
              distribution: newDist,
            })
            setAutoCapturing(false)
            setLastCapture({ pips: pipValues, time: Date.now() })
            setUndoFeedback(null)
          },
          onError: (err) => setError(err.message),
        },
      )
    },
    [],
  )

  const handleUndo = useCallback(() => {
    const p = phaseRef.current
    if (p.name !== 'recording' || p.rollCount === 0) return
    if (undoMutation.isPending) return

    undoMutation.mutate(
      { sessionId: p.sessionId },
      {
        onSuccess: ({ rollCount, zScore, removedPips }) => {
          // Rebuild distribution by subtracting removed pips
          const newDist = new Map(
            (phaseRef.current as Extract<Phase, { name: 'recording' }>).distribution,
          )
          for (const pip of removedPips) {
            const count = newDist.get(pip) ?? 0
            if (count <= 1) {
              newDist.delete(pip)
            } else {
              newDist.set(pip, count - 1)
            }
          }
          // Recompute chi-squared
          const total = Array.from(newDist.values()).reduce((a, b) => a + b, 0)
          let chiSq = 0
          if (total > 0) {
            const expected = total / 6
            for (let i = 1; i <= 6; i++) {
              const obs = newDist.get(i) ?? 0
              chiSq += ((obs - expected) ** 2) / expected
            }
          }

          setPhase({
            name: 'recording',
            sessionId: (phaseRef.current as Extract<Phase, { name: 'recording' }>).sessionId,
            rollCount,
            zScore,
            chiSquared: chiSq,
            distribution: newDist,
          })
          setLastCapture(null)
          setUndoFeedback(`Removed roll [${removedPips.join(', ')}]`)
          setTimeout(() => setUndoFeedback(null), 3000)
        },
        onError: (err) => setError(err.message),
      },
    )
  }, [undoMutation])

  // Recording loop — continuous frame processing with auto-capture
  useEffect(() => {
    if (phase.name !== 'recording') return

    let stream: MediaStream | null = null

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
        }
      })
      .catch(() => setError('Camera unavailable'))

    function processLoop() {
      const video = videoRef.current
      const canvas = canvasRef.current
      const overlay = overlayRef.current
      if (!video || !canvas || !overlay) {
        rafRef.current = requestAnimationFrame(processLoop)
        return
      }

      const w = video.videoWidth || 320
      const h = video.videoHeight || 240
      canvas.width = w
      canvas.height = h
      overlay.width = w
      overlay.height = h

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)

      const results = pipeline.processFrame(imageData.data, w, h)
      setDetectedResults(results)

      // Draw overlay: bounding boxes with pip values
      const overlayCtx = overlay.getContext('2d')!
      overlayCtx.clearRect(0, 0, w, h)

      for (const r of results) {
        const cluster = pipeline.state.clusters.find((c) => c.id === r.clusterId)
        const pip = cluster?.pipValue ?? (r.blobCount && r.blobCount > 0 ? r.blobCount : '?')

        // Bounding box
        overlayCtx.strokeStyle = '#34d399' // emerald-400
        overlayCtx.lineWidth = 2
        overlayCtx.strokeRect(r.roi.x, r.roi.y, r.roi.width, r.roi.height)

        // Pip label
        overlayCtx.fillStyle = '#34d399'
        overlayCtx.font = 'bold 16px monospace'
        overlayCtx.textAlign = 'center'
        overlayCtx.fillText(String(pip), r.roi.x + r.roi.width / 2, r.roi.y - 4)
      }

      // Auto-capture logic
      const currentCount = results.length

      if (cooldownRef.current > 0) {
        // In cooldown after a capture — wait for dice to be removed
        if (currentCount === 0) {
          cooldownRef.current--
        }
      } else if (currentCount === 0) {
        // No dice — reset
        stableCountRef.current = 0
        lastDiceCountRef.current = 0
      } else if (currentCount === lastDiceCountRef.current) {
        // Same count — increment stability
        stableCountRef.current++
        if (stableCountRef.current >= STABLE_FRAMES) {
          // Stable! Auto-capture
          const pipValues = results.map((r) => {
            const c = pipeline.state.clusters.find((cl) => cl.id === r.clusterId)
            return c?.pipValue ?? (r.blobCount && r.blobCount > 0 ? r.blobCount : 1)
          })
          setAutoCapturing(true)
          submitRoll(pipValues)
          stableCountRef.current = 0
          cooldownRef.current = COOLDOWN_FRAMES
        }
      } else {
        // Count changed — reset
        stableCountRef.current = 0
        lastDiceCountRef.current = currentCount
      }

      rafRef.current = requestAnimationFrame(processLoop)
    }

    rafRef.current = requestAnimationFrame(processLoop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [phase.name, pipeline, submitRoll])

  function handleDone() {
    if (phase.name !== 'recording') return
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

  if (phase.name === 'calibrating') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={onDone} className="text-slate-400 hover:text-slate-200 text-sm" aria-label="Cancel">
                ← Cancel
              </button>
              <h2 className="text-lg font-semibold text-slate-100">{diceSet.name}</h2>
            </div>
            <span className="text-sm text-slate-400">Calibration</span>
          </div>
          <CalibrationWizard
            pipeline={pipeline}
            diceSetId={diceSet.id}
            onComplete={handleCalibrationComplete}
          />
        </div>
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

  // phase === 'recording'
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{diceSet.name}</h2>
            <p className="text-sm text-slate-400">
              {autoCapturing
                ? 'Capturing roll…'
                : detectedResults.length > 0
                  ? `${detectedResults.length} ${detectedResults.length === 1 ? 'die' : 'dice'} detected`
                  : 'Hands-free — roll dice to record'}
            </p>
          </div>
          <button
            onClick={handleDone}
            disabled={addRollMutation.isPending || phase.rollCount === 0}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors disabled:opacity-50 text-sm"
          >
            End Session
          </button>
        </div>

        <p className="text-[10px] text-slate-500">Roll dice in frame. Auto-captures when stable for ~1 second.<HelpTip text="Remove dice from view between rolls to reset detection" /></p>

        {/* Live camera with overlay */}
        <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          {/* Auto-capture flash indicator */}
          {autoCapturing && (
            <div className="absolute inset-0 border-4 border-emerald-400 rounded-lg pointer-events-none animate-pulse" />
          )}
        </div>

        {/* Real-time stats */}
        <StatsOverlay
          rollCount={phase.rollCount}
          zScore={phase.zScore}
          chiSquared={phase.chiSquared}
          distribution={phase.distribution}
        />

        {/* Last capture + undo */}
        {lastCapture && (
          <div className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2">
            <div className="text-sm">
              <span className="text-slate-400">Last roll: </span>
              <span className="text-emerald-400 font-mono">[{lastCapture.pips.join(', ')}]</span>
            </div>
            <button
              onClick={handleUndo}
              disabled={undoMutation.isPending}
              className="text-xs px-2 py-1 rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50"
            >
              {undoMutation.isPending ? 'Undoing…' : 'Undo'}
            </button>
          </div>
        )}

        {undoFeedback && (
          <p className="text-center text-amber-400 text-xs">{undoFeedback}</p>
        )}

        {addRollMutation.isPending && (
          <p className="text-center text-slate-400 text-sm">Recording roll…</p>
        )}
      </div>
    </div>
  )
}
