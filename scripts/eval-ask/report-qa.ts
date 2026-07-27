/**
 * report-qa.ts — Dump every question + its /ask answer to a markdown file.
 *
 * Usage:
 *   npx tsx scripts/eval-ask/report-qa.ts \
 *     [--in=answers.jsonl] [--grades=grades.jsonl] [--out=qa-report.md] \
 *     [--filter=<mode>] [--sort=refs|worst|sub|time]
 *
 * The default output is a scannable per-question section with:
 *   - question text
 *   - key metrics (refs, provenance, factions, duration, failure modes)
 *   - permalink to the original Reddit post
 *   - the full /ask answer
 *   - the reference titles + web sources feeding it
 *
 * Filters (--filter=<mode>):
 *   all               every question (default)
 *   no-refs           only questions where retrieval returned 0 brain nodes
 *   brain-primary     only questions where the brain actually contributed
 *   failed            only questions with at least one failure mode
 *   web-only          only pure Gemini-sourced answers
 *
 * Sort (--sort=):
 *   refs      by refsCount descending (best-retrieval first)
 *   worst     by failure-mode count descending
 *   sub       alphabetical by subreddit
 *   time      by durationMs descending
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'

import type { AskRun, Grade } from './types'

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) out[m[1]!] = m[2]!
  }
  return out
}

function loadJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T)
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function main(): void {
  const args = parseArgs()
  const answersPath = args.in ?? 'scripts/eval-ask/.data/answers.jsonl'
  const gradesPath = args.grades ?? 'scripts/eval-ask/.data/grades.jsonl'
  const outPath = args.out ?? 'scripts/eval-ask/.data/qa-report.md'
  const filter = args.filter ?? 'all'
  const sort = args.sort ?? 'sub'

  const answers = loadJsonl<AskRun>(answersPath)
  const grades = loadJsonl<Grade>(gradesPath)
  const gradeById = new Map(grades.map((g) => [g.questionId, g]))

  const rows: Array<{ run: AskRun; grade: Grade | undefined }> = answers.map((run) => ({
    run,
    grade: gradeById.get(run.questionId),
  }))

  // Filter
  const filtered = rows.filter(({ grade }) => {
    if (!grade) return filter === 'all'
    switch (filter) {
      case 'no-refs':
        return grade.refsCount === 0
      case 'brain-primary':
        return grade.provenance === 'brain-primary' || grade.provenance === 'mixed'
      case 'failed':
        return grade.failureModes.filter((f) => f !== 'slow-response').length > 0
      case 'web-only':
        return grade.provenance === 'web-only'
      case 'all':
      default:
        return true
    }
  })

  // Sort
  const cmp = (a: (typeof rows)[0], b: (typeof rows)[0]): number => {
    switch (sort) {
      case 'refs':
        return (b.grade?.refsCount ?? 0) - (a.grade?.refsCount ?? 0)
      case 'worst':
        return (b.grade?.failureModes.length ?? 0) - (a.grade?.failureModes.length ?? 0)
      case 'time':
        return (b.run.durationMs ?? 0) - (a.run.durationMs ?? 0)
      case 'sub':
      default:
        return (a.run.subreddit ?? '').localeCompare(b.run.subreddit ?? '')
    }
  }
  filtered.sort(cmp)

  const lines: string[] = []
  lines.push(`# /ask eval — Q&A report`)
  lines.push('')
  lines.push(`- **Answers file:** \`${answersPath}\``)
  lines.push(`- **Grades file:** \`${gradesPath}\``)
  lines.push(`- **Filter:** \`${filter}\``)
  lines.push(`- **Sort:** \`${sort}\``)
  lines.push(`- **Total shown:** ${filtered.length} of ${rows.length}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  let idx = 0
  for (const { run, grade } of filtered) {
    idx++
    const g = grade
    const r = run.response
    lines.push(`## ${idx}. [/r/${run.subreddit}] ${g ? '' : '(no grade)'}`)
    lines.push('')
    lines.push(`**Question:** ${run.question.split('\n').join(' ⏎ ')}`)
    lines.push('')
    if (g) {
      const failuresShown = g.failureModes.filter((f) => f !== 'slow-response')
      lines.push(
        [
          `**refs:** ${g.refsCount}`,
          `**provenance:** ${g.provenance}`,
          `**factions:** ${g.factionsList.join(', ') || '—'}`,
          `**cube:** ${g.cubeDispatched ? 'yes' : 'no'}`,
          `**web:** ${g.webSourcesCount}`,
          `**t:** ${(g.durationMs / 1000).toFixed(1)}s`,
        ].join(' · '),
      )
      if (failuresShown.length > 0) {
        lines.push('')
        lines.push(`**Failures:** ${failuresShown.join(', ')}`)
      }
    } else {
      lines.push(`_(no grade found)_`)
    }
    lines.push('')

    // Answer
    if (r?.answer) {
      lines.push('**Answer:**')
      lines.push('')
      lines.push('> ' + r.answer.split('\n').join('\n> '))
    } else if (run.error) {
      lines.push(`**Error:** ${run.error}`)
    } else {
      lines.push('_(no answer returned)_')
    }
    lines.push('')

    // References + web sources
    if (r?.reference && r.reference.length > 0) {
      lines.push(`**Brain refs (${r.reference.length}):**`)
      for (const ref of r.reference.slice(0, 10)) {
        lines.push(
          `- [${ref.category}] ${ref.title}${ref.factionId ? ` — *${ref.factionId}*` : ''}`,
        )
      }
      if (r.reference.length > 10) lines.push(`- … (+${r.reference.length - 10} more)`)
      lines.push('')
    }
    if (r?.webSources && r.webSources.length > 0) {
      lines.push(`**Web sources (${r.webSources.length}):**`)
      for (const w of r.webSources.slice(0, 5)) {
        lines.push(`- ${truncate(w.title, 80)}`)
      }
      if (r.webSources.length > 5) lines.push(`- … (+${r.webSources.length - 5} more)`)
      lines.push('')
    }
    if (run.subreddit !== 'manual' && r) {
      // Reddit permalink lives on the harvested question, not the answer;
      // skip when not available (manual questions).
    }

    lines.push('---')
    lines.push('')
  }

  writeFileSync(outPath, lines.join('\n'))
  console.log(`Wrote ${filtered.length} Q&A sections → ${outPath}`)
  console.log(`Open in editor / preview: ${outPath}`)
}

main()
