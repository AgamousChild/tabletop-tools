/**
 * classify-questions.ts — Pattern-mine the harvested questions to find the
 * typical shapes we need the /ask rewriter to handle.
 *
 * Runs deterministic regex classifiers (no LLM) over the RAW question text
 * (title + body, ignoring the augmented [Faction] prefix so we're looking
 * at what users actually type). Each question gets tagged with ALL shapes
 * that match — many are hybrid (e.g., list-review + tournament-prep).
 *
 * Output: per-shape frequency + per-shape samples + per-sub breakdown of
 * shapes. Also flags questions matching zero shapes so we can iterate the
 * pattern set.
 *
 * Usage:
 *   npx tsx scripts/eval-ask/classify-questions.ts [--in=path.jsonl] [--samples=6]
 */
import { existsSync, readFileSync } from 'fs'

import type { HarvestedQuestion } from './types'

interface QuestionShape {
  id: string
  description: string
  pattern: RegExp | ((text: string) => boolean)
}

// Ordered rough-most-specific to most-general so a hybrid gets its strongest
// tag first in the samples output. Every match still counts for totals.
const SHAPES: QuestionShape[] = [
  {
    id: 'list-review',
    description: 'User dumps an army list and asks for feedback/optimization',
    // Points totals + detachment names + itemized units are the signature.
    pattern: (t) =>
      /\b\d{3,4}\s*(pts|points)\b/i.test(t) &&
      (/\b(detachment|force disposition|attached unit|characters?|battleline)\b/i.test(t) ||
        /^\s*[-•*]\s*\d+\s*x\s*[A-Z]/m.test(t)),
  },
  {
    id: 'matchup',
    description: 'What does faction X struggle against / good matchups',
    pattern:
      /\b(bad\s+match[- ]?ups?|good\s+match[- ]?ups?|do\s+(?:we|i|you)\s+(?:do\s+)?(?:badly|well)\s+(?:into|against|vs)|struggle\s+against|hard\s+time\s+(?:vs|against)|counter\s+(?:my|the))\b/i,
  },
  {
    id: 'unit-viability',
    description: '"Is X viable / good / worth taking?"',
    pattern:
      /\b(is\s+.*?\s+(?:viable|good|worth\s+(?:taking|it)|any\s+good|worth\s+(?:the\s+)?points?)|are\s+.*?\s+(?:viable|good|worth)|any\s+good\s*\??$|worth\s+the\s+points)\b/i,
  },
  {
    id: 'unit-loadout',
    description: 'Weapon-option comparison for a specific unit',
    pattern:
      /\b(vs|versus|or)\s+([a-z]+\s+){0,3}(cannon|rifle|blaster|fist|sword|hammer|blade|gun|weapon|loadout|kit)\b/i,
  },
  {
    id: 'onboarding',
    description: 'New player: where do I start, what to buy first',
    pattern:
      /\b(where\s+(?:do\s+i|to)\s+start|starting\s+out|getting\s+into|new\s+(?:to|player)|first\s+army|buying\s+(?:my\s+)?first|combat\s+patrol|start\s+collecting|beginner)\b/i,
  },
  {
    id: 'list-help-abstract',
    description: 'Wants help building a list without providing a full list',
    pattern:
      /\b(help\s+with\s+(?:a\s+)?(?:list|army|\d+k?\s*(?:pt|point)?)|list\s+advice|list\s+help|list\s+building|building\s+(?:a|my)\s+(?:list|army)|what\s+(?:units|should\s+i)\s+(?:take|include|buy))\b/i,
  },
  {
    id: 'ability-source',
    description: 'How to get X ability on Y unit',
    pattern:
      /\b(how\s+(?:can|do|to)\s+(?:i|you|we|they|it|units?|models?)?\s*(?:get|give|gain|grant|generate|apply|inflict|cause)|ways?\s+to\s+(?:get|give|grant|gain|apply|inflict)|sources?\s+of|which\s+units?\s+(?:have|get|grant)|who\s+(?:has|gets|grants))\b/i,
  },
  {
    id: 'rules-mechanic',
    description: 'How does a specific rule / interaction work',
    pattern:
      /\b(how\s+(?:does|do)\s+.+\s+work|when\s+(?:does|do|can)|can\s+(?:i|you|we|they)\s+.+\?|is\s+it\s+(?:legal|allowed|possible)|does\s+.+\s+(?:count|apply|work|stack|trigger)|rules?\s+(?:for|on|about|question))\b/i,
  },
  {
    id: 'disposition-play',
    description: 'How to play a specific force disposition / mission type',
    pattern:
      /\b(reconnaissance|priority\s+assets|take\s+and\s+hold|purge\s+the\s+foe|disruption)\b.*\b(disposition|list|play|army|game)\b/i,
  },
  {
    id: 'detachment-choice',
    description: 'Which detachment to run',
    pattern:
      /\b((?:what|which|best)\s+detachment|detachment\s+(?:should|would|to\s+(?:pick|choose|run|take)))\b/i,
  },
  {
    id: 'purchase-question',
    description: 'What models to buy next (with existing collection)',
    pattern:
      /\b(what\s+(?:should|do)\s+i\s+(?:buy|get|pick\s+up)\s+next|expanding\s+(?:my|the)\s+(?:collection|army)|which\s+(?:box|kit|combat\s+patrol)|worth\s+(?:buying|picking\s+up)|got\s+.*\s+for\s+christmas|models?\s+recommendations?)\b/i,
  },
  {
    id: 'tournament-prep',
    description: 'Prepping for a specific tournament / event',
    pattern:
      /\b(tournament|rtt|gt(?:s|z)?|lgt|3\s*day|first\s+event|first\s+big|going\s+to\s+.*\s+event|prepping\s+for|team\s+event|itc|competitive\s+event)\b/i,
  },
  {
    id: 'lore-hobby',
    description: 'Lore, painting, scheme, or hobby (non-rules) question',
    pattern:
      /\b(paint\s+scheme|kitbash|conversion|helmet\s+(?:rank|colour|color)|lore\s+question|which\s+chapter|colours?\s+for|blessing\s+(?:the|my)\s+(?:server|pc)|prayer|litany|imagine|painting|hobby|show(?:ing)?\s+off)\b/i,
  },
  {
    id: 'social-meta',
    description: 'Community, finding players, discord, TTS setup',
    pattern:
      /\b(find\s+people|find\s+someone|find\s+players?|opponents?\s+for|discord|tabletop\s+simulator|tts|how\s+(?:do|to)\s+play\s+with|looking\s+for\s+(?:a\s+)?(?:game|opponent|group))\b/i,
  },
  {
    id: 'binary-yes-no',
    description: 'Simple yes/no question',
    pattern: /^\s*(do|does|is|are|can|will|should|would|has|have)\s+.*\?\s*$/i,
  },
]

interface HarvestedRaw extends HarvestedQuestion {
  /** Raw pre-augment question text: title + body, no [Faction] prefix. */
  rawQuestion: string
}

function loadRaw(path: string): HarvestedRaw[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const q = JSON.parse(line) as HarvestedQuestion
      const rawQuestion = q.body ? `${q.title}\n\n${q.body}` : q.title
      return { ...q, rawQuestion }
    })
}

function classifyOne(text: string): string[] {
  const hits: string[] = []
  for (const shape of SHAPES) {
    const p = shape.pattern
    const match = typeof p === 'function' ? p(text) : p.test(text)
    if (match) hits.push(shape.id)
  }
  return hits
}

function pct(n: number, total: number): string {
  return `${((n / total) * 100).toFixed(1).padStart(5, ' ')}%`
}

function shortTitle(q: string, max = 90): string {
  const line = q.split('\n')[0]!.trim()
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

function main(): void {
  const args = new Map<string, string>()
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) args.set(m[1]!, m[2]!)
  }
  const inPath = args.get('in') ?? 'scripts/eval-ask/.data/questions.jsonl'
  const samples = Number(args.get('samples') ?? '6')

  const rows = loadRaw(inPath)
  console.log(`\n=== Question shape mining — ${rows.length} questions ===\n`)

  const shapeCount = new Map<string, number>()
  const shapeExamples = new Map<string, HarvestedRaw[]>()
  const unclassified: HarvestedRaw[] = []
  const shapesPerQuestion: number[] = []

  for (const r of rows) {
    const hits = classifyOne(r.rawQuestion)
    shapesPerQuestion.push(hits.length)
    if (hits.length === 0) {
      unclassified.push(r)
      continue
    }
    for (const shapeId of hits) {
      shapeCount.set(shapeId, (shapeCount.get(shapeId) ?? 0) + 1)
      if (!shapeExamples.has(shapeId)) shapeExamples.set(shapeId, [])
      const bucket = shapeExamples.get(shapeId)!
      if (bucket.length < samples) bucket.push(r)
    }
  }

  // Frequency
  const sorted = [...shapeCount.entries()].sort((a, b) => b[1] - a[1])
  console.log('SHAPE FREQUENCY (a question can match multiple):')
  console.log('')
  for (const [id, count] of sorted) {
    const shape = SHAPES.find((s) => s.id === id)!
    console.log(
      `  ${id.padEnd(22)} ${String(count).padStart(4)}  ${pct(count, rows.length)}  ${shape.description}`,
    )
  }
  console.log('')

  // Multi-tag distribution
  const multi = new Map<number, number>()
  for (const c of shapesPerQuestion) multi.set(c, (multi.get(c) ?? 0) + 1)
  console.log('TAGS-PER-QUESTION DISTRIBUTION:')
  for (const [tags, n] of [...multi.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${tags} tag${tags === 1 ? '' : 's'}: ${n}  (${pct(n, rows.length)})`)
  }
  console.log(`  → ${unclassified.length} unclassified  (${pct(unclassified.length, rows.length)})`)
  console.log('')

  // Per-shape samples
  console.log(`SAMPLES (${samples} per shape):`)
  for (const [id] of sorted) {
    console.log(`\n  ── ${id} ──`)
    for (const r of shapeExamples.get(id)!) {
      console.log(`    /r/${r.subreddit}  ${shortTitle(r.rawQuestion, 90)}`)
    }
  }

  // Unclassified — these are questions that didn't fit ANY shape; they're
  // either novel shapes we should add to SHAPES or genuinely one-off.
  console.log('')
  console.log(`UNCLASSIFIED (first ${samples}):`)
  for (const r of unclassified.slice(0, samples)) {
    console.log(`  /r/${r.subreddit}  ${shortTitle(r.rawQuestion, 100)}`)
  }
  console.log('')
}

main()
