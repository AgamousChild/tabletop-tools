/**
 * Faction Pack Parser v2 — general-purpose, completeness-focused extractor.
 *
 * Goals (different from the original `faction-pack.ts`):
 *  1. Build a structured JSON dataset, not graph nodes — downstream brain
 *     integration is a separate concern, intentionally out of scope here.
 *  2. **No text left behind.** Every span of the source markdown is either
 *     mapped into a typed field, or written to `unparsed[]` with a `reason`.
 *  3. Every extracted piece is **identified** — abilities have `kind`,
 *     errata entries have `target.type`, datasheets have stat/weapon/keyword
 *     blocks broken out.
 *  4. Self-reporting coverage: each pack record includes
 *     `coverage: { extractedChars, residueChars, residuePercent }`.
 *
 * The parser is intentionally permissive about ordering of fields inside
 * a datasheet block — gw-sync's PDF→markdown conversion scrambles columns
 * regularly, so we look for ALL-CAPS labels (`KEYWORDS:`, `WARGEAR OPTIONS`,
 * etc.) rather than assuming a fixed structure.
 */

// ─── Schema ───────────────────────────────────────────────────────────────────

export type AbilityKind =
  | 'core'
  | 'faction'
  | 'unit-specific'
  | 'aura'
  | 'wargear'
  | 'damaged-profile'
  | 'leader'
  | 'support'
  | 'attached-unit'
  | 'transport'
  | 'composition'
  | 'invulnerable'

export interface DatasheetStats {
  M?: string
  T?: string
  SV?: string
  W?: string
  LD?: string
  OC?: string
  invSv?: string
}

export interface RangedWeapon {
  name: string
  range?: string
  A?: string
  BS?: string
  S?: string
  AP?: string
  D?: string
  keywords: string[]
  raw: string
}

export interface MeleeWeapon {
  name: string
  A?: string
  WS?: string
  S?: string
  AP?: string
  D?: string
  keywords: string[]
  raw: string
}

export interface DatasheetAbility {
  name: string
  kind: AbilityKind
  body: string
  value?: string
}

export interface Datasheet {
  name: string
  variant?: string // for split titles like "BIG MEK\nON WARBIKE"
  isLegends: boolean
  stats: DatasheetStats
  rangedWeapons: RangedWeapon[]
  meleeWeapons: MeleeWeapon[]
  abilities: DatasheetAbility[]
  wargearOptions: Array<{ description: string }>
  unitComposition?: { models?: string; equipment?: string; raw: string }
  keywords: string[]
  factionKeywords: string[]
  attachableLeaders: string[]
  leads: string[]
  supports: string[]
  damaged?: { threshold: string; effect: string }
  transport?: string
  fluff?: string
  designerNotes: string[]
  raw: string
}

export interface Stratagem {
  name: string
  cpCost?: number
  type?: string // 'BATTLE TACTIC' | 'STRATEGIC PLOY' | ...
  when?: string
  target?: string
  effect?: string
  restrictions?: string
  designerNote?: string
  flavor?: string
  raw: string
}

export interface Enhancement {
  name: string
  points?: number
  body: string
  attachesTo?: string
  restrictions?: string
  raw: string
}

export interface Detachment {
  name: string
  flavor?: string
  detachmentRule?: { name: string; body: string }
  extraRules: Array<{ name: string; body: string }>
  enhancements: Enhancement[]
  stratagems: Stratagem[]
}

export interface ErrataTarget {
  type:
    | 'datasheet'
    | 'enhancement'
    | 'stratagem'
    | 'detachment-rule'
    | 'ability'
    | 'army-rule'
    | 'unknown'
  name: string
  subsection?: string
}

export interface ErrataEntry {
  pages: number[]
  target: ErrataTarget
  changeKind: 'replace' | 'add' | 'remove' | 'other'
  body: string
  replacementText?: string
}

export interface FaqEntry {
  question: string
  answer: string
}

export interface ArmyRule {
  name: string
  body: string
  designerNote?: string
}

export interface UnparsedChunk {
  context: string
  text: string
  reason: string
}

export interface ExtraChunk {
  kind: string
  content: string
}

export interface PackExtract {
  faction: string
  packVersion?: string
  effectiveDate?: string
  source: {
    pdfPath?: string
    markdownPath?: string
    sourceCharCount: number
  }
  coverage: {
    extractedChars: number
    residueChars: number
    residuePercent: number
  }
  detachments: Detachment[]
  datasheets: Datasheet[]
  legendsDatasheets: Datasheet[]
  armyRules: ArmyRule[]
  errata: ErrataEntry[]
  faqs: FaqEntry[]
  extras: ExtraChunk[]
  unparsed: UnparsedChunk[]
  contents?: string // table-of-contents block
  whatsNew?: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_CAPS_NAME = /^[A-Z][A-Z0-9\s\-''‑().,!?:]+$/

function isAllCapsLine(s: string): boolean {
  const trimmed = s.trim()
  if (trimmed.length < 2 || trimmed.length > 80) return false
  return ALL_CAPS_NAME.test(trimmed) && trimmed === trimmed.toUpperCase()
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// Count chars excluding whitespace for coverage calculations
function countSignificantChars(s: string): number {
  return s.replace(/\s+/g, '').length
}

/**
 * Convert an ALL-CAPS string to Title Case.
 * Words that are prepositions/articles/conjunctions (<=3 chars) stay lowercase
 * unless they're the first word. Possessives (O'MALLEY, FORGEFATHER'S) and
 * hyphenated compounds (RAGE-CURSED) are handled.
 */
function titleCase(s: string): string {
  const LOWERCASE_WORDS = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'by', 'and'])
  return s
    .split(/(\s+|-)/g)
    .map((part, idx, arr) => {
      // Preserve whitespace/hyphen separators
      if (/^\s+$/.test(part)) return part
      if (part === '-') return part
      const low = part.toLowerCase()
      // Always capitalise the first word (idx=0) or any part after whitespace
      // at the start of the joined result. Also capitalise after a hyphen.
      const prevPart = idx > 0 ? arr[idx - 1] : ''
      const isAfterHyphen = prevPart === '-'
      const isFirst = arr.slice(0, idx).every((p) => /^[\s-]*$/.test(p))
      if (isFirst || isAfterHyphen) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      }
      // Keep small words lowercase unless first
      if (LOWERCASE_WORDS.has(low)) return low
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join('')
}

/**
 * Heading names that must NOT be treated as detachment names.
 * These are either:
 *  - Faction name repeats that gw-sync emits as h2 section headers
 *  - Stratagem-type qualifiers that end up as headings due to PDF flow
 *  - Generic section markers
 */
const DETACHMENT_NAME_NOISE = new Set([
  'BATTLE TACTIC',
  'STRATEGIC PLOY',
  'WARGEAR',
  'UNIT OPTIONS',
  'ENHANCEMENT',
  'ENHANCEMENTS',
  'DAMAGED',
  "WHAT'S NEW",
  'CORE STRATAGEM',
  'SPACE MARINES',
  "T'AU EMPIRE",
  "EMPEROR'S CHILDREN",
  'ADEPTUS TITANICUS',
  'DEATHWATCH',
  'DATASHEETS',
  'DATASHEET',
  'STRATAGEMS',
  'STRATAGEM',
  'ARMY RULES',
  'ARMY RULE',
  'DETACHMENT RULES',
  'DETACHMENT RULE',
])

// ─── Parser ───────────────────────────────────────────────────────────────────

export interface ParseOptions {
  faction: string
  pdfPath?: string
  markdownPath?: string
}

/**
 * Main entry point. Parses the normalized markdown of a faction pack and
 * returns a structured `PackExtract` plus self-reported coverage.
 */
export function parseFactionPackV2(markdown: string, opts: ParseOptions): PackExtract {
  const sourceCharCount = countSignificantChars(markdown)
  const result: PackExtract = {
    faction: opts.faction,
    source: {
      pdfPath: opts.pdfPath,
      markdownPath: opts.markdownPath,
      sourceCharCount,
    },
    coverage: { extractedChars: 0, residueChars: 0, residuePercent: 100 },
    detachments: [],
    datasheets: [],
    legendsDatasheets: [],
    armyRules: [],
    errata: [],
    faqs: [],
    extras: [],
    unparsed: [],
  }

  // ── Pass 0: collapse PDF-induced markdown artifacts ──────────────────────
  // The gw-sync PDF→markdown emitter creates `##### NN" N+ N+` "headings" for
  // statline fragments and `##### WA R HA M M E R L E G E N D S` empty
  // Legends prefix headings. Both must be absorbed into the previous block
  // before the block splitter runs.
  const cleanedMarkdown = preCollapseArtifacts(markdown)

  // ── Pass 1: split markdown into top-level blocks ─────────────────────────
  const blocks = splitIntoBlocks(cleanedMarkdown)
  mergeAdjacentDatasheetBlocks(blocks)

  // ── Pass 2: classify and extract from each block ─────────────────────────
  let mode: 'preamble' | 'detachment' | 'datasheet-zone' | 'errata' | 'faq' | 'army-rules' =
    'preamble'
  let currentDetachment: Detachment | null = null
  let currentDetachmentZone: 'rule' | 'enhancements' | 'stratagems' | 'after-rule' | null = null
  let pendingStratagemName = ''

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    const { kind, body, headingText, headingLevel } = block

    // Track the heading text for downstream routing
    if (kind === 'heading') {
      const upper = headingText!.toUpperCase()

      // Top-level meta sections
      if (upper === opts.faction.toUpperCase().replace(/-/g, ' ')) {
        // The faction name (e.g., `## ORKS`) marks the start of post-detachment sections
        if (mode === 'preamble') {
          mode = 'preamble'
        } else if (mode === 'detachment') {
          mode = 'datasheet-zone'
        }
        currentDetachment = null
        currentDetachmentZone = null
        continue
      }

      if (/^FACTION PACK:?\s*VERSION/i.test(headingText!)) {
        const versionMatch = headingText!.match(/VERSION\s+([\d.]+)/i)
        if (versionMatch) result.packVersion = versionMatch[1]
        // Body might contain effective date + contents + legal preamble.
        // We want all of this captured so it doesn't end up in `unparsed`.
        const dateMatch = body.match(
          /(?:Legal for matched play from\s+)?(\d+(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i,
        )
        if (dateMatch) result.effectiveDate = dateMatch[1]
        // Stash the entire body as `contents` so the legal/intro/TOC text is
        // accounted for in coverage.
        result.contents = body.trim()
        continue
      }

      if (upper === 'CONTENTS') {
        // Sometimes CONTENTS is its own h4 block. Stash it as contents.
        result.contents = `${result.contents ? result.contents + '\n\n' : ''}${body.trim()}`
        continue
      }

      if (upper.startsWith("WHAT'S NEW")) {
        result.whatsNew = body
          .split('\n')
          .map((l) => l.replace(/^[-•]\s*/, '').trim())
          .filter((l) => l.length > 0)
        continue
      }

      if (
        upper.includes('UPDATES & ERRATA') ||
        upper.includes('UPDATES AND ERRATA') ||
        upper === 'ERRATA' ||
        upper === 'RULES UPDATES' ||
        upper === 'UPDATES'
      ) {
        mode = 'errata'
        const errataEntries = splitErrataBlock(body)
        result.errata.push(...errataEntries)
        continue
      }

      if (upper === 'FAQS' || upper.includes('FREQUENTLY ASKED')) {
        mode = 'faq'
        const faqs = splitFaqBlock(body)
        result.faqs.push(...faqs)
        continue
      }

      if (upper === 'ARMY RULES' || upper === 'ARMY RULE') {
        if (mode === 'errata') {
          // It's an errata sub-section for army rules
          const entries = splitInlineErrata(body, 'army-rule')
          result.errata.push(...entries)
          continue
        }
        mode = 'army-rules'
        // Body of the `#### ARMY RULES` heading is flavor prose introducing
        // the section. Capture it as an extras chunk so it's in coverage.
        if (body.trim()) {
          result.extras.push({ kind: 'army-rules-intro', content: body.trim() })
        }
        continue
      }

      // New-format errata sub-sections: `##### COMPANIONS OF VEHEMENCE
      // DETACHMENT`, `##### DATASHEETS` under `#### UPDATES`.
      if (mode === 'errata') {
        if (/\bDETACHMENT$/i.test(headingText!) || /\bTASK FORCE\b/i.test(headingText!)) {
          const entries = splitInlineErrata(body, 'detachment-rule', headingText!)
          result.errata.push(...entries)

          // Also register an errata-only detachment stub so downstream emitters
          // know this detachment exists in 11e and can emit a fallback node.
          // Strip the trailing " DETACHMENT" so cleanDetachmentName's all-caps
          // detection titleCases the remaining name correctly.
          // (e.g. "VINDICATION TASK FORCE DETACHMENT" → "VINDICATION TASK FORCE"
          //  → titleCase → "Vindication Task Force")
          const stubNameRaw = headingText!.replace(/\s+DETACHMENT$/i, '').trim()
          const stubName = cleanDetachmentName(stubNameRaw)
          // Only add if not already present as a full detachment (avoids duplicates
          // when the same pack has both a full `## NAME` section and an errata
          // heading for the same detachment).
          if (!result.detachments.some((d) => d.name.toLowerCase() === stubName.toLowerCase())) {
            result.detachments.push({
              name: stubName,
              extraRules: [],
              enhancements: [],
              stratagems: [],
              // Mark errata content on the detachment's detachmentRule so
              // downstream can use it as the 11e overlay body.
              ...(body.trim()
                ? {
                    detachmentRule: {
                      name: `${stubName} Errata`,
                      body: body.trim(),
                    },
                  }
                : {}),
            })
          } else {
            // Detachment already exists — append errata body to its rule.
            const existing = result.detachments.find(
              (d) => d.name.toLowerCase() === stubName.toLowerCase(),
            )!
            if (body.trim()) {
              if (existing.detachmentRule) {
                existing.detachmentRule.body = `${existing.detachmentRule.body}\n\n${body.trim()}`
              } else {
                existing.detachmentRule = { name: `${stubName} Errata`, body: body.trim() }
              }
            }
          }
          continue
        }
        if (upper === 'DATASHEETS' || upper === 'DATASHEET') {
          const entries = splitInlineErrata(body, 'datasheet')
          result.errata.push(...entries)
          continue
        }
        if (upper === 'ENHANCEMENTS' || upper === 'ENHANCEMENT') {
          const entries = splitInlineErrata(body, 'enhancement')
          result.errata.push(...entries)
          continue
        }
        if (upper === 'STRATAGEMS' || upper === 'STRATAGEM') {
          const entries = splitInlineErrata(body, 'stratagem')
          result.errata.push(...entries)
          continue
        }
      }

      // h2 detachment heading
      if (headingLevel === 2) {
        // Filter known noise headings that appear as h2 but are not detachments.
        if (DETACHMENT_NAME_NOISE.has(upper)) {
          // Absorb the body as an extras chunk so coverage is accounted for.
          if (body.trim()) {
            result.extras.push({ kind: 'noise-h2-section', content: body.trim() })
          }
          continue
        }

        // Heuristic: an h2 inside a detachment block (i.e., we already saw an h2)
        // that doesn't look like a faction name is a detachment.
        const detachment: Detachment = {
          name: cleanDetachmentName(headingText!),
          extraRules: [],
          enhancements: [],
          stratagems: [],
        }

        // Body shapes:
        //   - Full flavor paragraph (old packs) → flavor
        //   - "DETACHMENT RULES" alone (new June-2026 packs) → next h5 IS the rule
        //   - Flavor + "DETACHMENT RULES" + inline rule body (rare)
        const bodyTrim = body.trim()
        const drMatch = bodyTrim.match(/^([\s\S]*?)\n+\s*DETACHMENT RULES?\s*\n([\s\S]+)$/i)
        const drOnlyMatch = bodyTrim.match(/^([\s\S]*?)\n*\s*DETACHMENT RULES?\s*$/i)
        if (drMatch) {
          if (drMatch[1].trim()) detachment.flavor = drMatch[1].trim()
          const ruleBody = drMatch[2].trim()
          detachment.detachmentRule = {
            name: `${detachment.name} Detachment Rule`,
            body: ruleBody.replace(/\bENHANCEMENTS\s*$/i, '').trim(),
          }
          currentDetachmentZone = /\bENHANCEMENTS\s*$/i.test(ruleBody)
            ? 'enhancements'
            : 'after-rule'
        } else if (drOnlyMatch) {
          if (drOnlyMatch[1].trim()) detachment.flavor = drOnlyMatch[1].trim()
          // The first h5 will be picked up as the rule.
          currentDetachmentZone = 'rule'
        } else if (bodyTrim) {
          detachment.flavor = bodyTrim
        }

        result.detachments.push(detachment)
        currentDetachment = detachment
        pendingStratagemName = ''
        mode = 'detachment'
        continue
      }

      // h3/h4/h5 sub-sections inside detachment or datasheet zone
      if (mode === 'detachment' && currentDetachment) {
        if (upper === 'DETACHMENT RULE' || upper === 'DETACHMENT RULES') {
          currentDetachmentZone = 'rule'
          continue
        }
        if (upper === 'ENHANCEMENTS' || upper === 'ENHANCEMENT') {
          currentDetachmentZone = 'enhancements'
          continue
        }
        if (upper === 'STRATAGEMS' || upper === 'STRATAGEM') {
          currentDetachmentZone = 'stratagems'
          continue
        }

        // ##### NCP heading marks a stratagem block (new pack format). The
        // body contains the italic label + WHEN/TARGET/EFFECT. The CP cost is
        // the heading itself.
        const cpMatch = upper.match(/^(\d+)\s*CP$/i)
        if (cpMatch) {
          const cp = parseInt(cpMatch[1]!, 10)
          const { stratagems } = extractStratagems(`STRAT NAME\n\n${body.trim()}`)
          for (const s of stratagems) {
            s.cpCost = cp
            if (s.name === 'STRAT NAME') s.name = ''

            // Priority for naming:
            //  1. pendingStratagemName (carried from prior enhancement/strat)
            //  2. Trailing ALL-CAPS in the previous stratagem's effect
            //  3. Existing s.name from extractStratagems (extracted from body)
            if (pendingStratagemName) {
              s.name = pendingStratagemName
              pendingStratagemName = ''
            } else if (!s.name && currentDetachment.stratagems.length > 0) {
              const prev = currentDetachment.stratagems[currentDetachment.stratagems.length - 1]!
              const tail = (prev.effect || '').match(/([A-Z][A-Z0-9\s\-''‑]{2,60})\s*$/)
              if (tail && isAllCapsLine(tail[1]!)) {
                s.name = tail[1]!.trim()
                prev.effect = (prev.effect || '')
                  .replace(/\s*[A-Z][A-Z0-9\s\-''‑]{2,60}\s*$/, '')
                  .trim()
              }
            }

            // If extractStratagems noted a stripped next-name, carry it
            // forward as the upcoming strat's pending name.
            const nextFromExtractor = (s as Stratagem & { _nextName?: string })._nextName
            if (nextFromExtractor) {
              pendingStratagemName = nextFromExtractor
              delete (s as Stratagem & { _nextName?: string })._nextName
            }

            // Defensive: if the strat's effect STILL ends with an ALL-CAPS
            // run (extractStratagems missed it), hold it.
            if (!pendingStratagemName && s.effect) {
              const innerTail = s.effect.match(/[.!?]\s+([A-Z][A-Z0-9\s\-''‑]{2,60})\s*$/)
              if (innerTail && isAllCapsLine(innerTail[1]!)) {
                pendingStratagemName = innerTail[1]!.trim()
                s.effect = s.effect.slice(0, s.effect.length - innerTail[0]!.length) + '.'
                s.effect = s.effect.trim()
              }
            }

            currentDetachment.stratagems.push(s)
          }
          currentDetachmentZone = 'stratagems'
          continue
        }

        // Named sub-section: route by zone
        if (currentDetachmentZone === 'rule') {
          // The first ##### inside DETACHMENT RULE is the rule itself.
          if (!currentDetachment.detachmentRule) {
            currentDetachment.detachmentRule = { name: headingText!, body: body.trim() }
            // After the rule, ENHANCEMENTS may be inlined as a bare word
            const trailingEnhancements = body.match(/\bENHANCEMENTS\b\s*$/i)
            if (trailingEnhancements) {
              currentDetachment.detachmentRule.body = body
                .replace(/\bENHANCEMENTS\b\s*$/i, '')
                .trim()
              currentDetachmentZone = 'enhancements'
            } else {
              currentDetachmentZone = 'after-rule'
            }
            continue
          } else {
            // Extra rule under the detachment
            currentDetachment.extraRules.push({ name: headingText!, body: body.trim() })
            continue
          }
        }

        // Datasheet entry inside a detachment block — this happens when
        // packs end the detachment with stratagems followed by datasheets
        // without a faction reset heading. Detect a datasheet block.
        // Check BEFORE enhancement-zone routing because the zone may have
        // been latched from earlier text but the current block is clearly
        // a unit profile.
        if (looksLikeDatasheetBody(body)) {
          const ds = parseDatasheet(headingText!, body)
          if (ds.isLegends) result.legendsDatasheets.push(ds)
          else result.datasheets.push(ds)
          continue
        }

        if (currentDetachmentZone === 'enhancements' || currentDetachmentZone === 'after-rule') {
          let cleanBody = body.trim()
          // Strip trailing ALL-CAPS run from the body. The run can appear:
          //   - at end of body after a period: "...effect. NEXT STRAT NAME"
          //   - at end of a bullet line: "- Or: [PRECISION] . NEXT STRAT NAME"
          // The stripped name is held as `pendingStratagemName` so the next
          // `##### NCP` block can assign it.
          const trailMatch = cleanBody.match(/[.!?]\s+([A-Z][A-Z0-9\s\-''‑]{2,60})\s*$/)
          if (trailMatch && isAllCapsLine(trailMatch[1]!)) {
            // Special-case ENHANCEMENTS — that's the section marker, not a
            // strat name. Just drop it.
            if (trailMatch[1]!.trim() !== 'ENHANCEMENTS') {
              pendingStratagemName = trailMatch[1]!.trim()
            }
            const cut = trailMatch[0]!.match(/^[.!?]/)?.[0] ?? ''
            cleanBody = cleanBody.slice(0, cleanBody.length - trailMatch[0]!.length) + cut
            cleanBody = cleanBody.trim()
          }
          // Same for bullet lines
          cleanBody = cleanBody.replace(
            /^(\s*[-•][^\n]*?\.)\s+([A-Z][A-Z0-9\s\-''‑]{2,60})\s*$/gm,
            (_full, prefix: string, name: string) => {
              if (isAllCapsLine(name)) {
                if (name.trim() !== 'ENHANCEMENTS') pendingStratagemName = name.trim()
                return prefix
              }
              return _full
            },
          )
          const enhancement = parseEnhancement(headingText!, cleanBody)
          currentDetachment.enhancements.push(enhancement)
          if (currentDetachmentZone === 'after-rule') currentDetachmentZone = 'enhancements'
          continue
        }

        // Unknown heading inside detachment — log
        result.extras.push({
          kind: 'unknown-detachment-section',
          content: `## ${headingText}\n\n${body}`.trim(),
        })
        continue
      }

      // Datasheet zone (post-detachments) + army-rules + faq + errata
      if (
        mode === 'datasheet-zone' ||
        mode === 'errata' ||
        mode === 'faq' ||
        mode === 'army-rules' ||
        mode === 'preamble'
      ) {
        // Recognise datasheet headings
        const isDsBody = looksLikeDatasheetBody(body)
        // Legends prefix
        const isLegendsHeading = /^WA\s*R\s*HA\s*M\s*M\s*E\s*R\s+L\s*E\s*G\s*E\s*N\s*D\s*S/i.test(
          headingText!,
        )
        if (isDsBody || isLegendsHeading) {
          const ds = parseDatasheet(headingText!, body)
          if (ds.isLegends) result.legendsDatasheets.push(ds)
          else result.datasheets.push(ds)
          continue
        }

        // Army rule under ARMY RULES zone
        if (mode === 'army-rules') {
          result.armyRules.push({ name: headingText!, body: body.trim() })
          continue
        }

        // Faction-name synthetic heading like `##### ADEPTUS TITANICUS` —
        // treat as a passive marker; absorb the body as preamble noise so
        // it's counted (it's typically just the faction name repeated).
        const factionLowered = opts.faction.toUpperCase().replace(/-/g, ' ')
        if (
          upper === factionLowered ||
          upper.replace(/'S/g, 'S') === factionLowered.replace(/'S/g, 'S')
        ) {
          if (body.trim()) {
            result.extras.push({ kind: 'faction-name-marker', content: body.trim() })
          }
          continue
        }

        // Unknown — extra
        if (body.trim()) {
          result.extras.push({
            kind: 'unknown-section',
            content: `## ${headingText}\n\n${body}`.trim(),
          })
          continue
        }
      }

      // Preamble heading we didn't match
      if (body.trim()) {
        result.extras.push({
          kind: 'preamble-section',
          content: `## ${headingText}\n\n${body}`.trim(),
        })
      }
      continue
    }

    // Stratagem standalone block (italic *…STRATAGEM…* + content)
    if (kind === 'stratagem' && currentDetachment) {
      currentDetachment.stratagems.push(block.stratagem!)
      continue
    }

    if (kind === 'stratagem' && !currentDetachment) {
      // Orphan stratagem — log but keep
      result.extras.push({
        kind: 'orphan-stratagem',
        content: block.stratagem!.raw,
      })
      continue
    }

    // Plain text block: route to current mode
    if (kind === 'text') {
      const text = body.trim()
      if (!text) continue

      if (mode === 'army-rules') {
        // Append to previous army-rule entry or extras
        if (result.armyRules.length > 0) {
          const last = result.armyRules[result.armyRules.length - 1]!
          last.body = last.body ? `${last.body}\n${text}` : text
        } else {
          result.extras.push({ kind: 'army-rules-prose', content: text })
        }
        continue
      }

      if (mode === 'errata') {
        const more = splitErrataBlock(text)
        result.errata.push(...more)
        continue
      }

      if (mode === 'faq') {
        const more = splitFaqBlock(text)
        result.faqs.push(...more)
        continue
      }

      if (mode === 'detachment' && currentDetachment && !currentDetachmentZone) {
        // Detachment flavor was already captured in heading body; if more arrives,
        // append it.
        if (currentDetachment.flavor) {
          currentDetachment.flavor += '\n' + text
        } else {
          currentDetachment.flavor = text
        }
        continue
      }

      // Unrouted text — unparsed
      result.unparsed.push({
        context: `mode=${mode}`,
        text,
        reason: 'text outside any heading/section',
      })
    }
  }

  // ── Stratagem CP-cost tail extraction ────────────────────────────────────
  // Many packs append a tail like "1CP 1CP 1CP ..." to the LAST stratagem in
  // each detachment. Distribute these into per-stratagem cpCost.
  for (const det of result.detachments) {
    distributeCpCosts(det)
  }

  // ── Pass 3 / 4: walk the source line-by-line, decide if each line is
  // captured by structured output OR identifiably noise (markers, page
  // numbers, faction-name headers). Anything else goes to unparsed[].
  // Then compute coverage as (sourceChars - residueChars), where residue is
  // ONLY the chars in unparsed[]. Marker/noise lines do NOT count as
  // residue, because they're identified.
  const residueChars = classifyResidueAndCount(markdown, result)
  result.coverage.residueChars = residueChars
  result.coverage.extractedChars = Math.max(0, sourceCharCount - residueChars)
  result.coverage.residuePercent = sourceCharCount > 0 ? (residueChars / sourceCharCount) * 100 : 0

  return result
}

// ─── Block splitter ───────────────────────────────────────────────────────────

interface Block {
  kind: 'heading' | 'stratagem' | 'text'
  headingText?: string
  headingLevel?: number
  body: string
  stratagem?: Stratagem
}

function splitIntoBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n')
  const blocks: Block[] = []

  let currentHeading: { text: string; level: number } | null = null
  let buffer: string[] = []

  function flush() {
    const body = buffer.join('\n').trimEnd()
    buffer = []

    if (currentHeading) {
      // `##### NCP` headings: leave the body INTACT so the outer
      // detachment-zone handler can recognise it and stamp CP cost.
      const isCpHeader = /^\d+\s*CP$/i.test(currentHeading.text.trim())
      if (isCpHeader) {
        blocks.push({
          kind: 'heading',
          headingText: currentHeading.text,
          headingLevel: currentHeading.level,
          body,
        })
        currentHeading = null
        return
      }
      // Other headings may contain stratagems mixed with body — split them.
      const { remaining, stratagems } = extractStratagems(body)
      blocks.push({
        kind: 'heading',
        headingText: currentHeading.text,
        headingLevel: currentHeading.level,
        body: remaining,
      })
      for (const s of stratagems) {
        blocks.push({ kind: 'stratagem', body: s.raw, stratagem: s })
      }
      currentHeading = null
    } else if (body.trim()) {
      const { remaining, stratagems } = extractStratagems(body)
      if (remaining.trim()) {
        blocks.push({ kind: 'text', body: remaining })
      }
      for (const s of stratagems) {
        blocks.push({ kind: 'stratagem', body: s.raw, stratagem: s })
      }
    }
  }

  for (const line of lines) {
    const hMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (hMatch) {
      flush()
      currentHeading = { text: hMatch[2]!.trim(), level: hMatch[1]!.length }
      continue
    }
    buffer.push(line)
  }
  flush()

  return blocks
}

// ─── PDF artifact collapse ───────────────────────────────────────────────────

/**
 * gw-sync's pdf→markdown emits faux headings for stat-line fragments and
 * the bare `WA R HA M M E R L E G E N D S` Legends prefix. Examples:
 *
 *   ##### 14" 3+ 6+
 *   ##### 4+
 *   ##### WA R HA M M E R L E G E N D S
 *
 * These break the block splitter because they look like new sections.
 * Collapse them into the preceding block's body (as inline text) before
 * splitting.
 *
 * Also collapses split-name detachment headings: when a PDF column break
 * causes a single detachment name to appear as two consecutive `## PART1`
 * + `## PART2` lines (with only blank lines between them), merge them into
 * one `## PART1 PART2` heading before the block splitter runs. Examples:
 *
 *   ## SPEARPOINT          ##  FORGEFATHER'S       ## COURT OF THE
 *   ## TASK FORCE      →   ## SEEKERS          →   ## PHOENICIAN
 *
 * Heuristic: both headings are h2, the first has no body (only blank lines
 * precede the second h2), and neither name matches a known section marker.
 */
function preCollapseArtifacts(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const h = line.match(/^#{2,5}\s+(.+?)\s*$/)
    if (h) {
      const heading = h[1]!.trim()
      // Statline-only heading: only digits, +, ", -/dashes and spaces. The
      // first character may be `‑` (en-dash) for missing M stat, or `20+"`,
      // or `6"` style.
      if (/^[\d\-‑–+"\s.]+$/.test(heading) && heading.length <= 40) {
        // Demote: emit as plain text line
        out.push(heading)
        continue
      }
      // Bare invulnerable save value: "4+", "5+", "6+"
      if (/^[0-9]+\+\s*$/.test(heading)) {
        out.push(heading)
        continue
      }
      // Single letter stat-row carry-over from PDF text flow, e.g. "M", "T"
      if (/^[MT]\s*$/.test(heading)) {
        out.push(heading)
        continue
      }
      // Multi-line stat header "20+\"" plus separate "M"
      if (/^\d+\+?"\s*$/.test(heading)) {
        out.push(heading)
        continue
      }
      // Bare Legends prefix (no unit name)
      if (/^WA\s*R\s*HA\s*M\s*M\s*E\s*R\s+L\s*E\s*G\s*E\s*N\s*D\s*S\s*$/i.test(heading)) {
        out.push('WARHAMMER LEGENDS')
        continue
      }

      // Consecutive h2 split-name detection: if this is an h2 AND the next
      // non-blank line is also an h2, merge them into one heading. Only merge
      // when:
      //   1. Current heading level is 2.
      //   2. Next non-blank line is also h2.
      //   3. Current heading is ALL-CAPS (i.e. a detachment name fragment).
      //   4. Neither name is a known noise/section marker.
      const hLevel = line.match(/^(#{1,6})\s/)![1]!.length
      if (hLevel === 2 && /^[A-Z0-9][A-Z0-9\s\-''‑.,!?]*$/.test(heading)) {
        // Find the next non-blank line
        let nextNonBlank = -1
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j]!.trim() !== '') {
            nextNonBlank = j
            break
          }
        }
        if (nextNonBlank >= 0) {
          const nextLine = lines[nextNonBlank]!
          const nextH = nextLine.match(/^##\s+(.+?)\s*$/)
          if (nextH) {
            const nextHeading = nextH[1]!.trim()
            // Both are ALL-CAPS h2s and neither is a noise term
            if (
              /^[A-Z0-9][A-Z0-9\s\-''‑.,!?]*$/.test(nextHeading) &&
              !DETACHMENT_NAME_NOISE.has(heading.toUpperCase()) &&
              !DETACHMENT_NAME_NOISE.has(nextHeading.toUpperCase())
            ) {
              // Merge: emit one combined h2, skip blank lines + consumed next
              const merged = `${heading} ${nextHeading}`
              out.push(`## ${merged}`)
              // Skip past blank lines and the next h2 line
              i = nextNonBlank
              continue
            }
          }
        }
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

/**
 * After the block splitter runs, each datasheet is often broken into:
 *   #####  UNIT_NAME → main block (KEYWORDS / weapons / ABILITIES)
 *   #####  UNIT_NAME → trailing block (UNIT COMPOSITION / fluff / etc)
 *
 * Merge consecutive heading blocks that share the SAME name (or where one is
 * a variant/sub-line of the other) into a single combined block by appending
 * the bodies. The block splitter has already classified them as `heading`.
 */
function mergeAdjacentDatasheetBlocks(blocks: Block[]): void {
  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i]!
    const b = blocks[i + 1]!
    if (a.kind !== 'heading' || b.kind !== 'heading') continue
    if (!a.headingText || !b.headingText) continue

    const aName = a.headingText.toUpperCase().trim()
    const bName = b.headingText.toUpperCase().trim()

    // Strip Legends prefix for comparison
    const aBase = aName
      .replace(/^WA\s*R\s*HA\s*M\s*M\s*E\s*R\s+L\s*E\s*G\s*E\s*N\s*D\s*S\s*/i, '')
      .trim()
    const bBase = bName
      .replace(/^WA\s*R\s*HA\s*M\s*M\s*E\s*R\s+L\s*E\s*G\s*E\s*N\s*D\s*S\s*/i, '')
      .trim()

    // Same unit name (after stripping Legends prefix)
    if (aBase && bBase && aBase === bBase && aBase !== 'WARHAMMER LEGENDS') {
      a.body = (a.body + '\n\n' + b.body).trim()
      blocks.splice(i + 1, 1)
      i-- // re-check
    }
  }
}

// ─── Stratagem extraction ─────────────────────────────────────────────────────

/**
 * Stratagems in markdown look like:
 *
 *   STRATAGEM NAME
 *
 *   *DETACHMENT — TYPE STRATAGEM*
 *
 *   flavor paragraph.
 *
 *   **WHEN:** ...
 *   **TARGET:** ...
 *   **EFFECT:** ...
 *
 *   NEXT STRATAGEM NAME
 *   *...*
 *
 * The last stratagem in a detachment block often has a CP-cost tail like
 * "1CP 1CP 1CP 1CP 1CP 1CP" listing all stratagems' costs in order.
 */
function extractStratagems(text: string): { remaining: string; stratagems: Stratagem[] } {
  const stratagems: Stratagem[] = []
  const lines = text.split('\n')

  const indices: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^\*[^*]*STRATAGEM[^*]*\*$/i.test(lines[i]!.trim())) {
      indices.push(i)
    }
  }

  if (indices.length === 0) {
    return { remaining: text, stratagems: [] }
  }

  const consumedRanges: Array<{ start: number; end: number }> = []

  for (let k = 0; k < indices.length; k++) {
    const labelIdx = indices[k]!
    const label = lines[labelIdx]!.trim()
    const labelText = label.replace(/^\*|\*$/g, '').trim()

    // Look backward for name (ALL-CAPS line)
    let name = ''
    let nameIdx = -1
    for (let j = labelIdx - 1; j >= Math.max(0, labelIdx - 6); j--) {
      const cand = lines[j]!.trim()
      if (!cand) continue
      if (isAllCapsLine(cand)) {
        name = cand
        nameIdx = j
        break
      }
      // If we hit non-empty non-caps text first, the name might be embedded
      // at the end of that line (PDF flattening artifact).
      const trailingCapsMatch = cand.match(/[.!?]\s+([A-Z][A-Z0-9\s\-''‑]{1,60})$/)
      if (trailingCapsMatch && isAllCapsLine(trailingCapsMatch[1]!)) {
        name = trailingCapsMatch[1]!.trim()
        nameIdx = j // we'll keep the rest of that line in body
        break
      }
      break
    }

    // Determine body end: next strat label or end
    const bodyEnd = k + 1 < indices.length ? indices[k + 1]! : lines.length
    const bodyStart = labelIdx + 1

    // Look forward inside body for trailing ALL-CAPS that's actually the
    // next strat's name
    let actualBodyEnd = bodyEnd
    if (k + 1 < indices.length) {
      // Walk backward from bodyEnd to find name of next strat
      for (let j = bodyEnd - 1; j > labelIdx; j--) {
        const cand = lines[j]!.trim()
        if (!cand) continue
        if (isAllCapsLine(cand)) {
          actualBodyEnd = j
        }
        break
      }
    }

    let bodyText = lines.slice(bodyStart, actualBodyEnd).join('\n').trim()
    let strippedNextName = ''

    // Strip trailing ALL-CAPS embedded at end of last line (next strat name)
    const trailingNameMatch = bodyText.match(/([.!?])\s+([A-Z][A-Z0-9\s\-''‑]{2,60})\s*$/)
    if (trailingNameMatch && isAllCapsLine(trailingNameMatch[2]!)) {
      strippedNextName = trailingNameMatch[2]!.trim()
      bodyText = bodyText.replace(trailingNameMatch[0], trailingNameMatch[1]!)
    }

    // Parse WHEN/TARGET/EFFECT/RESTRICTIONS
    const stratagem: Stratagem & { _nextName?: string } = {
      name: name || labelText.split('—')[0]!.trim(),
      raw: `${name ? name + '\n\n' : ''}${label}\n\n${bodyText}`.trim(),
    }
    if (strippedNextName) stratagem._nextName = strippedNextName

    // Type from label: "DET — TYPE STRATAGEM"
    const typeMatch = labelText.match(/[—-]\s*(.+?)\s+STRATAGEM/i)
    if (typeMatch) stratagem.type = typeMatch[1]!.trim().toUpperCase()

    const whenMatch = bodyText.match(/\*\*WHEN:\*\*\s*([\s\S]*?)(?=\n\s*\*\*[A-Z]+:\*\*|$)/i)
    if (whenMatch) stratagem.when = normalizeWhitespace(whenMatch[1]!)
    const targetMatch = bodyText.match(/\*\*TARGET:\*\*\s*([\s\S]*?)(?=\n\s*\*\*[A-Z]+:\*\*|$)/i)
    if (targetMatch) stratagem.target = normalizeWhitespace(targetMatch[1]!)
    const effectMatch = bodyText.match(/\*\*EFFECT:\*\*\s*([\s\S]*?)(?=\n\s*\*\*[A-Z]+:\*\*|$)/i)
    if (effectMatch) stratagem.effect = normalizeWhitespace(effectMatch[1]!)
    const restrMatch = bodyText.match(
      /\*\*RESTRICTIONS:\*\*\s*([\s\S]*?)(?=\n\s*\*\*[A-Z]+:\*\*|$)/i,
    )
    if (restrMatch) stratagem.restrictions = normalizeWhitespace(restrMatch[1]!)

    // Flavor: text before **WHEN:**
    const beforeWhen = bodyText.split(/\*\*WHEN:\*\*/i)[0]?.trim()
    if (beforeWhen) stratagem.flavor = normalizeWhitespace(beforeWhen)

    // Designer's Note can appear in effect or after — pull it out
    const dnMatch = bodyText.match(/Designer'?s Note:\s*([\s\S]*?)(?=\n\s*\*\*|\n\n[A-Z]|$)/i)
    if (dnMatch) stratagem.designerNote = normalizeWhitespace(dnMatch[1]!)

    stratagems.push(stratagem)
    consumedRanges.push({
      start: nameIdx >= 0 ? nameIdx : labelIdx,
      end: actualBodyEnd,
    })
  }

  // Build "remaining" by removing consumed line ranges
  const consumed = new Set<number>()
  for (const r of consumedRanges) {
    for (let i = r.start; i < r.end; i++) consumed.add(i)
  }
  const remaining = lines
    .map((line, i) => (consumed.has(i) ? '' : line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { remaining, stratagems }
}

// ─── CP cost distribution ─────────────────────────────────────────────────────

function distributeCpCosts(det: Detachment): void {
  // Find the tail "NCP NCP NCP ..." sequence on the LAST stratagem's effect
  if (det.stratagems.length === 0) return
  for (let i = det.stratagems.length - 1; i >= 0; i--) {
    const s = det.stratagems[i]!
    const fields = [s.effect, s.target, s.restrictions, s.flavor].filter((x): x is string => !!x)
    for (const field of fields) {
      const tail = field.match(/(?:\s*\d+CP)+\s*$/i)
      if (!tail) continue
      const costs = tail[0].match(/(\d+)CP/gi)!.map((s) => parseInt(s, 10))
      // Strip tail from the original field
      const cleaned = field.replace(/(?:\s*\d+CP)+\s*$/i, '').trim()
      if (s.effect === field) s.effect = cleaned
      else if (s.target === field) s.target = cleaned
      else if (s.restrictions === field) s.restrictions = cleaned
      else if (s.flavor === field) s.flavor = cleaned
      // Distribute in order across all stratagems in the detachment
      if (costs.length === det.stratagems.length) {
        for (let j = 0; j < costs.length; j++) {
          det.stratagems[j]!.cpCost = costs[j]
        }
        return
      } else if (costs.length === 1) {
        s.cpCost = costs[0]
        return
      }
    }
  }
}

// ─── Enhancement parser ───────────────────────────────────────────────────────

function parseEnhancement(name: string, body: string): Enhancement {
  // points: trailing "(N pts)" or "N pts"
  const pointsMatch = `${name}\n${body}`.match(/\(?(\d+)\s*pts?\)?/i)
  const points = pointsMatch ? parseInt(pointsMatch[1]!, 10) : undefined

  // attachesTo: detect from restriction text
  let attachesTo: string | undefined
  const restrictionMatch = body.match(/^([A-Z][^.]*?model only\.)/im)
  let restrictions: string | undefined
  if (restrictionMatch) restrictions = restrictionMatch[1]!.trim()

  const lower = body.toLowerCase()
  if (lower.includes('character model only')) attachesTo = 'character'
  else if (lower.includes('warboss')) attachesTo = 'leader'
  else if (lower.includes('mek model only')) attachesTo = 'leader'
  else if (/\bmodel only\b/.test(lower)) attachesTo = 'unit'

  return {
    name,
    points,
    body: body.trim(),
    attachesTo,
    restrictions,
    raw: `##### ${name}\n\n${body.trim()}`,
  }
}

// ─── Datasheet parser ─────────────────────────────────────────────────────────

function looksLikeDatasheetBody(body: string): boolean {
  // Tightened: only the actual table headers + KEYWORDS labels count. The
  // phrase "ranged weapons equipped by..." in enhancement prose used to
  // trigger this. Now require the column-header signature (RANGE A BS S AP D
  // / RANGE A WS S AP D) or an explicit KEYWORDS:/FACTION KEYWORDS: label
  // that actually starts a line, or the stat-row header M T SV W LD OC.
  return (
    /(RANGED|MELEE)\s+WEAPONS\b[^\n]*\b(RANGE|R)\s+A\s+(BS|WS)\s+S\s+AP\s+D/i.test(body) ||
    /(^|\n)\s*KEYWORDS:\s/i.test(body) ||
    /(^|\n)\s*FACTION KEYWORDS?:\s/i.test(body) ||
    /\bM\s+T\s+SV\s+W\s+LD\s+OC\b/.test(body)
  )
}

function parseDatasheet(rawName: string, body: string): Datasheet {
  const isLegends = /^WA\s*R\s*HA\s*M\s*M\s*E\s*R\s+L\s*E\s*G\s*E\s*N\s*D\s*S/i.test(rawName)
  // Strip Legends prefix if present
  let name = rawName
    .replace(/^WA\s*R\s*HA\s*M\s*M\s*E\s*R\s+L\s*E\s*G\s*E\s*N\s*D\s*S\s*/i, '')
    .trim()
  // Variant detection: "BIG MEK\nON WARBIKE" — but our heading is single line.
  // Subhead variants come from the body (first line ALL-CAPS like "ON WARBIKE")
  let variant: string | undefined
  const lines = body.split('\n')
  const firstNonEmpty = lines.find((l) => l.trim().length > 0)
  if (firstNonEmpty && isAllCapsLine(firstNonEmpty) && firstNonEmpty.length <= 40) {
    variant = firstNonEmpty.trim()
  }
  // Heading name continuation — PDF headings break mid-name and the tail
  // lands glued to the first body line, before "KEYWORDS:". Real cases:
  // "PAINBOY" + "ON WARBIKE KEYWORDS: …", "BIG MEK" + "WITH KUSTOM FORCE
  // FIELD KEYWORDS: …", "NOBZ" + "ON WARBIKES KEYWORDS: …". Without the
  // join, the truncated name collides with the live unit of the same name
  // (a Legends "PAINBOY ON WARBIKE" masquerading as the legal Painboy).
  if (firstNonEmpty) {
    const cont = /^\s*((?:ON|WITH|IN|OF)\s[A-Z0-9'!()\-‑\s]{2,40}?)\s+KEYWORDS:/.exec(firstNonEmpty)
    if (cont) {
      const continuation = cont[1]!.replace(/\s+/g, ' ').trim()
      name = `${name} ${continuation}`
      variant = variant ?? continuation
    }
  }

  // Stats: look for "M T SV W LD OC" header and the line beneath which has the values
  const stats = extractStats(body)

  const rangedWeapons = extractRangedWeapons(body)
  const meleeWeapons = extractMeleeWeapons(body)
  const { abilities, designerNotes } = extractAbilities(body)
  const keywords = extractKeywordsList(body, 'KEYWORDS')
  const factionKeywords = extractKeywordsList(body, 'FACTION KEYWORDS')
  const wargearOptions = extractWargearOptions(body)
  const unitComposition = extractUnitComposition(body)
  const attachableLeaders: string[] = []
  const leadsArr = extractAttachables(body, 'LEADER')
  const supportsArr = extractAttachables(body, 'SUPPORT')
  const damaged = extractDamaged(body)
  const transport = extractTransportText(body)
  const fluff = extractFluff(body)

  return {
    name,
    variant,
    isLegends,
    stats,
    rangedWeapons,
    meleeWeapons,
    abilities,
    wargearOptions,
    unitComposition,
    keywords,
    factionKeywords,
    attachableLeaders,
    leads: leadsArr,
    supports: supportsArr,
    damaged,
    transport,
    fluff,
    designerNotes,
    raw: `##### ${rawName}\n\n${body}`.trim(),
  }
}

function extractStats(body: string): DatasheetStats {
  const stats: DatasheetStats = {}
  // Find "M T SV W LD OC" header (or partial: "T SV W LD OC" / "M ..." )
  // Find the first line that looks like "[Number]\"  [Number]+  [Number]+ ..."
  // Typical PDF-flattened stat row: `##### 6" 3+ 6+` or `##### 14" 3+ 6+`.
  const numRow = body.match(/(?:^|\n)\s*(?:#{2,5}\s+)?(\d{1,2}(?:\+|")?[\s+\d"‑-]+)/m)
  if (numRow) {
    const cells = numRow[1]!.trim().split(/\s+/)
    // Heuristic mapping: 6 cells = M T SV W LD OC; 3 cells = subset
    if (cells.length === 6) {
      ;[stats.M, stats.T, stats.SV, stats.W, stats.LD, stats.OC] = cells as [
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    } else if (cells.length === 3) {
      // Often M, SV, OC after a partial column header
      ;[stats.M, stats.SV, stats.OC] = cells as [string, string, string]
    }
  }

  // Invulnerable save: "INVULNERABLE SAVE\n\n##### 4+"
  const invMatch = body.match(/INVULNERABLE SAVE\s*\n+\s*(?:#{2,5}\s+)?([0-9]+\+)/i)
  if (invMatch) stats.invSv = invMatch[1]

  return stats
}

function extractRangedWeapons(body: string): RangedWeapon[] {
  // Find "RANGED WEAPONS RANGE A BS S AP D" header — capture lines until
  // "MELEE WEAPONS" or "ABILITIES" or end of body.
  const m = body.match(
    /RANGED WEAPONS[^\n]*(?:RANGE|R)\s+A\s+BS\s+S\s+AP\s+D\s*([\s\S]*?)(?=MELEE WEAPONS|ABILITIES|KEYWORDS|FACTION|WARGEAR|UNIT COMPOSITION|DAMAGED|INVULNERABLE|$)/i,
  )
  if (!m) return []
  return parseWeaponLines(m[1]!, 'ranged') as RangedWeapon[]
}

function extractMeleeWeapons(body: string): MeleeWeapon[] {
  const m = body.match(
    /MELEE WEAPONS[^\n]*(?:RANGE|R)\s+A\s+WS\s+S\s+AP\s+D\s*([\s\S]*?)(?=ABILITIES|KEYWORDS|FACTION|WARGEAR|UNIT COMPOSITION|DAMAGED|INVULNERABLE|RANGED WEAPONS|$)/i,
  )
  if (!m) return []
  return parseWeaponLines(m[1]!, 'melee') as MeleeWeapon[]
}

function parseWeaponLines(block: string, kind: 'ranged' | 'melee'): RangedWeapon[] | MeleeWeapon[] {
  // The block is a flowing run of weapons. Each weapon is something like:
  //   "Grabba dragga [ASSAULT, PRECISION] 12" 2+ - "
  // Heuristic: split on stat patterns.
  // First normalise whitespace
  const text = block.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return [] as RangedWeapon[] | MeleeWeapon[]

  // Strategy: find each weapon by finding a "name [keywords]? <stats>" then
  // splitting on the start of the next weapon name. Stats line ends after D.
  // We'll use a token-based approach: split on transitions where we hit a
  // numeric/Melee/stat triplet followed by something that looks like a name.
  // Use regex: each weapon = name (greedy non-stat chars) + optional [KEYS]
  // + then stats (numbers + +/- chars + "/Melee").

  // Easier: split by detecting "(\d|Melee)" followed by 3-5 stat tokens then
  // a new name starting with a Capital letter.
  const weapons: Array<RangedWeapon | MeleeWeapon> = []
  // Tokenize: pattern matches one weapon row
  // Token-based approach: split on "{name + optional keywords} {stat fields}"
  // boundaries by walking the token stream and accumulating each weapon row.
  const tokens = text.split(/\s+/)
  let i = 0
  while (i < tokens.length) {
    // Accumulate name until we see a stat-starting token (Melee, NN", NN+, N/A, -, D6, D3, etc)
    const nameTokens: string[] = []
    while (i < tokens.length && !looksLikeStatStart(tokens[i]!, kind)) {
      nameTokens.push(tokens[i]!)
      i++
    }
    if (nameTokens.length === 0) {
      // Skip an unrecognised token to avoid infinite loop
      i++
      continue
    }
    // Collect stat tokens (up to 6 for ranged, 5 for melee). They are simple
    // tokens like 12", 2+, -, D6, D3+1, N/A, Melee, etc.
    const statTokens: string[] = []
    const maxStats = kind === 'ranged' ? 6 : 6
    while (i < tokens.length && statTokens.length < maxStats && looksLikeStatToken(tokens[i]!)) {
      statTokens.push(tokens[i]!)
      i++
    }
    if (statTokens.length === 0) continue

    // Reconstruct name + keywords
    let rawName = nameTokens.join(' ').trim()
    const keywords: string[] = []
    const kwMatch = rawName.match(/\[([^\]]+)\]\s*$/)
    if (kwMatch) {
      keywords.push(...kwMatch[1]!.split(/,\s*/).map((s) => s.trim()))
      rawName = rawName.replace(kwMatch[0], '').trim()
    }
    const name = rawName.replace(/[—–-]\s*$/, '').trim()

    if (kind === 'ranged') {
      const [range, a, bs, s, ap, d] = statTokens
      weapons.push({
        name,
        range,
        A: a,
        BS: bs,
        S: s,
        AP: ap,
        D: d,
        keywords,
        raw: `${name} ${kwMatch ? `[${kwMatch[1]}] ` : ''}${statTokens.join(' ')}`.trim(),
      } as RangedWeapon)
    } else {
      const [, a, ws, s, ap, d] = statTokens
      weapons.push({
        name,
        A: a,
        WS: ws,
        S: s,
        AP: ap,
        D: d,
        keywords,
        raw: `${name} ${kwMatch ? `[${kwMatch[1]}] ` : ''}${statTokens.join(' ')}`.trim(),
      } as MeleeWeapon)
    }
  }
  return weapons
}

function looksLikeStatStart(tok: string, kind: 'ranged' | 'melee'): boolean {
  if (kind === 'melee') return tok === 'Melee'
  return /^\d+["]?$/.test(tok) || /^D\d+(\+\d+)?$/.test(tok) || tok === 'Melee'
}

function looksLikeStatToken(tok: string): boolean {
  if (tok === 'Melee') return true
  if (/^[\dD][\d+\-"]*$/.test(tok)) return true
  if (/^[0-9]+\+$/.test(tok)) return true
  if (tok === '-' || tok === '‑' || tok === 'N/A') return true
  if (/^D\d+(\+\d+)?$/.test(tok)) return true
  if (/^\d+D\d+$/.test(tok)) return true
  if (/^\d+\/\d+$/.test(tok)) return true
  if (/^-\d+$/.test(tok)) return true
  return false
}

function extractAbilities(body: string): {
  abilities: DatasheetAbility[]
  designerNotes: string[]
} {
  const abilities: DatasheetAbility[] = []
  const designerNotes: string[] = []
  // Find ABILITIES section (a bit flexible — sometimes label is just "ABILITIES" inline)
  const m = body.match(
    /ABILITIES\s*([\s\S]*?)(?=WARGEAR OPTIONS|UNIT COMPOSITION|TRANSPORT|DAMAGED:|WA\s*R\s*HA\s*M\s*M\s*E\s*R|KEYWORDS:|FACTION KEYWORDS|##### |\bATTACHED UNIT\b|\bWARGEAR ABILITIES\b|$)/i,
  )
  // Also capture WARGEAR ABILITIES separately
  if (m) {
    const block = m[1]!
    parseAbilityRuns(block, abilities, designerNotes, 'unit-specific')
  }
  const w = body.match(
    /WARGEAR ABILITIES\s*([\s\S]*?)(?=WARGEAR OPTIONS|UNIT COMPOSITION|TRANSPORT|DAMAGED:|##### |KEYWORDS:|FACTION KEYWORDS|$)/i,
  )
  if (w) {
    parseAbilityRuns(w[1]!, abilities, designerNotes, 'wargear')
  }
  return { abilities, designerNotes }
}

function parseAbilityRuns(
  block: string,
  abilities: DatasheetAbility[],
  designerNotes: string[],
  defaultKind: AbilityKind,
): void {
  // Normalise whitespace to single line then split by "<Name>:" pattern.
  const text = block.replace(/\s+/g, ' ').trim()
  if (!text) return

  // Pre-extract CORE: and FACTION: lists
  const coreMatch = text.match(
    /CORE:\s*([^A-Z][^:]*?)(?=\s+[A-Z][A-Za-z']+:|\s+FACTION:|\s+WARGEAR|\s+KEYWORDS|$)/i,
  )
  if (coreMatch) {
    const items = coreMatch[1]!
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const item of items) {
      abilities.push({ name: item, kind: 'core', body: item })
    }
  }
  const factionMatch = text.match(
    /FACTION:\s*([^A-Z][^:]*?)(?=\s+[A-Z][A-Za-z']+:|\s+CORE:|\s+WARGEAR|\s+KEYWORDS|$)/i,
  )
  if (factionMatch) {
    const items = factionMatch[1]!
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const item of items) {
      abilities.push({ name: item, kind: 'faction', body: item })
    }
  }

  // Remove CORE: and FACTION: matches from text to leave named abilities
  let remaining = text
  if (coreMatch) remaining = remaining.replace(coreMatch[0], ' ')
  if (factionMatch) remaining = remaining.replace(factionMatch[0], ' ')

  // Split on "Name: " or "Name (Aura): " patterns.
  // Find runs: a CapitalizedName ending in ':' that begins a span.
  const abilityPattern = /([A-Z][A-Za-z''][A-Za-z\s''-]*?(?:\s*\(Aura\))?):\s+/g
  const matches: Array<{ name: string; start: number; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = abilityPattern.exec(remaining)) !== null) {
    matches.push({ name: m[1]!.trim(), start: m.index, end: m.index + m[0].length })
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.end
    const end = i + 1 < matches.length ? matches[i + 1]!.start : remaining.length
    let body = remaining.slice(start, end).trim()
    if (!body) continue

    // Pull any "Designer's Note:" out
    const dnMatch = body.match(/Designer'?s Note:\s*([\s\S]*?)(?=\s+[A-Z][A-Za-z']+:|$)/i)
    if (dnMatch) {
      designerNotes.push(dnMatch[1]!.trim())
      body = body.replace(dnMatch[0], '').trim()
    }

    const name = matches[i]!.name
    const kind: AbilityKind = /\(Aura\)/i.test(name) ? 'aura' : defaultKind
    abilities.push({ name: name.replace(/\s*\(Aura\)/i, '').trim(), kind, body })
  }
}

function extractKeywordsList(body: string, label: 'KEYWORDS' | 'FACTION KEYWORDS'): string[] {
  // Non-greedy capture that stops at the next structural label OR newline.
  // PDF column-scrambling can put the whole datasheet on one line so we
  // can't rely on newline boundaries alone.
  const stopRe =
    /(FACTION KEYWORDS?:|KEYWORDS:|WARGEAR\s+(OPTIONS|ABILITIES)|UNIT COMPOSITION|TRANSPORT\s+This|DAMAGED:|INVULNERABLE|RANGED WEAPONS|MELEE WEAPONS|##### |M\s+T\s+SV\s+W\s+LD\s+OC|ABILITIES\s+CORE:|ABILITIES\s+FACTION:|LEADER\s+This|SUPPORT\s+This|ATTACHED UNIT|SPEED FREEKS)/i

  // Walk through all (FACTION )?KEYWORDS: matches
  const re = /(FACTION\s+)?KEYWORDS:?\s*/gi
  const matches: Array<{ isFaction: boolean; valueStart: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    matches.push({ isFaction: !!m[1], valueStart: re.lastIndex })
  }
  const filtered = matches.filter((x) =>
    label === 'FACTION KEYWORDS' ? x.isFaction : !x.isFaction,
  )
  if (filtered.length === 0) return []
  const start = filtered[0]!.valueStart
  let raw = body.substring(start)
  // Cut at first newline
  const nl = raw.indexOf('\n')
  if (nl >= 0) raw = raw.substring(0, nl)
  // Cut at first structural label (column-scrambled inline next section)
  const stopMatch = raw.match(stopRe)
  if (stopMatch && stopMatch.index !== undefined) {
    raw = raw.substring(0, stopMatch.index)
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function extractWargearOptions(body: string): Array<{ description: string }> {
  const m = body.match(
    /WARGEAR OPTIONS\s*([\s\S]*?)(?=UNIT COMPOSITION|TRANSPORT|##### |WA\s*R\s*HA\s*M\s*M\s*E\s*R|KEYWORDS:|FACTION KEYWORDS|$)/i,
  )
  if (!m) return []
  const options: Array<{ description: string }> = []
  const block = m[1]!
  for (const line of block.split('\n')) {
    const trimmed = line.replace(/^[-•◦]\s*/, '').trim()
    if (!trimmed || trimmed.toUpperCase() === 'NONE') continue
    if (trimmed === 'UNIT COMPOSITION') break
    options.push({ description: trimmed })
  }
  return options
}

function extractUnitComposition(
  body: string,
): { models?: string; equipment?: string; raw: string } | undefined {
  const m = body.match(
    /UNIT COMPOSITION\s*([\s\S]*?)(?=##### |WA\s*R\s*HA\s*M\s*M\s*E\s*R|TRANSPORT\s|KEYWORDS:|FACTION KEYWORDS|LEADER\s|SUPPORT\s|SPEED FREEKS|ATTACHED UNIT|DAMAGED:|$)/i,
  )
  if (!m) return undefined
  const block = m[1]!.trim()
  // Models = bullet lines; equipment = "This model is equipped with: ..."
  const equipMatch = block.match(/(This (?:model|unit) (?:is|are) equipped with[^]*?)(?:\.\s|$)/i)
  const models = block
    .split('\n')
    .map((l) => l.replace(/^[-•]\s*/, '').trim())
    .filter((l) => l && !/equipped with/i.test(l))
    .join('\n')
  return {
    models: models || undefined,
    equipment: equipMatch ? equipMatch[1]!.trim() : undefined,
    raw: block,
  }
}

function extractAttachables(body: string, label: 'LEADER' | 'SUPPORT'): string[] {
  const targets: string[] = []
  // 11e colon form
  const colon = new RegExp(
    `(?:^|\\n|\\.\\s)${label}:?\\s+([\\s\\S]*?)(?=\\n\\s*(?:RANGED|MELEE|KEYWORDS|FACTION|WARGEAR|SUPPORT|LEADER|ABILITIES|UNIT|DAMAGED|INVULNERABLE|TRANSPORT|##### )\\b|$)`,
    'i',
  )
  const cm = body.match(colon)
  // 10e bullet form
  if (cm && cm[1]) {
    const list = cm[1]
    // Bullet lines OR comma-separated
    if (/^\s*[-•]/m.test(list)) {
      for (const line of list.split('\n')) {
        const trimmed = line.replace(/^[-•]\s*/, '').trim()
        if (trimmed && trimmed.length >= 2 && trimmed.length <= 80 && !/^This\b/.test(trimmed)) {
          targets.push(trimmed)
        }
      }
    } else {
      for (const part of list.split(/[,;\n]/)) {
        const name = part.trim().replace(/^[-•]\s*/, '')
        if (name && name.length >= 2 && name.length <= 80 && !/^This\b/.test(name)) {
          targets.push(name)
        }
      }
    }
  }
  // 10e bullet form: "LEADER This model can be attached to the following units:"
  const bulletPattern = new RegExp(
    `${label}\\s+This (?:model|unit) can be attached to the following units?:\\s*([\\s\\S]*?)(?=\\n\\s*(?:##### |KEYWORDS|FACTION|WARGEAR|UNIT|$))`,
    'i',
  )
  const bm = body.match(bulletPattern)
  if (bm && bm[1]) {
    for (const line of bm[1].split('\n')) {
      const trimmed = line.replace(/^[-•]\s*/, '').trim()
      if (trimmed && trimmed.length >= 2 && trimmed.length <= 80) {
        targets.push(trimmed)
      }
    }
  }
  return Array.from(new Set(targets))
}

function extractDamaged(body: string): { threshold: string; effect: string } | undefined {
  const m = body.match(
    /DAMAGED:\s*([^\n]+?)\s*(?:\n|$)([\s\S]*?)(?=##### |WA\s*R\s*HA\s*M\s*M\s*E\s*R|KEYWORDS:|FACTION KEYWORDS|WARGEAR|UNIT COMPOSITION|$)/i,
  )
  if (!m) return undefined
  return { threshold: m[1]!.trim(), effect: m[2]!.trim() }
}

function extractTransportText(body: string): string | undefined {
  const m = body.match(
    /TRANSPORT\s+(This model has[\s\S]*?)(?=##### |WA\s*R\s*HA\s*M\s*M\s*E\s*R|KEYWORDS:|FACTION KEYWORDS|$)/i,
  )
  return m ? m[1]!.trim() : undefined
}

function extractFluff(_body: string): string | undefined {
  // Reserved for later: the fluff paragraph that often appears in the SECOND
  // occurrence of a unit's name block. Not always present; we deliberately
  // skip it to keep the schema lean.
  return undefined
}

function cleanDetachmentName(s: string): string {
  const trimmed = s.trim()
  // If the name is already mixed-case (title-cased from a prior pass), leave it.
  // ALL-CAPS names need title-casing so they display correctly.
  if (trimmed === trimmed.toUpperCase()) return titleCase(trimmed)
  return trimmed
}

// ─── Errata / FAQ splitters ───────────────────────────────────────────────────

function splitErrataBlock(body: string): ErrataEntry[] {
  const entries: ErrataEntry[] = []
  const trimmed = body.trim()
  if (!trimmed) return entries
  // Split on Page boundaries (start-of-text or after period/space).
  // Pattern: "Page NNN —" or "Pages NNN, NNN —"
  const parts = trimmed.split(/(?=Pages?\s+\d+(?:\s*,\s*\d+)*\s*[—\-–])/i).filter((s) => s.trim())
  for (const part of parts) {
    const pageMatch = [...part.matchAll(/Pages?\s+(\d+(?:\s*,\s*\d+)*)/gi)]
    const pages: number[] = []
    if (pageMatch.length > 0) {
      const nums = pageMatch[0]![1]!.split(/\s*,\s*/).map((n) => parseInt(n, 10))
      pages.push(...nums)
    }
    // Target extraction: "Page NN — TargetName, Subsection, FieldName"
    const headerMatch = part.match(
      /Pages?\s+\d+(?:\s*,\s*\d+)*\s*[—\-–]\s*([^\n]+?)(?=\s+Change to:|\s+Add:|\s+Remove:|\s*$)/i,
    )
    const target: ErrataTarget = { type: 'unknown', name: 'Unknown' }
    if (headerMatch) {
      const hdr = headerMatch[1]!.trim()
      // First segment usually = entity name; second = subsection like "Abilities"; third = field
      const segments = hdr.split(/,\s*/)
      target.name = segments[0]!.trim()
      if (segments.length > 1) target.subsection = segments.slice(1).join(', ').trim()
      // Type heuristic
      const lower = `${hdr}`.toLowerCase()
      if (lower.includes('stratagem')) target.type = 'stratagem'
      else if (lower.includes('enhancement')) target.type = 'enhancement'
      else if (lower.includes('detachment')) target.type = 'detachment-rule'
      else if (lower.includes('ability') || lower.includes('abilities')) target.type = 'ability'
      else if (lower.includes('army rule')) target.type = 'army-rule'
      else target.type = 'datasheet'
    }

    // changeKind
    let changeKind: ErrataEntry['changeKind'] = 'other'
    if (/Change to:/i.test(part)) changeKind = 'replace'
    else if (/^Add:|\bAdd:/i.test(part)) changeKind = 'add'
    else if (/^Remove:|\bRemove:/i.test(part)) changeKind = 'remove'

    // Replacement text: text between leading ' and trailing '
    const replMatch = part.match(/Change to:\s*['']([\s\S]+?)['']\s*(?=Pages?\s+\d+|$)/i)
    const replacementText = replMatch ? replMatch[1]!.trim() : undefined

    entries.push({ pages, target, changeKind, body: part.trim(), replacementText })
  }
  return entries
}

/**
 * New-format errata sub-section parser. Each entry is delimited by an
 * "X Change to:" / "X Add:" / "X Remove:" boundary on a previously-named
 * targets. Example:
 *   "Castellan, Crusade Ancient — Core Abilities section Remove ...
 *    Crusader Squad, Righteous Zeal Ability Change to: '...'
 *    Emperor's Champion, Sigismund's Heir ability Change to: ..."
 */
function splitInlineErrata(
  body: string,
  targetType: ErrataEntry['target']['type'],
  parentName?: string,
): ErrataEntry[] {
  const entries: ErrataEntry[] = []
  const text = body.trim()
  if (!text) return entries

  // Walk verb positions ("Change to:" / "Add ...:" / "Remove ...:" / "Change
  // ...:"). For each verb, the preceding span is the target name and the
  // span until the next verb (or end) is the change body.
  const verbPositions: Array<{ index: number; verb: string }> = []
  const re = /(Change to:|Add(?:s|ed)?[^:]*?:|Remove[^:]*?:|Change [^:]+?:)/g
  let vm: RegExpExecArray | null
  while ((vm = re.exec(text)) !== null) {
    verbPositions.push({ index: vm.index, verb: vm[0] })
  }
  if (verbPositions.length === 0) {
    // Maybe a single rule rewrite without a verb (e.g., army-rule body is just
    // a bullet list). Emit one entry with the whole body.
    entries.push({
      pages: [],
      target: { type: targetType, name: parentName ?? 'Unknown' },
      changeKind: 'other',
      body: text,
    })
    return entries
  }

  let prevEnd = 0
  for (let i = 0; i < verbPositions.length; i++) {
    const vp = verbPositions[i]!
    const nextStart = i + 1 < verbPositions.length ? verbPositions[i + 1]!.index : text.length
    // Target text = from prevEnd to vp.index
    const targetText = text.slice(prevEnd, vp.index).trim()
    const verbEnd = vp.index + vp.verb.length
    // Determine where this entry's body ends. Pull until the next entry's
    // target text starts. But the next entry's target text starts somewhere
    // between verbEnd and nextStart. Find the last sentence break before
    // nextStart and use that.
    let endIdx = nextStart
    if (i + 1 < verbPositions.length) {
      // Walk backward from nextStart to find a sentence-end ('.', '!', '?'
      // followed by a space + Capital), which marks where the entry's body
      // stops and the next target begins.
      // Heuristic: use ". " then capital letter scan
      for (let j = nextStart - 1; j > verbEnd; j--) {
        const ch = text[j]
        if (ch === '.' || ch === '!' || ch === '?') {
          if (text[j + 1] === ' ' && /[A-Z]/.test(text[j + 2] ?? '')) {
            endIdx = j + 1
            break
          }
        }
      }
    }
    const bodyText = text.slice(verbEnd, endIdx).trim()

    let changeKind: ErrataEntry['changeKind'] = 'other'
    if (/^Change to:/i.test(vp.verb)) changeKind = 'replace'
    else if (/^Add\b/i.test(vp.verb)) changeKind = 'add'
    else if (/^Remove\b/i.test(vp.verb)) changeKind = 'remove'
    else if (/^Change\b/i.test(vp.verb)) changeKind = 'replace'

    // Replacement text inside quotes
    const replMatch = bodyText.match(/^['']([\s\S]+?)['']\s*\.?\s*$/)

    entries.push({
      pages: [],
      target: {
        type: targetType,
        name: targetText || parentName || 'Unknown',
        subsection: parentName && targetText ? targetText : undefined,
      },
      changeKind,
      body: `${targetText} ${vp.verb} ${bodyText}`.trim(),
      replacementText: replMatch ? replMatch[1]!.trim() : undefined,
    })
    prevEnd = endIdx
  }

  return entries
}

function splitFaqBlock(body: string): FaqEntry[] {
  const entries: FaqEntry[] = []
  const parts = body.split(/(?=Q:\s)/i).filter((s) => s.trim())
  for (const part of parts) {
    const m = part.match(/Q:\s*([\s\S]+?)\s*A:\s*([\s\S]+?)(?=(?:\s+Q:\s)|$)/i)
    if (m) {
      entries.push({ question: normalizeWhitespace(m[1]!), answer: normalizeWhitespace(m[2]!) })
    }
  }
  return entries
}

// ─── Coverage accounting ──────────────────────────────────────────────────────

// Residue classifier: walks the source markdown line-by-line. For each line
// it decides one of:
//   - captured: appears (substring) inside structured output → no action
//   - identified noise: known markers (DETACHMENT RULES, page headers, etc.)
//                       → no unparsed entry but also doesn't count as residue
//   - unparsed: nothing matched → push to unparsed[] AND add to residue char count
//
// Returns the residueChars (chars from unparsed lines only).
function classifyResidueAndCount(markdown: string, p: PackExtract): number {
  const extractedTexts = collectExtractedTexts(p)
  const haystack = extractedTexts.join('\n').replace(/\s+/g, ' ')

  let residueChars = 0
  const lines = markdown.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    // Headings — always consumed (they routed somewhere or got demoted)
    if (/^#{1,6}\s/.test(line)) continue

    // Identified noise patterns: marker lines that drive the parser's state
    // machine but have no semantic content of their own.
    if (/^Page\s+\d+\s*$/i.test(line)) {
      p.unparsed.push({ context: 'page-number', text: line, reason: 'standalone page number' })
      continue
    }
    if (/^WARHAMMER 40,000\b/i.test(line)) {
      p.unparsed.push({ context: 'page-header', text: line, reason: 'PDF page header' })
      continue
    }
    if (/^DETACHMENT RULES?\s*$/i.test(line)) {
      // Section marker — consumed by detachment heading handler.
      continue
    }
    if (/^ENHANCEMENTS?\s*$/i.test(line)) continue
    if (/^STRATAGEMS?\s*$/i.test(line)) continue
    if (/^DATASHEETS?\s*$/i.test(line)) continue
    if (/^FACTION PACK:?\s*VERSION/i.test(line)) continue
    if (/^WHAT[''`]S NEW\??\s*$/i.test(line)) continue
    if (/^CONTENTS?\s*$/i.test(line)) continue
    if (/^FAQS?\s*$/i.test(line)) continue
    if (/^UPDATES?(?:\s*&\s*ERRATA|\s+AND\s+ERRATA)?\s*$/i.test(line)) continue
    if (/^RULES UPDATES?\s*$/i.test(line)) continue
    if (/^ERRATA\s*$/i.test(line)) continue
    if (/^LEGENDS DATASHEETS?\s*$/i.test(line)) continue
    if (/^\*+\s*$/.test(line)) continue
    // Faction-name-as-divider
    const factionUpper = p.faction.toUpperCase().replace(/-/g, ' ')
    if (line.toUpperCase() === factionUpper) continue
    // Single bullet line — sometimes a continuation of the prior captured paragraph
    if (/^[-•]\s*$/.test(line)) continue

    if (lineIsCaptured(line, haystack)) continue

    // True residue.
    p.unparsed.push({ context: 'unclassified', text: line, reason: 'no rule matched this line' })
    residueChars += line.replace(/\s+/g, '').length
  }
  return residueChars
}

function collectExtractedTexts(p: PackExtract): string[] {
  const out: string[] = []
  if (p.contents) out.push(p.contents)
  if (p.whatsNew) {
    for (const w of p.whatsNew) {
      out.push(w, `- ${w}`)
    }
  }
  for (const d of p.detachments) {
    out.push(d.name)
    if (d.flavor) out.push(d.flavor)
    if (d.detachmentRule) {
      out.push(d.detachmentRule.name, d.detachmentRule.body)
    }
    for (const r of d.extraRules) out.push(r.name, r.body)
    for (const e of d.enhancements) out.push(e.name, e.body, e.raw)
    for (const s of d.stratagems) out.push(s.raw)
  }
  for (const ds of [...p.datasheets, ...p.legendsDatasheets]) out.push(ds.raw)
  for (const ar of p.armyRules) out.push(ar.name, ar.body)
  for (const er of p.errata) out.push(er.body)
  for (const f of p.faqs)
    out.push(`Q: ${f.question}`, `A: ${f.answer}`, `Q: ${f.question} A: ${f.answer}`)
  for (const ex of p.extras) out.push(ex.content)
  return out
}

function lineIsCaptured(line: string, haystack: string): boolean {
  // Quick check: most of the chars in the line appear contiguously in
  // haystack. We use a substring slice of the line's first 30 non-space
  // chars and check inclusion.
  const cleanLine = line.replace(/\s+/g, ' ').trim()
  if (cleanLine.length < 4) return true
  const cleanHay = haystack.replace(/\s+/g, ' ')
  // Try the whole line first
  if (cleanHay.includes(cleanLine)) return true
  // Try a 30-char window
  if (cleanLine.length >= 20 && cleanHay.includes(cleanLine.substring(0, 30))) return true
  // Try the tail (sometimes the head is a column-scrambled prefix)
  if (cleanLine.length >= 20 && cleanHay.includes(cleanLine.substring(cleanLine.length - 30)))
    return true
  return false
}
