import { describe, expect, it } from 'vitest'

import { parseTwists, splitDesignerNote, TWIST_SLUGS, TWIST_TITLES } from './twists'

// All fixture text below is SYNTHETIC — it shadows the rules-text token
// fingerprints just enough for the parser to identify each card, without
// reproducing the real GW card text. See Data Boundary in CLAUDE.md.

const SYNTHETIC_TWISTS_INPUT = `
z:
C,
:e
:c
m
Made-up flavor sentence about cover for Nowhere to Hide.
Terrain features do not have the
Solid rule.
Designer's Note: Synthetic note for nowhere-to-hide.

Made-up flavor sentence about battleline for Martial Pride.
A BATTLELINE unit can start an action
in a turn in which it made an advance move.
A BATTLELINE unit can shoot in a turn in
which it started an action.
Designer's Note: Synthetic note for martial-pride.

:r::
-
:::a
Made-up flavor about rival warlords for Mirrored World.
The players both replace their Primary
Mission card with the same one of the
following.
Designer's Note: Synthetic note for mirrored-world.

Made-up flavor about decades of war for Ruinscape.
When a unit makes a normal or advance
move, models in that unit have the
MOBILE keyword until that move ends.
Designer's Note: Synthetic note for ruinscape.

Scrambled communications and intertwined vox-channels are everywhere.
The players exchange their Primary
Mission cards.
Designer's Note: Synthetic note for scrambled-communications.

Made-up flavor about a shroud of darkness.
Each unit is not visible to enemy models
unless they are within 18" of that unit, and
each unit cannot be targeted by [INDIRECT FIRE] weapons.
Designer's Note: Synthetic note for night-fighting.
`

describe('parseTwists', () => {
  it('emits one node per recognized twist slug', () => {
    const result = parseTwists(SYNTHETIC_TWISTS_INPUT, { retrievedAt: '2026-06-29T00:00:00Z' })
    expect(result.missing).toEqual([])
    expect(result.recognized.sort()).toEqual([...TWIST_SLUGS].sort())
    expect(result.nodes).toHaveLength(6)
  })

  it('tags every node as 11th edition and category twist', () => {
    const result = parseTwists(SYNTHETIC_TWISTS_INPUT)
    for (const node of result.nodes) {
      expect(node.edition).toBe('11th')
      expect(node.category).toBe('twist')
      expect(node.layer).toBe('core')
      expect(node.sources[0]!.type).toBe('community')
      expect(node.id).toMatch(/^ca11:twist:/)
    }
  })

  it('uses canonical display titles', () => {
    const result = parseTwists(SYNTHETIC_TWISTS_INPUT)
    const ruinscape = result.nodes.find((n) => n.id === 'ca11:twist:ruinscape')!
    expect(ruinscape.title).toBe(TWIST_TITLES.ruinscape)
    expect(ruinscape.title).toBe('Ruinscape')
  })

  it("separates Designer's Note from body when present", () => {
    const result = parseTwists(SYNTHETIC_TWISTS_INPUT)
    const node = result.nodes.find((n) => n.id === 'ca11:twist:ruinscape')!
    expect(node.content).toContain("Designer's Note: Synthetic note for ruinscape")
    // The body itself (rules text) should not include the literal "Designer's Note" prefix.
    const body = node.content.split('Designer')[0]!
    expect(body).toContain('MOBILE keyword')
  })

  it('reports missing slugs when input lacks them', () => {
    const partial = `
Made-up flavor about cover.
Terrain features do not have the
Solid rule.
Designer's Note: only nowhere-to-hide present.
`
    const result = parseTwists(partial)
    expect(result.recognized).toEqual(['nowhere-to-hide'])
    expect(result.missing).toHaveLength(TWIST_SLUGS.length - 1)
  })
})

describe('splitDesignerNote', () => {
  it("extracts the Designer's Note tail", () => {
    const { body, designerNote } = splitDesignerNote(
      "Some flavor. Terrain features do not have the Solid rule. Designer's Note: this is the note.",
    )
    expect(body).toContain('Solid rule')
    expect(designerNote).toBe('this is the note.')
  })

  it('returns no flavor when no rules marker is present', () => {
    const { flavor, body } = splitDesignerNote('Just a single block of text with no markers.')
    expect(flavor).toBeUndefined()
    expect(body).toBe('Just a single block of text with no markers.')
  })

  it('walks back to the previous sentence boundary for flavor cut', () => {
    const { flavor, body } = splitDesignerNote(
      'Narrative intro paragraph ends here. A BATTLELINE unit can do things.',
    )
    expect(flavor).toBe('Narrative intro paragraph ends here.')
    expect(body).toBe('A BATTLELINE unit can do things.')
  })
})
