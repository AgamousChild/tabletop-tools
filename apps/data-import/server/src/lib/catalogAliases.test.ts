/**
 * Characterization tests for the consolidated faction-alias facts.
 *
 * These pin the exact underlying data now that four separate hand-maintained
 * tables (sync.ts ×2, sources/bsdata.ts, sources/faction-pack.ts) have been
 * merged into one source. Each assertion here corresponds to an entry that
 * existed in one of the four original tables — see
 * wargame/w2/95-consolidation-roadmap.md Phase 3 D2-04 #9-12.
 */
import { describe, expect, it } from 'vitest'

import {
  CATALOG_TO_FACTION_SLUG,
  FACTION_NAME_ALIASES,
  FACTION_SLUG_TO_BSDATA_NAME,
  MFM_FACTION_SLUGS,
  SM_CHAPTER_TO_SUBFACTION,
  SM_CHAPTERS,
  SM_CHAPTERS_WITHOUT_MFM,
} from './catalogAliases'

describe('SM_CHAPTERS', () => {
  it('has exactly the 11 BSData Space Marines chapter catalogs', () => {
    expect(SM_CHAPTERS).toHaveLength(11)
    expect(SM_CHAPTERS.map((c) => c.titleCase).sort()).toEqual(
      [
        'Black Templars',
        'Blood Angels',
        'Dark Angels',
        'Deathwatch',
        'Imperial Fists',
        'Iron Hands',
        'Raven Guard',
        'Salamanders',
        'Space Wolves',
        'Ultramarines',
        'White Scars',
      ].sort(),
    )
  })

  it('marks exactly 5 chapters as having a dedicated MFM YAML', () => {
    const withMfm = SM_CHAPTERS.filter((c) => c.hasMfmFile).map((c) => c.slug)
    expect(withMfm.sort()).toEqual(
      ['black-templars', 'blood-angels', 'dark-angels', 'deathwatch', 'space-wolves'].sort(),
    )
  })

  it('marks the other 6 chapters as rolling up to space-marines for MFM', () => {
    expect([...SM_CHAPTERS_WITHOUT_MFM].sort()).toEqual(
      [
        'imperial-fists',
        'iron-hands',
        'raven-guard',
        'salamanders',
        'ultramarines',
        'white-scars',
      ].sort(),
    )
  })
})

describe('CATALOG_TO_FACTION_SLUG (table #1 facts — lowercase-key catalog alias)', () => {
  it('maps every SM chapter (lowercase) to space-marines', () => {
    expect(CATALOG_TO_FACTION_SLUG['black templars']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['blood angels']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['dark angels']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['deathwatch']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['imperial fists']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['iron hands']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['raven guard']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['salamanders']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['space wolves']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['ultramarines']).toBe('space-marines')
    expect(CATALOG_TO_FACTION_SLUG['white scars']).toBe('space-marines')
  })

  it('has exactly 12 entries (11 chapters + agents of the imperium)', () => {
    expect(Object.keys(CATALOG_TO_FACTION_SLUG)).toHaveLength(12)
  })

  it('aliases agents of the imperium to imperial-agents', () => {
    expect(CATALOG_TO_FACTION_SLUG['agents of the imperium']).toBe('imperial-agents')
  })
})

describe('SM_CHAPTER_TO_SUBFACTION (table #3 facts — Title-Case-key subfaction map)', () => {
  it('has exactly the 11 chapters mapped Title-Case → slug', () => {
    expect(SM_CHAPTER_TO_SUBFACTION).toEqual({
      'Black Templars': 'black-templars',
      'Blood Angels': 'blood-angels',
      'Dark Angels': 'dark-angels',
      Deathwatch: 'deathwatch',
      'Imperial Fists': 'imperial-fists',
      'Iron Hands': 'iron-hands',
      'Raven Guard': 'raven-guard',
      Salamanders: 'salamanders',
      'Space Wolves': 'space-wolves',
      Ultramarines: 'ultramarines',
      'White Scars': 'white-scars',
    })
  })
})

describe('MFM_FACTION_SLUGS (table #2 facts)', () => {
  it('has exactly 30 canonical MFM faction slugs', () => {
    expect(MFM_FACTION_SLUGS.size).toBe(30)
  })

  it('includes the 5 SM chapters that have their own MFM file', () => {
    expect(MFM_FACTION_SLUGS.has('black-templars')).toBe(true)
    expect(MFM_FACTION_SLUGS.has('blood-angels')).toBe(true)
    expect(MFM_FACTION_SLUGS.has('dark-angels')).toBe(true)
    expect(MFM_FACTION_SLUGS.has('deathwatch')).toBe(true)
    expect(MFM_FACTION_SLUGS.has('space-wolves')).toBe(true)
  })

  it('does not include the 6 chapters that roll up to space-marines', () => {
    expect(MFM_FACTION_SLUGS.has('imperial-fists')).toBe(false)
    expect(MFM_FACTION_SLUGS.has('iron-hands')).toBe(false)
    expect(MFM_FACTION_SLUGS.has('raven-guard')).toBe(false)
    expect(MFM_FACTION_SLUGS.has('salamanders')).toBe(false)
    expect(MFM_FACTION_SLUGS.has('ultramarines')).toBe(false)
    expect(MFM_FACTION_SLUGS.has('white-scars')).toBe(false)
  })

  it('includes space-marines as the chapter-rollup target', () => {
    expect(MFM_FACTION_SLUGS.has('space-marines')).toBe(true)
  })
})

describe('FACTION_NAME_ALIASES', () => {
  it('has exactly one string-drift alias', () => {
    expect(FACTION_NAME_ALIASES).toEqual({ 'agents of the imperium': 'imperial-agents' })
  })
})

describe('FACTION_SLUG_TO_BSDATA_NAME (table #4 facts — reverse slug → BSData name)', () => {
  it('collapses SM chapter slugs to the single BSData display name Space Marines', () => {
    expect(FACTION_SLUG_TO_BSDATA_NAME['space-marines']).toBe('Space Marines')
    expect(FACTION_SLUG_TO_BSDATA_NAME['blood-angels']).toBe('Space Marines')
    expect(FACTION_SLUG_TO_BSDATA_NAME['dark-angels']).toBe('Space Marines')
    expect(FACTION_SLUG_TO_BSDATA_NAME['black-templars']).toBe('Space Marines')
    expect(FACTION_SLUG_TO_BSDATA_NAME['deathwatch']).toBe('Space Marines')
    expect(FACTION_SLUG_TO_BSDATA_NAME['space-wolves']).toBe('Space Marines')
  })

  it('preserves both defensive-duplicate keys for T’au Empire slug variance', () => {
    expect(FACTION_SLUG_TO_BSDATA_NAME['tau-empire']).toBe("T'au Empire")
    expect(FACTION_SLUG_TO_BSDATA_NAME['t-au-empire']).toBe("T'au Empire")
  })

  it('preserves both defensive-duplicate keys for Emperor’s Children slug variance', () => {
    expect(FACTION_SLUG_TO_BSDATA_NAME['emperors-children']).toBe("Emperor's Children")
    expect(FACTION_SLUG_TO_BSDATA_NAME['emperor-s-children']).toBe("Emperor's Children")
  })

  it('maps agents of the imperium reverse direction', () => {
    expect(FACTION_SLUG_TO_BSDATA_NAME['imperial-agents']).toBe('Agents of the Imperium')
  })

  it('has exactly 30 entries', () => {
    expect(Object.keys(FACTION_SLUG_TO_BSDATA_NAME)).toHaveLength(30)
  })
})
