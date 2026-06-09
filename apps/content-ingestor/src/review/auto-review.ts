import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { draftToMarkdown, markdownToDraft } from '../drafts/store'
import type { DraftNode, LLMConfig } from '../types'

/**
 * LLM config for the reviewer — intentionally a DIFFERENT model than the extractor.
 */
export const REVIEWER_CONFIG: LLMConfig = {
  provider: 'ollama',
  model: 'gemma2:9b',
  endpoint: 'http://localhost:11434',
}

const REVIEW_PROMPT = `You are a Warhammer 40,000 11th Edition rules expert reviewing extracted tactical content for accuracy. 11th Edition launched 2026-01-01; 10th Edition is the immediate predecessor and still relevant for competitive history / "tick tock" coverage.

You will be given:
1. SOURCE CONTEXT — the original transcript/article text
2. EXTRACTED CONTENT — a summary and content extracted by another AI

Your job is to verify:
1. ACCURACY: Does the extracted content match what the source actually says? Flag any invented mechanics, wrong rules, or hallucinated details.
2. EDITION: APPROVE 11th Edition content (current) and APPROVE 10th Edition content where the source explicitly discusses 10th (retrospective, "innovations in 10th", comparison articles). REJECT 9th Edition mechanics (command protocols, doctrines that don't exist in 10th/11th).
3. TERMINOLOGY: Are unit names, detachment names, and rule terms correct?
4. VALUE: Is this actually useful tactical advice, or is it generic filler?

Respond with EXACTLY one of these verdicts:
- APPROVE — content is accurate, useful, and correctly represents the source
- REJECT — content contains hallucinated mechanics, wrong rules, or is not useful
- FIX — content has minor issues that can be corrected (list the issues)

After the verdict, write a one-line reason.

Format:
VERDICT: APPROVE|REJECT|FIX
REASON: <one line explanation>
ISSUES: <only if FIX — list specific problems>`

/**
 * Review a single draft using the reviewer LLM.
 */
export async function reviewDraft(
  draft: DraftNode,
  config: LLMConfig,
): Promise<{ verdict: 'approve' | 'reject' | 'fix'; reason: string; issues?: string }> {
  const prompt = `SOURCE CONTEXT:
${draft.sourceContext.slice(0, 3000)}

EXTRACTED SUMMARY:
${draft.summary}

EXTRACTED CONTENT:
${draft.content}

EXTRACTED KEYWORDS:
${draft.keywords.join(', ')}`

  const url = `${config.endpoint}/api/chat`
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: REVIEW_PROMPT },
      { role: 'user', content: prompt },
    ],
    stream: false,
    options: {
      num_ctx: 8192,
      num_predict: 256, // short response needed
    },
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return { verdict: 'fix', reason: `LLM error: ${response.status}` }
    }

    const data = (await response.json()) as { message: { content: string } }
    const text = data.message.content

    // Parse verdict
    const verdictMatch = text.match(/VERDICT:\s*(APPROVE|REJECT|FIX)/i)
    const reasonMatch = text.match(/REASON:\s*(.+)/i)
    const issuesMatch = text.match(/ISSUES:\s*(.+)/is)

    const verdict = verdictMatch
      ? (verdictMatch[1]!.toLowerCase() as 'approve' | 'reject' | 'fix')
      : 'fix'
    const reason = reasonMatch ? reasonMatch[1]!.trim() : 'No reason provided'
    const issues = issuesMatch ? issuesMatch[1]!.trim() : undefined

    return { verdict, reason, issues }
  } catch (err) {
    return { verdict: 'fix', reason: `Error: ${err instanceof Error ? err.message : err}` }
  }
}

/**
 * Auto-review all draft files in a directory.
 * Updates status based on verdict: approve → approved, reject → rejected, fix → stays draft.
 */
export async function autoReviewDrafts(
  draftDir: string,
  config: LLMConfig = REVIEWER_CONFIG,
): Promise<{ approved: number; rejected: number; needsFix: number; errors: number }> {
  const files = readdirSync(draftDir).filter((f) => f.endsWith('.md'))
  const drafts = files.filter((f) => {
    try {
      const content = readFileSync(path.join(draftDir, f), 'utf-8')
      return content.includes('status: draft')
    } catch {
      return false
    }
  })

  console.log(`Reviewing ${drafts.length} drafts in ${path.basename(draftDir)}/`)

  let approved = 0,
    rejected = 0,
    needsFix = 0,
    errors = 0

  for (let i = 0; i < drafts.length; i++) {
    const file = drafts[i]!
    const filePath = path.join(draftDir, file)

    try {
      const content = readFileSync(filePath, 'utf-8')
      const draft = markdownToDraft(content)

      process.stdout.write(`  [${i + 1}/${drafts.length}] ${draft.title.substring(0, 50)}...`)

      const result = await reviewDraft(draft, config)

      switch (result.verdict) {
        case 'approve':
          draft.status = 'approved'
          writeFileSync(filePath, draftToMarkdown(draft))
          approved++
          console.log(` ✓ approved`)
          break
        case 'reject':
          draft.status = 'rejected'
          writeFileSync(filePath, draftToMarkdown(draft))
          rejected++
          console.log(` ✗ rejected: ${result.reason}`)
          break
        case 'fix':
          needsFix++
          console.log(` ⚠ needs fix: ${result.reason}`)
          break
      }
    } catch (err) {
      errors++
      console.log(` ✗ error: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(
    `\nReview complete: ${approved} approved, ${rejected} rejected, ${needsFix} need fixes, ${errors} errors`,
  )
  return { approved, rejected, needsFix, errors }
}
