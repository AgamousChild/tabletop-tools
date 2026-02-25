import { describe, it, expect } from 'vitest'
import { classifyDocument, normalizePdfUrl, cleanTitle } from './scraper'

describe('classifyDocument', () => {
  it('classifies core rules', () => {
    expect(classifyDocument('Core Rules')).toBe('core-rules')
    expect(classifyDocument('Warhammer 40K Core Rules Updates & Commentary')).toBe('core-rules')
    expect(classifyDocument('Balance Dataslate January 2025')).toBe('core-rules')
    expect(classifyDocument('Munitorum Field Manual 2025')).toBe('core-rules')
    expect(classifyDocument('Chapter Approved Tournament Companion')).toBe('core-rules')
  })

  it('classifies faction packs', () => {
    expect(classifyDocument('Space Marines')).toBe('faction-pack')
    expect(classifyDocument('Adepta Sororitas')).toBe('faction-pack')
    expect(classifyDocument('Tyranids Index')).toBe('faction-pack')
  })

  it('is case insensitive', () => {
    expect(classifyDocument('CORE RULES')).toBe('core-rules')
    expect(classifyDocument('balance DATASLATE')).toBe('core-rules')
  })
})

describe('normalizePdfUrl', () => {
  it('returns absolute URLs unchanged', () => {
    const url = 'https://example.com/test.pdf'
    expect(normalizePdfUrl(url, 'https://other.com')).toBe(url)
  })

  it('handles protocol-relative URLs', () => {
    expect(normalizePdfUrl('//cdn.example.com/test.pdf', 'https://example.com')).toBe(
      'https://cdn.example.com/test.pdf',
    )
  })

  it('handles relative URLs', () => {
    expect(normalizePdfUrl('/downloads/test.pdf', 'https://example.com')).toBe(
      'https://example.com/downloads/test.pdf',
    )
  })
})

describe('cleanTitle', () => {
  it('removes "Download" suffix', () => {
    expect(cleanTitle('Core Rules Download')).toBe('Core Rules')
  })

  it('removes "Warhammer 40,000" prefix', () => {
    expect(cleanTitle('Warhammer 40,000 - Core Rules')).toBe('Core Rules')
    expect(cleanTitle('Warhammer 40,000: Space Marines')).toBe('Space Marines')
  })

  it('collapses whitespace', () => {
    expect(cleanTitle('Core   Rules   v2')).toBe('Core Rules v2')
  })

  it('trims result', () => {
    expect(cleanTitle('  Space Marines  ')).toBe('Space Marines')
  })

  it('handles combined cases', () => {
    expect(cleanTitle('  Warhammer 40,000 – Balance Dataslate  Download  ')).toBe(
      'Balance Dataslate',
    )
  })
})
