/**
 * Scrape all downloaded 3D models from Cults3D.
 * Two-phase: collect URLs (cached), then scrape details (resumable).
 *
 * Run: npx tsx src/cults3d/scrape-models.ts
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BROWSER_STATE = '.local/cults3d/browser-state2'
const OUTPUT_DIR = '.local/cults3d'
const URLS_FILE = path.join(OUTPUT_DIR, 'urls.json')
const MODELS_FILE = path.join(OUTPUT_DIR, 'models.json')

mkdirSync(OUTPUT_DIR, { recursive: true })

interface UrlEntry {
  modelUrl: string
  downloadUrl: string
  orderNo: string
  date: string
  price: string
}

interface ModelEntry {
  name: string
  modelUrl: string
  downloadUrl: string
  thumbnailUrl: string
  description: string
  designer: string
  status: number
  gwUnitGuess: string
  orderNo: string
  date: string
  price: string
  scrapedAt: string
}

// ── Phase 1: Collect URLs (cached) ──────────────────────────────────────────

async function collectUrls(page: any): Promise<UrlEntry[]> {
  if (existsSync(URLS_FILE)) {
    const cached = JSON.parse(readFileSync(URLS_FILE, 'utf-8')) as UrlEntry[]
    console.log(`Phase 1: ${cached.length} URLs loaded from cache\n`)
    return cached
  }

  console.log('Phase 1: Collecting URLs from orders pages...\n')
  const entries: UrlEntry[] = []
  let pageNum = 1

  while (true) {
    const url = pageNum === 1
      ? 'https://cults3d.com/en/orders'
      : `https://cults3d.com/en/orders?page=${pageNum}`

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    } catch {
      try {
        await page.waitForTimeout(2000)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      } catch {
        console.log(`  Page ${pageNum}: timeout twice — stopping`)
        break
      }
    }
    await page.waitForTimeout(1500)

    const pageResult = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr')
      const results: Array<{ modelUrl: string; downloadUrl: string; orderNo: string; date: string; price: string }> = []
      rows.forEach((row: any) => {
        const cells = row.querySelectorAll('td')
        if (cells.length < 4) return
        const modelLink = cells[2]?.querySelector('a[href*="/3d-model/"]')
        const downloadLink = row.querySelector('a[href*="/orders/"]')
        results.push({
          modelUrl: modelLink?.href || '',
          downloadUrl: downloadLink?.href || '',
          orderNo: cells[0]?.textContent?.trim() || '',
          date: cells[1]?.textContent?.trim() || '',
          price: cells[3]?.textContent?.trim() || '',
        })
      })
      return { entries: results, rowCount: rows.length }
    })

    if (pageResult.rowCount === 0) break
    const pageEntries = pageResult.entries.filter(e => e.modelUrl)

    entries.push(...pageEntries)
    writeFileSync(URLS_FILE, JSON.stringify(entries, null, 2))
    console.log(`  Page ${pageNum}: ${pageEntries.length} models, ${pageResult.rowCount} rows (${entries.length} total)`)
    pageNum++
    if (pageNum > 200) break
  }

  writeFileSync(URLS_FILE, JSON.stringify(entries, null, 2))
  console.log(`\nSaved ${entries.length} URLs to ${URLS_FILE}\n`)
  return entries
}

// ── Phase 2: Scrape details (resumable) ─────────────────────────────────────

async function scrapeDetails(page: any, urls: UrlEntry[]): Promise<void> {
  let models: ModelEntry[] = []
  if (existsSync(MODELS_FILE)) {
    models = JSON.parse(readFileSync(MODELS_FILE, 'utf-8'))
  }
  const done = new Set(models.map(m => m.modelUrl))
  const todo = urls.filter(u => !done.has(u.modelUrl))

  console.log(`Phase 2: ${models.length} already scraped, ${todo.length} remaining\n`)

  for (let i = 0; i < todo.length; i++) {
    const entry = todo[i]!
    try {
      await page.goto(entry.modelUrl, { waitUntil: 'domcontentloaded', timeout: 10000 })
      await page.waitForTimeout(1000)

      const is404 = await page.evaluate(() =>
        document.title.includes('404') ||
        document.body.innerText.includes('Page not found') ||
        document.body.innerText.includes('This creation does not exist')
      )

      if (is404) {
        models.push({
          name: entry.modelUrl.split('/').pop()?.replace(/-/g, ' ') || '',
          modelUrl: entry.modelUrl, downloadUrl: entry.downloadUrl,
          thumbnailUrl: '', description: '', designer: '',
          status: 404, gwUnitGuess: '',
          orderNo: entry.orderNo, date: entry.date, price: entry.price,
          scrapedAt: new Date().toISOString(),
        })
        process.stdout.write('X')
      } else {
        const data = await page.evaluate(() => {
          const name = document.querySelector('h1')?.textContent?.trim() || ''
          const thumbnail = (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content || ''
          const bodyText = document.body.innerText
          const descMatch = bodyText.match(/3D MODEL DESCRIPTION\s*([\s\S]*?)(?:CATEGORIES|LICENSE|TAGS|$)/i)
          const description = descMatch ? descMatch[1]!.trim() : ''
          const designerMatch = bodyText.match(/DESIGN AUTHOR\s+(\S+)/i)
          const designer = designerMatch ? designerMatch[1]! : ''
          return { name, thumbnail, description: description.substring(0, 2000), designer }
        })

        models.push({
          name: data.name, modelUrl: entry.modelUrl, downloadUrl: entry.downloadUrl,
          thumbnailUrl: data.thumbnail, description: data.description, designer: data.designer,
          status: 200, gwUnitGuess: guessGWUnit(data.name, data.description),
          orderNo: entry.orderNo, date: entry.date, price: entry.price,
          scrapedAt: new Date().toISOString(),
        })
        process.stdout.write('.')
      }
    } catch {
      models.push({
        name: entry.modelUrl.split('/').pop()?.replace(/-/g, ' ') || '',
        modelUrl: entry.modelUrl, downloadUrl: entry.downloadUrl,
        thumbnailUrl: '', description: '', designer: '',
        status: 0, gwUnitGuess: '',
        orderNo: entry.orderNo, date: entry.date, price: entry.price,
        scrapedAt: new Date().toISOString(),
      })
      process.stdout.write('x')
    }

    // Save after EVERY model
    writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2))

    if ((i + 1) % 50 === 0) {
      console.log(`  [${i + 1}/${todo.length}]`)
    }
  }

  const alive = models.filter(m => m.status === 200).length
  const dead = models.filter(m => m.status === 404).length
  const errs = models.filter(m => m.status === 0).length
  const matched = models.filter(m => m.gwUnitGuess).length

  console.log(`\n\nDone. ${models.length} models.`)
  console.log(`  Live: ${alive} | 404: ${dead} | Error: ${errs} | GW matched: ${matched}`)
}

// ── GW unit matching ────────────────────────────────────────────────────────

function guessGWUnit(name: string, description: string): string {
  const t = `${name} ${description}`.toLowerCase()

  const MATCHES: Array<[string[], string]> = [
    // Faction aliases
    [['stinky', 'stink', 'plague marine', 'poxwalker', 'death guard', 'nurgle marine'], 'Death Guard'],
    [['battle nun', 'battle nuns', 'sister', 'sororitas'], 'Adepta Sororitas'],
    [['666', 'silvery knight', 'grey knight'], 'Grey Knights'],
    [['space bug', 'tyranid', 'hive', 'genestealer'], 'Tyranids'],
    [['knife ear', 'pointy ear', 'dire space elf', 'drukhari', 'dark eldar'], 'Drukhari'],
    [['aeldari', 'eldar', 'craftworld'], 'Aeldari'],
    [['fish people', 'fish', 'tau', 'fire warrior'], "T'au Empire"],
    [['green tide', 'ork', 'orky'], 'Orks'],
    [['tin boy', 'robot', 'necron'], 'Necrons'],
    [['golden boy', 'banana', 'custodes', 'custodian'], 'Adeptus Custodes'],
    [['angry marine', 'angry boy', 'world eater', 'khorne'], 'World Eaters'],
    [['dust boy', 'thousand son', 'rubric'], 'Thousand Sons'],
    [['space dwarf', 'votann', 'squat'], 'Leagues of Votann'],
    [['dna-enjoyer', 'dna enjoyer', 'genestealer cult'], 'Genestealer Cults'],
    [['noise marine', 'audio', 'amplifier', 'speaker', 'sonic'], "Emperor's Children"],
    [['old man big cat', 'lion el', 'lionel'], 'Lion El\'Jonson'],
    [['crusade addict', 'black templar'], 'Black Templars'],

    // Specific units
    [['angron'], 'Angron'],
    [['berzerker', 'berserker'], 'Khorne Berzerkers'],
    [['eightbound', 'eight bound'], 'Eightbound'],
    [['exalted eightbound'], 'Exalted Eightbound'],
    [['kharn', 'khârn'], 'Khârn the Betrayer'],
    [['jakhals', 'jackal'], 'Jakhals'],
    [['bloodthirster'], 'Bloodthirster'],
    [['daemon prince'], 'Daemon Prince'],
    [['helbrute', 'hellbrute'], 'Helbrute'],
    [['dreadnought'], 'Dreadnought'],
    [['land raider'], 'Land Raider'],
    [['rhino'], 'Rhino'],
    [['defiler'], 'Defiler'],
    [['maulerfiend'], 'Maulerfiend'],
    [['forgefiend'], 'Forgefiend'],
    [['heldrake'], 'Heldrake'],
    [['terminator'], 'Terminators'],
    [['lieutenant'], 'Lieutenant'],
    [['captain'], 'Captain'],
    [['intercessor'], 'Intercessors'],
    [['warboss'], 'Warboss'],
    [['meganob', 'mega nob'], 'Meganobz'],
    [['trukk'], 'Trukk'],
    [['battlewagon'], 'Battlewagon'],
    [['nob'], 'Nobz'],
    [['grot', 'gretchin'], 'Gretchin'],
    [['silent king', 'szarekh'], 'The Silent King'],
    [['wraith', 'canoptek wraith'], 'Canoptek Wraiths'],
    [['flayed one'], 'Flayed Ones'],
    [['destroyer', 'lokhust'], 'Lokhust Destroyers'],
    [['doomsday ark'], 'Doomsday Ark'],
    [['space marine'], 'Space Marines'],
    [['imperial knight'], 'Imperial Knights'],
    [['chaos knight'], 'Chaos Knights'],
  ]

  for (const [keywords, unit] of MATCHES) {
    if (keywords.some(k => t.includes(k))) return unit
  }
  return ''
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const page = await context.newPage()

  const urls = await collectUrls(page)
  await scrapeDetails(page, urls)

  await page.close()
  await context.close()
}

main().catch(console.error)
