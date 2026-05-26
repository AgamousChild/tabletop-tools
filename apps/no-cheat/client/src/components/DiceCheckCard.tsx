import { useEffect, useRef } from 'react'

type Props = {
  roiGray: Uint8Array
  roiWidth: number
  roiHeight: number
  pipGuess: number | null
  dismissed: boolean
  onToggle: () => void
  onChangePip?: (pip: number) => void
}

export function DiceCheckCard({
  roiGray,
  roiWidth,
  roiHeight,
  pipGuess,
  dismissed,
  onToggle,
  onChangePip,
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

  return (
    <div
      data-testid="dice-check-card"
      className={`bg-slate-900 border-2 rounded-lg p-2 flex flex-col items-center gap-1 ${
        dismissed ? 'border-red-500 opacity-40' : 'border-emerald-500'
      }`}
    >
      <canvas ref={canvasRef} width={80} height={80} className="rounded bg-slate-950" />
      <div data-testid="pip-guess" className="text-lg font-bold text-slate-100">
        {pipGuess !== null ? pipGuess : '?'}
      </div>
      {/* Pip correction buttons */}
      {!dismissed && onChangePip && (
        <div className="flex gap-px">
          {[1, 2, 3, 4, 5, 6].map((pip) => (
            <button
              key={pip}
              onClick={() => onChangePip(pip)}
              aria-label={`Set pip ${pip}`}
              className={`w-5 h-5 rounded text-[10px] font-bold ${
                pip === pipGuess
                  ? 'bg-emerald-400 text-slate-950'
                  : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
              }`}
            >
              {pip}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={onToggle}
        className={`text-xs px-2 py-1 rounded ${
          dismissed
            ? 'bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900'
            : 'bg-red-900/50 text-red-400 hover:bg-red-900'
        }`}
      >
        {dismissed ? 'Keep' : 'Not a die'}
      </button>
    </div>
  )
}
