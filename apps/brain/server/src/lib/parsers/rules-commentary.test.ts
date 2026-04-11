import { describe, it, expect } from 'vitest'
import { parseRulesCommentary } from './rules-commentary'

// Matches the structure from the new gw-sync structured PDF parser:
// ## = top-level divisions, #### = section headers, ##### = individual entries
const SAMPLE_COMMENTARY = `
## CORE RULES UPDATES

#### UPDATES & ERRATA

##### ' REDEPLOYMENTS

Rules that allow players to redeploy certain units after both armies are deployed are always resolved after the Deploy Armies step. Page 5

##### ' OUT-OF-PHASE RULES

Some rules allow a model or unit to move, shoot, charge or fight outside of the normal turn sequence. Page 10

##### 'SURGE' MOVES

Some rules enable units to make out-of-phase 'surge' moves when a certain trigger occurs. Page 13

#### FAQS

##### GENERAL

Q: Can a unit use a Stratagem while Battle-shocked?
A: No. Battle-shocked units cannot use Stratagems.

##### TIMING/SEQUENCING

Q: If a unit with Fights First is charged, does the charging unit still get its charge bonus?
A: Yes. Fights First and charge bonus are separate mechanics.

## RULES COMMENTARY

##### CHARGING

A unit that is wholly within 1" of an enemy unit at the start of the Charge phase cannot declare a charge. This is a common source of confusion.

##### DESTROYED

When a model is destroyed, remove it from the battlefield immediately. Do not wait until the end of the phase.
`.trim()

describe('parseRulesCommentary', () => {
  const result = parseRulesCommentary(SAMPLE_COMMENTARY, '2026-04-08')

  it('creates commentary nodes from errata entries', () => {
    const commentary = result.nodes.filter(n => n.category === 'commentary')
    expect(commentary.length).toBeGreaterThanOrEqual(2)
  })

  it('creates FAQ nodes from FAQ section', () => {
    const faqs = result.nodes.filter(n => n.category === 'faq')
    expect(faqs.length).toBeGreaterThanOrEqual(2)
  })

  it('creates commentary nodes from Rules Commentary section', () => {
    const charging = result.nodes.find(n => n.title === 'CHARGING')
    expect(charging).toBeDefined()
    expect(charging!.category).toBe('commentary')
    expect(charging!.content).toContain('wholly within')
  })

  it('generates clarifies refs', () => {
    const clarifies = result.refs.filter(r => r.rel === 'clarifies')
    expect(clarifies.length).toBeGreaterThan(0)
  })

  it('extracts page numbers for source attribution', () => {
    const withPage = result.nodes.find(n => n.sources[0]?.page !== undefined)
    expect(withPage).toBeDefined()
  })

  it('sets layer to errata on all nodes', () => {
    for (const node of result.nodes) {
      expect(node.layer).toBe('errata')
    }
  })

  it('skips meta headings like VERSION', () => {
    const version = result.nodes.find(n => n.title.includes('VERSION'))
    expect(version).toBeUndefined()
  })

  it('is idempotent', () => {
    const result2 = parseRulesCommentary(SAMPLE_COMMENTARY, '2026-04-08')
    expect(result2.nodes.map(n => n.id)).toEqual(result.nodes.map(n => n.id))
  })
})
