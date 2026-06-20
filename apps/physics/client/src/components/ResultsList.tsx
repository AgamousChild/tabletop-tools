import { fmtTs } from '@/lib/search'
import type { SearchResult } from '@/types'

interface Props {
  results: SearchResult[]
  onSelect: (result: SearchResult) => void
  query: string
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
  if (!terms.length) return text
  const re = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'ig',
  )
  const parts = text.split(re)
  return parts.map((p, i) => (re.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))
}

export function ResultsList({ results, onSelect, query }: Props) {
  if (!results.length) {
    return <div className="results-empty">No results</div>
  }
  return (
    <ul className="results">
      {results.map((r) => (
        <li key={`${r.meetingId}:${r.startSec}`} onClick={() => onSelect(r)}>
          <div className="result-meta">
            <strong>{r.meetingName}</strong> · {fmtTs(r.startSec)}–{fmtTs(r.endSec)}
          </div>
          <div className="result-snippet">{highlight(r.text, query)}</div>
        </li>
      ))}
    </ul>
  )
}
