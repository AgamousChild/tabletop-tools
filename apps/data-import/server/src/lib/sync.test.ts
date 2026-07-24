import { describe, expect, it } from 'vitest'

import { bsdataFactionToMfmSlug, validateMfmCounts } from './sync'

/**
 * MFM↔BSData faction slug mapping.
 *
 * BSData carries compound catalog names (`Aeldari - Craftworlds`, `Imperium -
 * Adepta Sororitas`, `Chaos Daemons Library`); MFM publishes one YAML per
 * canonical faction. The mapper rewrites BSData's compound name to the MFM
 * slug so `buildMfmUnitIdMapping`'s (factionSlug, name) key actually hits.
 *
 * Failure modes the rewrite fixes (see
 * docs/reports/2026-06-27-inconsistency-deep-dive.md §2):
 *   - `Aeldari - Craftworlds` was slugifying to `aeldari-craftworlds` (no MFM
 *     match) instead of `aeldari`.
 *   - SM chapters were being rolled up to `space-marines` even when MFM has a
 *     chapter-specific YAML (`black-templars`, `blood-angels`, etc.).
 */

describe('bsdataFactionToMfmSlug', () => {
  describe('compound name truncation — first segment wins', () => {
    it('strips ` - Craftworlds` so Aeldari catalogs map to the aeldari MFM file', () => {
      expect(bsdataFactionToMfmSlug('Aeldari - Craftworlds')).toBe('aeldari')
    })

    it('strips ` - Ynnari` so Ynnari catalogs map to the aeldari MFM file', () => {
      expect(bsdataFactionToMfmSlug('Aeldari - Ynnari')).toBe('aeldari')
    })

    it('takes the parent segment when the source-layer leaves a parent prefix on a sub-faction', () => {
      // Source layer strips `Imperium - ` from `Imperium - Adepta Sororitas`,
      // leaving the bare faction name.
      expect(bsdataFactionToMfmSlug('Adepta Sororitas')).toBe('adepta-sororitas')
    })

    it('takes the sub-faction when MFM has a dedicated file for it (Aeldari - Drukhari → drukhari)', () => {
      // Drukhari has its own MFM YAML, so the BSData sub-faction wins over the
      // generic `Aeldari` parent.
      expect(bsdataFactionToMfmSlug('Aeldari - Drukhari')).toBe('drukhari')
    })
  })

  describe('Library wrapper-catalog suffix/prefix', () => {
    it('strips ` Library` suffix on shared-definition catalogs', () => {
      expect(bsdataFactionToMfmSlug('Chaos Daemons Library')).toBe('chaos-daemons')
    })

    it('strips `Library - ` prefix on cross-faction shared catalogs', () => {
      expect(bsdataFactionToMfmSlug('Library - Tyranids')).toBe('tyranids')
    })

    it('strips compound + Library suffix (Aeldari - Aeldari Library → aeldari)', () => {
      expect(bsdataFactionToMfmSlug('Aeldari - Aeldari Library')).toBe('aeldari')
    })

    it('strips a hyphenated Library segment (Astra Militarum - Library → astra-militarum)', () => {
      expect(bsdataFactionToMfmSlug('Astra Militarum - Library')).toBe('astra-militarum')
    })
  })

  describe('SM-chapter rollup — chapters without MFM files roll up, chapters with MFM files keep their slug', () => {
    it('preserves Black Templars (MFM has black-templars.yaml)', () => {
      expect(bsdataFactionToMfmSlug('Black Templars')).toBe('black-templars')
    })

    it('preserves Blood Angels (MFM has blood-angels.yaml)', () => {
      expect(bsdataFactionToMfmSlug('Blood Angels')).toBe('blood-angels')
    })

    it('preserves Dark Angels, Deathwatch, Space Wolves (each has a dedicated MFM YAML)', () => {
      expect(bsdataFactionToMfmSlug('Dark Angels')).toBe('dark-angels')
      expect(bsdataFactionToMfmSlug('Deathwatch')).toBe('deathwatch')
      expect(bsdataFactionToMfmSlug('Space Wolves')).toBe('space-wolves')
    })

    it('rolls up chapters that have no dedicated MFM YAML to space-marines', () => {
      expect(bsdataFactionToMfmSlug('Ultramarines')).toBe('space-marines')
      expect(bsdataFactionToMfmSlug('Iron Hands')).toBe('space-marines')
      expect(bsdataFactionToMfmSlug('Imperial Fists')).toBe('space-marines')
      expect(bsdataFactionToMfmSlug('Raven Guard')).toBe('space-marines')
      expect(bsdataFactionToMfmSlug('Salamanders')).toBe('space-marines')
      expect(bsdataFactionToMfmSlug('White Scars')).toBe('space-marines')
    })
  })

  describe('name aliases', () => {
    it('aliases `Agents of the Imperium` to `imperial-agents`', () => {
      expect(bsdataFactionToMfmSlug('Agents of the Imperium')).toBe('imperial-agents')
    })

    it('handles T’au Empire apostrophe (slugifies to tau-empire)', () => {
      expect(bsdataFactionToMfmSlug("T'au Empire")).toBe('tau-empire')
    })
  })

  describe('direct slug for simple faction names', () => {
    it('Tyranids → tyranids', () => {
      expect(bsdataFactionToMfmSlug('Tyranids')).toBe('tyranids')
    })

    it('Necrons → necrons, Orks → orks', () => {
      expect(bsdataFactionToMfmSlug('Necrons')).toBe('necrons')
      expect(bsdataFactionToMfmSlug('Orks')).toBe('orks')
    })

    it('Chaos Space Marines and friends slug straight to their MFM equivalents', () => {
      expect(bsdataFactionToMfmSlug('Chaos Space Marines')).toBe('chaos-space-marines')
      expect(bsdataFactionToMfmSlug('Death Guard')).toBe('death-guard')
      expect(bsdataFactionToMfmSlug('Thousand Sons')).toBe('thousand-sons')
      expect(bsdataFactionToMfmSlug('World Eaters')).toBe('world-eaters')
      expect(bsdataFactionToMfmSlug("Emperor's Children")).toBe('emperors-children')
    })

    it('Genestealer Cults, Leagues of Votann — multi-word factions slug correctly', () => {
      expect(bsdataFactionToMfmSlug('Genestealer Cults')).toBe('genestealer-cults')
      expect(bsdataFactionToMfmSlug('Leagues of Votann')).toBe('leagues-of-votann')
    })
  })
})

/**
 * MFM count guard.
 *
 * Prevents "BSData scraper broke and silently dropped everything" from
 * clobbering good R2 data. The exact scenario this catches: 22/7/2026 MFM
 * v1.1 layout change silently dropped 28 of 30 factions' changed units in
 * the BSData scraper for ~16 hours before their PR #25 fixed the selectors.
 */
describe('validateMfmCounts', () => {
  it('passes when there is no baseline (first ever run)', () => {
    expect(validateMfmCounts(undefined, { unitCount: 1805, detachmentCount: 346 })).toEqual({
      ok: true,
    })
  })

  it('passes when a baseline has both counts at 0 — treats as first run', () => {
    expect(
      validateMfmCounts(
        { unitCount: 0, detachmentCount: 0 },
        { unitCount: 1805, detachmentCount: 346 },
      ),
    ).toEqual({ ok: true })
  })

  it('passes when counts are stable or grow', () => {
    expect(
      validateMfmCounts(
        { unitCount: 1800, detachmentCount: 340 },
        { unitCount: 1805, detachmentCount: 346 },
      ).ok,
    ).toBe(true)
  })

  it('passes a small drop within threshold (2% shrink)', () => {
    expect(
      validateMfmCounts(
        { unitCount: 1800, detachmentCount: 340 },
        { unitCount: 1764, detachmentCount: 335 },
      ).ok,
    ).toBe(true)
  })

  it('fails when unit count drops more than 5%', () => {
    const r = validateMfmCounts(
      { unitCount: 1800, detachmentCount: 340 },
      { unitCount: 1000, detachmentCount: 340 },
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('unit drop')
    expect(r.reason).toContain('1800→1000')
  })

  it('fails when detachment count drops more than 5%', () => {
    const r = validateMfmCounts(
      { unitCount: 1800, detachmentCount: 340 },
      { unitCount: 1800, detachmentCount: 200 },
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('detachment drop')
    expect(r.reason).toContain('340→200')
  })

  it('honors a custom threshold', () => {
    // 8% drop with default 5% threshold → fails
    const strict = validateMfmCounts(
      { unitCount: 100, detachmentCount: 10 },
      { unitCount: 92, detachmentCount: 10 },
    )
    expect(strict.ok).toBe(false)

    // Same drop with 10% threshold → passes
    const loose = validateMfmCounts(
      { unitCount: 100, detachmentCount: 10 },
      { unitCount: 92, detachmentCount: 10 },
      10,
    )
    expect(loose.ok).toBe(true)
  })
})
