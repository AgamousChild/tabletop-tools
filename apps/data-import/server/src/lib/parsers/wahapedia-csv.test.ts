import { describe, expect, it } from 'vitest'

import {
  convertDescriptions,
  htmlToMarkdown,
  parsePipeCsv,
  stripHtml,
  titleCase,
} from './wahapedia-csv'

describe('parsePipeCsv', () => {
  it('parses pipe-delimited CSV with headers', () => {
    const raw = 'id|name|value\n1|foo|bar\n2|baz|qux'
    const result = parsePipeCsv(raw)
    expect(result).toEqual([
      { id: '1', name: 'foo', value: 'bar' },
      { id: '2', name: 'baz', value: 'qux' },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(parsePipeCsv('')).toEqual([])
  })

  it('returns empty array for headers only', () => {
    const result = parsePipeCsv('id|name')
    expect(result).toEqual([])
  })

  it('trims whitespace from headers and values', () => {
    const raw = ' id | name \n 1 | hello world '
    const result = parsePipeCsv(raw)
    expect(result).toEqual([{ id: '1', name: 'hello world' }])
  })

  it('handles missing values (fewer pipes than headers)', () => {
    const raw = 'a|b|c\n1|2'
    const result = parsePipeCsv(raw)
    expect(result).toEqual([{ a: '1', b: '2', c: '' }])
  })

  it('skips empty lines', () => {
    const raw = 'id|name\n\n1|foo\n\n2|bar\n'
    const result = parsePipeCsv(raw)
    expect(result).toEqual([
      { id: '1', name: 'foo' },
      { id: '2', name: 'bar' },
    ])
  })
})

describe('stripHtml', () => {
  it('strips simple HTML tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold')
  })

  it('converts <br> to newlines', () => {
    expect(stripHtml('line1<br/>line2')).toBe('line1\nline2')
  })

  it('decodes HTML entities', () => {
    expect(stripHtml('&amp; &lt; &gt; &quot; &#39; &nbsp;')).toBe('& < > " \'')
  })

  it('trims result', () => {
    expect(stripHtml('  hello  ')).toBe('hello')
  })
})

describe('htmlToMarkdown', () => {
  it('returns plain text unchanged', () => {
    expect(htmlToMarkdown('no html here')).toBe('no html here')
  })

  it('returns empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('')
  })

  it('converts <b> to markdown bold', () => {
    expect(htmlToMarkdown('<b>bold</b>')).toBe('**bold**')
  })

  it('converts <i> and <em> to markdown italic', () => {
    expect(htmlToMarkdown('<i>italic</i>')).toBe('*italic*')
    expect(htmlToMarkdown('<em>emphasized</em>')).toBe('*emphasized*')
  })

  it('converts <span class="kwb"> to bold', () => {
    expect(htmlToMarkdown('<span class="kwb">keyword</span>')).toBe('**keyword**')
  })

  it('strips other span tags keeping text', () => {
    expect(htmlToMarkdown('<span class="foo">text</span>')).toBe('text')
  })

  it('converts <br> to newline', () => {
    expect(htmlToMarkdown('line1<br/>line2')).toBe('line1\nline2')
  })

  it('converts <p> to text with newlines', () => {
    expect(htmlToMarkdown('<p>paragraph</p>')).toBe('paragraph')
  })

  it('converts <li> to bullet items', () => {
    expect(htmlToMarkdown('<ul><li>item1</li><li>item2</li></ul>')).toContain('- item1')
    expect(htmlToMarkdown('<ul><li>item1</li><li>item2</li></ul>')).toContain('- item2')
  })

  it('decodes HTML entities', () => {
    expect(htmlToMarkdown('<b>&amp;</b>')).toBe('**&**')
  })

  it('collapses excessive newlines', () => {
    const input = '<p>a</p><p></p><p></p><p>b</p>'
    const result = htmlToMarkdown(input)
    expect(result).not.toContain('\n\n\n')
  })
})

describe('titleCase', () => {
  it('converts uppercase to title case', () => {
    expect(titleCase('HELLO WORLD')).toBe('Hello World')
  })

  it('normalizes curly apostrophes', () => {
    expect(titleCase('HELL\u2019S GATE')).toBe("Hell's Gate")
  })

  it('handles single word', () => {
    expect(titleCase('TEST')).toBe('Test')
  })
})

describe('convertDescriptions', () => {
  it('applies htmlToMarkdown to the description field', () => {
    const rows = [
      { id: '1', description: '<b>bold</b>' },
      { id: '2', description: 'plain text' },
    ]
    const result = convertDescriptions(rows)
    expect(result[0]!.description).toBe('**bold**')
    expect(result[1]!.description).toBe('plain text')
  })

  it('handles custom field name', () => {
    const rows = [{ id: '1', text: '<i>italic</i>' }]
    const result = convertDescriptions(rows, 'text')
    expect(result[0]!.text).toBe('*italic*')
  })

  it('skips non-string fields', () => {
    const rows = [{ id: '1', description: 42 }]
    const result = convertDescriptions(rows)
    expect(result[0]!.description).toBe(42)
  })
})
