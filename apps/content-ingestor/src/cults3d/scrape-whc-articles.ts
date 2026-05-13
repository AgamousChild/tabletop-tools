import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const OUTPUT_DIR = '.local/whc'

const ARTICLES = [
  'https://www.warhammer-community.com/en-gb/articles/xlppkx5s/new40k-take-cover-with-updated-terrain-rules/',
  'https://www.warhammer-community.com/en-gb/articles/lxzwueun/new40k-terrain-objectives-make-the-battlefield-your-mission/',
  'https://www.warhammer-community.com/en-gb/articles/weRHuROW/safe-terrain-is-now-simple-terrain-in-the-new-edition-of-warhammer-40000/',
  'https://www.warhammer-community.com/en-gb/articles/ctdexme4/warhammer-40000-the-new-edition-is-revealed-at-adepticon-preview-2026/',
  'https://www.warhammer-community.com/en-gb/articles/oefzq9fg/new40k-how-your-army-affects-your-mission/',
]

async function main() {
  mkdirSync(`${OUTPUT_DIR}/articles`, { recursive: true })
  mkdirSync(`${OUTPUT_DIR}/images`, { recursive: true })

  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  for (let i = 0; i < ARTICLES.length; i++) {
    const url = ARTICLES[i]!
    const slug = url.split('/').filter(Boolean).pop()!
    console.log(`\n[${i + 1}/${ARTICLES.length}] ${slug}\n`)

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(3000)

      // Get article content
      const article = await page.evaluate(() => {
        const title = document.querySelector('h1')?.textContent?.trim() || ''
        const date = document.querySelector('time')?.textContent?.trim() ||
                     document.querySelector('[datetime]')?.getAttribute('datetime') || ''

        // Get all text content from article body
        const body = document.querySelector('article, .article-content, [class*="article"], main')
        const text = body?.innerText || document.body.innerText

        // Get all images
        const images = Array.from(document.querySelectorAll('img'))
          .map(img => ({
            src: img.src || img.getAttribute('data-src') || '',
            alt: img.alt || '',
            width: img.naturalWidth || img.width,
          }))
          .filter(img => img.src && !img.src.includes('logo') && !img.src.includes('icon') && img.width > 200)

        return { title, date, text: text.substring(0, 10000), images }
      })

      console.log(`  Title: ${article.title}`)
      console.log(`  Date: ${article.date}`)
      console.log(`  Text length: ${article.text.length}`)
      console.log(`  Images: ${article.images.length}`)

      // Save article text
      writeFileSync(`${OUTPUT_DIR}/articles/${slug}.txt`, `# ${article.title}\n\nDate: ${article.date}\nURL: ${url}\n\n${article.text}`)

      // Download images
      for (let j = 0; j < article.images.length; j++) {
        const img = article.images[j]!
        if (!img.src.startsWith('http')) continue
        try {
          const response = await page.evaluate(async (src: string) => {
            const r = await fetch(src)
            const blob = await r.blob()
            const reader = new FileReader()
            return new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string)
              reader.readAsDataURL(blob)
            })
          }, img.src)

          // Extract base64 and save
          const base64 = response.split(',')[1]
          if (base64) {
            const ext = img.src.match(/\.(png|jpg|jpeg|webp|gif)/i)?.[1] || 'jpg'
            const filename = `${slug}-${j}.${ext}`
            writeFileSync(`${OUTPUT_DIR}/images/${filename}`, Buffer.from(base64, 'base64'))
            console.log(`  Saved image: ${filename} (${img.alt || 'no alt'})`)
          }
        } catch {
          console.log(`  Failed to download image ${j}`)
        }
      }

      // Take full page screenshot
      await page.screenshot({ path: `${OUTPUT_DIR}/articles/${slug}.png`, fullPage: true })
      console.log(`  Screenshot saved`)

    } catch (err) {
      console.log(`  ERROR: ${(err as Error).message?.substring(0, 60)}`)
    }
  }

  await page.close()
  await browser.close()
  console.log('\nDone.')
}

main().catch(console.error)
