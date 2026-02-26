import { useEffect, useRef, useState } from 'react'

import type { Cluster } from '../lib/cv/cluster'
import type { Pipeline, RoiResult } from '../lib/cv/pipeline'
import { getClusterSet, saveClusterSet } from '../lib/store/exemplarStore'
import { ClusterLabelingScreen } from './ClusterLabelingScreen'

type Props = {
  pipeline: Pipeline
  diceSetId: string
  onComplete: () => void
}

type Step =
  | { name: 'background' }
  | { name: 'place-dice' }
  | { name: 'label'; clusters: Cluster[] }
  | { name: 'test-roll'; results: RoiResult[]; pipValues: number[] }

const STABLE_EXEMPLAR_COUNT = 3

export function CalibrationWizard({ pipeline, diceSetId, onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [step, setStep] = useState<Step>({ name: 'background' })
  const [error, setError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

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

  // Load existing cluster set
  useEffect(() => {
    getClusterSet(diceSetId).then((set) => {
      if (set && set.clusters.length > 0) {
        pipeline.state.clusters = set.clusters
        // Skip to test roll if already labeled
        if (set.clusters.some((c) => c.pipValue !== null) && set.clusters.length >= 6) {
          // Already calibrated — skip to test roll directly
        }
      }
    })
  }, [diceSetId, pipeline])

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
    setStep({ name: 'place-dice' })
  }

  function handleCaptureDice() {
    const frame = getFrame()
    if (!frame) return
    const results = pipeline.processFrame(frame.imageData.data, frame.canvas.width, frame.canvas.height)

    if (results.length === 0) {
      setError('No dice detected. Place dice on the surface and try again.')
      return
    }

    setError(null)

    // Check if clusters need labeling
    const unlabeled = pipeline.state.clusters.filter((c) => c.pipValue === null)
    if (unlabeled.length > 0) {
      setStep({ name: 'label', clusters: unlabeled })
    } else {
      // Already labeled from a previous session — go to test roll
      const pipValues = results.map((r) => {
        const cluster = pipeline.state.clusters.find((c) => c.id === r.clusterId)
        return cluster?.pipValue ?? (r.blobCount && r.blobCount > 0 ? r.blobCount : 1)
      })
      setStep({ name: 'test-roll', results, pipValues })
    }
  }

  function handleLabelingComplete(labels: Map<string, number>) {
    for (const [clusterId, pipValue] of labels) {
      pipeline.labelCluster(clusterId, pipValue)
    }

    void saveClusterSet(diceSetId, {
      clusters: pipeline.state.clusters,
      updatedAt: Date.now(),
    })

    // Transition to test-roll step — the user will capture a test frame
    setStep({ name: 'test-roll', results: [], pipValues: [] })
  }

  function handleTestRollRetry() {
    const frame = getFrame()
    if (!frame) return
    const results = pipeline.processFrame(frame.imageData.data, frame.canvas.width, frame.canvas.height)
    const pipValues = results.map((r) => {
      const cluster = pipeline.state.clusters.find((c) => c.id === r.clusterId)
      return cluster?.pipValue ?? (r.blobCount && r.blobCount > 0 ? r.blobCount : 1)
    })
    setStep({ name: 'test-roll', results, pipValues })
  }

  function handleRecalibrate() {
    pipeline.state.backgroundLab = null
    pipeline.state.clusters = []
    setStep({ name: 'background' })
  }

  if (error && step.name !== 'place-dice') {
    return (
      <div className="rounded-lg bg-slate-900 border border-slate-800 p-6 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  const stepNumber =
    step.name === 'background' ? 1 : step.name === 'place-dice' ? 2 : step.name === 'label' ? 3 : 4

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center justify-between px-2">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                n === stepNumber
                  ? 'bg-amber-400 text-slate-950'
                  : n < stepNumber
                    ? 'bg-emerald-400/20 text-emerald-400'
                    : 'bg-slate-800 text-slate-500'
              }`}
            >
              {n < stepNumber ? '✓' : n}
            </div>
            {n < 4 && (
              <div
                className={`w-12 h-0.5 mx-1 ${n < stepNumber ? 'bg-emerald-400/30' : 'bg-slate-800'}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Camera feed — always visible except during labeling */}
      {step.name !== 'label' && (
        <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Test roll overlay: bounding boxes */}
          {step.name === 'test-roll' && step.results.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              {step.results.map((r, i) => {
                const video = videoRef.current
                if (!video) return null
                const vw = video.videoWidth || 320
                const vh = video.videoHeight || 240
                const scaleX = 100 / vw
                const scaleY = 100 / vh
                return (
                  <div
                    key={i}
                    className="absolute border-2 border-emerald-400 rounded"
                    style={{
                      left: `${r.roi.x * scaleX}%`,
                      top: `${r.roi.y * scaleY}%`,
                      width: `${r.roi.width * scaleX}%`,
                      height: `${r.roi.height * scaleY}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 bg-emerald-400 text-slate-950 text-xs font-bold px-1.5 py-0.5 rounded">
                      {step.pipValues[i]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Step content */}
      {step.name === 'background' && (
        <div className="space-y-3">
          <h3 className="text-slate-100 font-semibold text-center">Step 1: Capture Background</h3>
          <p className="text-slate-400 text-sm text-center">
            Point camera at your rolling surface. Remove all dice from the area.
            Ensure good, even lighting.
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

      {step.name === 'place-dice' && (
        <div className="space-y-3">
          <h3 className="text-slate-100 font-semibold text-center">Step 2: Place Your Dice</h3>
          <p className="text-slate-400 text-sm text-center">
            Place your dice on the surface. Roll them once so each die shows a different face.
            Keep them still.
          </p>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            onClick={handleCaptureDice}
            className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold text-lg hover:bg-amber-300 transition-colors"
          >
            Capture Dice
          </button>
        </div>
      )}

      {step.name === 'label' && (
        <div className="space-y-3">
          <h3 className="text-slate-100 font-semibold text-center">Step 3: Label Faces</h3>
          <p className="text-slate-400 text-sm text-center">
            Identify the pip value for each detected face.
          </p>
          <ClusterLabelingScreen clusters={step.clusters} onComplete={handleLabelingComplete} />
        </div>
      )}

      {step.name === 'test-roll' && (
        <div className="space-y-3">
          <h3 className="text-slate-100 font-semibold text-center">Step 4: Test Roll</h3>
          {step.results.length === 0 ? (
            <>
              <p className="text-slate-400 text-sm text-center">
                Roll your dice and capture to verify detection works.
              </p>
              <button
                onClick={handleTestRollRetry}
                className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold text-lg hover:bg-amber-300 transition-colors"
              >
                Capture Test Roll
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-400 text-sm text-center">
                Detected {step.results.length} {step.results.length === 1 ? 'die' : 'dice'}:
                {' '}{step.pipValues.join(', ')}
              </p>
              <p className="text-slate-300 text-sm text-center">Does this look correct?</p>
            </>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleRecalibrate}
              className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors font-semibold"
            >
              Recalibrate
            </button>
            {step.results.length > 0 && (
              <button
                onClick={handleTestRollRetry}
                className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-amber-400 transition-colors font-semibold"
              >
                Retest
              </button>
            )}
            <button
              onClick={onComplete}
              className="flex-1 py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors"
            >
              Start Recording
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
