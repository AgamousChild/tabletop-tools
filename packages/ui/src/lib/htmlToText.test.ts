import { describe, expect, it } from 'vitest'
import { htmlToText } from './htmlToText'

describe('htmlToText', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('')
  })

  it('passes through plain text', () => {
    expect(htmlToText('Hello world')).toBe('Hello world')
  })

  it('converts <br> to newline', () => {
    expect(htmlToText('Line 1<br>Line 2')).toBe('Line 1\nLine 2')
    expect(htmlToText('Line 1<br/>Line 2')).toBe('Line 1\nLine 2')
    expect(htmlToText('Line 1<br />Line 2')).toBe('Line 1\nLine 2')
  })

  it('converts <p> tags to newlines', () => {
    expect(htmlToText('<p>First paragraph</p><p>Second paragraph</p>')).toBe(
      'First paragraph\n\nSecond paragraph',
    )
  })

  it('converts <li> to bullet points', () => {
    expect(htmlToText('<ul><li>Item one</li><li>Item two</li></ul>')).toBe(
      '• Item one\n• Item two',
    )
  })

  it('strips bold and italic tags but keeps text', () => {
    expect(htmlToText('This is <b>bold</b> and <em>italic</em>')).toBe(
      'This is bold and italic',
    )
    expect(htmlToText('<strong>Strong text</strong>')).toBe('Strong text')
  })

  it('decodes HTML entities', () => {
    expect(htmlToText('5&quot; range &amp; 3&lt;4')).toBe('5" range & 3<4')
    expect(htmlToText('Test&nbsp;value')).toBe('Test value')
    expect(htmlToText('em&mdash;dash')).toBe('em—dash')
  })

  it('strips unknown tags', () => {
    expect(htmlToText('<span class="foo">text</span>')).toBe('text')
    expect(htmlToText('<table><tr><td>cell</td></tr></table>')).toBe('cell')
  })

  it('collapses excessive whitespace', () => {
    expect(htmlToText('  Hello   world  ')).toBe('Hello world')
    expect(htmlToText('<br><br><br>Text')).toBe('Text')
  })

  it('handles Wahapedia-style ability description', () => {
    const html =
      '<b>Oath of Moment:</b> At the start of your Command phase, select one unit from your opponent\'s army. Until the start of your next Command phase, each time a model in this unit makes an attack that targets that unit, you can re-roll the Hit roll.'
    const result = htmlToText(html)
    expect(result).toContain('Oath of Moment:')
    expect(result).toContain('re-roll the Hit roll')
    expect(result).not.toContain('<')
  })
})
