import { describe, expect, it } from 'vitest'

import { splitTitleAndBody } from './mission-card-ocr'

describe('splitTitleAndBody', () => {
  it('extracts an ALL-CAPS title from the first line', () => {
    const raw = `BATTLEFIELD DOMINANCE
At the end of each battle round, the player who controls
more objective markers scores 5 VP.`
    const { title, body } = splitTitleAndBody(raw)
    expect(title).toBe('BATTLEFIELD DOMINANCE')
    expect(body).toContain('At the end of each battle round')
    expect(body).toContain('5 VP')
    // body is joined onto one line
    expect(body).not.toContain('\n')
  })

  it('returns empty title when no ALL-CAPS line is present', () => {
    const raw = `Some rules text only.
More rules text here.`
    const { title, body } = splitTitleAndBody(raw)
    expect(title).toBe('')
    expect(body).toContain('Some rules text')
    expect(body).toContain('More rules text')
  })

  it('skips leading blank lines', () => {
    const raw = `

ASSASSINATION
Score 5 VP if your opponent has no CHARACTER models.`
    const { title, body } = splitTitleAndBody(raw)
    expect(title).toBe('ASSASSINATION')
    expect(body).toContain('Score 5 VP')
  })

  it('does not pick up a sub-60-char mixed-case heading as the title', () => {
    // Bodies often start with a sentence-case sentence; the splitter should
    // not promote that to a title.
    const raw = `The player whose turn it is scores: For each objective marker
they control, 5 VP. MAX 15VP.`
    const { title } = splitTitleAndBody(raw)
    expect(title).toBe('')
  })

  it('handles an empty input without throwing', () => {
    const { title, body } = splitTitleAndBody('')
    expect(title).toBe('')
    expect(body).toBe('')
  })

  it('caps the title at the first short ALL-CAPS line, not body shouting', () => {
    // Pathological case: ALL CAPS appears mid-body. We only look at the first
    // few lines, so this shouldn't be promoted to title.
    const raw = `Some sentence-case intro line.
More intro.
Yet more intro.
Yet more intro 2.
Yet more intro 3.
A CAPITALISED PHRASE DEEP IN THE BODY.`
    const { title } = splitTitleAndBody(raw)
    expect(title).toBe('')
  })
})
