/**
 * Build a single HTML gallery of the English-overlay images for review.
 * Usage: node scripts/11th-ingest/build-gallery.mjs <overlaysDir>
 *   expects <overlaysDir>/cards/*.png and <overlaysDir>/rules/*.png; writes <overlaysDir>/index.html
 */
import { readdirSync, writeFileSync, existsSync } from 'node:fs'

const dir = process.argv[2]
const list = (sub) => (existsSync(`${dir}/${sub}`) ? readdirSync(`${dir}/${sub}`).filter((f) => f.endsWith('.png')).sort() : [])
const cards = list('cards')
const rules = list('rules')

const fig = (sub, f) => `<figure><img loading="lazy" src="${sub}/${f}"><figcaption>${f.replace('.png', '')}</figcaption></figure>`
const html = `<!doctype html><html><head><meta charset="utf-8"><title>11th Edition — English overlays</title>
<style>
 body{background:#1b1b1b;color:#eee;font-family:system-ui,sans-serif;margin:24px}
 h1{font-size:20px} h2{margin:1.6em 0 .6em;border-bottom:1px solid #444;padding-bottom:4px}
 .g{display:flex;flex-wrap:wrap;gap:14px}
 figure{margin:0;width:300px;background:#262626;padding:6px;border-radius:6px}
 img{width:100%;display:block;border:1px solid #333}
 figcaption{font-size:11px;color:#9a9a9a;margin-top:4px;word-break:break-all}
</style></head><body>
<h1>11th Edition — English overlays &nbsp;·&nbsp; ${cards.length} mission cards + ${rules.length} rules pages</h1>
<h2>Mission cards (${cards.length})</h2><div class="g">${cards.map((f) => fig('cards', f)).join('')}</div>
<h2>Rules pages (${rules.length})</h2><div class="g">${rules.map((f) => fig('rules', f)).join('')}</div>
</body></html>`

writeFileSync(`${dir}/index.html`, html)
console.log(`wrote ${dir}/index.html — ${cards.length} cards + ${rules.length} rules = ${cards.length + rules.length} images`)
