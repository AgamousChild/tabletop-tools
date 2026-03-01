import { useRef, useEffect } from 'react'

type Props = {
  roiGray: Uint8Array
  roiWidth: number
  roiHeight: number
  guess: number | null
  confidence: number
  onCorrect: (label: number) => void
  onSkip: () => void
}

function getBorderColor(confidence: number): string {
  if (confidence > 0.8) return 'border-emerald-500'
  if (confidence >= 0.5) return 'border-amber-500'
  return 'border-red-500'
}

export function TrainingRoiCard({
  roiGray,
  roiWidth,
  roiHeight,
  guess,
  confidence,
  onCorrect,
  onSkip,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imgData = ctx.createImageData(roiWidth, roiHeight)
    for (let i = 0; i < roiGray.length; i++) {
      const v = roiGray[i]
      imgData.data[i * 4] = v
      imgData.data[i * 4 + 1] = v
      imgData.data[i * 4 + 2] = v
      imgData.data[i * 4 + 3] = 255
    }

    // Draw at native size to an offscreen canvas, then scale
    const offscreen = document.createElement('canvas')
    offscreen.width = roiWidth
    offscreen.height = roiHeight
    const offCtx = offscreen.getContext('2d')
    if (offCtx) {
      offCtx.putImageData(imgData, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height)
    }
  }, [roiGray, roiWidth, roiHeight])

  const borderColor = getBorderColor(confidence)

  return (
    <div
      data-testid="training-roi-card"
      className={`bg-slate-900 border-2 ${borderColor} rounded-lg p-3 flex flex-col items-center gap-2`}
    >
      {/* ROI canvas */}
      <canvas
        ref={canvasRef}
        width={80}
        height={80}
        className="rounded bg-slate-950"
      />

      {/* Guess display */}
      <div data-testid="guess-display" className="text-2xl font-bold text-slate-100">
        {guess !== null ? guess : '?'}
      </div>

      {/* Pip buttons */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map((pip) => (
          <button
            key={pip}
            onClick={() => onCorrect(pip)}
            className={`w-8 h-8 rounded text-sm font-bold ${
              pip === guess
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
            }`}
          >
            {pip}
          </button>
        ))}
      </div>

      {/* Skip button */}
      <button
        onClick={onSkip}
        className="text-sm text-slate-400 hover:text-slate-200"
      >
        Skip
      </button>
    </div>
  )
}
