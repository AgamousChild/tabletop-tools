/**
 * Stamp publishedAt dates on community.json nodes using video-dates.txt files.
 *
 * Each video-dates.txt has lines: videoId|||YYYYMMDD
 * Community nodes have sourceUrl like: https://www.youtube.com/watch?v=<videoId>
 *
 * Run: npx tsx src/bcp/stamp-community-dates.ts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const COMMUNITY_JSON = '../brain/server/.local/brain/nodes/community.json'
const INGEST_DIR = '.local/ingest'

function loadVideoDates(dir: string): Map<string, string> {
  const dateFile = path.join(dir, 'video-dates.txt')
  if (!existsSync(dateFile)) return new Map()

  const lines = readFileSync(dateFile, 'utf-8').trim().split('\n').filter(Boolean)
  const map = new Map<string, string>()

  for (const line of lines) {
    const [id, dateStr] = line.split('|||')
    if (id && dateStr && dateStr !== 'NA') {
      // Convert YYYYMMDD to YYYY-MM-DD
      const formatted = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
      map.set(id, formatted)
    }
  }

  return map
}

async function main() {
  // Load all video dates from all ingest directories
  const allDates = new Map<string, string>()
  const dirs = readdirSync(INGEST_DIR).filter(d => {
    const full = path.join(INGEST_DIR, d)
    return existsSync(path.join(full, 'video-dates.txt'))
  })

  for (const dir of dirs) {
    const dates = loadVideoDates(path.join(INGEST_DIR, dir))
    console.log(`  ${dir}: ${dates.size} video dates loaded`)
    for (const [id, date] of dates) allDates.set(id, date)
  }

  console.log(`\nTotal: ${allDates.size} video dates\n`)

  // Also build a map from draft files — match draft sourceUrl to video ID
  // Draft nodes have sourceUrl like: https://www.youtube.com/watch?v=<videoId>
  // Community nodes have id like: community:<slug>

  // Load community.json
  if (!existsSync(COMMUNITY_JSON)) {
    console.error('community.json not found')
    process.exit(1)
  }

  const nodes = JSON.parse(readFileSync(COMMUNITY_JSON, 'utf-8')) as Array<{
    id: string
    sources: Array<{ type: string; publishedAt?: string; retrievedAt: string }>
  }>

  // We need to match community nodes back to their source videos
  // The drafts have sourceUrl — scan draft files for slug → videoId mapping
  let stamped = 0
  let noMatch = 0

  // Build slug → videoId map from draft files (first match wins)
  const slugToVideoId = new Map<string, string>()
  // Also build slug → set of all videoIds for fallback
  const slugToAllVideoIds = new Map<string, Set<string>>()

  for (const dir of readdirSync(INGEST_DIR)) {
    const fullDir = path.join(INGEST_DIR, dir)
    try {
      const files = readdirSync(fullDir).filter(f => f.endsWith('.md'))
      for (const file of files) {
        const content = readFileSync(path.join(fullDir, file), 'utf-8')
        const titleMatch = content.match(/^title:\s*(.+)$/m)
        const urlMatch = content.match(/^sourceUrl:\s*(.+)$/m)
        if (titleMatch && urlMatch) {
          const title = titleMatch[1]!.trim()
          const url = urlMatch[1]!.trim()
          const videoIdMatch = url.match(/[?&]v=([^&]+)/)
          if (videoIdMatch) {
            const slug = `community:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
            if (!slugToVideoId.has(slug)) {
              slugToVideoId.set(slug, videoIdMatch[1]!)
            }
            if (!slugToAllVideoIds.has(slug)) slugToAllVideoIds.set(slug, new Set())
            slugToAllVideoIds.get(slug)!.add(videoIdMatch[1]!)
          }
        }
      }
    } catch { /* skip non-directories */ }
  }

  console.log(`Mapped ${slugToVideoId.size} community node slugs to video IDs\n`)

  for (const node of nodes) {
    // Try direct slug match first
    let videoId = slugToVideoId.get(node.id)

    // Fallback: try any videoId from the slug's set that has a date
    if (!videoId || !allDates.has(videoId)) {
      const candidates = slugToAllVideoIds.get(node.id)
      if (candidates) {
        for (const cid of candidates) {
          if (allDates.has(cid)) { videoId = cid; break }
        }
      }
    }

    if (videoId && allDates.has(videoId)) {
      const date = allDates.get(videoId)!
      for (const src of node.sources) {
        if (!src.publishedAt) {
          src.publishedAt = date
          stamped++
        }
      }
    } else {
      noMatch++
    }
  }

  writeFileSync(COMMUNITY_JSON, JSON.stringify(nodes, null, 2))
  console.log(`Done. ${stamped} sources stamped, ${noMatch} nodes without date match.`)
}

main().catch(console.error)
