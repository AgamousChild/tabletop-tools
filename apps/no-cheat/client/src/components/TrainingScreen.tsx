import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { RoiResult } from '../lib/cv/pipeline'
import type { Roi } from '../lib/cv/isolate'
import { createTrainedPipeline } from '../lib/cv/trainedPipeline'
import { extractFeatures } from '../lib/cv/features'
import { classifyKnn } from '../lib/cv/knnClassifier'
import type { TrainingExample } from '../lib/cv/knnClassifier'
import { rgbaToGray } from '../lib/cv/background'
import {
  addExample,
  getExamples,
  getStats,
  updateStats,
  clearAll,
} from '../lib/store/trainingStore'
import type { StoredExample, TrainingStats as TrainingStatsType } from '../lib/store/trainingStore'
import { TrainingRoiCard } from './TrainingRoiCard'
import { TrainingStats } from './TrainingStats'

type Props = {
  diceSet: { id: string; name: string }
  onBack: () => void
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
  | { name: 'background' }
  | { name: 'training'; frozen: boolean; rois: DetectedRoi[] }

const STABLE_FRAMES = 20
const COOLDOWN_FRAMES = 10

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

export function TrainingScreen({ diceSet, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: 'background' })
  const [error, setError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  // Training data state
  const [examples, setExamples] = useState<StoredExample[]>([])
  const [stats, setStats] = useState<TrainingStatsType | null>(null)

  const pipeline = useMemo(() => createTrainedPipeline(diceSet.id), [diceSet.id])

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const stableCountRef = useRef(0)
  const cooldownRef = useRef(0)
  const lastDiceCountRef = useRef(0)
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
      // Feed existing examples to the pipeline
      pipeline.setExamples(
        storedExamples.map((e) => ({ features: e.features, label: e.label })),
      )
    }
    load()
  }, [diceSet.id, pipeline])

  // Start camera stream
  useEffect(() => {
    let stream: MediaStream | null = null

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          setCameraReady(true)
        }
      })
      .catch(() => setError('Camera unavailable. Please grant camera permission.'))

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function getFrame(): { imageData: ImageData; canvas: HTMLCanvasElement } | null {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return { imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), canvas }
  }

  function handleCaptureBackground() {
    const frame = getFrame()
    if (!frame) return
    pipeline.captureBackground(frame.imageData.data, frame.canvas.width, frame.canvas.height)
    setPhase({ name: 'training', frozen: false, rois: [] })
  }

  // Training loop - continuous frame processing
  useEffect(() => {
    if (phase.name !== 'training' || phase.frozen) return

    function processLoop() {
      const p = phaseRef.current
      if (p.name !== 'training' || p.frozen) return

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

      const currentCount = results.length

      if (cooldownRef.current > 0) {
        if (currentCount === 0) {
          cooldownRef.current--
        }
      } else if (currentCount === 0) {
        stableCountRef.current = 0
        lastDiceCountRef.current = 0
      } else if (currentCount === lastDiceCountRef.current) {
        stableCountRef.current++
        if (stableCountRef.current >= STABLE_FRAMES) {
          // Stable! Freeze and extract ROIs
          const frameGray = rgbaToGray(
            frame.imageData.data,
            frame.canvas.width,
            frame.canvas.height,
          )

          const currentExamples = examplesRef.current
          const trainingExamples: TrainingExample[] = currentExamples.map((e) => ({
            features: e.features,
            label: e.label,
          }))

          const detectedRois: DetectedRoi[] = results.map((r) => {
            const roiGray = extractSubImage(
              frameGray,
              frame.canvas.width,
              r.roi.x,
              r.roi.y,
              r.roi.width,
              r.roi.height,
            )
            const features = extractFeatures(roiGray, r.roi.width, r.roi.height)
            const knnResult = classifyKnn(features, trainingExamples)

            return {
              roi: r.roi,
              roiGray,
              roiWidth: r.roi.width,
              roiHeight: r.roi.height,
              guess: knnResult ? knnResult.label : r.pipCount,
              confidence: knnResult ? knnResult.confidence : 0,
              selectedLabel: null,
              skipped: false,
            }
          })

          setPhase({ name: 'training', frozen: true, rois: detectedRois })
          stableCountRef.current = 0
          cooldownRef.current = COOLDOWN_FRAMES
          return // Stop the loop — frozen
        }
      } else {
        stableCountRef.current = 0
        lastDiceCountRef.current = currentCount
      }

      rafRef.current = requestAnimationFrame(processLoop)
    }

    rafRef.current = requestAnimationFrame(processLoop)

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [phase.name, phase.name === 'training' ? (phase as Extract<Phase, { name: 'training' }>).frozen : false, pipeline])

  function handleCorrect(index: number, label: number) {
    if (phase.name !== 'training' || !phase.frozen) return
    const newRois = [...phase.rois]
    newRois[index] = { ...newRois[index]!, selectedLabel: label, skipped: false }
    setPhase({ name: 'training', frozen: true, rois: newRois })
  }

  function handleSkip(index: number) {
    if (phase.name !== 'training' || !phase.frozen) return
    const newRois = [...phase.rois]
    newRois[index] = { ...newRois[index]!, skipped: true, selectedLabel: null }
    setPhase({ name: 'training', frozen: true, rois: newRois })
  }

  const handleSaveAll = useCallback(async () => {
    if (phase.name !== 'training' || !phase.frozen) return

    const roisToSave = phase.rois.filter((r) => r.selectedLabel !== null && !r.skipped)
    if (roisToSave.length === 0) {
      // Nothing to save — just unfreeze
      setPhase({ name: 'training', frozen: false, rois: [] })
      return
    }

    // Track stats
    let totalGuesses = stats?.totalGuesses ?? 0
    let correctGuesses = stats?.correctGuesses ?? 0
    let corrections = stats?.corrections ?? 0

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

    // Reload examples and feed to pipeline
    const updatedExamples = await getExamples(diceSet.id)
    setExamples(updatedExamples)
    pipeline.setExamples(
      updatedExamples.map((e) => ({ features: e.features, label: e.label })),
    )

    // Unfreeze
    setPhase({ name: 'training', frozen: false, rois: [] })
  }, [phase, stats, diceSet.id, pipeline])

  function handleSkipAll() {
    setPhase({ name: 'training', frozen: false, rois: [] })
  }

  const handleClear = useCallback(async () => {
    await clearAll(diceSet.id)
    setExamples([])
    setStats(null)
    pipeline.setExamples([])
  }, [diceSet.id, pipeline])

  // Compute stats for TrainingStats component
  const exampleCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const e of examples) {
      counts.set(e.label, (counts.get(e.label) ?? 0) + 1)
    }
    return counts
  }, [examples])

  const statsForComponent = stats
    ? { totalGuesses: stats.totalGuesses, correctGuesses: stats.correctGuesses, corrections: stats.corrections }
    : null

  // Determine if "Save All" should be enabled
  const allRoisHandled =
    phase.name === 'training' &&
    phase.frozen &&
    phase.rois.length > 0 &&
    phase.rois.every((r) => r.selectedLabel !== null || r.skipped)

  const hasAnySave =
    phase.name === 'training' &&
    phase.frozen &&
    phase.rois.some((r) => r.selectedLabel !== null && !r.skipped)

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-sm" aria-label="Back">
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
          <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-sm" aria-label="Back">
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-slate-100">{diceSet.name}</h2>
          <span className="ml-auto text-sm text-slate-400">Training</span>
        </div>

        {/* Camera feed */}
        <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          {phase.name === 'training' && phase.frozen && (
            <div className="absolute inset-0 border-4 border-amber-400 rounded-lg pointer-events-none animate-pulse" />
          )}
        </div>

        {/* Phase content */}
        {phase.name === 'background' && (
          <div className="space-y-3">
            <h3 className="text-slate-100 font-semibold text-center">Capture Background</h3>
            <p className="text-slate-400 text-sm text-center">
              Point camera at your rolling surface. Remove all dice from the area.
            </p>
            <button
              onClick={handleCaptureBackground}
              disabled={!cameraReady}
              className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold text-lg hover:bg-amber-300 transition-colors disabled:opacity-50"
            >
              Capture Background
            </button>
          </div>
        )}

        {phase.name === 'training' && !phase.frozen && (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm text-center">
              Waiting for dice to stabilize... Roll dice into the frame.
            </p>
          </div>
        )}

        {phase.name === 'training' && phase.frozen && phase.rois.length > 0 && (
          <div className="space-y-3">
            <p className="text-slate-100 font-semibold text-center">
              {phase.rois.length} {phase.rois.length === 1 ? 'die' : 'dice'} detected — label each face
            </p>

            {/* ROI cards */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {phase.rois.map((roi, i) => (
                <TrainingRoiCard
                  key={i}
                  roiGray={roi.roiGray}
                  roiWidth={roi.roiWidth}
                  roiHeight={roi.roiHeight}
                  guess={roi.guess}
                  confidence={roi.confidence}
                  onCorrect={(label) => handleCorrect(i, label)}
                  onSkip={() => handleSkip(i)}
                />
              ))}
            </div>

            {/* Save / Skip buttons */}
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
        />
      </div>
    </div>
  )
}
