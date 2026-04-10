import { describe, it, expect } from 'vitest'
import { parseRulesCommentary } from './rules-commentary'

const SAMPLE_COMMENTARY = `
## UPDATES AND ERRATA

### Page 5 - Core Concepts

Add the following:
REDEPLOYMENTS Rules that allow players to redeploy certain units after both armies are deployed are always resolved after the Deploy Armies step.

### Page 6 - Unit Coherency, 2nd paragraph

Change to:
If for any reason a model cannot be set up in Unit Coherency, that unit cannot be set up.

### Page 10 - The Battle Round

Add the following:
OUT-OF-PHASE RULES Some rules allow a model or unit to move, shoot, charge or fight outside of the normal turn sequence.

## FAQS

### Q: Can a unit use a Stratagem while Battle-shocked?

A: No. Battle-shocked units cannot use Stratagems.

### Q: If a unit with Fights First is charged, does the charging unit still get its charge bonus?

A: Yes. Fights First and charge bonus are separate mechanics.
`.trim()

describe('parseRulesCommentary', () => {
  const result = parseRulesCommentary(SAMPLE_COMMENTARY, '2026-04-08')

  it('creates errata nodes from page references', () => {
    const errata = result.nodes.filter(n => n.layer === 'errata' && n.category === 'commentary')
    expect(errata.length).toBe(3)
  })

  it('creates FAQ nodes from Q&A pairs', () => {
    const faqs = result.nodes.filter(n => n.category === 'faq')
    expect(faqs.length).toBe(2)
  })

  it('generates clarifies refs for errata', () => {
    const clarifies = result.refs.filter(r => r.rel === 'clarifies')
    expect(clarifies.length).toBeGreaterThan(0)
  })

  it('includes page number in source when available', () => {
    const page5 = result.nodes.find(n => n.title.includes('Page 5'))
    expect(page5?.sources[0]?.page).toBe(5)
  })

  it('sets layer to errata on all nodes', () => {
    for (const node of result.nodes) {
      expect(node.layer).toBe('errata')
    }
  })

  it('is idempotent', () => {
    const result2 = parseRulesCommentary(SAMPLE_COMMENTARY, '2026-04-08')
    expect(result2.nodes.map(n => n.id)).toEqual(result.nodes.map(n => n.id))
  })
})
