import { useCallback, useEffect, useMemo, useState } from 'react'

import { SourcePopup } from '@/components/SourcePopup'
import type { PracticeExam, PracticeExamQuestion } from '@/types'
import { gradeStamp } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

type View = { kind: 'question'; index: number } | { kind: 'missing' }

interface QuestionCardProps {
  q: PracticeExamQuestion
  total: number
  onViewSource: () => void
}

export function QuestionCard({ q, total, onViewSource }: QuestionCardProps) {
  const stamp = gradeStamp(q)
  return (
    <div className="pe-card">
      <div className="pe-card-head">
        <span className="pe-badge">
          Q{q.n} <span className="pe-badge-total">of {total}</span>
        </span>
        <span className={`pe-stamp pe-stamp-${stamp}`} data-testid="pe-stamp">
          {stamp === 'correct' && 'CORRECT'}
          {stamp === 'wrong' && 'WRONG'}
          {stamp === 'ungraded' && 'UNGRADED'}
        </span>
      </div>
      <p className="pe-question">{q.text}</p>
      {q.questionImage && (
        <img
          className="pe-question-image"
          src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/${q.questionImage.replace(/^\//, '')}`}
          alt={`Question ${q.n} figure`}
        />
      )}
      <ul className="pe-options">
        {q.options.map((opt) => {
          const isSelected = q.selected === opt.letter
          const isCorrect = q.correctAnswer === opt.letter
          const cls = [
            'pe-option',
            isSelected ? 'pe-option-selected' : '',
            isCorrect && stamp === 'wrong' ? 'pe-option-correct-answer' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <li key={opt.letter} className={cls}>
              <span className={`pe-radio ${isSelected ? 'pe-radio-filled' : ''}`} aria-hidden />
              <span className="pe-option-letter">{opt.letter}.</span>
              <span className="pe-option-text">{opt.text}</span>
            </li>
          )
        })}
      </ul>
      {stamp === 'wrong' && q.correctAnswer && (
        <div className="pe-correct-note">Correct: {q.correctAnswer}</div>
      )}
      {q.source && (
        <button className="pe-view-source" onClick={onViewSource}>
          View source
        </button>
      )}
    </div>
  )
}

interface Props {
  exam: PracticeExam
}

export function PracticeExamView({ exam }: Props) {
  const questions = exam.questions
  const total = questions.length
  const [view, setView] = useState<View>({ kind: 'question', index: 0 })
  const [popupOpen, setPopupOpen] = useState(false)

  const current = view.kind === 'question' ? questions[view.index] : null

  const goPrev = useCallback(() => {
    setView((v) =>
      v.kind === 'question' && v.index > 0 ? { kind: 'question', index: v.index - 1 } : v,
    )
  }, [])
  const goNext = useCallback(() => {
    setView((v) =>
      v.kind === 'question' && v.index < total - 1 ? { kind: 'question', index: v.index + 1 } : v,
    )
  }, [total])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (popupOpen) return
      if (view.kind !== 'question') return
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, view.kind, popupOpen])

  const missingEntries = useMemo(
    () =>
      questions.filter(
        (q) =>
          // A question is "missing" only if it has no source AND no external answer AND wasn't graded.
          // Q48 has no source but IS graded (correctAnswer='A', correct=true) — belongs on the
          // regular exam flow, not on the Missing Answers list.
          q.source === null && q.external === null && q.correctAnswer === null,
      ),
    [questions],
  )

  if (view.kind === 'missing') {
    return (
      <div className="pe-missing">
        <div className="pe-missing-head">
          <h2>Missing Answers</h2>
          <button className="pe-link" onClick={() => setView({ kind: 'question', index: 0 })}>
            &larr; Back to questions
          </button>
        </div>
        <p className="pe-missing-sub">
          Questions with no source hit in the deck scan, or with an external reference.
        </p>
        {missingEntries.length === 0 ? (
          <p className="pe-missing-empty">
            Nothing to show — every question was matched in-corpus.
          </p>
        ) : (
          <ul className="pe-missing-list">
            {missingEntries.map((q) => {
              const bothNull = q.source === null && q.external === null
              let host = ''
              if (q.external) {
                try {
                  host = new URL(q.external.url).host
                } catch {
                  host = q.external.url
                }
              }
              return (
                <li key={q.n} className="pe-missing-item">
                  <div className="pe-missing-item-head">
                    <span className="pe-missing-badge">Q{q.n}</span>
                    <span className="pe-missing-text">{q.text}</span>
                  </div>
                  {q.external && (
                    <div className="pe-missing-meta">
                      Answer: <strong>{q.correctAnswer ?? '—'}</strong> ·{' '}
                      <a href={q.external.url} target="_blank" rel="noopener noreferrer">
                        {host}
                      </a>
                    </div>
                  )}
                  {bothNull && (
                    <div className="pe-missing-meta pe-missing-note">
                      Question incomplete in source scan — needs re-scan
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="pe-view">
      <QuestionCard q={current} total={total} onViewSource={() => setPopupOpen(true)} />

      <div className="pe-nav">
        <button
          className="pe-nav-btn"
          disabled={view.index === 0}
          onClick={goPrev}
          aria-label="Previous question"
        >
          &larr; Prev
        </button>
        <span className="pe-nav-count">
          {view.index + 1} / {total}
        </span>
        <button
          className="pe-nav-btn"
          disabled={view.index === total - 1}
          onClick={goNext}
          aria-label="Next question"
        >
          Next &rarr;
        </button>
      </div>

      <div className="pe-jump">
        <button className="pe-link" onClick={() => setView({ kind: 'missing' })}>
          Jump to end &rarr; Missing Answers ({missingEntries.length})
        </button>
      </div>

      {popupOpen && current.source && (
        <SourcePopup
          source={current.source}
          questionNum={current.n}
          deckSlideCount={exam.deckSlideCounts?.[current.source.deckId] ?? 999}
          onClose={() => setPopupOpen(false)}
        />
      )}
    </div>
  )
}

export function PracticeExamLoader() {
  const [exam, setExam] = useState<PracticeExam | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${BASE}/data/practice-exam-graded.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((data: PracticeExam) => setExam(data))
      .catch((e) => setErr(String(e)))
  }, [])

  if (err) return <div className="error">Failed to load practice exam: {err}</div>
  if (!exam) return <div className="loading">Loading practice exam…</div>
  return <PracticeExamView exam={exam} />
}
