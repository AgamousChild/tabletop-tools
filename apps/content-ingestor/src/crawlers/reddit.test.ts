import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crawlSubreddit, fetchRedditPost } from './reddit'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSubredditJson(posts: Array<{ permalink: string; title: string; score: number }>) {
  return {
    data: {
      children: posts.map((p) => ({ data: p })),
    },
  }
}

function makePostJson(
  post: { title: string; selftext: string },
  comments: Array<{ body: string; score: number }>,
) {
  return [
    { data: { children: [{ data: post }] } },
    { data: { children: comments.map((c) => ({ data: c })) } },
  ]
}

// ── crawlSubreddit ─────────────────────────────────────────────────────────

describe('crawlSubreddit', () => {
  it('parses Reddit JSON format into post objects', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () =>
        makeSubredditJson([
          { permalink: '/r/WarhammerCompetitive/comments/abc/some_post/', title: 'Great Tactics', score: 100 },
          { permalink: '/r/WarhammerCompetitive/comments/def/another_post/', title: 'Shooting Phase Tips', score: 50 },
        ]),
    })

    const result = await crawlSubreddit('https://www.reddit.com/r/WarhammerCompetitive')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      url: 'https://www.reddit.com/r/WarhammerCompetitive/comments/abc/some_post/',
      title: 'Great Tactics',
      score: 100,
    })
  })

  it('filters out posts with score below 10', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () =>
        makeSubredditJson([
          { permalink: '/r/test/comments/a/high_score/', title: 'High', score: 50 },
          { permalink: '/r/test/comments/b/low_score/', title: 'Low', score: 5 },
          { permalink: '/r/test/comments/c/exactly_ten/', title: 'Ten', score: 10 },
          { permalink: '/r/test/comments/d/nine/', title: 'Nine', score: 9 },
        ]),
    })

    const result = await crawlSubreddit('https://www.reddit.com/r/test')
    expect(result).toHaveLength(2)
    expect(result.every((p) => p.score >= 10)).toBe(true)
  })

  it('sorts results by score descending', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () =>
        makeSubredditJson([
          { permalink: '/r/test/comments/a/low/', title: 'Low', score: 20 },
          { permalink: '/r/test/comments/b/high/', title: 'High', score: 200 },
          { permalink: '/r/test/comments/c/mid/', title: 'Mid', score: 50 },
        ]),
    })

    const result = await crawlSubreddit('https://www.reddit.com/r/test')
    expect(result[0]!.score).toBe(200)
    expect(result[1]!.score).toBe(50)
    expect(result[2]!.score).toBe(20)
  })

  it('sends the required User-Agent header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeSubredditJson([]),
    })

    await crawlSubreddit('https://www.reddit.com/r/test')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((options.headers as Record<string, string>)['User-Agent']).toBe('40k-brain-ingestor/1.0')
  })

  it('appends .json?limit= to the subreddit URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeSubredditJson([]),
    })

    await crawlSubreddit('https://www.reddit.com/r/test', 50)

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://www.reddit.com/r/test.json?limit=50')
  })

  it('uses default limit of 100 when none provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeSubredditJson([]),
    })

    await crawlSubreddit('https://www.reddit.com/r/test')

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('limit=100')
  })

  it('throws on non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' })

    await expect(crawlSubreddit('https://www.reddit.com/r/test')).rejects.toThrow('429')
  })
})

// ── fetchRedditPost ────────────────────────────────────────────────────────

describe('fetchRedditPost', () => {
  it('extracts title and selftext from post data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () =>
        makePostJson(
          { title: 'How to Beat Space Marines', selftext: 'Focus fire on characters first.' },
          [],
        ),
    })

    const result = await fetchRedditPost('https://www.reddit.com/r/test/comments/abc/post')
    expect(result.title).toBe('How to Beat Space Marines')
    expect(result.content).toBe('Focus fire on characters first.')
  })

  it('extracts comment bodies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () =>
        makePostJson({ title: 'Post', selftext: 'Body' }, [
          { body: 'Top comment', score: 100 },
          { body: 'Second comment', score: 50 },
        ]),
    })

    const result = await fetchRedditPost('https://www.reddit.com/r/test/comments/abc/post')
    expect(result.comments).toContain('Top comment')
    expect(result.comments).toContain('Second comment')
  })

  it('sorts comments by score descending and takes top 10', async () => {
    const comments = Array.from({ length: 15 }, (_, i) => ({
      body: `Comment ${i}`,
      score: i * 10,
    }))

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makePostJson({ title: 'Post', selftext: 'Body' }, comments),
    })

    const result = await fetchRedditPost('https://www.reddit.com/r/test/comments/abc/post')
    expect(result.comments).toHaveLength(10)
    // First comment should be the highest score (index 14 → score 140)
    expect(result.comments[0]).toBe('Comment 14')
  })

  it('sends the required User-Agent header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makePostJson({ title: 'Post', selftext: '' }, []),
    })

    await fetchRedditPost('https://www.reddit.com/r/test/comments/abc/post')

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((options.headers as Record<string, string>)['User-Agent']).toBe('40k-brain-ingestor/1.0')
  })

  it('appends .json to the post URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makePostJson({ title: 'Post', selftext: '' }, []),
    })

    await fetchRedditPost('https://www.reddit.com/r/test/comments/abc/the_post')

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://www.reddit.com/r/test/comments/abc/the_post.json')
  })

  it('throws on non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' })

    await expect(fetchRedditPost('https://www.reddit.com/r/test/comments/abc/post')).rejects.toThrow('403')
  })
})
