import { describe, expect, it } from 'vitest'

import { buildPrompt, evaluateCandidate, type LlmEvalInput, parseResponse } from './llm-evaluator'

const sampleInput: LlmEvalInput = {
  brainNode: { id: 'n1', title: 'Oath of Moment', category: 'keyword', excerpt: 'Declare oath...' },
  candidate: {
    proposedCanonicalId: 'ability:A0987',
    matchMethod: 'name_faction',
    confidence: 0.82,
    source: 'sync:wahapedia',
  },
  currentEntity: {
    id: 'ability:A0123',
    type: 'ability',
    name: 'Oath of Moment',
    factionId: 'space-marines',
  },
  proposedEntity: {
    id: 'ability:A0987',
    type: 'ability',
    name: 'Oath of Iron',
    factionId: 'iron-hands',
  },
}

describe('buildPrompt', () => {
  it('includes brain note, both entities, and match signal', () => {
    const p = buildPrompt(sampleInput)
    expect(p).toContain('Oath of Moment')
    expect(p).toContain('CURRENT link')
    expect(p).toContain('ability:A0123')
    expect(p).toContain('ability:A0987')
    expect(p).toContain('Oath of Iron')
    expect(p).toContain('name_faction')
    expect(p).toContain('0.82')
  })

  it('shows "(none — first-time link)" when no current entity', () => {
    const p = buildPrompt({ ...sampleInput, currentEntity: null })
    expect(p).toContain('first-time link')
  })

  it('truncates long excerpts at 800 chars', () => {
    const long = 'x'.repeat(2000)
    const p = buildPrompt({
      ...sampleInput,
      brainNode: { ...sampleInput.brainNode, excerpt: long },
    })
    // 800 'x' chars should be in the prompt, but not 2000
    expect(p).toContain('x'.repeat(800))
    expect(p).not.toContain('x'.repeat(801))
  })
})

describe('parseResponse', () => {
  it('parses APPROVE - reason', () => {
    expect(parseResponse('APPROVE - types match and confidence is high')).toEqual({
      decision: 'APPROVE',
      reason: 'types match and confidence is high',
      rawResponse: 'APPROVE - types match and confidence is high',
    })
  })

  it('parses REJECT - reason', () => {
    expect(parseResponse('REJECT - types differ')).toEqual({
      decision: 'REJECT',
      reason: 'types differ',
      rawResponse: 'REJECT - types differ',
    })
  })

  it('parses UNSURE - reason', () => {
    expect(parseResponse('UNSURE - ambiguous name match')).toEqual({
      decision: 'UNSURE',
      reason: 'ambiguous name match',
      rawResponse: 'UNSURE - ambiguous name match',
    })
  })

  it('handles leading whitespace and mixed case', () => {
    expect(parseResponse('  approve - looks good  ').decision).toBe('APPROVE')
  })

  it('falls back to keyword detection when format is loose', () => {
    const r = parseResponse('I think APPROVE is the right answer here.')
    expect(r.decision).toBe('APPROVE')
    expect(r.reason).toContain('keyword detected')
  })

  it('returns UNSURE for malformed responses', () => {
    const r = parseResponse('this is just gibberish without any keyword')
    expect(r.decision).toBe('UNSURE')
    expect(r.reason).toContain('malformed response')
  })
})

describe('evaluateCandidate', () => {
  it('calls the AI binding with the built prompt and parses the response', async () => {
    const calls: Array<{ model: string; prompt: string }> = []
    const mockAi = {
      async run(model: string, opts: { messages: Array<{ role: string; content: string }> }) {
        calls.push({ model, prompt: opts.messages[0].content })
        return { response: 'APPROVE - confident match' }
      },
    }
    const result = await evaluateCandidate(mockAi, sampleInput)
    expect(result.decision).toBe('APPROVE')
    expect(result.reason).toBe('confident match')
    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toContain('Oath of Moment')
  })

  it('returns UNSURE when AI returns garbage', async () => {
    const mockAi = {
      async run() {
        return { response: 'I cannot help with that' }
      },
    }
    const result = await evaluateCandidate(mockAi, sampleInput)
    expect(result.decision).toBe('UNSURE')
  })

  it('uses the provided model name', async () => {
    let usedModel: string | undefined
    const mockAi = {
      async run(model: string) {
        usedModel = model
        return { response: 'APPROVE - ok' }
      },
    }
    await evaluateCandidate(mockAi, sampleInput, '@cf/test/custom-model')
    expect(usedModel).toBe('@cf/test/custom-model')
  })
})
