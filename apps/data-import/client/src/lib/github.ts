const DEFAULT_REPO = 'BSData/wh40k-10e'
const DEFAULT_BRANCH = 'main'

export interface CatalogFile {
  name: string
  faction: string
  downloadUrl: string
  size: number
}

export interface RateLimitInfo {
  remaining: number
  limit: number
  resetAt: Date
}

export class RateLimitError extends Error {
  resetAt: Date
  constructor(resetAt: Date, message?: string) {
    super(message ?? `GitHub API rate limit exceeded. Try again at ${resetAt.toLocaleTimeString()}.`)
    this.name = 'RateLimitError'
    this.resetAt = resetAt
  }
}

interface GitHubContentItem {
  name: string
  size: number
  download_url: string | null
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const remaining = headers.get('X-RateLimit-Remaining')
  const limit = headers.get('X-RateLimit-Limit')
  const reset = headers.get('X-RateLimit-Reset')
  if (remaining == null || limit == null || reset == null) return null
  return {
    remaining: parseInt(remaining, 10),
    limit: parseInt(limit, 10),
    resetAt: new Date(parseInt(reset, 10) * 1000),
  }
}

export async function listCatalogFiles(
  repo: string = DEFAULT_REPO,
  branch: string = DEFAULT_BRANCH,
): Promise<{ files: CatalogFile[]; rateLimit: RateLimitInfo | null }> {
  const url = `https://api.github.com/repos/${repo}/contents?ref=${branch}`
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  })

  const rateLimit = parseRateLimitHeaders(res.headers)

  if (!res.ok) {
    if (res.status === 403 && rateLimit && rateLimit.remaining === 0) {
      throw new RateLimitError(rateLimit.resetAt)
    }
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  }

  const items: GitHubContentItem[] = await res.json()

  const files = items
    .filter((item) => item.name.endsWith('.cat') && item.download_url)
    .map((item) => ({
      name: item.name,
      faction: item.name.replace(/\.cat$/, ''),
      downloadUrl: `https://raw.githubusercontent.com/${repo}/${branch}/${item.name}`,
      size: item.size,
    }))
    .sort((a, b) => a.faction.localeCompare(b.faction))

  return { files, rateLimit }
}

export async function getLatestCommitSha(
  repo: string = DEFAULT_REPO,
  branch: string = DEFAULT_BRANCH,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits/${branch}`,
      { headers: { Accept: 'application/vnd.github.v3+json' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.sha ?? null
  } catch {
    return null
  }
}

export async function fetchCatalogXml(file: CatalogFile): Promise<string> {
  const res = await fetch(file.downloadUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${file.name}: ${res.status} ${res.statusText}`)
  }
  return res.text()
}
