#!/usr/bin/env node
// Renders the landing page from the app-roster manifest.
//
// Reads landing/index.html (template), injects:
//   <!--CARDS-->   -> one <a class="card"> per apps.json entry with
//                     showOnLanding: true, in manifest order
//   <!--VERSION--> -> "v<version> &middot; " (same behavior as the old
//                     sed substitution in build.sh)
//
// Usage: node render-landing.mjs <version> <output-path>
// Called by build.sh; safe to run standalone for a local preview.
//
// See wargame/w2/decisions/D2-02-deploy-topology-roster-manifest.md for
// why the roster lives in apps.json and nowhere else.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const [version, outputPath] = process.argv.slice(2)
if (!version || !outputPath) {
  console.error('Usage: node render-landing.mjs <version> <output-path>')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(here, 'apps.json'), 'utf8'))
const template = readFileSync(join(here, 'landing', 'index.html'), 'utf8')

if (!template.includes('<!--CARDS-->')) {
  console.error('ERROR: landing/index.html is missing the <!--CARDS--> marker')
  process.exit(1)
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const cards = manifest.apps
  .filter((app) => app.showOnLanding)
  .map(
    (app) => `    <a class="card" href="/${app.slug}/">
      <div class="card-title">${escapeHtml(app.title)}</div>
      <div class="card-desc">${escapeHtml(app.description)}</div>
    </a>`,
  )
  .join('\n')

const html = template
  .replace('<!--CARDS-->', `\n${cards}\n`)
  .replaceAll('<!--VERSION-->', `v${version} &middot; `)

writeFileSync(outputPath, html)
console.log(
  `Landing page rendered: ${outputPath} (${manifest.apps.filter((a) => a.showOnLanding).length} cards, v${version})`,
)
