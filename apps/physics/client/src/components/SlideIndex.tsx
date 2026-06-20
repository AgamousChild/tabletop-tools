import { fmtTs } from '@/lib/search'
import type { Slide } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

interface Props {
  meetingName: string
  slides: Slide[]
  onSelect: (slide: Slide) => void
}

function snippet(text: string, max = 180): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return cut.slice(0, lastSpace > 100 ? lastSpace : max) + '…'
}

export function SlideIndex({ meetingName, slides, onSelect }: Props) {
  if (!slides.length) {
    return <div className="results-empty">No slides for {meetingName}</div>
  }
  return (
    <ul className="slide-index">
      {slides.map((s) => {
        const thumb = `${BASE}/${s.imageUrl.replace(/^\//, '')}`
        return (
          <li key={s.slideNum} onClick={() => onSelect(s)}>
            <img className="slide-thumb" src={thumb} alt={`slide ${s.slideNum}`} loading="lazy" />
            <div className="slide-meta-col">
              <div className="result-meta">
                Slide {s.slideNum} · {fmtTs(s.startSec)}–{fmtTs(s.endSec)}
              </div>
              <div className="result-snippet">{snippet(s.text) || <em>(no transcript)</em>}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
