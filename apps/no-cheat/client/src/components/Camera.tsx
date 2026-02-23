import { useEffect, useMemo, useRef, useState } from 'react'

import type { Cluster } from '../lib/cv/cluster'
import { createPipeline } from '../lib/cv/pipeline'
import { getClusterSet, saveClusterSet } from '../lib/store/exemplarStore'
import { ClusterLabelingScreen } from './ClusterLabelingScreen'

// Clusters are considered stable (ready to label) when all 6 faces have
// been seen at least this many times.
const STABLE_EXEMPLAR_COUNT = 3

type Props = {
  diceSetId?: string
  onCapture: (pipValues: number[]) => void
  onCaptureFrame?: (dataUrl: string) => void
  captureOnly?: boolean
  captureLabel?: string
}

export function Camera({
  diceSetId,
  onCapture,
  onCaptureFrame,
  captureOnly = false,
  captureLabel,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [detected, setDetected] = useState<number[] | null>(null)
  const [calibrated, setCalibrated] = useState(false)
  const [clusterCount, setClusterCount] = useState(0)
  const [showLabeling, setShowLabeling] = useState(false)
  const [labeledClusters, setLabeledClusters] = useState(false)

  const pipeline = useMemo(() => createPipeline(diceSetId ?? 'default'), [diceSetId])

  // Start camera stream
  useEffect(() => {
    let stream: MediaStream | null = null

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
        }
      })
      .catch(() => setError('Camera unavailable. Please grant camera permission.'))

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Load existing cluster set from IndexedDB on mount
  useEffect(() => {
    if (!diceSetId) return
    getClusterSet(diceSetId).then((set) => {
      if (set && set.clusters.length > 0) {
        pipeline.state.clusters = set.clusters
        setClusterCount(set.clusters.length)
        if (set.clusters.some((c) => c.pipValue !== null)) {
          setLabeledClusters(true)
        }
      }
    })
  }, [diceSetId, pipeline])

  function handleCalibrateBackground() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    pipeline.captureBackground(imageData.data, canvas.width, canvas.height)
    setCalibrated(true)
  }

  function handleCapture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    if (captureOnly) {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      onCaptureFrame?.(dataUrl)
      return
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const results = pipeline.processFrame(imageData.data, canvas.width, canvas.height)

    // Update cluster count for progress display
    setClusterCount(pipeline.state.clusters.length)

    // Map results to pip values: prefer labeled cluster value, fall back to blob count
    const pipValues = results.map((r) => {
      const cluster = pipeline.state.clusters.find((c) => c.id === r.clusterId)
      const blobPip = r.blobCount && r.blobCount > 0 ? r.blobCount : 1
      return cluster?.pipValue ?? blobPip
    })

    setDetected(pipValues)
  }

  function handleConfirm() {
    if (!detected) return
    onCapture(detected)
    setDetected(null)

    // After confirming a roll, check if labeling should now be triggered
    if (!labeledClusters && !captureOnly) {
      const clusters = pipeline.state.clusters
      const isStable =
        clusters.length >= 6 && clusters.every((c) => c.exemplars.length >= STABLE_EXEMPLAR_COUNT)
      if (isStable) {
        setShowLabeling(true)
      }
    }
  }

  function handleRetake() {
    setDetected(null)
  }

  function adjustValue(index: number, delta: number) {
    if (!detected) return
    setDetected(detected.map((v, i) => (i === index ? Math.min(6, Math.max(1, v + delta)) : v)))
  }

  function handleLabelingComplete(labels: Map<string, number>) {
    for (const [clusterId, pipValue] of labels) {
      pipeline.labelCluster(clusterId, pipValue)
    }
    setLabeledClusters(true)
    setShowLabeling(false)

    if (diceSetId) {
      void saveClusterSet(diceSetId, {
        clusters: pipeline.state.clusters,
        updatedAt: Date.now(),
      })
    }
  }

  if (error) {
    return (
      <div className="rounded-lg bg-slate-900 border border-slate-800 p-6 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  // Which clusters still need labeling
  const unlabeledClusters: Cluster[] = pipeline.state.clusters.filter(
    (c) => c.pipValue === null,
  )

  return (
    <div className="space-y-4">
      <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-square">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {showLabeling ? (
        <ClusterLabelingScreen
          clusters={unlabeledClusters}
          onComplete={handleLabelingComplete}
        />
      ) : !calibrated && !captureOnly ? (
        <div className="space-y-2">
          <p className="text-center text-slate-400 text-sm">
            Point camera at the empty surface where you'll roll, then tap to calibrate.
          </p>
          <button
            onClick={handleCalibrateBackground}
            className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold text-lg hover:bg-amber-300 transition-colors"
          >
            Calibrate Background
          </button>
        </div>
      ) : detected !== null ? (
        <div className="space-y-3">
          <p className="text-center text-slate-400 text-sm">
            {detected.length === 0
              ? 'No dice detected — retake or adjust manually'
              : `${detected.length} ${detected.length === 1 ? 'die' : 'dice'} detected`}
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            {detected.map((v, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <button
                  onClick={() => adjustValue(i, 1)}
                  className="w-10 h-7 rounded border border-slate-700 text-slate-400 hover:border-slate-400 text-sm transition-colors"
                >
                  ▲
                </button>
                <span className="text-3xl font-bold text-slate-100 w-10 text-center">{v}</span>
                <button
                  onClick={() => adjustValue(i, -1)}
                  className="w-10 h-7 rounded border border-slate-700 text-slate-400 hover:border-slate-400 text-sm transition-colors"
                >
                  ▼
                </button>
                <button
                  onClick={() => setDetected(detected.filter((_, j) => j !== i))}
                  className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRetake}
              className="px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 transition-colors text-sm"
            >
              Retake
            </button>
            <button
              onClick={() => setDetected([...detected, 1])}
              disabled={detected.length >= 20}
              className="px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:border-amber-400 hover:text-amber-400 transition-colors text-sm"
            >
              + Die
            </button>
            <button
              onClick={handleConfirm}
              disabled={detected.length === 0}
              className="flex-1 py-2 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-colors text-sm disabled:opacity-30"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleCapture}
            className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold text-lg hover:bg-amber-300 transition-colors"
          >
            {captureLabel ?? 'Capture'}
          </button>

          {/* Cluster progress — shown while rolling, hidden once labeled */}
          {calibrated && !captureOnly && clusterCount > 0 && (
            <div className="space-y-1">
              {labeledClusters ? (
                <p className="text-center text-emerald-400 text-sm">
                  ✓ Dice calibrated — full recognition active
                </p>
              ) : (
                <>
                  <p className="text-center text-slate-400 text-sm">
                    {clusterCount >= 6
                      ? 'All faces seen — label after next confirm'
                      : `Faces seen: ${clusterCount} of 6 — keep rolling`}
                  </p>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className="bg-amber-400 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min((clusterCount / 6) * 100, 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
