import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { PracticeExamQuestion } from '../types'
import { QuestionCard } from './PracticeExam'

function make(overrides: Partial<PracticeExamQuestion> = {}): PracticeExamQuestion {
  return {
    n: 1,
    text: 'Sample question',
    options: [
      { letter: 'A', text: 'first' },
      { letter: 'B', text: 'second' },
      { letter: 'C', text: 'third' },
    ],
    selected: 'A',
    correctAnswer: 'A',
    correct: true,
    source: null,
    external: null,
    ...overrides,
  }
}

describe('QuestionCard', () => {
  it('renders CORRECT stamp when correct', () => {
    const html = renderToStaticMarkup(
      <QuestionCard q={make()} total={48} onViewSource={() => {}} />,
    )
    expect(html).toContain('CORRECT')
    expect(html).toContain('pe-stamp-correct')
    expect(html).not.toContain('Correct: ')
  })

  it('renders WRONG stamp when wrong and shows correct answer letter', () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        q={make({ selected: 'A', correctAnswer: 'C', correct: false })}
        total={48}
        onViewSource={() => {}}
      />,
    )
    expect(html).toContain('WRONG')
    expect(html).toContain('pe-stamp-wrong')
    expect(html).toContain('Correct: C')
  })

  it('renders UNGRADED stamp when correct is null', () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        q={make({ selected: null, correctAnswer: null, correct: null })}
        total={48}
        onViewSource={() => {}}
      />,
    )
    expect(html).toContain('UNGRADED')
    expect(html).toContain('pe-stamp-ungraded')
  })

  it('highlights the selected option with pe-option-selected class', () => {
    const html = renderToStaticMarkup(
      <QuestionCard q={make({ selected: 'B' })} total={48} onViewSource={() => {}} />,
    )
    // The B option should carry the selected class
    const optionMatches = html.match(/<li[^>]*pe-option[^>]*>[^]*?<\/li>/g) ?? []
    const selectedLi = optionMatches.find((li) => li.includes('pe-option-selected'))
    expect(selectedLi).toBeDefined()
    expect(selectedLi).toContain('B.')
  })

  it('shows "View source" button only when source is set', () => {
    const withSource = renderToStaticMarkup(
      <QuestionCard
        q={make({
          source: {
            deckId: 'psyc602-ch05',
            slideNum: 3,
            highlight: { leftPct: 0, topPct: 0, widthPct: 100, heightPct: 10 },
            quote: 'q',
          },
        })}
        total={48}
        onViewSource={() => {}}
      />,
    )
    expect(withSource).toContain('View source')

    const noSource = renderToStaticMarkup(
      <QuestionCard q={make({ source: null })} total={48} onViewSource={() => {}} />,
    )
    expect(noSource).not.toContain('View source')
  })

  it('marks the correct answer option when the question was wrong', () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        q={make({ selected: 'A', correctAnswer: 'C', correct: false })}
        total={48}
        onViewSource={() => {}}
      />,
    )
    const optionMatches = html.match(/<li[^>]*pe-option[^>]*>[^]*?<\/li>/g) ?? []
    const correctLi = optionMatches.find((li) => li.includes('pe-option-correct-answer'))
    expect(correctLi).toBeDefined()
    expect(correctLi).toContain('C.')
  })
})
