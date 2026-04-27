import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_CONFIG } from './types.ts'
import type { ContentSource } from './types.ts'
import { fetchArticleWithBrowser } from './crawlers/playwright-web.ts'
import { processContent } from './extract/extract.ts'
import { loadExistingNodes } from './extract/dedup.ts'
import { saveDraft } from './drafts/store.ts'

const config = DEFAULT_CONFIG
const outDir = path.join(config.dataDir, 'goonhammer-10th')
mkdirSync(outDir, { recursive: true })

async function main() {
  const articles = JSON.parse(readFileSync('.local/goonhammer-filtered.json', 'utf8')) as Array<{ url: string; title: string }>
  console.log(`Processing ${articles.length} Goonhammer articles\n`)

  const existingNodes = await loadExistingNodes(config.brainNodesDir)
  let totalNodes = 0

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]!
    process.stdout.write(`  [${i + 1}/${articles.length}] ${article.title.substring(0, 55)}...`)

    try {
      const fetched = await fetchArticleWithBrowser(article.url, path.join(outDir, '_temp'))

      if (fetched.content.length < 100) {
        console.log(' (too short, skipping)')
        continue
      }

      const source: ContentSource = {
        url: article.url,
        type: 'article',
        site: 'Goonhammer',
        title: fetched.title,
        fetchedAt: new Date().toISOString(),
      }

      const drafts = await processContent(source, fetched.content, config, existingNodes)

      for (let j = 0; j < drafts.length; j++) {
        await saveDraft(drafts[j]!, outDir, totalNodes + j)
      }

      totalNodes += drafts.length

      if (drafts.length === 0) {
        console.log(' - not relevant')
      } else {
        console.log(` -> ${drafts.length} concepts`)
      }
    } catch (err) {
      console.log(` X Error: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`\nDone. ${totalNodes} drafts in ${outDir}`)
}

main()
