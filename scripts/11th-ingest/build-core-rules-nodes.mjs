#!/usr/bin/env node
/**
 * Build brain Nodes from the 11th-edition Core Rules PDF.
 *
 * SCHEMA-FIRST: the canonical hierarchy lives in
 *   scripts/11th-ingest/core-rules-outline.json
 * Each entry there is { ref, title, isImage? }. The parser locates the title
 * (or the ref) in the raw pdftotext output, then slices content between
 * consecutive outline entries. Titles in the outline are AUTHORITATIVE — we
 * don't try to detect them from the text. This avoids all the column-bleed
 * and missed-heading problems that plagued heading-detection.
 *
 * For each outline entry:
 *   - Search the raw text for the title or the ref. The earliest occurrence
 *     after the previous entry's position becomes the anchor.
 *   - Content = lines from the anchor to the next entry's anchor.
 *   - If `isImage`, emit a stub node ("See PDF page N — diagram.") with no
 *     scanned body.
 *
 * If an outline entry can't be located in the text, we still emit a node so
 * the structure stays intact; content is a placeholder noting the gap.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const TXT_PATH = 'C:/R/sync-data/tools/11th-official/core-rules-raw.txt'
const OUTLINE_PATH = 'C:/R/tabletop-tools/scripts/11th-ingest/core-rules-outline.json'
const OVERRIDES_PATH = 'C:/R/tabletop-tools/scripts/11th-ingest/core-rules-content-overrides.json'
const RETRIEVED_AT = new Date().toISOString()
const SOURCE_TITLE = 'Warhammer 40,000 11th ed Core Rules (Free)'
const SOURCE_URL =
  'https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf'

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[’ʼ'‘"”“]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function phaseFromRef(ref) {
  const major = parseInt(ref.split('.')[0], 10)
  if (major === 8) return 'command'
  if (major === 9) return 'movement'
  if (major === 10) return 'shooting'
  if (major === 11) return 'charge'
  if (major === 12) return 'fight'
  return undefined
}

function categoryFor(ref) {
  const major = parseInt(ref.split('.')[0], 10)
  const minor = parseInt(ref.split('.')[1] ?? '0', 10)
  const depth = ref.split('.').length
  if (depth === 2 && minor === 0) return 'section-overview'
  if (ref.startsWith('00.')) return 'banner'
  if (major >= 7 && major <= 12) return 'phase-sequence'
  if (major === 13) return 'terrain'
  if (major === 14) return 'mission'
  if (major === 15) return 'stratagem'
  if (major === 16) return 'action'
  if (major === 17 || major === 18) return 'core-mechanic'
  if (major === 19) return 'attached-unit'
  if (major === 20 || major === 21) return 'reserves'
  if (major >= 22 && major <= 24) return 'keyword'
  return 'core-mechanic'
}

// ── load ─────────────────────────────────────────────────────────────────────

const raw = readFileSync(TXT_PATH, 'utf8').replace(/\r/g, '')
const lines = raw.split('\n')
const outline = JSON.parse(readFileSync(OUTLINE_PATH, 'utf8')).entries

// Auto-extend: for any NN.NN heading found in the PDF text that ISN'T already
// in the outline, append it as a `preliminary: true` entry. Caps at section 24
// (the last numbered section in the Core Rules). User can dictate canonical
// titles later — these are placeholders so brain coverage is complete now.
{
  const outlineRefs = new Set(outline.map((e) => e.ref))
  // "Covered" majors: majors that already have ≥3 outline entries — these are
  // fully dictated. Sparsely-defined majors (e.g. only NN.00 declared) still
  // get auto-extension.
  const majorCounts = new Map()
  for (const e of outline) {
    const m = parseInt(e.ref.split('.')[0], 10)
    majorCounts.set(m, (majorCounts.get(m) ?? 0) + 1)
  }
  const coveredMajors = new Set(
    [...majorCounts.entries()].filter(([, c]) => c >= 3).map(([m]) => m),
  )
  const rawText = readFileSync(TXT_PATH, 'utf8').replace(/\r/g, '')
  const headingRe = /(?:^|\n)\s*(?:\d{1,2}\.\s+)?([A-Z][A-Z0-9 &\-/,()]{1,}?)\s*(\d{2}\.\d{2})\b/g
  const found = new Set()
  for (const m of rawText.matchAll(headingRe)) {
    const title = m[1].trim()
    const ref = m[2]
    if (outlineRefs.has(ref)) continue
    if (found.has(ref)) continue
    const major = parseInt(ref.split('.')[0], 10)
    if (coveredMajors.has(major)) continue
    if (major > 25) continue
    if (title.length < 3) continue
    found.add(ref)
    outline.push({ ref, title, preliminary: true })
  }
  // Add section-header stubs NN.00 for any major not covered by the outline.
  const newMajors = new Set(
    [...found]
      .map((r) => r.split('.')[0])
      .filter((m) => !coveredMajors.has(parseInt(m, 10))),
  )
  // Use TOC titles where we already have them in the index (from the existing
  // section-header scanner below); otherwise placeholder.
  const tocTitles = {
    '10': 'SHOOTING PHASE',
    '11': 'CHARGE PHASE',
    '12': 'FIGHT PHASE',
    '13': 'TERRAIN',
    '14': 'OBJECTIVES',
    '15': 'STRATAGEMS',
    '16': 'ACTIONS',
    '17': 'MONSTERS AND VEHICLES',
    '18': 'TRANSPORTS',
    '19': 'ATTACHED UNITS',
    '20': 'STRATEGIC RESERVES',
    '21': 'FLYING AND SURGING',
    '22': 'OTHER RULES AND ABILITIES',
    '23': 'AIRCRAFT',
    '24': 'CORE ABILITIES',
  }
  for (const maj of newMajors) {
    if (outlineRefs.has(`${maj}.00`)) continue
    outline.push({ ref: `${maj}.00`, title: tocTitles[maj] ?? `SECTION ${maj}`, preliminary: true })
  }
  // Also add banner stubs 00.04 (BATTLEFIELDS AND TACTICS), 00.05 (ADVANCED
  // RULES), 00.06 (REFERENCE) if not already present, mapped from the TOC.
  const banners = [
    ['00.04', 'BATTLEFIELDS AND TACTICS'],
    ['00.05', 'ADVANCED RULES'],
    ['00.06', 'REFERENCE'],
    ['00.07', 'CORE RULES INDEX'],
  ]
  for (const [ref, title] of banners) {
    if (!outlineRefs.has(ref)) outline.push({ ref, title, preliminary: true })
  }
  outline.sort((a, b) => a.ref.localeCompare(b.ref))
}
const overrides = (() => {
  try {
    return JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8')).overrides ?? {}
  } catch {
    return {}
  }
})()

const pages = raw.split('\f')
const lineToPage = new Map()
let lineIdx = 0
for (let p = 0; p < pages.length; p++) {
  for (const _ of pages[p].split('\n')) lineToPage.set(lineIdx++, p + 1)
}

// ── locate each outline entry in the raw text ────────────────────────────────

// Strip any "(IMAGE)" suffix and lowercase for matching.
function normalizeForSearch(title) {
  return title.replace(/\s*\(IMAGE\)\s*$/, '').trim()
}

// Build a function that finds the line index where a title appears. We look
// for either:
//   (a) "TITLE NN.NN" or "TITLE NN.NN.NN" (heading line)
//   (b) just the title on its own (uppercase)
//   (c) the ref "NN.NN" on a line (last-resort match)
// Search starts from `fromLine` to enforce document order.
function locate(entry, fromLine) {
  const target = normalizeForSearch(entry.title).toUpperCase()
  const targetEsc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const refEsc = entry.ref.replace(/\./g, '\\.')

  // Pattern (a): TITLE may be followed by the ref with 0+ whitespace.
  const reA = new RegExp(`^\\s*\\d*\\.?\\s*${targetEsc}\\s*${refEsc}\\b`, 'i')
  // Pattern (b): title appears on a line by itself (allow leading whitespace +
  // optional trailing colon).
  const reB = new RegExp(`^\\s*${targetEsc}:?\\s*$`, 'i')
  // Pattern (c): just the ref appears alone (some headings are oddly formatted).
  const reC = new RegExp(`^\\s*${refEsc}\\s*$`)

  for (let i = fromLine; i < lines.length; i++) {
    if (reA.test(lines[i])) return { idx: i, hit: 'A' }
  }
  for (let i = fromLine; i < lines.length; i++) {
    if (reB.test(lines[i])) return { idx: i, hit: 'B' }
  }
  for (let i = fromLine; i < lines.length; i++) {
    if (reC.test(lines[i])) return { idx: i, hit: 'C' }
  }
  return null
}

// Two-pass locate. Pass 1: depth-2 (NN.NN) forward-only. Then we know the
// section boundaries, so pass 1B can constrain depth-3+ to the parent region.
// Pass 2: fill remaining misses with constrained whole-doc search.
const located = outline.map((entry) => ({ entry, lineIdx: null, hit: 'MISS' }))

// Pass 1A: anchor banners and depth-2 (NN.NN) entries forward-only.
let lastIdx = 0
for (let i = 0; i < located.length; i++) {
  const ref = located[i].entry.ref
  if (ref.split('.').length > 2) continue
  const loc = locate(located[i].entry, lastIdx)
  if (loc) {
    located[i].lineIdx = loc.idx
    located[i].hit = loc.hit
    lastIdx = loc.idx + 1
  }
}
function refDepth(ref) {
  return ref.split('.').length
}
function parentRefOf(ref) {
  const parts = ref.split('.')
  if (parts.length <= 2) return null
  return parts.slice(0, -1).join('.')
}
function nextSiblingLine(idx) {
  // Find the next entry at the same depth or shallower. Skip soft-anchored
  // hits (PARENT-BODY / INLINE) since they share the parent's region rather
  // than marking a new region boundary.
  const baseDepth = refDepth(located[idx].entry.ref)
  for (let j = idx + 1; j < located.length; j++) {
    if (located[j].lineIdx == null) continue
    if (located[j].hit === 'PARENT-BODY' || located[j].hit === 'INLINE') continue
    if (refDepth(located[j].entry.ref) <= baseDepth) return located[j].lineIdx
  }
  return lines.length
}
function parentBoundsFor(ref) {
  const pref = parentRefOf(ref)
  if (!pref) return { from: 0, to: lines.length }
  const pIdx = located.findIndex((l) => l.entry.ref === pref)
  if (pIdx < 0 || located[pIdx].lineIdx == null) return { from: 0, to: lines.length }
  return { from: located[pIdx].lineIdx + 1, to: nextSiblingLine(pIdx) }
}
// Pass 1B: depth-3+ entries, constrained to their parent's region.
for (let i = 0; i < located.length; i++) {
  if (located[i].lineIdx != null) continue
  const ref = located[i].entry.ref
  if (refDepth(ref) <= 2) continue
  const bounds = parentBoundsFor(ref)
  const loc = locate(located[i].entry, bounds.from)
  if (loc && loc.idx < bounds.to) {
    located[i].lineIdx = loc.idx
    located[i].hit = loc.hit
  }
}
// Pass 2: remaining (depth-2) entries — whole-doc retry (out-of-order).
for (let i = 0; i < located.length; i++) {
  if (located[i].lineIdx != null) continue
  if (refDepth(located[i].entry.ref) > 2) continue
  const loc = locate(located[i].entry, 0)
  if (loc) {
    located[i].lineIdx = loc.idx
    located[i].hit = loc.hit + '*'
  }
}

// Inline-characteristic fallback. PROFILES (02.02) and WEAPONS (02.04) list
// characteristics inline as "Move (M): The speed at which..." — these are the
// 14 outline entries with titles like "MOVE (M)". Locate the parent (NN.NN),
// scan its body for "Name (CODE):" lines, and attach to matching entries.
const inlineCharRe = /^\s*([A-Z][A-Za-z][A-Za-z'’\- ]{2,30}?)\s*\(([A-Z][A-Za-z]{0,5})\):\s*(.*)$/
const inlineContent = new Map() // key "NAME (CODE)" → { lineIdx, content }
for (const { entry, lineIdx } of located) {
  if (!lineIdx) continue
  // For each anchored entry, scan the next 200 lines for inline definitions.
  // 200 is enough for PROFILES body without bleeding into the next section.
  for (let k = 1; k < 200 && lineIdx + k < lines.length; k++) {
    const line = lines[lineIdx + k]
    const m = line.match(inlineCharRe)
    if (!m) continue
    const key = `${m[1]} (${m[2]})`.toUpperCase()
    // Collect content until next inline-char definition or blank+capitalized stop.
    const body = [m[3]]
    for (let j = 1; j < 30 && lineIdx + k + j < lines.length; j++) {
      const next = lines[lineIdx + k + j]
      if (inlineCharRe.test(next)) break
      if (!next.trim()) break
      body.push(next)
    }
    if (!inlineContent.has(key)) {
      inlineContent.set(key, { lineIdx: lineIdx + k, content: body.join('\n').trim() })
    }
  }
}
// Apply inline content to any missing entry whose title matches.
for (let i = 0; i < located.length; i++) {
  if (located[i].lineIdx != null) continue
  const titleKey = located[i].entry.title.toUpperCase()
  const inline = inlineContent.get(titleKey)
  if (inline) {
    located[i].lineIdx = inline.lineIdx
    located[i].hit = 'INLINE'
    located[i].inlineContent = inline.content
  }
}

// Parent-body search fallback. For each missing NN.NN.NN (or deeper) entry,
// search the parent NN.NN body for the title text (case-insensitive). When
// found, capture the surrounding sentence as content. This handles entries
// like 03.01.04 BASE that are bolded inline-terms inside MOVING UNITS rather
// than separate sub-headings.
const parentEntry = new Map() // ref → located entry
for (const l of located) parentEntry.set(l.entry.ref, l)

function findParentBody(parentRef) {
  const p = parentEntry.get(parentRef)
  if (!p || p.lineIdx == null) return null
  // Body slice = from parent's anchor to next outline entry's anchor.
  const pi = located.indexOf(p)
  let endLine = lines.length
  for (let j = pi + 1; j < located.length; j++) {
    if (located[j].lineIdx != null && located[j].hit !== 'PARENT-BODY' && located[j].hit !== 'INLINE') {
      endLine = located[j].lineIdx
      break
    }
  }
  return { startLine: p.lineIdx + 1, endLine }
}

function extractSentenceContaining(body, phrase) {
  // Try a sequence of progressively-looser patterns, returning the first hit.
  // Handles plural mismatch (outline "DISTANCES" vs body "distance") and lets
  // multi-word titles match the longest contiguous prefix that still finds a hit.
  const variants = []
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  variants.push(phrase)
  // Singular fallback: trailing S → optional S, ES → optional ES.
  variants.push(phrase.replace(/IES\b/i, 'Y').replace(/ES\b/i, '').replace(/S\b/i, ''))
  // First-word fallback: just the most distinctive word (longest).
  const words = phrase.split(/\s+/).filter((w) => w.length >= 4)
  if (words.length > 0) variants.push(words.sort((a, b) => b.length - a.length)[0])

  let hitAt = -1
  for (const v of variants) {
    const re = new RegExp(`\\b${esc(v)}s?\\b`, 'i')
    const m = body.match(re)
    if (m) {
      hitAt = m.index
      break
    }
  }
  if (hitAt < 0) return null
  // Walk back to start of sentence.
  let start = hitAt
  while (start > 0) {
    const c = body[start - 1]
    if ((c === '.' || c === '!' || c === '?' || c === '\n') && /\s/.test(body[start])) break
    start--
  }
  // Walk forward to end of sentence. Use hitAt + 1 so we always advance past
  // the matched word; the trailing `.` / `!` / `?` scan picks up the boundary
  // regardless of the matched variant's actual length.
  let end = hitAt + 1
  while (end < body.length) {
    const c = body[end]
    if ((c === '.' || c === '!' || c === '?') && (body[end + 1] === ' ' || body[end + 1] === '\n' || end + 1 === body.length)) {
      end++
      break
    }
    end++
  }
  return body.slice(start, end).trim()
}

for (let i = 0; i < located.length; i++) {
  if (located[i].lineIdx != null) continue
  const ref = located[i].entry.ref
  if (ref.split('.').length < 3) continue // only NN.NN.NN+ get this fallback
  const parentRef = parentOf(ref)
  const range = findParentBody(parentRef)
  if (!range) continue
  const body = lines.slice(range.startLine, range.endLine).join('\n')
  const sentence = extractSentenceContaining(body, located[i].entry.title)
  if (sentence) {
    located[i].lineIdx = range.startLine
    located[i].hit = 'PARENT-BODY'
    located[i].inlineContent = sentence
  }
}

// ── build nodes ──────────────────────────────────────────────────────────────

const nodes = []

function parentOf(ref) {
  const parts = ref.split('.')
  if (parts.length <= 2) return null
  // Drop the last segment — works for both 3-level (NN.NN.NN → NN.NN) and
  // 4-level (NN.NN.NN.NN → NN.NN.NN) refs.
  return parts.slice(0, -1).join('.')
}

for (let i = 0; i < located.length; i++) {
  const { entry, lineIdx, hit, inlineContent: inlineBody } = located[i]
  // Body slice: from this entry's anchor to the next located entry's anchor.
  let endLine = lines.length
  for (let j = i + 1; j < located.length; j++) {
    if (located[j].lineIdx != null && located[j].hit !== 'PARENT-BODY' && located[j].hit !== 'INLINE') {
      endLine = located[j].lineIdx
      break
    }
  }

  let content
  let page
  const override = overrides[entry.ref]
  if (override) {
    content = override.content
    page = override.page ?? (lineIdx ? lineToPage.get(lineIdx) : 1) ?? 1
    if (override.isImage) entry.isImage = true
  } else if (entry.isImage) {
    content = `[Image content — see PDF page ${lineIdx ? (lineToPage.get(lineIdx) ?? '?') : '?'}.]`
    page = lineIdx ? (lineToPage.get(lineIdx) ?? 1) : 1
  } else if (inlineBody) {
    content = inlineBody
    page = lineToPage.get(lineIdx) ?? 1
  } else if (lineIdx == null) {
    content = `[Outline entry ${entry.ref} (${entry.title}) — content not located in pdftotext extraction.]`
    page = 1
  } else {
    const bodyStart = lineIdx + 1
    content = lines.slice(bodyStart, endLine).join('\n').trim()
    page = lineToPage.get(lineIdx) ?? 1
  }

  const ref = entry.ref
  const title = entry.title.replace(/\s*\(IMAGE\)\s*$/, '').trim()
  const id = `11e-core-${slug(title)}-${ref.replace(/\./g, '-')}`
  const summary = (content.split(/[.!?]\s/)[0] || title).slice(0, 200)
  const kw = new Set()
  for (const tok of (title + ' ' + content).toLowerCase().match(/[a-z][a-z\-]{3,}/g) ?? []) {
    if (kw.size >= 12) break
    if (['this', 'that', 'with', 'from', 'their', 'your', 'have', 'these'].includes(tok)) continue
    kw.add(tok)
  }

  nodes.push({
    id,
    layer: 'core',
    category: categoryFor(ref),
    title,
    content,
    summary,
    ...(phaseFromRef(ref) ? { phase: phaseFromRef(ref) } : {}),
    ruleRef: ref,
    ...(parentOf(ref) ? { parentRef: parentOf(ref) } : {}),
    ...(entry.isImage ? { isImage: true } : {}),
    sources: [
      {
        type: 'pdf',
        title: SOURCE_TITLE,
        url: SOURCE_URL,
        page,
        publishedAt: '2026-06-01',
        retrievedAt: RETRIEVED_AT,
      },
    ],
    refs: [],
    version: 1,
    keywords: [...kw],
    edition: '11th',
    locateHit: hit,
  })
}

console.log(`Outline entries: ${outline.length}`)
console.log(`Located in text: ${located.filter((l) => l.lineIdx != null).length}`)
console.log(`Missing       : ${located.filter((l) => l.lineIdx == null).length}`)
console.log(`Nodes emitted : ${nodes.length}`)

// ── write outputs ────────────────────────────────────────────────────────────

const outDir = process.argv[2] ?? 'C:/R/sync-data/tools/11th-official/brain-nodes'
mkdirSync(outDir, { recursive: true })
for (const n of nodes) writeFileSync(`${outDir}/${n.id}.json`, JSON.stringify(n, null, 2))

writeFileSync(
  `${outDir}/_index.json`,
  JSON.stringify(
    nodes.map((n) => ({
      id: n.id,
      ref: n.ruleRef,
      title: n.title,
      category: n.category,
      parent: n.parentRef ?? null,
      isImage: n.isImage ?? false,
      locate: n.locateHit,
    })),
    null,
    2,
  ),
)
console.log(`Wrote ${nodes.length} node files to ${outDir}`)

if (process.argv.includes('--upload')) {
  const bundlePath = `${outDir}/11e-core-bundle.json`
  writeFileSync(bundlePath, JSON.stringify(nodes))
  execSync(
    `wrangler r2 object put tabletop-tools-brain/nodes/11e-core.json --file ${bundlePath} --remote`,
    { stdio: 'inherit' },
  )
  console.log('Uploaded nodes/11e-core.json — remember to bump manifest.json hash.')
}
