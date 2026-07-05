import type { Slide } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

interface Props {
  deckName: string
  slides: Slide[]
  onSelect: (slide: Slide) => void
}

function snippet(text: string, max = 200): string {
  if (!text) return ''
  // Strip the OCR marker (script appends ' [ocr]' at the end of body)
  const clean = text
    .replace(/\s*\[ocr\]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return cut.slice(0, lastSpace > 120 ? lastSpace : max) + '…'
}

export function SlideIndex({ deckName, slides, onSelect }: Props) {
  if (!slides.length) {
    return <div className="results-empty">No slides for {deckName}</div>
  }
  return (
    <ul className="slide-index">
      {slides.map((s) => {
        const thumb = `${BASE}/${s.imageUrl.replace(/^\//, '')}`
        return (
          <li key={s.slideNum} onClick={() => onSelect(s)}>
            <img className="slide-thumb" src={thumb} alt={`slide ${s.slideNum}`} loading="lazy" />
            <div className="slide-meta-col">
              <div className="result-meta">Slide {s.slideNum}</div>
              {s.title && <div className="result-title">{s.title}</div>}
              <div className="result-snippet">{snippet(s.body) || <em>(no text)</em>}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
