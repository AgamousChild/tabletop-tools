import { describe, expect, it } from 'vitest'

import { linkBrainHtml, renderMarkdown } from './render-markdown'

describe('linkBrainHtml', () => {
  it('rewrites a [label](brain:id) link to a <button> with the shared class', () => {
    const out = linkBrainHtml('Bring a [Land Raider](brain:lr) into reserves.')
    expect(out).toBe(
      'Bring a <button class="brain-entity-link" data-brain-node="lr">Land Raider</button> into reserves.',
    )
  })

  it('rewrites multiple links and gives every one the same class', () => {
    const out = linkBrainHtml(
      'Use [Overwatch](brain:strat-ow) against the [Infernus Squad](brain:000000126).',
    )
    const classMatches = out.match(/class="brain-entity-link"/g)
    expect(classMatches).not.toBeNull()
    expect(classMatches!).toHaveLength(2)
  })

  it('leaves text without brain: links untouched', () => {
    const out = linkBrainHtml('No links here, just words.')
    expect(out).toBe('No links here, just words.')
  })
})

describe('renderMarkdown', () => {
  it('produces valid HTML for a simple paragraph', () => {
    const out = renderMarkdown('Hello world.')
    expect(out).toContain('Hello world.')
    expect(out).toContain('<p')
  })
})
