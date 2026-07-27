/**
 * aggregate.ts — Read the grades.jsonl and print a systemic-failure report.
 *
 * Usage:
 *   npx tsx scripts/eval-ask/aggregate.ts [--in=path.jsonl] [--samples=5]
 *
 * The report has three sections:
 *
 *   1. Overall dimensions (mean/median for scalar fields).
 *   2. Failure-mode frequency (which systemic bugs fire most often).
 *   3. For each failure mode: a few example question ids + titles so
 *      you can inspect the pathological cases without opening the full
 *      answers JSONL.
 *
 * This is the "which layer is broken" heatmap Micah asked for.
 */
import { existsSync, readFileSync } from 'fs'

import type { Grade } from './types'

function loadJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf-8').trim()
  if (!text) return []
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

function pct(count: number, total: number): string {
  if (total === 0) return '  0%'
  return `${((count / total) * 100).toFixed(1).padStart(4, ' ')}%`
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function shortTitle(question: string, max = 100): string {
  const firstLine = question.split('\n')[0]!.trim()
  return firstLine.length > max ? firstLine.slice(0, max - 1) + '…' : firstLine
}

function main(): void {
  const args = new Map<string, string>()
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) args.set(m[1]!, m[2]!)
  }
  const inPath = args.get('in') ?? 'scripts/eval-ask/.data/grades.jsonl'
  const samplesPerMode = Number(args.get('samples') ?? '5')

  const grades = loadJsonl<Grade>(inPath)
  if (grades.length === 0) {
    console.error(`No grades found at ${inPath}`)
    process.exit(1)
  }

  const total = grades.length
  const okGrades = grades.filter((g) => g.ok)

  console.log(`\n=== /ask eval report — ${total} questions ===\n`)

  // ── 1. Overall dimensions ─────────────────────────────────────────────
  const answerBytes = okGrades.map((g) => g.answerBytes)
  const refs = okGrades.map((g) => g.refsCount)
  const dur = okGrades.map((g) => g.durationMs)
  console.log('DIMENSIONS (successful runs only)')
  console.log(
    `  Response time      mean=${Math.round(mean(dur))}ms  median=${Math.round(median(dur))}ms  slowest=${Math.max(...dur)}ms`,
  )
  console.log(
    `  Answer size        mean=${Math.round(mean(answerBytes))} chars  median=${Math.round(median(answerBytes))} chars`,
  )
  console.log(
    `  Brain refs         mean=${mean(refs).toFixed(1)}  median=${median(refs).toFixed(0)}  max=${Math.max(...refs, 0)}`,
  )
  const zeroRefs = okGrades.filter((g) => g.refsCount === 0).length
  console.log(
    `  Zero-refs answers  ${zeroRefs}/${okGrades.length}  (${pct(zeroRefs, okGrades.length)})`,
  )
  const zeroFactions = okGrades.filter((g) => g.factionsDetected === 0).length
  console.log(
    `  Zero-faction answers  ${zeroFactions}/${okGrades.length}  (${pct(zeroFactions, okGrades.length)})`,
  )
  console.log('')

  // Provenance breakdown
  const provCounts = { 'brain-primary': 0, mixed: 0, 'web-only': 0, 'no-answer': 0 }
  for (const g of grades) provCounts[g.provenance]++
  console.log('PROVENANCE')
  for (const [k, v] of Object.entries(provCounts)) {
    console.log(`  ${k.padEnd(20)} ${String(v).padStart(4)}  (${pct(v, total)})`)
  }
  console.log('')

  // Cube dispatch expected vs actual
  const shouldDispatch = grades.filter((g) => g.shouldCubeDispatch).length
  const didDispatch = grades.filter((g) => g.cubeDispatched).length
  const missedDispatch = grades.filter((g) => g.shouldCubeDispatch && !g.cubeDispatched).length
  console.log('CUBE DISPATCH')
  console.log(
    `  Expected  ${String(shouldDispatch).padStart(4)}/${total}  (${pct(shouldDispatch, total)})`,
  )
  console.log(
    `  Actual    ${String(didDispatch).padStart(4)}/${total}  (${pct(didDispatch, total)})`,
  )
  console.log(
    `  Missed    ${String(missedDispatch).padStart(4)}/${total}  (${pct(missedDispatch, total)})`,
  )
  console.log('')

  // ── 2. Failure-mode frequency ─────────────────────────────────────────
  const modeCounts = new Map<string, number>()
  const modeExamples = new Map<string, Grade[]>()
  for (const g of grades) {
    for (const mode of g.failureModes) {
      modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1)
      if (!modeExamples.has(mode)) modeExamples.set(mode, [])
      const bucket = modeExamples.get(mode)!
      if (bucket.length < samplesPerMode) bucket.push(g)
    }
  }
  const sortedModes = [...modeCounts.entries()].sort((a, b) => b[1] - a[1])
  console.log('FAILURE MODES (sorted by frequency)')
  if (sortedModes.length === 0) {
    console.log('  (none)')
  } else {
    for (const [mode, count] of sortedModes) {
      console.log(`  ${mode.padEnd(36)} ${String(count).padStart(4)}  (${pct(count, total)})`)
    }
  }
  console.log('')

  // ── 3. Sample per failure mode ────────────────────────────────────────
  console.log(`SAMPLES (${samplesPerMode} per failure mode)`)
  for (const [mode, count] of sortedModes) {
    console.log(`\n  ── ${mode} (${count}) ──`)
    for (const g of modeExamples.get(mode)!) {
      console.log(`    /r/${g.subreddit}  ${g.questionId}: ${shortTitle(g.question, 90)}`)
    }
  }
  console.log('')

  // Distribution by subreddit — surfaces uneven coverage.
  const bySub = new Map<string, Grade[]>()
  for (const g of grades) {
    if (!bySub.has(g.subreddit)) bySub.set(g.subreddit, [])
    bySub.get(g.subreddit)!.push(g)
  }
  console.log('COVERAGE BY SUBREDDIT (n, mean refs, % web-only)')
  const rows = [...bySub.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [sub, gs] of rows) {
    const meanRefs = mean(gs.map((g) => g.refsCount))
    const webOnly = gs.filter((g) => g.provenance === 'web-only').length
    console.log(
      `  /r/${sub.padEnd(24)} ${String(gs.length).padStart(4)}  refs=${meanRefs.toFixed(1).padStart(4)}  web-only=${pct(webOnly, gs.length)}`,
    )
  }
  console.log('')
}

main()
