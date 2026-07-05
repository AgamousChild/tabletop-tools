/**
 * Remap practice-exam-graded.json highlight boxes to REAL block coordinates
 * from slides.json (the same data SlideViewer.tsx uses).
 *
 * For each question with a source: find the block in slides.json whose text
 * best contains the quote. Use that block's percentages. If no reasonable
 * match, leave `source.highlight` unset — popup will render slide + quote
 * without an overlay box (per SourcePopup change: highlight is optional).
 *
 * Also updates Q48: correctAnswer='A', correct=true, no source.
 *
 * Usage:
 *   cd apps/study/client
 *   node scripts/remap-exam-highlights.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PUBLIC = resolve('public', 'data')
const SLIDES_PATH = resolve(PUBLIC, 'slides.json')
const EXAM_PATH = resolve(PUBLIC, 'practice-exam-graded.json')

function norm(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function bestBlock(blocks, quote) {
  if (!blocks || blocks.length === 0) return null
  const nq = norm(quote)
  if (!nq) return null

  let best = null
  let bestScore = 0

  for (const b of blocks) {
    const nb = norm(b.text || '')
    if (!nb) continue

    let score = 0
    if (nb === nq) score = 1000                  // exact match
    else if (nb.includes(nq)) score = 500 + nq.length  // block contains quote
    else if (nq.includes(nb)) score = 400 + nb.length  // quote contains block
    else {
      // shared-token overlap
      const qTokens = new Set(nq.split(' ').filter((t) => t.length >= 4))
      const bTokens = new Set(nb.split(' ').filter((t) => t.length >= 4))
      let shared = 0
      for (const t of qTokens) if (bTokens.has(t)) shared++
      if (shared >= 2) score = shared * 10
    }

    if (score > bestScore) {
      bestScore = score
      best = b
    }
  }

  // Require a non-trivial match — token-overlap must be meaningful, or
  // substring must actually contain something.
  if (bestScore < 30) return null
  return best
}

function main() {
  const slidesManifest = JSON.parse(readFileSync(SLIDES_PATH, 'utf8'))
  const exam = JSON.parse(readFileSync(EXAM_PATH, 'utf8'))

  // Build lookup: `${deckId}|${slideNum}` → blocks[]
  const blockLookup = new Map()
  for (const deck of slidesManifest.decks) {
    for (const s of deck.slides) {
      blockLookup.set(`${s.deckId}|${s.slideNum}`, s.blocks || [])
    }
  }

  let matched = 0
  let unmatched = 0
  const misses = []

  for (const q of exam.questions) {
    // Q48 correction
    if (q.n === 48) {
      q.correctAnswer = 'A'
      q.correct = true
      q.note = 'Options B/C/D truncated in source scan; A confirmed selected and correct.'
      // No source — Q48 becomes a normal question with a Correct stamp but no View source button.
      q.source = null
      q.external = null
      continue
    }

    if (!q.source) continue
    const key = `${q.source.deckId}|${q.source.slideNum}`
    const blocks = blockLookup.get(key)
    if (!blocks) {
      unmatched++
      misses.push({ n: q.n, reason: `deck+slide not in slides.json: ${key}` })
      delete q.source.highlight
      continue
    }
    const block = bestBlock(blocks, q.source.quote || '')
    if (!block) {
      unmatched++
      misses.push({ n: q.n, reason: `no block matched quote: "${(q.source.quote || '').slice(0, 60)}…"` })
      delete q.source.highlight
      continue
    }
    q.source.highlight = {
      leftPct: block.leftPct,
      topPct: block.topPct,
      widthPct: block.widthPct,
      heightPct: block.heightPct,
    }
    matched++
  }

  // Update stats
  const inCorpus = exam.questions.filter((q) => q.source).length
  const external = exam.questions.filter((q) => q.external).length
  const ungraded = exam.questions.filter((q) => q.correct === null && q.correctAnswer === null).length
  const correct = exam.questions.filter((q) => q.correct === true).length
  const wrong = exam.questions.filter((q) => q.correct === false).length
  exam.stats = { inCorpus, external, ungraded, correct, wrong }
  exam.remappedAt = new Date().toISOString()

  writeFileSync(EXAM_PATH, JSON.stringify(exam, null, 2))

  console.log(`Wrote ${EXAM_PATH}`)
  console.log(`  Remapped highlights: ${matched}`)
  console.log(`  Unmatched (no highlight): ${unmatched}`)
  console.log(`  Stats: correct=${correct} wrong=${wrong} ungraded=${ungraded} inCorpus=${inCorpus} external=${external}`)
  if (misses.length > 0) {
    console.log(`\nUnmatched detail:`)
    for (const m of misses) console.log(`  Q${m.n}: ${m.reason}`)
  }
}

main()
