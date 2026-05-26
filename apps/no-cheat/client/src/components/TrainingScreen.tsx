import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { rgbaToGray } from '../lib/cv/background'
import { detectPips } from '../lib/cv/blobDetector'
import { extractFeatures } from '../lib/cv/features'
import type { Roi } from '../lib/cv/isolate'
import type { TrainingExample } from '../lib/cv/knnClassifier'
import { classifyKnn } from '../lib/cv/knnClassifier'
import type { RoiResult } from '../lib/cv/pipeline'
import { DEFAULT_CONFIG } from '../lib/cv/pipeline'
import { createTrainedPipeline } from '../lib/cv/trainedPipeline'
import { getMainCamera } from '../lib/getMainCamera'
import type { StoredExample, TrainingStats as TrainingStatsType } from '../lib/store/trainingStore'
import {
  addExample,
  clearAll,
  getExamples,
  getStats,
  updateStats,
} from '../lib/store/trainingStore'
import { trpc } from '../lib/trpc'
import { DiceCheckCard } from './DiceCheckCard'
import { TrainingHistory } from './TrainingHistory'
import { TrainingRoiCard } from './TrainingRoiCard'
import { TrainingStats } from './TrainingStats'

type Props = {
  diceSet: { id: string; name: string }
  onBack: () => void
}

type DiceCandidate = {
  roi: Roi
  roiGray: Uint8Array
  roiWidth: number
  roiHeight: number
  bestPip: number | null
  features: number[]
  dismissed: boolean
}

type DetectedRoi = {
  roi: Roi
  roiGray: Uint8Array
  roiWidth: number
  roiHeight: number
  guess: number | null
  confidence: number
  selectedLabel: number | null
  skipped: boolean
}

type Phase =
  | { name: 'detecting' }
  | {
      name: 'confirming'
      lockedResults: RoiResult[]
      samples: (number | null)[][]
      startTime: number
    }
  | { name: 'dice_check'; candidates: DiceCandidate[] }
  | { name: 'labeling'; rois: DetectedRoi[] }

const WINDOW_SIZE = 10
const STABILITY_RATIO = 0.4
const COOLDOWN_FRAMES = 8
const CONFIRM_DURATION = 800
const CONFIRM_INTERVAL = 200
const AUTO_LOCK_TIMEOUT = 4000 // ms — auto-lock after this long even if unstable

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

/** Convert Uint8Array to base64 string for server upload. */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/** Find the most common value in an array (mode). Returns null for empty arrays. */
function mode(values: (number | null)[]): number | null {
  const freq = new Map<number, number>()
  for (const v of values) {
    if (v !== null) freq.set(v, (freq.get(v) ?? 0) + 1)
  }
  let best: number | null = null,
    bestCount = 0
  for (const [val, count] of freq) {
    if (count > bestCount) {
      best = val
      bestCount = count
    }
  }
  return best
}

export function TrainingScreen({ diceSet, onBack }: Props) {
  const [showHistory, setShowHistory] = useState(false)
  const [phase, setPhase] = useState<Phase>({ name: 'detecting' })
  const [error, setError] = useState<string | null>(null)
  const [detectedCount, setDetectedCount] = useState(0)
  const [confirmProgress, setConfirmProgress] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [contrast, setContrast] = useState(DEFAULT_CONFIG.contrast)
  const [centerCrop, setCenterCrop] = useState(DEFAULT_CONFIG.centerCrop)

  // Training data state
  const [examples, setExamples] = useState<StoredExample[]>([])
  const [stats, setStats] = useState<TrainingStatsType | null>(null)

  const pipeline = useMemo(() => createTrainedPipeline(diceSet.id), [diceSet.id])
  const saveToServer = trpc.training.saveExamples.useMutation()

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const recentCountsRef = useRef<number[]>([])
  const cooldownRef = useRef(0)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const examplesRef = useRef(examples)
  examplesRef.current = examples

  // Load existing examples and stats on mount
  useEffect(() => {
    async function load() {
      const [storedExamples, storedStats] = await Promise.all([
        getExamples(diceSet.id),
        getStats(diceSet.id),
      ])
      setExamples(storedExamples)
      setStats(storedStats)
      pipeline.setExamples(storedExamples.map((e) => ({ features: e.features, label: e.label })))
    }
    load()
  }, [diceSet.id, pipeline])

  // Start camera stream and auto-ready the pipeline
  useEffect(() => {
    let stream: MediaStream | null = null

    getMainCamera()
      .then((s) => {
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          const video = videoRef.current
          const w = video.videoWidth || 320
          const h = video.videoHeight || 240
          pipeline.captureBackground(new Uint8ClampedArray(w * h * 4), w, h)
        }
      })
      .catch(() => setError('Camera unavailable. Please grant camera permission.'))

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [pipeline])

  function getFrame(): { imageData: ImageData; canvas: HTMLCanvasElement } | null {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    if (
      !pipeline.state.ready ||
      pipeline.state.width !== canvas.width ||
      pipeline.state.height !== canvas.height
    ) {
      pipeline.captureBackground(
        new Uint8ClampedArray(canvas.width * canvas.height * 4),
        canvas.width,
        canvas.height,
      )
    }
    return { imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), canvas }
  }

  // --- Phase 1: Detecting loop ---
  useEffect(() => {
    if (phase.name !== 'detecting') return

    const detectStartTime = Date.now()
    let lastNonZeroResults: RoiResult[] = []

    function processLoop() {
      if (phaseRef.current.name !== 'detecting') return

      const frame = getFrame()
      if (!frame) {
        rafRef.current = requestAnimationFrame(processLoop)
        return
      }

      const results = pipeline.processFrame(
        frame.imageData.data,
        frame.canvas.width,
        frame.canvas.height,
      )

      // Draw live overlay
      const overlay = overlayRef.current
      if (overlay) {
        const w = frame.canvas.width
        const h = frame.canvas.height
        overlay.width = w
        overlay.height = h
        const ctx = overlay.getContext('2d')!
        ctx.clearRect(0, 0, w, h)
        for (const r of results) {
          const pip = r.pipCount ?? '?'
          const half = r.roi.width / 2
          ctx.save()
          ctx.translate(r.roi.cx, r.roi.cy)
          ctx.rotate(r.roi.angle)
          ctx.strokeStyle = '#fbbf24'
          ctx.lineWidth = 2
          ctx.strokeRect(-half, -half, r.roi.width, r.roi.width)
          ctx.fillStyle = '#fbbf24'
          ctx.font = 'bold 16px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(String(pip), 0, -half - 4)
          ctx.restore()
        }
      }

      setDetectedCount(results.length)
      const currentCount = results.length

      if (currentCount > 0) lastNonZeroResults = results

      if (cooldownRef.current > 0) {
        if (currentCount === 0) cooldownRef.current--
      } else {
        // Include all frames (including zeros) in the sliding window so
        // intermittent frame drops don't reset stability progress.
        const counts = recentCountsRef.current
        counts.push(currentCount)
        if (counts.length > WINDOW_SIZE) counts.shift()

        let shouldLock = false

        if (counts.length >= WINDOW_SIZE) {
          // Find mode of non-zero counts (ignore empty frames)
          const freq = new Map<number, number>()
          for (const c of counts) {
            if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1)
          }
          let modeVal = 0,
            modeCount = 0
          for (const [val, count] of freq) {
            if (count > modeCount) {
              modeVal = val
              modeCount = count
            }
          }

          if (
            modeVal > 0 &&
            modeCount / WINDOW_SIZE >= STABILITY_RATIO &&
            currentCount === modeVal
          ) {
            shouldLock = true
          }
        }

        // Auto-lock timeout: if we've been detecting long enough and have
        // seen dice at some point, lock with best available results.
        if (
          !shouldLock &&
          lastNonZeroResults.length > 0 &&
          Date.now() - detectStartTime > AUTO_LOCK_TIMEOUT
        ) {
          shouldLock = true
        }

        if (shouldLock) {
          const lockResults = results.length > 0 ? results : lastNonZeroResults
          if (lockResults.length > 0) {
            const initialSamples = lockResults.map((r) => [r.pipCount])
            recentCountsRef.current = []
            setPhase({
              name: 'confirming',
              lockedResults: lockResults,
              samples: initialSamples,
              startTime: Date.now(),
            })
            return
          }
        }

        // Reset if no dice seen in the entire window
        if (currentCount === 0 && lastNonZeroResults.length === 0) {
          recentCountsRef.current = []
        }
      }

      rafRef.current = requestAnimationFrame(processLoop)
    }

    rafRef.current = requestAnimationFrame(processLoop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase.name, pipeline])

  // --- Phase 2: Confirming loop (locked boxes, sample every 250ms for 2s) ---
  useEffect(() => {
    if (phase.name !== 'confirming') return

    const lockedResults = phase.lockedResults
    const startTime = phase.startTime
    const samples = phase.samples.map((s) => [...s])
    let lastSampleTime = Date.now()

    function confirmLoop() {
      if (phaseRef.current.name !== 'confirming') return

      // Draw locked overlay (fixed positions, every frame for smooth display)
      const overlay = overlayRef.current
      const frame = getFrame()
      if (overlay && frame) {
        const w = frame.canvas.width
        const h = frame.canvas.height
        overlay.width = w
        overlay.height = h
        const ctx = overlay.getContext('2d')!
        ctx.clearRect(0, 0, w, h)

        for (let i = 0; i < lockedResults.length; i++) {
          const r = lockedResults[i]!
          const bestPip = mode(samples[i]!) ?? r.pipCount ?? '?'
          const half = r.roi.width / 2
          ctx.save()
          ctx.translate(r.roi.cx, r.roi.cy)
          ctx.rotate(r.roi.angle)
          ctx.strokeStyle = '#34d399' // emerald-400
          ctx.lineWidth = 3
          ctx.strokeRect(-half, -half, r.roi.width, r.roi.width)
          ctx.fillStyle = '#34d399'
          ctx.font = 'bold 16px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(String(bestPip), 0, -half - 4)
          ctx.restore()
        }
      }

      const now = Date.now()
      const elapsed = now - startTime

      // Update progress
      setConfirmProgress(Math.min(1, elapsed / CONFIRM_DURATION))

      // Sample every 250ms
      if (frame && now - lastSampleTime >= CONFIRM_INTERVAL) {
        lastSampleTime = now
        const frameGray = rgbaToGray(frame.imageData.data, frame.canvas.width, frame.canvas.height)
        for (let i = 0; i < lockedResults.length; i++) {
          const r = lockedResults[i]!
          const roiGray = extractSubImage(
            frameGray,
            frame.canvas.width,
            r.roi.x,
            r.roi.y,
            r.roi.width,
            r.roi.height,
          )
          const pip = detectPips(roiGray, r.roi.width, r.roi.height)
          samples[i]!.push(pip)
        }
      }

      // After 2 seconds → build candidates for dice check
      if (elapsed >= CONFIRM_DURATION) {
        const frameForSnapshot = getFrame()
        const frameGray = frameForSnapshot
          ? rgbaToGray(
              frameForSnapshot.imageData.data,
              frameForSnapshot.canvas.width,
              frameForSnapshot.canvas.height,
            )
          : null

        const currentExamples = examplesRef.current
        const trainingExamples: TrainingExample[] = currentExamples.map((e) => ({
          features: e.features,
          label: e.label,
        }))

        const candidates: DiceCandidate[] = lockedResults.map((r, i) => {
          const bestPip = mode(samples[i]!)
          const imgWidth = frameForSnapshot?.canvas.width ?? pipeline.state.width
          const roiGray = frameGray
            ? extractSubImage(frameGray, imgWidth, r.roi.x, r.roi.y, r.roi.width, r.roi.height)
            : new Uint8Array(r.roi.width * r.roi.height)
          const features = extractFeatures(roiGray, r.roi.width, r.roi.height)

          // Auto-dismiss if kNN classifies as "not a die" (label 0)
          const knnResult = classifyKnn(features, trainingExamples)
          const autoDismissed =
            knnResult !== null && knnResult.label === 0 && knnResult.confidence >= 0.6

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
        cooldownRef.current = COOLDOWN_FRAMES
        setPhase({ name: 'dice_check', candidates })
        return
      }

      rafRef.current = requestAnimationFrame(confirmLoop)
    }

    rafRef.current = requestAnimationFrame(confirmLoop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase.name, pipeline])

  // --- Phase 3: Dice check handlers ---
  function handleToggleDismiss(index: number) {
    setPhase((prev) => {
      if (prev.name !== 'dice_check') return prev
      const newCandidates = [...prev.candidates]
      newCandidates[index] = {
        ...newCandidates[index]!,
        dismissed: !newCandidates[index]!.dismissed,
      }
      return { name: 'dice_check', candidates: newCandidates }
    })
  }

  const handleConfirmDice = useCallback(async () => {
    if (phase.name !== 'dice_check') return

    const currentExamples = examplesRef.current
    const trainingExamples: TrainingExample[] = currentExamples.map((e) => ({
      features: e.features,
      label: e.label,
    }))

    // Save dismissed candidates as negative examples (label 0)
    const dismissedServerExamples: Array<{
      label: number
      guess: number | null
      confidence: number | null
      features: number[]
      imageBase64: string
    }> = []

    for (const candidate of phase.candidates) {
      if (candidate.dismissed) {
        await addExample({
          diceSetId: diceSet.id,
          label: 0, // "not a die"
          features: candidate.features,
          roiGray: candidate.roiGray,
          roiWidth: candidate.roiWidth,
          roiHeight: candidate.roiHeight,
        })
        dismissedServerExamples.push({
          label: 0,
          guess: candidate.bestPip,
          confidence: null,
          features: candidate.features,
          imageBase64: uint8ToBase64(candidate.roiGray),
        })
      }
    }

    // Sync dismissed (false positive) examples to server
    if (dismissedServerExamples.length > 0) {
      saveToServer.mutate(
        { diceSetId: diceSet.id, examples: dismissedServerExamples },
        { onError: (err) => console.warn('[training sync] Server save failed:', err.message) },
      )
    }

    // Build DetectedRois from kept candidates
    const keptCandidates = phase.candidates.filter((c) => !c.dismissed)

    if (keptCandidates.length === 0) {
      // All dismissed — reload examples and go back to detecting
      const updatedExamples = await getExamples(diceSet.id)
      setExamples(updatedExamples)
      pipeline.setExamples(updatedExamples.map((e) => ({ features: e.features, label: e.label })))
      setPhase({ name: 'detecting' })
      return
    }

    const detectedRois: DetectedRoi[] = keptCandidates.map((c) => {
      const knnResult = classifyKnn(c.features, trainingExamples)
      // Use bestPip (from direct detection) as primary guess — it's more accurate
      // kNN confidence is used for border color only
      const knnConfidence = knnResult && knnResult.label > 0 ? knnResult.confidence : 0

      return {
        roi: c.roi,
        roiGray: c.roiGray,
        roiWidth: c.roiWidth,
        roiHeight: c.roiHeight,
        guess: c.bestPip,
        confidence: knnConfidence,
        selectedLabel: null,
        skipped: false,
      }
    })

    // Reload examples (in case negatives were added)
    const updatedExamples = await getExamples(diceSet.id)
    setExamples(updatedExamples)
    pipeline.setExamples(updatedExamples.map((e) => ({ features: e.features, label: e.label })))

    setPhase({ name: 'labeling', rois: detectedRois })
  }, [phase, diceSet.id, pipeline, saveToServer])

  // --- Phase 4: Labeling handlers ---
  function handleCorrect(index: number, label: number) {
    setPhase((prev) => {
      if (prev.name !== 'labeling') return prev
      const newRois = [...prev.rois]
      newRois[index] = { ...newRois[index]!, selectedLabel: label, skipped: false }
      return { name: 'labeling', rois: newRois }
    })
  }

  function handleSkip(index: number) {
    setPhase((prev) => {
      if (prev.name !== 'labeling') return prev
      const newRois = [...prev.rois]
      newRois[index] = { ...newRois[index]!, skipped: true, selectedLabel: null }
      return { name: 'labeling', rois: newRois }
    })
  }

  const handleSaveAll = useCallback(async () => {
    if (phase.name !== 'labeling') return

    const roisToSave = phase.rois.filter((r) => r.selectedLabel !== null && !r.skipped)
    if (roisToSave.length === 0) {
      setPhase({ name: 'detecting' })
      return
    }

    let totalGuesses = stats?.totalGuesses ?? 0
    let correctGuesses = stats?.correctGuesses ?? 0
    let corrections = stats?.corrections ?? 0

    const serverExamples: Array<{
      label: number
      guess: number | null
      confidence: number | null
      features: number[]
      imageBase64: string
    }> = []

    for (const roi of roisToSave) {
      const features = extractFeatures(roi.roiGray, roi.roiWidth, roi.roiHeight)
      await addExample({
        diceSetId: diceSet.id,
        label: roi.selectedLabel!,
        features,
        roiGray: roi.roiGray,
        roiWidth: roi.roiWidth,
        roiHeight: roi.roiHeight,
      })

      // Collect for server sync
      const imageBase64 = uint8ToBase64(roi.roiGray)
      serverExamples.push({
        label: roi.selectedLabel!,
        guess: roi.guess,
        confidence: roi.confidence,
        features,
        imageBase64,
      })

      totalGuesses++
      if (roi.guess === roi.selectedLabel) {
        correctGuesses++
      } else {
        corrections++
      }
    }

    const newStats: TrainingStatsType = {
      diceSetId: diceSet.id,
      totalGuesses,
      correctGuesses,
      corrections,
      lastTrainedAt: Date.now(),
    }
    await updateStats(newStats)
    setStats(newStats)

    const updatedExamples = await getExamples(diceSet.id)
    setExamples(updatedExamples)
    pipeline.setExamples(updatedExamples.map((e) => ({ features: e.features, label: e.label })))

    // Non-blocking server sync
    saveToServer.mutate(
      { diceSetId: diceSet.id, examples: serverExamples },
      { onError: (err) => console.warn('[training sync] Server save failed:', err.message) },
    )

    setPhase({ name: 'detecting' })
  }, [phase, stats, diceSet.id, pipeline, saveToServer])

  function handleSkipAll() {
    setPhase({ name: 'detecting' })
  }

  const handleClear = useCallback(async () => {
    await clearAll(diceSet.id)
    setExamples([])
    setStats(null)
    pipeline.setExamples([])
  }, [diceSet.id, pipeline])

  const exampleCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const e of examples) {
      counts.set(e.label, (counts.get(e.label) ?? 0) + 1)
    }
    return counts
  }, [examples])

  const statsForComponent = stats
    ? {
        totalGuesses: stats.totalGuesses,
        correctGuesses: stats.correctGuesses,
        corrections: stats.corrections,
      }
    : null

  const allRoisHandled =
    phase.name === 'labeling' &&
    phase.rois.length > 0 &&
    phase.rois.every((r) => r.selectedLabel !== null || r.skipped)

  if (showHistory) {
    return <TrainingHistory diceSetId={diceSet.id} onBack={() => setShowHistory(false)} />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-400 hover:text-slate-200 text-sm"
              aria-label="Back"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-slate-100">{diceSet.name}</h2>
          </div>
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-slate-200 text-sm"
            aria-label="Back"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-slate-100">{diceSet.name}</h2>
          <span className="ml-auto text-sm text-slate-400">Training</span>
        </div>

        {/* Settings toggle */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            aria-label="Detection settings"
          >
            {showSettings ? 'Hide Settings' : 'Settings'}
          </button>
        </div>

        {showSettings && (
          <div className="bg-slate-900 rounded-lg p-3 space-y-3 border border-slate-800">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Detection Settings
            </p>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Contrast Sensitivity</label>
                <span className="text-xs text-slate-500 font-mono">{contrast}</span>
              </div>
              <input
                type="range"
                min={3}
                max={25}
                step={1}
                value={contrast}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setContrast(v)
                  pipeline.setConfig({ contrast: v })
                }}
                className="w-full accent-amber-400"
              />
              <p className="text-[10px] text-slate-600">
                Lower = more sensitive (catches faint dice). Higher = fewer false detections.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Edge Crop</label>
                <span className="text-xs text-slate-500 font-mono">
                  {Math.round(centerCrop * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={30}
                step={5}
                value={centerCrop * 100}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100
                  setCenterCrop(v)
                  pipeline.setConfig({ centerCrop: v })
                }}
                className="w-full accent-amber-400"
              />
              <p className="text-[10px] text-slate-600">
                Trims edges before pip counting. Higher = ignores more table bleed.
              </p>
            </div>

            <button
              onClick={() => {
                setContrast(DEFAULT_CONFIG.contrast)
                setCenterCrop(DEFAULT_CONFIG.centerCrop)
                pipeline.setConfig({ ...DEFAULT_CONFIG })
              }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Reset to defaults
            </button>
          </div>
        )}

        {/* Camera feed */}
        <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-square">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          {phase.name === 'confirming' && (
            <div className="absolute inset-0 border-4 border-emerald-400 rounded-lg pointer-events-none" />
          )}
          {phase.name === 'dice_check' && (
            <div className="absolute inset-0 border-4 border-amber-400 rounded-lg pointer-events-none" />
          )}
          {phase.name === 'labeling' && (
            <div className="absolute inset-0 border-4 border-amber-400 rounded-lg pointer-events-none" />
          )}
        </div>

        {/* Confirming progress bar */}
        {phase.name === 'confirming' && (
          <div className="space-y-2">
            <p className="text-emerald-400 text-sm text-center font-semibold">
              Locking in {phase.lockedResults.length}{' '}
              {phase.lockedResults.length === 1 ? 'die' : 'dice'}...
            </p>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-200"
                style={{ width: `${confirmProgress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Detecting status */}
        {phase.name === 'detecting' && (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm text-center">
              {detectedCount > 0
                ? `${detectedCount} ${detectedCount === 1 ? 'die' : 'dice'} detected — hold steady...`
                : 'Roll dice into the frame.'}
            </p>
          </div>
        )}

        {/* Dice check UI */}
        {phase.name === 'dice_check' && (
          <div className="space-y-3">
            <p className="text-slate-100 font-semibold text-center">
              {phase.candidates.filter((c) => !c.dismissed).length} of {phase.candidates.length}{' '}
              detections — tap to dismiss non-dice
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {phase.candidates.map((candidate, i) => (
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

            <div className="flex gap-2">
              <button
                onClick={() => setPhase({ name: 'detecting' })}
                className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors font-semibold"
              >
                Reset
              </button>
              <button
                onClick={handleConfirmDice}
                className="flex-1 py-3 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-colors"
              >
                Confirm {phase.candidates.filter((c) => !c.dismissed).length} dice
              </button>
            </div>
          </div>
        )}

        {/* Labeling UI */}
        {phase.name === 'labeling' && phase.rois.length > 0 && (
          <div className="space-y-3">
            <p className="text-slate-100 font-semibold text-center">
              {phase.rois.length} {phase.rois.length === 1 ? 'die' : 'dice'} detected — label each
              face
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {phase.rois.map((roi, i) => (
                <TrainingRoiCard
                  key={i}
                  roiGray={roi.roiGray}
                  roiWidth={roi.roiWidth}
                  roiHeight={roi.roiHeight}
                  guess={roi.guess}
                  confidence={roi.confidence}
                  selectedLabel={roi.selectedLabel}
                  skipped={roi.skipped}
                  onCorrect={(label) => handleCorrect(i, label)}
                  onSkip={() => handleSkip(i)}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSkipAll}
                className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors font-semibold"
              >
                Skip All
              </button>
              <button
                onClick={handleSaveAll}
                disabled={!allRoisHandled}
                className="flex-1 py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors disabled:opacity-50"
              >
                Save All
              </button>
            </div>
          </div>
        )}

        {/* Training stats — always visible */}
        <TrainingStats
          stats={statsForComponent}
          exampleCounts={exampleCounts}
          totalExamples={examples.length}
          onClear={handleClear}
          onViewHistory={() => setShowHistory(true)}
        />
      </div>
    </div>
  )
}
