import { useRef, useState } from 'react'

type Props = {
  onCapture: (dataUrl: string | null) => void
  required: boolean
  label?: string
}

export function PhotoCaptureScreen({ onCapture, required, label = 'Board Photo' }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setPreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="p-6 space-y-4 max-w-md mx-auto">
      <h3 className="text-lg font-semibold text-slate-200">{label}</h3>

      {preview ? (
        <div className="space-y-3">
          <img src={preview} alt="Board photo preview" className="w-full rounded-lg border border-slate-700" />
          <div className="flex gap-2">
            <button
              onClick={() => onCapture(preview)}
              className="flex-1 py-2 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300"
            >
              Use Photo
            </button>
            <button
              onClick={() => {
                setPreview(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300"
            >
              Retake
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            aria-label="Take photo"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-8 rounded-lg border-2 border-dashed border-slate-700 text-slate-400 hover:border-amber-400/50 hover:text-amber-400 transition-colors"
          >
            Tap to take photo
          </button>
          {!required && (
            <button
              onClick={() => onCapture(null)}
              className="w-full py-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-300 text-sm"
            >
              Skip Photo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
