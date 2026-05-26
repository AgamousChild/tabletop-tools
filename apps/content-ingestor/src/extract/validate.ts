import type { DraftNode } from '../types'

export interface ValidationResult {
  valid: boolean
  issues: string[]
}

/**
 * Validate that a draft node has complete, non-truncated content.
 * Returns { valid: true } if all checks pass, or { valid: false, issues: [...] }.
 */
export function validateDraft(draft: DraftNode): ValidationResult {
  const issues: string[] = []

  // 1. Summary exists and is complete
  if (!draft.summary || draft.summary.trim().length < 10) {
    issues.push('Summary missing or too short')
  }
  if (draft.summary && isTrancated(draft.summary)) {
    issues.push('Summary appears truncated')
  }

  // 2. Content has substance (at least 100 chars)
  if (!draft.content || draft.content.trim().length < 100) {
    issues.push('Content missing or too short (< 100 chars)')
  }
  if (draft.content && isTrancated(draft.content)) {
    issues.push('Content appears truncated')
  }

  // 3. Source context isn't truncated
  if (draft.sourceContext && isTrancated(draft.sourceContext)) {
    issues.push('Source context appears truncated')
  }

  // 4. Keywords are populated
  if (!draft.keywords || draft.keywords.length === 0) {
    issues.push('No keywords')
  }

  // 5. Title exists
  if (!draft.title || draft.title.trim().length < 3) {
    issues.push('Title missing or too short')
  }

  // 6. Check for incomplete bullet points in all text fields
  for (const field of ['content', 'sourceContext'] as const) {
    const text = draft[field]
    if (text && hasIncompleteBulletPoints(text)) {
      issues.push(`${field} has incomplete bullet points`)
    }
  }

  return { valid: issues.length === 0, issues }
}

/**
 * Detect if text appears truncated:
 * - Ends mid-word (no sentence-ending punctuation at the end)
 * - Ends with an incomplete markdown bold marker
 * - Last line is suspiciously short compared to content
 */
function isTrancated(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  // Ends mid-word: last char is a letter (not punctuation) and not at a sentence boundary
  const lastChar = trimmed[trimmed.length - 1]!
  const endsClean = /[.!?)\]"':]$/.test(lastChar) || trimmed.endsWith('\n')
  if (!endsClean && /[a-zA-Z]$/.test(lastChar)) return true

  // Ends with incomplete bold/italic marker
  if (/\*\*[^*]+$/.test(trimmed.slice(-50))) return true

  // Ends with an opening parenthesis or bracket without closing
  const lastLine = trimmed.split('\n').pop() ?? ''
  if ((lastLine.match(/\(/g) || []).length > (lastLine.match(/\)/g) || []).length) return true

  return false
}

/**
 * Check if text has numbered bullet points where the last one is incomplete.
 * e.g., "1. First point.\n2. Second point.\n3. Third po"
 */
function hasIncompleteBulletPoints(text: string): boolean {
  const lines = text.split('\n')
  const bulletLines = lines.filter(l => /^\s*\d+\.\s/.test(l) || /^\s*[-*]\s/.test(l))
  if (bulletLines.length < 2) return false

  const lastBullet = bulletLines[bulletLines.length - 1]!.trim()
  // Last bullet is incomplete if it doesn't end with sentence punctuation
  if (!/[.!?)\]]$/.test(lastBullet) && lastBullet.length > 5) return true

  return false
}
