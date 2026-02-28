import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SimpleMarkdown, renderMarkdown } from './SimpleMarkdown'

describe('renderMarkdown', () => {
  it('renders bold text', () => {
    const html = renderMarkdown('This is **bold** text')
    expect(html).toContain('<strong')
    expect(html).toContain('bold')
  })

  it('renders italic text', () => {
    const html = renderMarkdown('This is *italic* text')
    expect(html).toContain('<em>')
    expect(html).toContain('italic')
  })

  it('renders links', () => {
    const html = renderMarkdown('Visit [Example](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('Example')
  })

  it('renders headers', () => {
    const html = renderMarkdown('# Big Header')
    expect(html).toContain('<h1')
    expect(html).toContain('Big Header')
  })

  it('renders unordered lists', () => {
    const html = renderMarkdown('- Item one\n- Item two')
    expect(html).toContain('<ul')
    expect(html).toContain('<li>Item one</li>')
    expect(html).toContain('<li>Item two</li>')
  })

  it('renders inline code', () => {
    const html = renderMarkdown('Use `code` here')
    expect(html).toContain('<code')
    expect(html).toContain('code')
  })

  it('escapes HTML entities', () => {
    const html = renderMarkdown('Use <script> tags')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('handles plain text as paragraphs', () => {
    const html = renderMarkdown('Just a line')
    expect(html).toContain('<p')
    expect(html).toContain('Just a line')
  })
})

describe('SimpleMarkdown component', () => {
  it('renders markdown text', () => {
    render(<SimpleMarkdown text="Hello **world**" />)
    expect(screen.getByText('world')).toBeTruthy()
  })

  it('applies custom className', () => {
    const { container } = render(<SimpleMarkdown text="test" className="my-class" />)
    expect(container.firstElementChild?.classList.contains('my-class')).toBe(true)
  })
})
