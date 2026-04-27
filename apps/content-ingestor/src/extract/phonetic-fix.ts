import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Double Metaphone-inspired phonetic encoder for 40K terms.
 * Simplified — strips vowels, normalizes consonant clusters.
 */
function phoneticKey(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z]/g, '')       // strip non-alpha
    .replace(/[aeiou]/g, '')       // strip vowels
    .replace(/(.)\1+/g, '$1')     // collapse repeated consonants
    .replace(/^[wh]+/, '')         // strip leading w/h
    .replace(/ck/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/gh/g, 'g')
    .replace(/sch/g, 'sk')
    .replace(/th/g, 't')
    .replace(/sh/g, 's')
    .slice(0, 8)                   // truncate
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0))
  for (let i = 0; i <= la; i++) dp[i]![0] = i
  for (let j = 0; j <= lb; j++) dp[0]![j] = j
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      )
    }
  }
  return dp[la]![lb]!
}

/**
 * Load all known 40K terms from brain nodes.
 */
export function loadTermDictionary(brainNodesDir: string): string[] {
  const terms = new Set<string>()

  try {
    const files = readdirSync(brainNodesDir).filter(f => f.endsWith('.json'))
    for (const file of files) {
      const nodes = JSON.parse(readFileSync(path.join(brainNodesDir, file), 'utf-8'))
      for (const n of nodes) {
        if (n.title && n.title.length > 2 && n.title.length < 60) {
          terms.add(n.title)
        }
      }
    }
  } catch {
    // Brain nodes not available
  }

  return [...terms]
}

interface TermMatch {
  original: string
  replacement: string
  confidence: number   // 0-1
  reason: string
}

/**
 * Build a phonetic index from known terms for fast lookup.
 */
export function buildPhoneticIndex(terms: string[]): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const term of terms) {
    // Index each word in the term + the full term
    const words = term.split(/\s+/)
    for (const word of words) {
      if (word.length < 3) continue
      const key = phoneticKey(word)
      if (!key) continue
      const existing = index.get(key) ?? []
      existing.push(term)
      index.set(key, existing)
    }
    // Also index the full term as one key
    const fullKey = phoneticKey(term.replace(/\s+/g, ''))
    if (fullKey) {
      const existing = index.get(fullKey) ?? []
      existing.push(term)
      index.set(fullKey, existing)
    }
  }
  return index
}

/**
 * Find potential corrections in text by matching against the term dictionary.
 * Returns suggested replacements with confidence scores.
 */
export function findPhoneticMatches(
  text: string,
  terms: string[],
  phoneticIndex: Map<string, string[]>,
): TermMatch[] {
  const matches: TermMatch[] = []
  const seen = new Set<string>()

  // Extract multi-word capitalized phrases that might be unit/detachment names
  const phraseRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g
  let match: RegExpExecArray | null

  while ((match = phraseRegex.exec(text)) !== null) {
    const phrase = match[1]!
    if (phrase.length < 4 || seen.has(phrase.toLowerCase())) continue
    seen.add(phrase.toLowerCase())

    // Skip if it's already a known term (exact or substring match)
    if (terms.some(t => t.toLowerCase() === phrase.toLowerCase())) continue
    if (terms.some(t => t.toLowerCase().includes(phrase.toLowerCase()) && phrase.length > 5)) continue

    // Check phonetic match
    const key = phoneticKey(phrase.replace(/\s+/g, ''))
    const candidates = phoneticIndex.get(key) ?? []

    // Also check each word (limit candidates to avoid stack overflow)
    const words = phrase.split(/\s+/)
    for (const word of words) {
      if (word.length < 4) continue
      const wordKey = phoneticKey(word)
      const wordCandidates = (phoneticIndex.get(wordKey) ?? []).slice(0, 20)
      for (const c of wordCandidates) candidates.push(c)
    }

    // Dedupe candidates and limit
    const uniqueCandidates = [...new Set(candidates)].slice(0, 50)

    // Score each candidate by Levenshtein distance
    for (const candidate of uniqueCandidates) {
      const dist = levenshtein(phrase.toLowerCase(), candidate.toLowerCase())
      const maxLen = Math.max(phrase.length, candidate.length)
      const similarity = 1 - dist / maxLen

      // Only suggest if reasonably similar (>60%) but not exact
      if (similarity > 0.55 && similarity < 1.0 && dist <= 4) {
        matches.push({
          original: phrase,
          replacement: candidate,
          confidence: similarity,
          reason: `phonetic match (${(similarity * 100).toFixed(0)}% similar, distance: ${dist})`,
        })
      }
    }
  }

  // Also check lowercase phrases that look like they could be misheard terms
  const lowPhraseRegex = /\b([a-z]+(?:\s+[a-z]+){0,2})\b/g
  while ((match = lowPhraseRegex.exec(text)) !== null) {
    const phrase = match[1]!
    if (phrase.length < 5 || seen.has(phrase)) continue
    // Only check phrases that could plausibly be 40K terms (not common English)
    const commonWords = new Set(['about', 'after', 'again', 'because', 'before', 'being', 'between', 'could', 'doing', 'during', 'every', 'going', 'having', 'would', 'should', 'their', 'there', 'these', 'thing', 'think', 'those', 'under', 'using', 'where', 'which', 'while', 'world', 'other', 'right', 'still', 'might', 'really', 'actually', 'basically', 'definitely', 'probably', 'something', 'everything', 'nothing', 'however', 'whatever', 'whenever', 'another', 'always', 'around', 'enough', 'though', 'through', 'within', 'without', 'already', 'getting', 'looking', 'making', 'taking', 'coming', 'playing', 'running', 'trying', 'putting', 'sitting', 'standing', 'starting', 'moving', 'charging', 'shooting', 'fighting', 'killing', 'scoring', 'winning', 'losing', 'holding', 'control', 'position', 'movement', 'models', 'points', 'turns', 'round', 'phase', 'units', 'range', 'damage', 'attacks', 'wounds', 'strength', 'profile', 'keyword', 'ability', 'effect', 'target', 'result', 'battle', 'armies', 'player', 'opponent', 'terrain', 'objective', 'deployment', 'reserve', 'advance', 'charge', 'melee', 'ranged', 'pistol', 'heavy', 'rerolls', 'reroll'])
    if (commonWords.has(phrase)) continue
    seen.add(phrase)

    const key = phoneticKey(phrase.replace(/\s+/g, ''))
    const candidates = phoneticIndex.get(key) ?? []
    const uniqueCandidates = [...new Set(candidates)]

    for (const candidate of uniqueCandidates) {
      const dist = levenshtein(phrase.toLowerCase(), candidate.toLowerCase())
      const maxLen = Math.max(phrase.length, candidate.length)
      const similarity = 1 - dist / maxLen

      if (similarity > 0.6 && similarity < 1.0 && dist <= 3) {
        matches.push({
          original: phrase,
          replacement: candidate,
          confidence: similarity,
          reason: `phonetic match (${(similarity * 100).toFixed(0)}% similar)`,
        })
      }
    }
  }

  // Sort by confidence descending, dedupe by original
  const best = new Map<string, TermMatch>()
  for (const m of matches.sort((a, b) => b.confidence - a.confidence)) {
    if (!best.has(m.original)) {
      best.set(m.original, m)
    }
  }

  return [...best.values()]
}

/**
 * Apply phonetic corrections to text. Only applies high-confidence matches (>70%).
 */
export function applyPhoneticFixes(text: string, matches: TermMatch[], minConfidence = 0.7): string {
  let result = text
  const applied: TermMatch[] = matches
    .filter(m => m.confidence >= minConfidence)
    .sort((a, b) => b.original.length - a.original.length) // longest first to avoid partial replacements

  for (const match of applied) {
    const regex = new RegExp(`\\b${match.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    result = result.replace(regex, match.replacement)
  }

  return result
}

/**
 * Scan all draft files in a directory and report potential phonetic mismatches.
 */
export async function scanDraftsForMismatches(
  draftDir: string,
  brainNodesDir: string,
): Promise<Map<string, TermMatch[]>> {
  const terms = loadTermDictionary(brainNodesDir)
  const index = buildPhoneticIndex(terms)
  const results = new Map<string, TermMatch[]>()

  const files = readdirSync(draftDir).filter(f => f.endsWith('.md'))

  for (const file of files) {
    const content = readFileSync(path.join(draftDir, file), 'utf-8')
    const matches = findPhoneticMatches(content, terms, index)
    if (matches.length > 0) {
      results.set(file, matches)
    }
  }

  return results
}
