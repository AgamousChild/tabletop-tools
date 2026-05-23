# apps/data-import/client/src/lib/github.ts

> GitHub API client for listing BSData catalog files — legacy client-side fetcher.

## Prompt

Client-side GitHub API utilities for the BSData repository. Originally used for direct client→GitHub fetching before the server-side pipeline was built. Still used as a fallback or for displaying catalog info.

### Types

`CatalogFile` — `{ name, faction, downloadUrl, size }`.
`RateLimitInfo` — `{ remaining, limit, resetAt: Date }`.
`RateLimitError` — Error subclass with `resetAt` property and descriptive message.

### Functions

**`listCatalogFiles(repo?, branch?)`** — fetch GitHub Contents API for the repo root. Parse rate limit headers. On 403 with exhausted rate limit, throw `RateLimitError`. Filter to `.cat` files, map to `CatalogFile` objects with constructed raw download URLs, sort by faction name. Return `{ files, rateLimit }`.

**`getLatestCommitSha(repo?, branch?)`** — fetch latest commit SHA from Commits API. Return null on failure.

**`fetchCatalogXml(file: CatalogFile)`** — fetch the raw XML content from `downloadUrl`. Throw on non-OK response.

### Rate limit header parsing (private)

`parseRateLimitHeaders(headers)` — extract `X-RateLimit-Remaining`, `X-RateLimit-Limit`, `X-RateLimit-Reset` from response headers. Reset is Unix seconds → Date.

## Dependencies

None (uses global `fetch`).

## Contracts

- Default repo: `BSData/wh40k-10e`, default branch: `main`
- Download URLs use `raw.githubusercontent.com` (not the API blob URL)
- All functions handle errors gracefully (null returns or thrown typed errors)
