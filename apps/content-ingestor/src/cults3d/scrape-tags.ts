/**
 * Scrape tags/categories from Cults3D model pages.
 * Adds tags to existing models.json entries.
 * Resumable — skips models that already have tags.
 *
 * Run: npx tsx src/cults3d/scrape-tags.ts
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const BROWSER_STATE = '.local/cults3d/browser-state2'
const MODELS_FILE = '.local/cults3d/models.json'

interface ModelEntry {
  name: string
  modelUrl: string
  tags?: string[]
  categories?: string[]
  [key: string]: any
}

async function main() {
  const models: ModelEntry[] = JSON.parse(readFileSync(MODELS_FILE, 'utf-8'))
  const todo = models.filter(m => !m.tags && m.modelUrl && m.status === 200)

  console.log(`${models.length} total models, ${todo.length} need tags\n`)

  const context = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const page = await context.newPage()

  let scraped = 0

  for (const model of todo) {
    try {
      await page.goto(model.modelUrl, { waitUntil: 'domcontentloaded', timeout: 10000 })
      await page.waitForTimeout(1000)

      const data = await page.evaluate(() => {
        const text = document.body.innerText

        // Extract tags
        const tagMatch = text.match(/TAGS\s+([\s\S]*?)(?:PUBLICATION DATE|3D PRINTER FILE|USAGES|$)/i)
        const tags = tagMatch
          ? tagMatch[1]!.trim().split(/\s*,\s*|\n/).map(t => t.trim()).filter(t => t.length > 0 && t.length < 50)
          : []

        // Extract categories from breadcrumb or category section
        const catMatch = text.match(/CATEGORIES\s+([\s\S]*?)(?:TAGS|PUBLICATION DATE|3D PRINTER FILE|$)/i)
        const categories = catMatch
          ? catMatch[1]!.trim().split(/\s*[,\n]\s*/).map(c => c.trim()).filter(c => c.length > 0 && c.length < 50)
          : []

        return { tags, categories }
      })

      model.tags = data.tags
      model.categories = data.categories
      scraped++
      process.stdout.write('.')

    } catch {
      model.tags = []
      model.categories = []
      scraped++
      process.stdout.write('x')
    }

    // Save after every model
    writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2))

    if (scraped % 50 === 0) {
      console.log(`  [${scraped}/${todo.length}]`)
    }

    await page.waitForTimeout(300)
  }

  await page.close()
  await context.close()

  // Summary
  const withTags = models.filter(m => m.tags && m.tags.length > 0).length
  const terrain = models.filter(m => m.tags?.some(t => /terrain|scenery|ruins|building/i.test(t)) || m.categories?.some(c => /terrain|scenery/i.test(c))).length
  const bits = models.filter(m => m.tags?.some(t => /bits|conversion|weapon|accessori/i.test(t))).length

  console.log(`\n\nDone. ${scraped} scraped.`)
  console.log(`  With tags: ${withTags}`)
  console.log(`  Terrain: ${terrain}`)
  console.log(`  Bits/conversion: ${bits}`)
}

main().catch(console.error)
