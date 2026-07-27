/**
 * reaugment-questions.ts — Rewrite the `question` field of each row in
 * questions.jsonl, applying the current normalizeQuestion() logic to the
 * existing (title, body, sub) triple. Use after changing the harvester's
 * question-formatting rules — no need to re-harvest.
 *
 * Also wipes answers.jsonl so the runner picks up all rows fresh with the
 * new question text.
 *
 * Usage:
 *   npx tsx scripts/eval-ask/reaugment-questions.ts
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'

import type { HarvestedQuestion } from './types'

const IN_PATH = 'scripts/eval-ask/.data/questions.jsonl'
const ANSWERS_PATH = 'scripts/eval-ask/.data/answers.jsonl'

// Duplicated from harvest.ts so this script is self-contained. Keep in sync.
const SUBREDDIT_FACTION_HINT: Record<string, string> = {
  AdeptusMechanicus: 'Adeptus Mechanicus',
  BlackTemplars: 'Black Templars',
  BloodAngels: 'Blood Angels',
  ChaosKnights: 'Chaos Knights',
  deathguard40k: 'Death Guard',
  deathwatch40k: 'Deathwatch',
  Drukhari: 'Drukhari',
  Eldar: 'Aeldari',
  EmperorsChildren: "Emperor's Children",
  genestealercult: 'Genestealer Cults',
  ImperialAgents_40K: 'Imperial Agents',
  ImperialKnights: 'Imperial Knights',
  IronHands40k: 'Iron Hands',
  Necrons40k: 'Necrons',
  orks: 'Orks',
  sistersofbattle: 'Adepta Sororitas',
  spacemarines: 'Space Marines',
  Tau40K: "T'au Empire",
  TheAstraMilitarum: 'Astra Militarum',
  ThousandSons: 'Thousand Sons',
  Tyranids: 'Tyranids',
  WorldEaters40k: 'World Eaters',
}

function normalizeQuestion(title: string, body: string, sub: string): string {
  const t = title.trim()
  const b = body.trim()
  const trimmedBody = b.length > 2000 ? b.slice(0, 2000) + '…' : b
  const faction = SUBREDDIT_FACTION_HINT[sub]
  const prefix = faction ? `[${faction}] ` : ''
  if (!b) return prefix + t
  return `${prefix}${t}\n\n${trimmedBody}`
}

function main(): void {
  const text = readFileSync(IN_PATH, 'utf-8').trim()
  const rows = text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HarvestedQuestion)

  let rewritten = 0
  const out: HarvestedQuestion[] = []
  for (const q of rows) {
    const newQuestion = normalizeQuestion(q.title, q.body, q.subreddit)
    if (newQuestion !== q.question) rewritten++
    out.push({ ...q, question: newQuestion })
  }

  writeFileSync(IN_PATH, out.map((q) => JSON.stringify(q)).join('\n') + '\n')
  console.log(`Rewrote ${rewritten}/${rows.length} questions in ${IN_PATH}`)

  if (existsSync(ANSWERS_PATH)) {
    unlinkSync(ANSWERS_PATH)
    console.log(`Wiped ${ANSWERS_PATH} — runner will re-run all questions with new text.`)
  }
}

main()
