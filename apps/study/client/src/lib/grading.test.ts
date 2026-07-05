import { describe, expect, it } from 'vitest'

import type { PracticeExamQuestion } from '../types'
import { gradeStamp } from '../types'

function q(overrides: Partial<PracticeExamQuestion>): PracticeExamQuestion {
  return {
    n: 1,
    text: '',
    options: [],
    selected: null,
    correctAnswer: null,
    correct: null,
    source: null,
    external: null,
    ...overrides,
  }
}

describe('gradeStamp', () => {
  it('returns "correct" when correct === true', () => {
    expect(gradeStamp(q({ correct: true }))).toBe('correct')
  })

  it('returns "wrong" when correct === false', () => {
    expect(gradeStamp(q({ correct: false }))).toBe('wrong')
  })

  it('returns "ungraded" when correct === null', () => {
    expect(gradeStamp(q({ correct: null }))).toBe('ungraded')
  })

  it('treats undefined correct as ungraded', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(gradeStamp(q({ correct: undefined as any }))).toBe('ungraded')
  })
})
