# apps/content-ingestor/src/crawlers/reddit.ts

> Crawl subreddits and fetch Reddit posts with comments via JSON API.

## Prompt

**`crawlSubreddit(subredditUrl, limit?)`** — hit Reddit's `.json` endpoint, filter posts by score ≥10, sort by score descending. Return `Array<{ url, title }>`.

**`fetchRedditPost(postUrl)`** — fetch post `.json` endpoint, extract title, selftext, and top 10 comments by score. Custom User-Agent header. Return `{ title, content, comments }`.

## Dependencies

None (uses global `fetch`).
