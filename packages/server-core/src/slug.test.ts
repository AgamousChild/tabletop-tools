import { describe, expect, it } from 'vitest'

import { slugify } from './slug'

// ============================================================
// Characterization tests — these lock in the exact behavior of
// the seven call sites this primitive replaces (D2-07 items 1-2,
// wargame/w2/95-consolidation-roadmap.md Phase 2). Every case here
// was verified against the *original* inline functions before the
// cutover; do not "fix" a case without confirming the call site
// that depended on it no longer needs the old behavior.
// ============================================================

describe('slugify — default options (content-ingestor: nodes.ts, commit.ts, commit-process-queue.ts, drafts/store.ts)', () => {
  it('lowercases and hyphenates non-alphanumeric runs', () => {
    expect(slugify('World Eaters')).toBe('world-eaters')
  })

  it('does not strip apostrophes — they become hyphens', () => {
    expect(slugify("Emperor's Children")).toBe('emperor-s-children')
    expect(slugify("T'au Empire")).toBe('t-au-empire')
  })

  it('trims leading/trailing hyphens from whitespace and punctuation', () => {
    expect(slugify('  Leading/Trailing Spaces  ')).toBe('leading-trailing-spaces')
    expect(slugify('---Already Hyphenated---')).toBe('already-hyphenated')
  })

  it('collapses unicode apostrophe variants to a hyphen (no stripping by default)', () => {
    expect(slugify('Foo’s Bar')).toBe('foo-s-bar') // right single quote
    expect(slugify('Foo′s Bar')).toBe('foo-s-bar') // prime
    expect(slugify('Foo‘s Bar')).toBe('foo-s-bar') // left single quote
  })

  it('collapses straight and curly double quotes to a hyphen', () => {
    expect(slugify('Foo"Quoted"Bar')).toBe('foo-quoted-bar')
    expect(slugify('Foo“Curly”Bar')).toBe('foo-curly-bar')
  })

  it('does not truncate by default', () => {
    const long = 'A'.repeat(80) + ' ' + 'B'.repeat(80)
    expect(slugify(long)).toBe('a'.repeat(80) + '-' + 'b'.repeat(80))
  })

  it('returns empty string for all-whitespace or all-punctuation input', () => {
    expect(slugify('   ')).toBe('')
    expect(slugify('!!!')).toBe('')
  })

  it('drops non-ASCII letters entirely (not just diacritics)', () => {
    expect(slugify('Ünïcödé Chårs')).toBe('n-c-d-ch-rs')
  })
})

describe('slugify — contentEntitySlug options (data-import: sync.ts, content-producer.ts)', () => {
  const opts = { stripChars: /[’ʼ'‘"”“]/g, maxLength: 60 }

  it('strips apostrophes/smart quotes before hyphenation (no double-hyphen)', () => {
    expect(slugify("Emperor's Children", opts)).toBe('emperors-children')
    expect(slugify("T'au Empire", opts)).toBe('tau-empire')
  })

  it('strips right single quote and left single quote but not prime', () => {
    expect(slugify('Foo’s Bar', opts)).toBe('foos-bar') // right single quote — stripped
    expect(slugify('Foo‘s Bar', opts)).toBe('foos-bar') // left single quote — stripped
    expect(slugify('Foo′s Bar', opts)).toBe('foo-s-bar') // prime — NOT stripped, becomes hyphen
  })

  it('strips straight and curly double quotes', () => {
    expect(slugify('Foo"Quoted"Bar', opts)).toBe('fooquotedbar')
    expect(slugify('Foo“Curly”Bar', opts)).toBe('foocurlybar')
  })

  it('truncates to 60 chars after slugification', () => {
    const long = 'A'.repeat(80) + ' ' + 'B'.repeat(80)
    expect(slugify(long, opts)).toBe('a'.repeat(60))
    expect(slugify(long, opts).length).toBe(60)
  })

  it('unaffected cases match the default behavior', () => {
    expect(slugify('World Eaters', opts)).toBe('world-eaters')
    expect(slugify('  Leading/Trailing Spaces  ', opts)).toBe('leading-trailing-spaces')
    expect(slugify('---Already Hyphenated---', opts)).toBe('already-hyphenated')
    expect(slugify('   ', opts)).toBe('')
    expect(slugify('!!!', opts)).toBe('')
  })
})

describe('slugify — faction-pack options (data-import: sources/faction-pack.ts)', () => {
  const opts = { stripChars: /['‘’′"'"]/g }

  it('strips apostrophes and prime before hyphenation', () => {
    expect(slugify("Emperor's Children", opts)).toBe('emperors-children')
    expect(slugify("T'au Empire", opts)).toBe('tau-empire')
    expect(slugify('Foo′s Bar', opts)).toBe('foos-bar') // prime IS stripped here (divergent from contentEntitySlug)
  })

  it('does NOT strip curly double quotes — this is the verified divergence from contentEntitySlug', () => {
    expect(slugify('Foo“Curly”Bar', opts)).toBe('foo-curly-bar')
  })

  it('strips straight double quote', () => {
    expect(slugify('Foo"Quoted"Bar', opts)).toBe('fooquotedbar')
  })

  it('does not truncate', () => {
    const long = 'A'.repeat(80) + ' ' + 'B'.repeat(80)
    expect(slugify(long, opts)).toBe('a'.repeat(80) + '-' + 'b'.repeat(80))
  })
})

describe('slugify — extract-detachments namespacing (content-ingestor: meta/extract-detachments.ts)', () => {
  // extract-detachments.ts keeps its own two-arg `slugify(name, factionSlug)`
  // signature and calls the shared fn internally with default options,
  // prefixing `${factionSlug}:`. Verified here at the primitive level —
  // the wrapper itself is exercised via its own call site, not this file.
  it('default-options output is what the namespacing wrapper prefixes', () => {
    expect(`space-marines:${slugify("Emperor's Children")}`).toBe(
      'space-marines:emperor-s-children',
    )
    expect(`space-marines:${slugify('   ')}`).toBe('space-marines:')
  })
})
