import { describe, it, expect } from 'vitest'
import {
  RELEVANCE_PROMPT,
  CLEANUP_PROMPT,
  EXTRACTION_PROMPT,
  TIMESTAMP_PROMPT,
  GLOSSARY,
} from './prompts'

describe('RELEVANCE_PROMPT', () => {
  it('instructs the LLM to answer YES or NO', () => {
    expect(RELEVANCE_PROMPT).toMatch(/YES/i)
    expect(RELEVANCE_PROMPT).toMatch(/NO/i)
  })

  it('focuses on competitive/tactical 40K content', () => {
    expect(RELEVANCE_PROMPT).toMatch(/compet/i)
    expect(RELEVANCE_PROMPT).toMatch(/tactic/i)
  })

  it('excludes lore, painting, and hobby content', () => {
    expect(RELEVANCE_PROMPT).toMatch(/lore|painting|hobby/i)
  })
})

describe('CLEANUP_PROMPT', () => {
  it('contains major faction names for terminology correction', () => {
    expect(CLEANUP_PROMPT).toMatch(/Khorne/)
    expect(CLEANUP_PROMPT).toMatch(/Nurgle/)
    expect(CLEANUP_PROMPT).toMatch(/Slaanesh/)
    expect(CLEANUP_PROMPT).toMatch(/Tzeentch/)
  })

  it('includes misheard term mappings', () => {
    expect(CLEANUP_PROMPT).toMatch(/corn|"corn"/i)
    expect(CLEANUP_PROMPT).toMatch(/Berzerker/i)
    expect(CLEANUP_PROMPT).toMatch(/T'au/i)
  })

  it('instructs to keep meaning identical', () => {
    expect(CLEANUP_PROMPT).toMatch(/meaning|identical|only.*fix|fix.*only/i)
  })

  it('includes common unit names', () => {
    expect(CLEANUP_PROMPT).toMatch(/Intercessor/i)
    expect(CLEANUP_PROMPT).toMatch(/Eightbound/i)
  })
})

describe('EXTRACTION_PROMPT', () => {
  it('instructs the LLM to return a JSON array', () => {
    expect(EXTRACTION_PROMPT).toMatch(/JSON array/i)
  })

  it('specifies required fields including confidence', () => {
    expect(EXTRACTION_PROMPT).toMatch(/title/)
    expect(EXTRACTION_PROMPT).toMatch(/summary/)
    expect(EXTRACTION_PROMPT).toMatch(/content/)
    expect(EXTRACTION_PROMPT).toMatch(/keywords/)
    expect(EXTRACTION_PROMPT).toMatch(/confidence/)
    expect(EXTRACTION_PROMPT).toMatch(/category/)
  })

  it('includes example output', () => {
    // Should contain at least one example object with real content
    expect(EXTRACTION_PROMPT).toMatch(/"title"/)
    expect(EXTRACTION_PROMPT).toMatch(/"summary"/)
  })

  it('defines the three category values', () => {
    expect(EXTRACTION_PROMPT).toMatch(/tactic/)
    expect(EXTRACTION_PROMPT).toMatch(/ruling/)
    expect(EXTRACTION_PROMPT).toMatch(/worked-example/)
  })

  it('describes confidence as a 0-1 scale', () => {
    expect(EXTRACTION_PROMPT).toMatch(/0[- ]?(?:to|–|-)[- ]?1|0\.0.*1\.0/)
  })
})

describe('TIMESTAMP_PROMPT', () => {
  it('asks for timestamps with visual demonstrations', () => {
    expect(TIMESTAMP_PROMPT).toMatch(/timestamp/i)
    expect(TIMESTAMP_PROMPT).toMatch(/visual|tabletop|board|screen/i)
  })

  it('returns JSON array with timestamp and description fields', () => {
    expect(TIMESTAMP_PROMPT).toMatch(/JSON array/i)
    expect(TIMESTAMP_PROMPT).toMatch(/timestamp/)
    expect(TIMESTAMP_PROMPT).toMatch(/description/)
  })

  it('specifies deployment and movement examples', () => {
    expect(TIMESTAMP_PROMPT).toMatch(/deployment|movement|terrain/i)
  })
})

describe('GLOSSARY', () => {
  it('contains common faction abbreviations', () => {
    expect(GLOSSARY).toMatch(/WE.*World Eaters|World Eaters.*WE/)
    expect(GLOSSARY).toMatch(/SM.*Space Marines|Space Marines.*SM/)
    expect(GLOSSARY).toMatch(/CSM.*Chaos Space Marines|Chaos Space Marines.*CSM/)
  })

  it('includes T\'au faction reference', () => {
    expect(GLOSSARY).toMatch(/T'au/)
  })

  it('contains game rule terminology', () => {
    expect(GLOSSARY).toMatch(/CP|Command Point/i)
  })
})
