/**
 * harvest.ts — Pull recent question-shaped posts from 40K subreddits.
 *
 * Usage:
 *   npx tsx scripts/eval-ask/harvest.ts [--limit=500] [--out=path.jsonl]
 *
 * Reddit's public `.json` endpoints work without OAuth but require a
 * distinct User-Agent. We hit `/r/{sub}/new.json` and page with the
 * `after` cursor until we have enough candidates OR run out of posts
 * within the age window.
 *
 * Filter: title ends with '?' OR starts with a question word OR has a
 * flair indicating a question. Skip: painting/showcase/lore/meme posts,
 * stickied posts, removed posts.
 *
 * Output: JSONL of HarvestedQuestion, one row per line, sorted by sub +
 * age descending. Idempotent when re-run against an existing output
 * (skips posts already present by id).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

import type { HarvestedQuestion } from './types'

// Load .env from repo root without a runtime dependency on dotenv.
// One-liner: parse KEY=VALUE per line, ignore comments / blanks.
function loadEnvFromFile(): void {
  const envPath = join(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  for (const raw of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
loadEnvFromFile()

const SUBREDDITS = [
  'AdeptusMechanicus',
  'BlackTemplars',
  'BloodAngels',
  'Chaos40k',
  'ChaosKnights',
  'CompetitiveWH40k',
  'deathguard40k',
  'deathwatch40k',
  'Drukhari',
  'Eldar',
  'EmperorsChildren',
  'genestealercult',
  'ImperialAgents_40K',
  'ImperialKnights',
  'IronHands40k',
  'Necrons40k',
  'orks',
  'PoorHammer',
  'sistersofbattle',
  'spacemarines',
  'Tau40K',
  'TheAstraMilitarum',
  'ThousandSons',
  'TTSWarhammer40k',
  'Tyranids',
  'UnitCrunch',
  'Warhammer',
  'Warhammer40k',
  'WarhammerCompetitive',
  'WorldEaters40k',
]

const SIX_MONTHS_SECONDS = 180 * 24 * 60 * 60
const MAX_POSTS_PER_SUB = 100 // hard cap per sub even before deduping/filtering
// Data source: arctic-shift — post-Pushshift Reddit archive maintained by
// the Photon Reddit team. Full Reddit post objects (title, selftext, flair,
// created_utc, permalink) served from their own DB with no Reddit auth
// required. Reddit's own API blocks unauth JSON with 403 across every
// domain from any network we tested; OAuth setup is gated behind Reddit's
// paid-tier API rules. arctic-shift sidesteps all of it.
//
// API docs: https://arctic-shift.photon-reddit.com
// Endpoint: /api/posts/search?subreddit=X&limit=N&after=UTC&sort=desc
//   &sort_type=created_utc
const ARCTIC_SHIFT_HOST = process.env.ARCTIC_SHIFT_HOST ?? 'https://arctic-shift.photon-reddit.com'
const HARVEST_UA = process.env.HARVEST_UA ?? 'tabletop-tools-eval/1.0'

const QUESTION_LEAD_WORDS =
  /^\s*(how|what|which|why|does|do|can|could|should|would|is|are|when|where|will|has|have|any\b|help|need|any\s+advice|any\s+ideas|new\s+player|newbie|first\s+time|starting|getting\s+into)\b/i

const HOBBY_NOISE_TITLE =
  /\b(paint|painted|painting|showcase|shwocase|art|finished|wip|kitbash|converted|conversion|display|diorama|hobby|memes?|meme|shitpost|cursed|for\s+sale|selling|bought|got\s+my|arrived|unboxing)\b/i

const HOBBY_NOISE_FLAIR =
  /painting|hobby|showcase|art|diorama|conversion|kitbash|meme|humor|photo|photograph/i

const QUESTION_FLAIR =
  /question|help|rules?|list\s+help|list\s+building|tactics?|new\s+player|newbie|advice/i

interface RedditPost {
  id: string
  title: string
  selftext: string
  created_utc: number
  permalink: string
  link_flair_text: string | null
  num_comments: number
  stickied: boolean
  removed_by_category: string | null
  over_18?: boolean
}

/**
 * Fetch a page of posts from arctic-shift. Uses `before` as the pagination
 * cursor (unix seconds) — arctic-shift sorts descending by created_utc,
 * so each subsequent call passes the oldest-post-timestamp from the prior
 * page as `before` to walk backward through history.
 */
async function fetchArcticShiftPage(
  sub: string,
  cutoffUtc: number,
  before: number | null,
): Promise<{ posts: RedditPost[]; oldestUtc: number | null }> {
  const params = new URLSearchParams({
    subreddit: sub,
    limit: '100',
    sort: 'desc',
    sort_type: 'created_utc',
    after: String(cutoffUtc),
  })
  if (before !== null) params.set('before', String(before))
  const url = `${ARCTIC_SHIFT_HOST}/api/posts/search?${params.toString()}`
  const resp = await fetch(url, {
    headers: { 'User-Agent': HARVEST_UA, Accept: 'application/json' },
  })
  if (!resp.ok) {
    throw new Error(`arctic-shift /r/${sub} → HTTP ${resp.status} ${resp.statusText}`)
  }
  const body = (await resp.json()) as { data: RedditPost[] }
  const posts = body.data ?? []
  const oldestUtc = posts.length > 0 ? Math.min(...posts.map((p) => p.created_utc)) : null
  return { posts, oldestUtc }
}

function isQuestionShape(post: RedditPost): boolean {
  const title = post.title.trim()
  const flair = post.link_flair_text ?? ''

  if (HOBBY_NOISE_FLAIR.test(flair)) return false
  if (HOBBY_NOISE_TITLE.test(title)) return false

  if (title.endsWith('?')) return true
  if (QUESTION_LEAD_WORDS.test(title)) return true
  if (QUESTION_FLAIR.test(flair)) return true
  return false
}

function normalizeQuestion(post: RedditPost): string {
  const title = post.title.trim()
  const body = post.selftext.trim()
  if (!body) return title
  // Cap body at ~2000 chars — long body posts are usually list-building
  // rambles that we still want to feed to /ask, but not TB-scale.
  const trimmedBody = body.length > 2000 ? body.slice(0, 2000) + '…' : body
  return `${title}\n\n${trimmedBody}`
}

async function harvestSub(
  sub: string,
  cutoffUtc: number,
  alreadyWrittenIds: ReadonlySet<string>,
): Promise<HarvestedQuestion[]> {
  const out: HarvestedQuestion[] = []
  // Only used to de-dupe within this sub's paginated pages; NEVER pollutes
  // the caller's "already-written" set (that's read-only from disk).
  const seenThisSub = new Set<string>()
  let before: number | null = null
  let pagesFetched = 0
  const MAX_PAGES = 5 // 5 × 100 = up to 500 posts scanned per sub

  while (pagesFetched < MAX_PAGES && out.length < MAX_POSTS_PER_SUB) {
    let posts: RedditPost[]
    let oldestUtc: number | null
    try {
      const page = await fetchArcticShiftPage(sub, cutoffUtc, before)
      posts = page.posts
      oldestUtc = page.oldestUtc
    } catch (e) {
      console.error(`  [${sub}] fetch failed: ${e instanceof Error ? e.message : e}`)
      break
    }
    pagesFetched++

    if (posts.length === 0) break

    for (const post of posts) {
      if (post.stickied) continue
      if (post.removed_by_category) continue
      if (alreadyWrittenIds.has(post.id)) continue // skip prior-run entries
      if (seenThisSub.has(post.id)) continue // within-sub dedupe (paging overlap)
      if (post.created_utc < cutoffUtc) continue
      if (!isQuestionShape(post)) continue

      out.push({
        id: post.id,
        subreddit: sub,
        title: post.title.trim(),
        body: (post.selftext ?? '').trim(),
        flair: post.link_flair_text ?? undefined,
        createdAtIso: new Date(post.created_utc * 1000).toISOString(),
        permalink: `https://www.reddit.com${post.permalink}`,
        numComments: post.num_comments,
        question: normalizeQuestion(post),
      })
      seenThisSub.add(post.id)
      if (out.length >= MAX_POSTS_PER_SUB) break
    }

    // Advance the cursor. If the page's oldest post is already past our
    // cutoff, we've walked back far enough to stop.
    if (oldestUtc === null || oldestUtc <= cutoffUtc) break
    before = oldestUtc

    // Small pause between pages (arctic-shift is a shared community
    // service — don't hammer it).
    await new Promise((r) => setTimeout(r, 500))
  }

  return out
}

async function main(): Promise<void> {
  const args = new Map<string, string>()
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) args.set(m[1]!, m[2]!)
  }
  const limit = Number(args.get('limit') ?? '500')
  const outPath = args.get('out') ?? 'scripts/eval-ask/.data/questions.jsonl'
  mkdirSync(dirname(outPath), { recursive: true })

  const cutoffUtc = Math.floor(Date.now() / 1000) - SIX_MONTHS_SECONDS
  const seen = new Set<string>()
  if (existsSync(outPath)) {
    const existing = readFileSync(outPath, 'utf-8').trim().split('\n').filter(Boolean)
    for (const line of existing) {
      try {
        const q = JSON.parse(line) as HarvestedQuestion
        seen.add(q.id)
      } catch {
        /* skip malformed line */
      }
    }
    console.log(`Resuming: ${seen.size} question(s) already harvested at ${outPath}`)
  }

  // Always fetch from every sub so the balanced sample below can draw
  // fairly. A chatty sub's 100 hits shouldn't starve smaller subs.
  const all: HarvestedQuestion[] = []
  for (const sub of SUBREDDITS) {
    process.stdout.write(`Fetching /r/${sub} … `)
    const rows = await harvestSub(sub, cutoffUtc, seen)
    all.push(...rows)
    console.log(`+${rows.length} (running total ${all.length + seen.size})`)
    // Sub-to-sub pause (arctic-shift is a shared service).
    await new Promise((r) => setTimeout(r, 500))
  }

  // Balance the sample. Compute per-sub cap from the remaining budget
  // divided across ALL subs that actually returned questions. Round-robin
  // across subs to fill the balanced list — small subs contribute what
  // they can, chatty subs cap at perSub.
  const bySub = new Map<string, HarvestedQuestion[]>()
  for (const q of all) {
    if (!bySub.has(q.subreddit)) bySub.set(q.subreddit, [])
    bySub.get(q.subreddit)!.push(q)
  }
  const remainingBudget = Math.max(0, limit - seen.size)
  const perSub = Math.max(5, Math.ceil(remainingBudget / Math.max(1, bySub.size)))
  const balanced: HarvestedQuestion[] = []
  // Round-robin fill so if we hit the budget mid-way, every sub still got
  // a fair shot at contributing.
  const iters = [...bySub.entries()].map(([sub, rows]) => ({ sub, rows, idx: 0 }))
  while (balanced.length < remainingBudget) {
    let progressed = false
    for (const it of iters) {
      if (it.idx >= it.rows.length) continue
      if (it.idx >= perSub) continue
      balanced.push(it.rows[it.idx]!)
      it.idx++
      progressed = true
      if (balanced.length >= remainingBudget) break
    }
    if (!progressed) break
  }

  // Write append-only.
  if (balanced.length > 0) {
    if (!existsSync(outPath)) writeFileSync(outPath, '')
    for (const q of balanced) {
      appendFileSync(outPath, JSON.stringify(q) + '\n')
    }
  }

  console.log(
    `\nHarvest complete: +${balanced.length} new (total in file: ${seen.size + balanced.length}) → ${outPath}`,
  )
  console.log('Next: npx tsx scripts/eval-ask/run.ts')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
