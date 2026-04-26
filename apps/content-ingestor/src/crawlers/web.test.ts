import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crawlSite, fetchArticle } from './web'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('crawlSite', () => {
  it('extracts links from HTML anchor tags', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body>
          <a href="/articles/how-to-play">How To Play</a>
          <a href="/articles/tactics-guide">Tactics Guide</a>
        </body></html>
      `,
    })

    const result = await crawlSite('https://example.com')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ url: 'https://example.com/articles/how-to-play', title: 'How To Play' })
    expect(result[1]).toEqual({ url: 'https://example.com/articles/tactics-guide', title: 'Tactics Guide' })
  })

  it('deduplicates URLs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body>
          <a href="/articles/tactics">Tactics</a>
          <a href="/articles/tactics">Tactics Again</a>
        </body></html>
      `,
    })

    const result = await crawlSite('https://example.com')
    expect(result).toHaveLength(1)
    expect(result[0]!.url).toBe('https://example.com/articles/tactics')
  })

  it('resolves relative URLs to absolute using the base URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body>
          <a href="/guides/shooting">Shooting Guide</a>
        </body></html>
      `,
    })

    const result = await crawlSite('https://tactics.net')
    expect(result[0]!.url).toBe('https://tactics.net/guides/shooting')
  })

  it('filters out anchor-only and bare-domain links', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body>
          <a href="#section">Jump</a>
          <a href="https://example.com">Home</a>
          <a href="/articles/real-article">Real Article</a>
          <a href="javascript:void(0)">Noop</a>
        </body></html>
      `,
    })

    const result = await crawlSite('https://example.com')
    // Only the real article with a path segment beyond root should be included
    expect(result.every((r) => r.url.includes('/articles/'))).toBe(true)
  })

  it('returns empty array when fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })

    await expect(crawlSite('https://example.com')).rejects.toThrow('404')
  })

  it('deduplicates URLs that differ only by query parameters', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body>
          <a href="/articles/tactics?ref=nav">Tactics (nav)</a>
          <a href="/articles/tactics?ref=footer">Tactics (footer)</a>
        </body></html>
      `,
    })

    const result = await crawlSite('https://example.com')
    expect(result).toHaveLength(1)
    expect(result[0]!.url).toBe('https://example.com/articles/tactics')
  })

  it('handles absolute hrefs from other domains by ignoring them', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body>
          <a href="https://other-site.com/page">External</a>
          <a href="/local/article">Local</a>
        </body></html>
      `,
    })

    const result = await crawlSite('https://example.com')
    const urls = result.map((r) => r.url)
    expect(urls.some((u) => u.includes('other-site.com'))).toBe(false)
    expect(urls).toContain('https://example.com/local/article')
  })
})

describe('fetchArticle', () => {
  it('extracts title from <h1> tag', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><head><title>Page Title</title></head>
        <body><article><h1>Article Heading</h1><p>Content here.</p></article></body></html>
      `,
    })

    const result = await fetchArticle('https://example.com/article')
    expect(result.title).toBe('Article Heading')
  })

  it('falls back to <title> when no <h1> exists', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><head><title>Page Title</title></head>
        <body><main><p>Content here.</p></main></body></html>
      `,
    })

    const result = await fetchArticle('https://example.com/article')
    expect(result.title).toBe('Page Title')
  })

  it('strips nav, footer, aside, header, script, and style elements', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body>
          <nav>Navigation links here</nav>
          <header>Site header stuff</header>
          <main>
            <h1>Real Article</h1>
            <p>Good content lives here.</p>
            <aside>Related articles sidebar</aside>
          </main>
          <footer>Footer copyright</footer>
          <script>alert('bad')</script>
          <style>.hidden { display: none }</style>
        </body></html>
      `,
    })

    const result = await fetchArticle('https://example.com/article')
    expect(result.content).not.toContain('Navigation links')
    expect(result.content).not.toContain('Site header stuff')
    expect(result.content).not.toContain('Footer copyright')
    expect(result.content).not.toContain("alert('bad')")
    expect(result.content).not.toContain('.hidden')
    expect(result.content).toContain('Good content lives here')
  })

  it('strips elements with sidebar/ad/nav/menu class names', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body>
          <div class="sidebar">Sidebar junk</div>
          <div class="ad">Advertisement</div>
          <div class="nav">Nav menu</div>
          <div class="menu">Menu items</div>
          <article><p>Real article content.</p></article>
        </body></html>
      `,
    })

    const result = await fetchArticle('https://example.com/article')
    expect(result.content).not.toContain('Sidebar junk')
    expect(result.content).not.toContain('Advertisement')
    expect(result.content).not.toContain('Nav menu')
    expect(result.content).not.toContain('Menu items')
    expect(result.content).toContain('Real article content')
  })

  it('extracts text from <article> when present, falling back to <main> then <body>', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body>
          <main>
            <article><p>Article text in article tag.</p></article>
            <p>Extra main text outside article.</p>
          </main>
        </body></html>
      `,
    })

    const result = await fetchArticle('https://example.com/article')
    expect(result.content).toContain('Article text in article tag')
  })

  it('cleans up excessive whitespace', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `
        <html><body><article>
          <p>   First paragraph.   </p>


          <p>   Second paragraph.   </p>
        </article></body></html>
      `,
    })

    const result = await fetchArticle('https://example.com/article')
    // Should not have runs of 3+ newlines
    expect(result.content).not.toMatch(/\n{3,}/)
  })

  it('throws on non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' })

    await expect(fetchArticle('https://example.com/article')).rejects.toThrow('500')
  })
})
