import { describe, it, expect } from 'vitest'
import { parsePipeCsv, stripHtml } from './csv-parser'

describe('parsePipeCsv', () => {
  it('parses pipe-delimited CSV with headers', () => {
    const csv = `id|name|faction_id
1|Intercessors|SM
2|Boyz|ORK`
    const rows = parsePipeCsv(csv)
    expect(rows).toEqual([
      { id: '1', name: 'Intercessors', faction_id: 'SM' },
      { id: '2', name: 'Boyz', faction_id: 'ORK' },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(parsePipeCsv('')).toEqual([])
  })

  it('returns empty array for headers only', () => {
    const csv = 'id|name|faction_id'
    expect(parsePipeCsv(csv)).toEqual([])
  })

  it('handles trailing newlines', () => {
    const csv = `id|name
1|Test

`
    const rows = parsePipeCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ id: '1', name: 'Test' })
  })

  it('trims whitespace from headers and values', () => {
    const csv = ` id | name \n 1 | Foo `
    const rows = parsePipeCsv(csv)
    expect(rows[0]).toEqual({ id: '1', name: 'Foo' })
  })

  it('handles missing values as empty strings', () => {
    const csv = `id|name|extra
1|Test`
    const rows = parsePipeCsv(csv)
    expect(rows[0]).toEqual({ id: '1', name: 'Test', extra: '' })
  })

  it('handles rows with more values than headers', () => {
    const csv = `id|name
1|Test|extra_val`
    const rows = parsePipeCsv(csv)
    expect(rows[0].id).toBe('1')
    expect(rows[0].name).toBe('Test')
  })
})

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<b>Bold</b> text')).toBe('Bold text')
  })

  it('converts <br> to newlines', () => {
    expect(stripHtml('line1<br>line2')).toBe('line1\nline2')
    expect(stripHtml('line1<br/>line2')).toBe('line1\nline2')
    expect(stripHtml('line1<br />line2')).toBe('line1\nline2')
  })

  it('decodes HTML entities', () => {
    expect(stripHtml('&amp; &lt; &gt; &quot; &#39;')).toBe('& < > " \'')
  })

  it('handles &nbsp;', () => {
    expect(stripHtml('word&nbsp;word')).toBe('word word')
  })

  it('trims result', () => {
    expect(stripHtml('  <p>test</p>  ')).toBe('test')
  })

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('')
  })
})
