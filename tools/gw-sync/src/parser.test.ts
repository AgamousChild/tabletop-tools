import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { textToMarkdown, generateIndex } from './parser'

describe('textToMarkdown', () => {
  it('adds title as H1', () => {
    const md = textToMarkdown('Core Rules', 'Some text')
    expect(md).toMatch(/^# Core Rules\n/)
  })

  it('converts ALL CAPS lines to H2 headings', () => {
    const md = textToMarkdown('Test', 'MOVEMENT PHASE\nMove your units.')
    expect(md).toContain('## Movement Phase')
  })

  it('skips standalone page numbers', () => {
    const md = textToMarkdown('Test', 'Some text\n42\nMore text')
    expect(md).not.toMatch(/^42$/m)
  })

  it('converts bullet points', () => {
    const md = textToMarkdown('Test', '• First item\n● Second item\n— Third item')
    expect(md).toContain('- First item')
    expect(md).toContain('- Second item')
    expect(md).toContain('- Third item')
  })

  it('collapses multiple blank lines', () => {
    const md = textToMarkdown('Test', 'Line 1\n\n\n\n\nLine 2')
    expect(md).not.toContain('\n\n\n')
  })

  it('preserves regular text', () => {
    const md = textToMarkdown('Test', 'This is a normal paragraph.')
    expect(md).toContain('This is a normal paragraph.')
  })

  it('does not convert short ALL CAPS words to headers', () => {
    const md = textToMarkdown('Test', 'Use AP -1.')
    expect(md).not.toContain('## ')
  })

  it('trims whitespace', () => {
    const md = textToMarkdown('Test', '  indented text  ')
    expect(md).toContain('indented text')
  })
})

describe('generateIndex', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gw-idx-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates INDEX.md with sections', () => {
    generateIndex(tempDir, [
      { title: 'Core Rules', mdFileName: 'core-rules.md', category: 'core-rules' },
      { title: 'Space Marines', mdFileName: 'space-marines.md', category: 'faction-pack' },
    ])

    const content = readFileSync(join(tempDir, 'INDEX.md'), 'utf-8')
    expect(content).toContain('# GW Warhammer 40,000 Downloads')
    expect(content).toContain('## Core Rules')
    expect(content).toContain('[Core Rules](./core-rules.md)')
    expect(content).toContain('## Faction Packs')
    expect(content).toContain('[Space Marines](./space-marines.md)')
  })

  it('omits empty sections', () => {
    generateIndex(tempDir, [
      { title: 'Core Rules', mdFileName: 'core-rules.md', category: 'core-rules' },
    ])

    const content = readFileSync(join(tempDir, 'INDEX.md'), 'utf-8')
    expect(content).toContain('## Core Rules')
    expect(content).not.toContain('## Faction Packs')
  })

  it('handles empty entries list', () => {
    generateIndex(tempDir, [])

    const content = readFileSync(join(tempDir, 'INDEX.md'), 'utf-8')
    expect(content).toContain('# GW Warhammer 40,000 Downloads')
    expect(content).not.toContain('## Core Rules')
  })
})
