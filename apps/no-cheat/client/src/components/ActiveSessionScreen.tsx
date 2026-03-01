import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { RoiResult } from '../lib/cv/pipeline'
import type { Roi } from '../lib/cv/isolate'
import { createTrainedPipeline } from '../lib/cv/trainedPipeline'
import { extractFeatures } from '../lib/cv/features'
import { classifyKnn } from '../lib/cv/knnClassifier'
import type { TrainingExample } from '../lib/cv/knnClassifier'
import { addExample, getExamples } from '../lib/store/trainingStore'
import { rgbaToGray } from '../lib/cv/background'
import { detectPips } from '../lib/cv/blobDetector'
import { HelpTip } from '@tabletop-tools/ui'
import { trpc } from '../lib/trpc'
import { CalibrationWizard } from './CalibrationWizard'
import { Camera } from './Camera'
import { DiceCheckCard } from './DiceCheckCard'
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

type DiceCheckCandidate = {
  roi: Roi
  roiGray: Uint8Array
  roiWidth: number
  roiHeight: number
  bestPip: number | null
  features: number[]
  dismissed: boolean
}

type RecordingSubPhase =
  | { name: 'detecting' }
  | { name: 'confirming'; lockedResults: RoiResult[]; samples: (number | null)[][]; startTime: number }
  | { name: 'dice_check'; candidates: DiceCheckCandidate[] }

const WINDOW_SIZE = 15
const STABILITY_RATIO = 0.6
const COOLDOWN_FRAMES = 10
const CONFIRM_DURATION = 2000
const CONFIRM_INTERVAL = 250
const DICE_CHECK_AUTO_CONFIRM = 5000

function extractSubImage(
  gray: Uint8Array,
  imgWidth: number,
  x: number,
  y: number,
  w: number,
  h: number,
): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      out[row * w + col] = gray[(y + row) * imgWidth + (x + col)]!
    }
  }
  return out
}

function modeValue(values: (number | null)[]): number | null {
  const freq = new Map<number, number>()
  for (const v of values) {
    if (v !== null) freq.set(v, (freq.get(v) ?? 0) + 1)
  }
  let best: number | null = null, bestCount = 0
  for (const [val, count] of freq) {
    if (count > bestCount) { best = val; bestCount = count }
  }
  return best
}

export function ActiveSessionScreen({ diceSet, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: 'starting' })
  const [subPhase, setSubPhase] = useState<RecordingSubPhase>({ name: 'detecting' })
  const [error, setError] = useState<string | null>(null)
  const [detectedCount, setDetectedCount] = useState(0)
  const [confirmProgress, setConfirmProgress] = useState(0)
  const [lastCapture, setLastCapture] = useState<{ pips: number[]; time: number } | null>(null)
  const [undoFeedback, setUndoFeedback] = useState<string | null>(null)

  const pipeline = useMemo(() => createTrainedPipeline(diceSet.id), [diceSet.id])

  // Load training examples from IDB on mount
  const trainingExamplesRef = useRef<TrainingExample[]>([])
  useEffect(() => {
    getExamples(diceSet.id).then((examples) => {
      if (examples.length > 0) {
        pipeline.setExamples(examples.map((e) => ({ features: e.features, label: e.label })))
        trainingExamplesRef.current = examples.map((e) => ({ features: e.features, label: e.label }))
      }
    })
  }, [diceSet.id, pipeline])

  // Refs for the recording loop
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const recentCountsRef = useRef<number[]>([])
  const cooldownRef = useRef(0)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const subPhaseRef = useRef(subPhase)
  subPhaseRef.current = subPhase

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
    setSubPhase({ name: 'detecting' })
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

  // Helper: get current frame from video
  function getFrame(): { imageData: ImageData; w: number; h: number } | null {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null

    const w = video.videoWidth || 320
    const h = video.videoHeight || 240
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, w, h)

    if (!pipeline.state.ready || pipeline.state.width !== w || pipeline.state.height !== h) {
      pipeline.captureBackground(new Uint8ClampedArray(w * h * 4), w, h)
    }

    return { imageData: ctx.getImageData(0, 0, w, h), w, h }
  }

  // Camera stream — starts when entering recording, stops when leaving
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

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [phase.name])

  // --- Sub-phase 1: Detecting loop ---
  useEffect(() => {
    if (phase.name !== 'recording' || subPhase.name !== 'detecting') return

    function processLoop() {
      if (subPhaseRef.current.name !== 'detecting') return

      const frame = getFrame()
      if (!frame) {
        rafRef.current = requestAnimationFrame(processLoop)
        return
      }

      const results = pipeline.processFrame(frame.imageData.data, frame.w, frame.h)

      // Draw overlay: bounding boxes with pip values
      const overlay = overlayRef.current
      if (overlay) {
        overlay.width = frame.w
        overlay.height = frame.h
        const overlayCtx = overlay.getContext('2d')!
        overlayCtx.clearRect(0, 0, frame.w, frame.h)

        for (const r of results) {
          const pip = r.pipCount ?? '?'
          overlayCtx.strokeStyle = '#fbbf24' // amber-400
          overlayCtx.lineWidth = 2
          overlayCtx.strokeRect(r.roi.x, r.roi.y, r.roi.width, r.roi.height)
          overlayCtx.fillStyle = '#fbbf24'
          overlayCtx.font = 'bold 16px monospace'
          overlayCtx.textAlign = 'center'
          overlayCtx.fillText(String(pip), r.roi.x + r.roi.width / 2, r.roi.y - 4)
        }
      }

      setDetectedCount(results.length)
      const currentCount = results.length

      if (cooldownRef.current > 0) {
        if (currentCount === 0) cooldownRef.current--
      } else if (currentCount === 0) {
        recentCountsRef.current = []
      } else {
        const counts = recentCountsRef.current
        counts.push(currentCount)
        if (counts.length > WINDOW_SIZE) counts.shift()

        if (counts.length >= WINDOW_SIZE) {
          const freq = new Map<number, number>()
          for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1)
          let modeVal = 0, modeCount = 0
          for (const [val, count] of freq) {
            if (count > modeCount) { modeVal = val; modeCount = count }
          }

          if (modeCount / WINDOW_SIZE >= STABILITY_RATIO && currentCount === modeVal) {
            // Stable → enter confirming sub-phase
            const initialSamples = results.map((r) => [r.pipCount])
            recentCountsRef.current = []
            setSubPhase({
              name: 'confirming',
              lockedResults: results,
              samples: initialSamples,
              startTime: Date.now(),
            })
            return
          }
        }
      }

      rafRef.current = requestAnimationFrame(processLoop)
    }

    rafRef.current = requestAnimationFrame(processLoop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase.name, subPhase.name, pipeline])

  // --- Sub-phase 2: Confirming loop (locked boxes, sample every 250ms for 2s) ---
  useEffect(() => {
    if (phase.name !== 'recording' || subPhase.name !== 'confirming') return

    const lockedResults = subPhase.lockedResults
    const startTime = subPhase.startTime
    const samples = subPhase.samples.map((s) => [...s])
    let lastSampleTime = Date.now()

    function confirmLoop() {
      if (subPhaseRef.current.name !== 'confirming') return

      // Draw locked overlay
      const overlay = overlayRef.current
      const frame = getFrame()
      if (overlay && frame) {
        overlay.width = frame.w
        overlay.height = frame.h
        const ctx = overlay.getContext('2d')!
        ctx.clearRect(0, 0, frame.w, frame.h)

        for (let i = 0; i < lockedResults.length; i++) {
          const r = lockedResults[i]!
          const bestPip = modeValue(samples[i]!) ?? r.pipCount ?? '?'
          ctx.strokeStyle = '#34d399' // emerald-400
          ctx.lineWidth = 3
          ctx.strokeRect(r.roi.x, r.roi.y, r.roi.width, r.roi.height)
          ctx.fillStyle = '#34d399'
          ctx.font = 'bold 16px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(String(bestPip), r.roi.x + r.roi.width / 2, r.roi.y - 4)
        }
      }

      const now = Date.now()
      const elapsed = now - startTime

      setConfirmProgress(Math.min(1, elapsed / CONFIRM_DURATION))

      // Sample every 250ms
      if (frame && now - lastSampleTime >= CONFIRM_INTERVAL) {
        lastSampleTime = now
        const frameGray = rgbaToGray(frame.imageData.data, frame.w, frame.h)
        for (let i = 0; i < lockedResults.length; i++) {
          const r = lockedResults[i]!
          const roiGray = extractSubImage(frameGray, frame.w, r.roi.x, r.roi.y, r.roi.width, r.roi.height)
          const pip = detectPips(roiGray, r.roi.width, r.roi.height)
          samples[i]!.push(pip)
        }
      }

      // After 2 seconds → build candidates for dice check
      if (elapsed >= CONFIRM_DURATION) {
        const frameForSnapshot = getFrame()
        const frameGray = frameForSnapshot
          ? rgbaToGray(frameForSnapshot.imageData.data, frameForSnapshot.w, frameForSnapshot.h)
          : null

        const candidates: DiceCheckCandidate[] = lockedResults.map((r, i) => {
          const bestPip = modeValue(samples[i]!)
          const imgWidth = frameForSnapshot?.w ?? pipeline.state.width
          const roiGray = frameGray
            ? extractSubImage(frameGray, imgWidth, r.roi.x, r.roi.y, r.roi.width, r.roi.height)
            : new Uint8Array(r.roi.width * r.roi.height)
          const features = extractFeatures(roiGray, r.roi.width, r.roi.height)

          // Auto-dismiss if kNN classifies as "not a die" (label 0)
          const knnResult = classifyKnn(features, trainingExamplesRef.current)
          const autoDismissed = knnResult !== null && knnResult.label === 0 && knnResult.confidence >= 0.6

          return {
            roi: r.roi,
            roiGray,
            roiWidth: r.roi.width,
            roiHeight: r.roi.height,
            bestPip,
            features,
            dismissed: autoDismissed,
          }
        })

        setConfirmProgress(0)
        setSubPhase({ name: 'dice_check', candidates })
        return
      }

      rafRef.current = requestAnimationFrame(confirmLoop)
    }

    rafRef.current = requestAnimationFrame(confirmLoop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase.name, subPhase.name, pipeline])

  // --- Sub-phase 3: Dice check handlers ---
  function handleToggleDismiss(index: number) {
    setSubPhase((prev) => {
      if (prev.name !== 'dice_check') return prev
      const newCandidates = [...prev.candidates]
      newCandidates[index] = { ...newCandidates[index]!, dismissed: !newCandidates[index]!.dismissed }
      return { name: 'dice_check', candidates: newCandidates }
    })
  }

  const handleConfirmDice = useCallback(async () => {
    const sp = subPhaseRef.current
    if (sp.name !== 'dice_check') return

    // Save dismissed candidates as negative examples (label 0)
    for (const candidate of sp.candidates) {
      if (candidate.dismissed) {
        await addExample({
          diceSetId: diceSet.id,
          label: 0,
          features: candidate.features,
          roiGray: candidate.roiGray,
          roiWidth: candidate.roiWidth,
          roiHeight: candidate.roiHeight,
        })
      }
    }

    // Reload training examples to include new negatives
    const updatedExamples = await getExamples(diceSet.id)
    pipeline.setExamples(updatedExamples.map((e) => ({ features: e.features, label: e.label })))
    trainingExamplesRef.current = updatedExamples.map((e) => ({ features: e.features, label: e.label }))

    const keptCandidates = sp.candidates.filter((c) => !c.dismissed)

    if (keptCandidates.length === 0) {
      // All dismissed — go back to detecting
      cooldownRef.current = COOLDOWN_FRAMES
      setSubPhase({ name: 'detecting' })
      return
    }

    // Submit the roll with the confirmed dice
    const pipValues = keptCandidates.map((c) => c.bestPip ?? 1)
    cooldownRef.current = COOLDOWN_FRAMES
    setSubPhase({ name: 'detecting' })
    submitRoll(pipValues)
  }, [diceSet.id, pipeline, submitRoll])

  // Auto-confirm dice check after timeout
  useEffect(() => {
    if (phase.name !== 'recording' || subPhase.name !== 'dice_check') return

    const timer = setTimeout(() => {
      handleConfirmDice()
    }, DICE_CHECK_AUTO_CONFIRM)

    return () => clearTimeout(timer)
  }, [phase.name, subPhase.name, handleConfirmDice])

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
        <p className="text-slate-400">Starting session...</p>
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
        <p className="text-slate-400">Analyzing {phase.rollCount} rolls...</p>
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
            <p className="text-center text-slate-400 text-sm">Uploading...</p>
          )}
        </div>
      </div>
    )
  }

  // phase === 'recording'
  const isConfirming = subPhase.name === 'confirming'
  const isDiceCheck = subPhase.name === 'dice_check'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{diceSet.name}</h2>
            <p className="text-sm text-slate-400">
              {isConfirming
                ? 'Locking dice...'
                : isDiceCheck
                  ? 'Confirm dice'
                  : detectedCount > 0
                    ? `${detectedCount} ${detectedCount === 1 ? 'die' : 'dice'} detected`
                    : 'Hands-free \u2014 roll dice to record'}
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
          {isConfirming && (
            <div className="absolute inset-0 border-4 border-emerald-400 rounded-lg pointer-events-none" />
          )}
          {isDiceCheck && (
            <div className="absolute inset-0 border-4 border-amber-400 rounded-lg pointer-events-none" />
          )}
        </div>

        {/* Confirming progress bar */}
        {isConfirming && (
          <div className="space-y-2">
            <p className="text-emerald-400 text-sm text-center font-semibold">
              Locking in {subPhase.lockedResults.length} {subPhase.lockedResults.length === 1 ? 'die' : 'dice'}...
            </p>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-200"
                style={{ width: `${confirmProgress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Dice check UI */}
        {isDiceCheck && (
          <div className="space-y-3">
            <p className="text-slate-100 font-semibold text-center">
              {subPhase.candidates.filter((c) => !c.dismissed).length} of {subPhase.candidates.length} detections — tap to dismiss non-dice
            </p>

            <div className="grid grid-cols-3 gap-2">
              {subPhase.candidates.map((candidate, i) => (
                <DiceCheckCard
                  key={i}
                  roiGray={candidate.roiGray}
                  roiWidth={candidate.roiWidth}
                  roiHeight={candidate.roiHeight}
                  pipGuess={candidate.bestPip}
                  dismissed={candidate.dismissed}
                  onToggle={() => handleToggleDismiss(i)}
                />
              ))}
            </div>

            <button
              onClick={handleConfirmDice}
              className="w-full py-3 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-colors"
            >
              Confirm {subPhase.candidates.filter((c) => !c.dismissed).length} dice
            </button>

            <p className="text-[10px] text-slate-500 text-center">Auto-confirms in 5 seconds</p>
          </div>
        )}

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
              {undoMutation.isPending ? 'Undoing...' : 'Undo'}
            </button>
          </div>
        )}

        {undoFeedback && (
          <p className="text-center text-amber-400 text-xs">{undoFeedback}</p>
        )}

        {addRollMutation.isPending && (
          <p className="text-center text-slate-400 text-sm">Recording roll...</p>
        )}
      </div>
    </div>
  )
}
