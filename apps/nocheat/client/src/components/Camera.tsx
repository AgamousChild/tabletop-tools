import { useEffect, useRef, useState } from 'react'
import { trpc } from '../lib/trpc'

type Props = {
  onCapture: (pipValues: number[]) => void
  onCaptureFrame?: (dataUrl: string) => void
  captureOnly?: boolean
  captureLabel?: string
}

export function Camera({ onCapture, onCaptureFrame, captureOnly = false, captureLabel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [detected, setDetected] = useState<number[] | null>(null)
  const [reading, setReading] = useState(false)

  const readDiceMutation = trpc.vision.readDice.useMutation()

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

  function isolateDice(canvas: HTMLCanvasElement): string {
    const ctx = canvas.getContext('2d')!
    const { width, height } = canvas
    const imageData = ctx.getImageData(0, 0, width, height)
    const pixels = imageData.data

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]!
      const g = pixels[i + 1]!
      const b = pixels[i + 2]!
      // White dice faces: high brightness across all channels
      const brightness = (r + g + b) / 3
      const isWhite = brightness > 140 && r > 120 && g > 120 && b > 120
      if (!isWhite) {
        // Black out non-white pixels (background, game board)
        pixels[i] = 0
        pixels[i + 1] = 0
        pixels[i + 2] = 0
      }
    }

    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.9)
  }

  async function handleCapture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const dataUrl = isolateDice(canvas)

    if (captureOnly) {
      onCaptureFrame?.(dataUrl)
      return
    }

    const imageBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')

    setReading(true)
    try {
      const result = await readDiceMutation.mutateAsync({ imageBase64 })
      setDetected(result.values)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to read dice')
    } finally {
      setReading(false)
    }
  }

  function handleConfirm() {
    if (!detected) return
    onCapture(detected)
    setDetected(null)
  }

  function handleRetake() {
    setDetected(null)
  }

  function adjustValue(index: number, delta: number) {
    if (!detected) return
    setDetected(detected.map((v, i) =>
      i === index ? Math.min(6, Math.max(1, v + delta)) : v
    ))
  }

  if (error) {
    return (
      <div className="rounded-lg bg-slate-900 border border-slate-800 p-6 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-square">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />
        {reading && (
          <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center">
            <p className="text-amber-400 font-semibold">Reading dice…</p>
          </div>
        )}
      </div>

      {detected !== null ? (
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
        <button
          onClick={handleCapture}
          disabled={reading}
          className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold text-lg hover:bg-amber-300 transition-colors disabled:opacity-50"
        >
          {reading ? 'Reading…' : (captureLabel ?? 'Capture')}
        </button>
      )}
    </div>
  )
}
