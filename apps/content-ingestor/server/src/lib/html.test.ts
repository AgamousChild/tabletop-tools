import { describe, it, expect } from 'vitest'
import { fetchArticleText } from './html'

function mockFetch(html: string, status = 200): typeof fetch {
  return async () => new Response(html, { status, headers: { 'content-type': 'text/html' } })
}

function failFetch(): typeof fetch {
  return async () => {
    throw new Error('Network error')
  }
}

describe('fetchArticleText', () => {
  it('extracts text from simple HTML', async () => {
    const html = '<html><body><p>Hello world</p></body></html>'
    const text = await fetchArticleText('https://example.com', mockFetch(html))
    expect(text).toBe('Hello world')
  })

  it('strips script tags and their contents', async () => {
    const html = '<body><p>Keep this</p><script>var x = 1;</script><p>And this</p></body>'
    const text = await fetchArticleText('https://example.com', mockFetch(html))
    expect(text).toBe('Keep this And this')
  })

  it('strips style tags and their contents', async () => {
    const html = '<body><style>.foo { color: red; }</style><p>Visible text</p></body>'
    const text = await fetchArticleText('https://example.com', mockFetch(html))
    expect(text).toBe('Visible text')
  })

  it('strips nav, header, and footer tags', async () => {
    const html = `
      <html>
        <body>
          <header><a href="/">Home</a></header>
          <nav><ul><li>Menu</li></ul></nav>
          <article><p>Article content here</p></article>
          <footer><p>Copyright 2026</p></footer>
        </body>
      </html>`
    const text = await fetchArticleText('https://example.com', mockFetch(html))
    expect(text).toBe('Article content here')
  })

  it('handles case-insensitive tags', async () => {
    const html = '<SCRIPT>alert(1)</SCRIPT><p>Safe</p><STYLE>body{}</STYLE>'
    const text = await fetchArticleText('https://example.com', mockFetch(html))
    expect(text).toBe('Safe')
  })

  it('collapses whitespace', async () => {
    const html = '<body><p>  Multiple   spaces  </p>\n\n<p>  And   newlines  </p></body>'
    const text = await fetchArticleText('https://example.com', mockFetch(html))
    expect(text).toBe('Multiple spaces And newlines')
  })

  it('decodes HTML entities', async () => {
    const html = '<body><p>Tom &amp; Jerry &lt;3 &gt; fun &quot;yes&quot; it&#39;s great</p></body>'
    const text = await fetchArticleText('https://example.com', mockFetch(html))
    expect(text).toBe("Tom & Jerry <3 > fun \"yes\" it's great")
  })

  it('decodes numeric HTML entities', async () => {
    const html = '<body><p>&#169; 2026 &#x2014; dash</p></body>'
    const text = await fetchArticleText('https://example.com', mockFetch(html))
    expect(text).toBe('\u00A9 2026 \u2014 dash')
  })

  it('throws on fetch failure', async () => {
    await expect(fetchArticleText('https://example.com', failFetch())).rejects.toThrow()
  })

  it('throws on non-ok response', async () => {
    const badFetch: typeof fetch = async () => new Response('Not Found', { status: 404 })
    await expect(fetchArticleText('https://example.com', badFetch)).rejects.toThrow('404')
  })

  it('throws on empty result', async () => {
    const html = '<html><head><script>only script</script></head><body></body></html>'
    await expect(fetchArticleText('https://example.com', mockFetch(html))).rejects.toThrow('empty')
  })
})
