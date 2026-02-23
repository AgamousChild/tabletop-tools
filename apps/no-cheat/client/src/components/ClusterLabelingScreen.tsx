import { useEffect, useRef, useState } from 'react'

import type { Cluster } from '../lib/cv/cluster'

/**
 * Renders a single 64×64 grayscale Uint8Array as a visible image via canvas.
 */
function GrayscaleImage({ pixels }: { pixels: Uint8Array }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(64, 64)
    for (let i = 0; i < 64 * 64; i++) {
      const v = pixels[i]!
      imageData.data[i * 4] = v
      imageData.data[i * 4 + 1] = v
      imageData.data[i * 4 + 2] = v
      imageData.data[i * 4 + 3] = 255
    }
    ctx.putImageData(imageData, 0, 0)
  }, [pixels])

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      className="w-32 h-32 rounded-lg border border-slate-700"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

type Props = {
  clusters: Cluster[]
  onComplete: (labels: Map<string, number>) => void
}

/**
 * Steps through unlabeled clusters one at a time, collecting pip value
 * assignments from the user. Calls onComplete with the full labels map.
 */
export function ClusterLabelingScreen({ clusters, onComplete }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [labels, setLabels] = useState<Map<string, number>>(new Map())

  const cluster = clusters[currentIdx]
  if (!cluster) return null

  const exemplar = cluster.exemplars[0]
  if (!exemplar) return null

  function handleLabel(pipValue: number) {
    const next = new Map(labels)
    next.set(cluster!.id, pipValue)

    if (currentIdx + 1 >= clusters.length) {
      onComplete(next)
    } else {
      setLabels(next)
      setCurrentIdx(currentIdx + 1)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-slate-100 font-semibold">Label your dice</p>
        <p className="text-slate-400 text-sm mt-1">
          Cluster {currentIdx + 1} of {clusters.length}
        </p>
      </div>

      <div className="flex justify-center">
        <GrayscaleImage pixels={exemplar} />
      </div>

      <p className="text-center text-slate-400 text-sm">What pip value is this face?</p>

      <div className="grid grid-cols-6 gap-2">
        {[1, 2, 3, 4, 5, 6].map((pip) => (
          <button
            key={pip}
            onClick={() => handleLabel(pip)}
            className="py-3 rounded-lg border border-slate-700 text-slate-100 font-bold text-lg hover:border-amber-400 hover:text-amber-400 transition-colors"
          >
            {pip}
          </button>
        ))}
      </div>
    </div>
  )
}
