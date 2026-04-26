const USER_AGENT = '40k-brain-ingestor/1.0'

// ── Reddit JSON shapes ────────────────────────────────────────────────────

interface RedditPost {
  permalink: string
  title: string
  score: number
}

interface RedditComment {
  body: string
  score: number
}

interface RedditListingResponse {
  data: {
    children: Array<{ data: RedditPost }>
  }
}

interface RedditPostResponse {
  data: {
    children: Array<{ data: { title: string; selftext: string } }>
  }
}

interface RedditCommentsResponse {
  data: {
    children: Array<{ data: RedditComment }>
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch the top posts from a subreddit using the Reddit JSON API.
 * Filters to posts with score >= 10, sorted by score descending.
 */
export async function crawlSubreddit(
  subredditUrl: string,
  limit = 100,
): Promise<Array<{ url: string; title: string; score: number }>> {
  const apiUrl = `${subredditUrl}.json?limit=${limit}`
  const response = await fetch(apiUrl, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(`crawlSubreddit failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as RedditListingResponse

  return data.data.children
    .map(({ data: post }) => ({
      url: `https://www.reddit.com${post.permalink}`,
      title: post.title,
      score: post.score,
    }))
    .filter((post) => post.score >= 10)
    .sort((a, b) => b.score - a.score)
}

/**
 * Fetch a Reddit post and its top 10 comments by score.
 * Returns the post title, selftext content, and top comment bodies.
 */
export async function fetchRedditPost(
  postUrl: string,
): Promise<{ title: string; content: string; comments: string[] }> {
  const apiUrl = `${postUrl}.json`
  const response = await fetch(apiUrl, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(`fetchRedditPost failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as [RedditPostResponse, RedditCommentsResponse]

  const postData = data[0].data.children[0]?.data
  const title = postData?.title ?? ''
  const content = postData?.selftext ?? ''

  const comments = data[1].data.children
    .map(({ data: c }) => ({ body: c.body, score: c.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((c) => c.body)

  return { title, content, comments }
}
