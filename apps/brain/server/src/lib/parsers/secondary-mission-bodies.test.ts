import { describe, expect, it } from 'vitest'

import { matchChunkToSecondarySlug, parseSecondaryBodies } from './secondary-mission-bodies'

// Synthetic fixtures: the strings below shadow the fingerprint tokens just
// enough for the parser to identify each card, without reproducing real GW
// card text. See Data Boundary in CLAUDE.md.

const SYNTHETIC_BODIES = `
Synthetic flavor for beacon.
WHEN DRAWN: Select one friendly unit to be your beacon unit.
WHEN: End of your opponent's turn.
beacon unit text rules.

Synthetic flavor for outflank.
WHEN: End of your turn
Friendly units within battlefield edges. opposite battlefield edges synthetic clause.

Synthetic flavor for plunder.
WHEN DRAWN: synthetic plunder clause.
WHEN: End of your turn
A terrain area was plundered this turn.

Synthetic flavor for no prisoners showing no mercy.
WHEN: End of a turn
For each enemy unit destroyed this turn exterminate them.

Synthetic flavor for assassination targeting CHARACTER models.
WHEN: End of a turn
For each enemy CHARACTER model destroyed this turn.

Synthetic flavor for cleanse Purify these locations.
WHEN: End of your turn
One objective was cleansed by your army this turn.
`

describe('matchChunkToSecondarySlug', () => {
  it('matches a beacon chunk', () => {
    expect(matchChunkToSecondarySlug('the beacon unit is on the battlefield')).toBe('beacon')
  })

  it('matches a no-prisoners chunk via no mercy + exterminate', () => {
    expect(
      matchChunkToSecondarySlug('Show no mercy. exterminate your enemies. WHEN: End of a turn.'),
    ).toBe('no-prisoners')
  })

  it('returns null for a chunk with no fingerprint matches', () => {
    expect(matchChunkToSecondarySlug('this chunk has no recognized tokens')).toBeNull()
  })
})

describe('parseSecondaryBodies', () => {
  it('extracts body text for recognized slugs from a multi-card transcript', () => {
    const result = parseSecondaryBodies(SYNTHETIC_BODIES)
    // We deliberately wrote 6 cards into the fixture.
    expect(result.recognized.sort()).toEqual(
      ['assassination', 'beacon', 'cleanse', 'no-prisoners', 'outflank', 'plunder'].sort(),
    )
    expect(result.bodyBySlug.get('plunder')).toContain('plundered')
    expect(result.bodyBySlug.get('beacon')).toContain('beacon unit')
  })

  it('returns empty recognized when no fingerprints match', () => {
    const input = `
WHEN: End of your turn
something completely synthetic and unrecognizable for the matcher.
`
    const result = parseSecondaryBodies(input)
    expect(result.recognized).toEqual([])
    expect(result.missing).toHaveLength(18)
  })

  it('reports missing slugs from the canonical list', () => {
    const result = parseSecondaryBodies(SYNTHETIC_BODIES)
    // 18 secondary slugs total - 6 in fixture = 12 missing.
    expect(result.missing).toContain('a-grievous-blow')
    expect(result.missing).toContain('forward-position')
    expect(result.recognized).not.toContain('a-grievous-blow')
  })

  it('keeps the longer body when multiple chunks map to the same slug', () => {
    const input = `
WHEN: End of a turn
For each enemy unit destroyed this turn exterminate brief text.

WHEN: End of your turn
no mercy detailed second chunk for the same card with extra extra extra exterminate text.
`
    const result = parseSecondaryBodies(input)
    expect(result.bodyBySlug.get('no-prisoners')).toContain('detailed second chunk')
  })
})
