const DEFAULT_REPO = 'BSData/wh40k-10e'
const DEFAULT_BRANCH = 'main'

export interface CatalogFile {
  name: string
  faction: string
  downloadUrl: string
  size: number
}

interface GitHubContentItem {
  name: string
  size: number
  download_url: string | null
}

export async function listCatalogFiles(
  repo: string = DEFAULT_REPO,
  branch: string = DEFAULT_BRANCH,
): Promise<CatalogFile[]> {
  const url = `https://api.github.com/repos/${repo}/contents?ref=${branch}`
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  })

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  }

  const items: GitHubContentItem[] = await res.json()

  return items
    .filter((item) => item.name.endsWith('.cat') && item.download_url)
    .map((item) => ({
      name: item.name,
      faction: item.name.replace(/\.cat$/, ''),
      downloadUrl: `https://raw.githubusercontent.com/${repo}/${branch}/${item.name}`,
      size: item.size,
    }))
    .sort((a, b) => a.faction.localeCompare(b.faction))
}

export async function fetchCatalogXml(file: CatalogFile): Promise<string> {
  const res = await fetch(file.downloadUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${file.name}: ${res.status} ${res.statusText}`)
  }
  return res.text()
}
