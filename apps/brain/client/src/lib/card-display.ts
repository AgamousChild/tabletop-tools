import type { CardData, SourceRef } from '../components/cards/types'

// ── ResultNode ────────────────────────────────────────────────────────────────

/** Result node from API — matches BrainScreen's ResultNode, extended with qualityFlags */
export interface ResultNode {
  id: string
  score: number
  title: string
  summary: string
  content: string
  layer: string
  category: string
  factionId?: string
  factionName?: string
  subfaction?: string
  phase?: string
  parentUnit?: string
  detachmentId?: string
  sources: any[]
  keywords: string[]
  qualityFlags?: string[]
  // Structured Node fields (PR #71)
  cpCost?: number
  when?: string
  target?: string
  effect?: string
  turn?: string
  stratType?: string
  cost?: number
  attachesTo?: 'leader' | 'unit'
  // PR #70 (detachment-only)
  dp?: number
  forceDisposition?: string
}

// ── PdfSource + CardView ──────────────────────────────────────────────────────

export interface PdfSource {
  pdfName: string
  page: number
  title: string
  topPct?: number
  heightPct?: number
  leftPct?: number
  widthPct?: number
}

export interface CardView {
  card: CardData
  pdfSource?: PdfSource
  qualityFlags: string[]
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a node to a card + optional PDF source.
 * ALWAYS returns a card. PDF is supplementary — the card is the primary view.
 */
export function resolveCardView(node: ResultNode): CardView {
  const pdfSrc = node.sources?.find((s: any) => s.type === 'pdf' && s.page)
  const pdfSource: PdfSource | undefined = pdfSrc
    ? {
        pdfName: pdfSrc.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        page: pdfSrc.page as number,
        title: node.title,
        topPct: pdfSrc.topPct,
        heightPct: pdfSrc.heightPct,
        leftPct: pdfSrc.leftPct,
        widthPct: pdfSrc.widthPct,
      }
    : undefined

  const qualityFlags = node.qualityFlags ?? []
  const card = buildCardForCategory(node, pdfSource)

  return { card, pdfSource, qualityFlags }
}

// ── Category router ───────────────────────────────────────────────────────────

function buildCardForCategory(node: ResultNode, pdfSource?: PdfSource): CardData {
  switch (node.category) {
    case 'datasheet':
      return {
        type: 'unit',
        data: {
          // Minimal stub — callers (BrainScreen) are expected to enhance via fetchFullUnitData
          id: node.id,
          name: node.title,
          factionId: node.factionId || '',
          role: '',
          derivedType: '',
          points: '',
          stats: {
            move: '-',
            toughness: '-',
            save: '-',
            wounds: '-',
            leadership: '-',
            oc: '-',
          },
          rangedWeapons: [],
          meleeWeapons: [],
          abilities: [],
          coreAbilities: [],
          keywords: [],
          factionKeywords: [],
          composition: '',
          loadout: '',
          leaders: [],
        },
      }

    case 'stratagem':
      return {
        type: 'stratagem',
        data: {
          id: node.id,
          name: node.title,
          // Prefer the structured stratType (e.g. "Battle Tactic") populated
          // by parsers. Fall back to the generic 'Stratagem' label when the
          // parser didn't tag the row (legacy / faction-pack stratagems).
          type: node.stratType || 'Stratagem',
          // Structured cpCost wins (number) — render as string. Fall back to
          // legacy regex if missing.
          cpCost:
            node.cpCost != null ? String(node.cpCost) : extractField(node.content, 'CP') || '1',
          turn: node.turn || '',
          phase: node.phase || '',
          when: node.when || extractField(node.content, 'WHEN') || '',
          target: node.target || extractField(node.content, 'TARGET') || '',
          effect: node.effect || extractField(node.content, 'EFFECT') || node.summary,
          detachmentName: formatDetachmentName(node.detachmentId),
          factionId: node.factionId || '',
          subfaction: node.subfaction,
        },
      }

    case 'enhancement': {
      // Drop the duplicate summary render — body content is the source of
      // truth (PR #71 stripped Cost: into structured `cost`). The legacy
      // regex fallback path stays for nodes that pre-date PR #71.
      const cost = node.cost != null ? String(node.cost) : extractInlineField(node.content, 'Cost')
      // Description: strip the "**Cost:**" markdown line if present (legacy
      // node content shape); otherwise the body is already clean.
      const description = node.cost != null ? node.content : stripField(node.content, 'Cost')
      return {
        type: 'enhancement',
        data: {
          id: node.id,
          name: node.title,
          cost: cost || '',
          description,
          restriction: extractRestriction(node.content),
          detachmentName: formatDetachmentName(node.detachmentId),
          factionId: node.factionId || '',
          subfaction: node.subfaction,
          attachesTo: node.attachesTo,
        },
      }
    }

    case 'phase-sequence':
    case 'core-mechanic':
    case 'terrain':
    case 'army-construction':
    case 'mission':
    case 'keyword':
      return {
        type: 'core-rule',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          phase: node.phase,
          sources: node.sources as SourceRef[],
          qualityFlags: node.qualityFlags,
        },
      }

    case 'faction':
      return {
        type: 'rule',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary || '',
          factionId: node.factionId || '',
          isArmyRule: false,
          isFaction: true,
          sources: node.sources as SourceRef[],
        },
      }

    case 'army-rule':
    case 'army-ability':
    case 'faction-ability':
      if (node.category === 'army-rule' || node.category === 'army-ability' || !node.detachmentId) {
        // Parse sub-rules from content — lines like "**NAME:** description"
        const armyContent = node.content || node.summary || ''
        const subRuleLines = armyContent.match(/^\*\*([^:*]+):\*\*\s*(.+)$/gm) || []
        const subRules = subRuleLines
          .map((line) => {
            const m = line.match(/^\*\*([^:*]+):\*\*\s*(.+)$/)
            return m ? { name: m[1]!.trim(), description: m[2]!.trim() } : null
          })
          .filter((sr): sr is { name: string; description: string } => sr !== null)

        // Description is the content before the first sub-rule
        const firstSubIdx = armyContent.search(/^\*\*[A-Z][^:*]+:\*\*/m)
        const mainDesc = firstSubIdx > 0 ? armyContent.slice(0, firstSubIdx).trim() : armyContent

        return {
          type: 'rule',
          data: {
            id: node.id,
            name: node.title,
            description: mainDesc,
            factionId: node.factionId || '',
            subfaction: node.subfaction,
            isArmyRule: true,
            subRules: subRules.length > 0 ? subRules : undefined,
            sources: node.sources as SourceRef[],
          },
        }
      }
      return {
        type: 'rule',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          factionId: node.factionId || '',
          subfaction: node.subfaction,
          isArmyRule: false,
          detachmentName: formatDetachmentName(node.detachmentId),
          sources: node.sources as SourceRef[],
        },
      }

    case 'detachment':
    case 'detachment-rule':
      return {
        type: 'detachment',
        data: {
          id: node.id,
          name: node.title,
          factionId: node.factionId || '',
          factionName: node.factionName,
          subfaction: node.subfaction,
          abilityText: node.content || node.summary,
          stratagems: [],
          enhancements: [],
          // PR #70 fields: detachment-points + force disposition. MFM is the
          // source; faction-pack mfm-lookup stamps both onto the same node.
          dp: node.dp,
          forceDisposition: node.forceDisposition,
          // Chapter badge — Node.subfaction carries the chapter slug for SM
          // chapters. Render that as a small badge near the title.
          chapterBadge: node.subfaction,
          sources: node.sources as SourceRef[],
          qualityFlags: node.qualityFlags,
        },
      }

    case 'primary-mission':
    case 'secondary-mission': {
      const missionContent = node.content || node.summary || ''
      return {
        type: 'mission',
        data: {
          id: node.id,
          name: node.title,
          missionType: node.category === 'primary-mission' ? 'primary' : 'secondary',
          side: node.id.includes(':atk:')
            ? 'attacker'
            : node.id.includes(':def:')
              ? 'defender'
              : undefined,
          isFixed: node.keywords?.includes('fixed'),
          content: missionContent,
          sources: node.sources as SourceRef[],
        },
      }
    }

    case 'twist':
      return {
        type: 'twist',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          sources: node.sources as SourceRef[],
        },
      }

    case 'challenger':
      return {
        type: 'challenger',
        data: {
          id: node.id,
          name: node.title,
          content: node.content || node.summary,
          sources: node.sources as SourceRef[],
        },
      }

    case 'deployment-zone': {
      // Build all PDF page images (Incursion + Strike Force pages)
      const deployImages = (node.sources ?? [])
        .filter((s: any) => s.type === 'pdf' && s.page)
        .map((s: any) => ({
          pdfName: s.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
          page: s.page as number,
        }))
      return {
        type: 'deployment-zone',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          pdfImages: deployImages.length > 0 ? deployImages : undefined,
          sources: node.sources as SourceRef[],
          qualityFlags: node.qualityFlags,
        },
      }
    }

    case 'terrain-layout':
      return {
        type: 'terrain-layout',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          pdfImage: pdfSource ? { pdfName: pdfSource.pdfName, page: pdfSource.page } : undefined,
          sources: node.sources as SourceRef[],
          qualityFlags: node.qualityFlags,
        },
      }

    case 'force-disposition':
      return {
        type: 'force-disposition',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          pdfImage: pdfSource ? { pdfName: pdfSource.pdfName, page: pdfSource.page } : undefined,
          sources: node.sources as SourceRef[],
          qualityFlags: node.qualityFlags,
        },
      }

    case 'faq':
    case 'commentary':
      return {
        type: 'errata',
        data: {
          id: node.id,
          name: node.title,
          correctionText: node.content || node.summary,
          qualityFlags: node.qualityFlags,
        },
      }

    case 'balance-change':
      return {
        type: 'balance',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          effectiveDate: (node as any).effectiveDate as string | undefined,
          sources: node.sources as SourceRef[],
          qualityFlags: node.qualityFlags,
        },
      }

    case 'ruling':
    case 'tactic':
    case 'worked-example':
      return {
        type: 'community',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          qualityFlags: node.qualityFlags,
        },
      }

    default:
      // Fallback: generic rule card — always returns something
      return {
        type: 'rule',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          factionId: node.factionId || '',
          isArmyRule: false,
          sources: node.sources as SourceRef[],
        },
      }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract a FIELD: value from content — handles both **FIELD:** (bold) and plain FIELD: formats */
function extractField(content: string, field: string): string {
  // Try bold format first: **FIELD:** value
  const boldRe = new RegExp(`\\*\\*${field}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]+:\\*\\*|$)`, 'i')
  const boldMatch = content.match(boldRe)
  if (boldMatch) return boldMatch[1]!.trim()

  // Try plain format: FIELD: value (stops at next ALLCAPS label or double newline)
  const plainRe = new RegExp(`(?:^|\\n)${field}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, 'i')
  const plainMatch = content.match(plainRe)
  return plainMatch ? plainMatch[1]!.trim() : ''
}

/** Extract a **FIELD:** single-line value (stops at end of line) */
function extractInlineField(content: string, field: string): string {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*([^\\n]+)`, 'i')
  const m = content.match(re)
  return m ? m[1]!.trim() : ''
}

/** Strip a **FIELD:** section from content, returning the remainder */
function stripField(content: string, field: string): string {
  return content.replace(new RegExp(`\\*\\*${field}:\\*\\*\\s*\\S+\\s*`, 'i'), '').trim()
}

/** Extract restriction line ("X model only") from content */
function extractRestriction(content: string): string | undefined {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.find((l) => /model only/i.test(l))
}

/** Format a detachmentId slug into a display name */
function formatDetachmentName(detId?: string): string {
  if (!detId) return ''
  const slug = detId.includes(':') ? detId.split(':').pop()! : detId
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
