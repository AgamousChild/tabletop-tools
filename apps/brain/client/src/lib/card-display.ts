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
          type: 'Stratagem',
          cpCost: extractField(node.content, 'CP') || '1',
          turn: '',
          phase: node.phase || '',
          when: extractField(node.content, 'WHEN') || '',
          target: extractField(node.content, 'TARGET') || '',
          effect: extractField(node.content, 'EFFECT') || node.summary,
          detachmentName: formatDetachmentName(node.detachmentId),
          factionId: node.factionId || '',
          subfaction: node.subfaction,
        },
      }

    case 'enhancement':
      return {
        type: 'enhancement',
        data: {
          id: node.id,
          name: node.title,
          cost: extractInlineField(node.content, 'Cost') || '',
          description: stripField(node.content, 'Cost'),
          restriction: extractRestriction(node.content),
          detachmentName: formatDetachmentName(node.detachmentId),
          factionId: node.factionId || '',
          subfaction: node.subfaction,
        },
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

    case 'faction-ability':
      if (!node.detachmentId) {
        return {
          type: 'rule',
          data: {
            id: node.id,
            name: node.title,
            description: node.content || node.summary,
            factionId: node.factionId || '',
            subfaction: node.subfaction,
            isArmyRule: true,
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
          sources: node.sources as SourceRef[],
          qualityFlags: node.qualityFlags,
        },
      }

    case 'primary-mission':
    case 'secondary-mission':
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
          content: node.content || node.summary,
          sources: node.sources as SourceRef[],
        },
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

    case 'deployment-zone':
      return {
        type: 'deployment-zone',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          pdfImage: pdfSource
            ? { pdfName: pdfSource.pdfName, page: pdfSource.page }
            : undefined,
          sources: node.sources as SourceRef[],
          qualityFlags: node.qualityFlags,
        },
      }

    case 'terrain-layout':
      return {
        type: 'terrain-layout',
        data: {
          id: node.id,
          name: node.title,
          description: node.content || node.summary,
          pdfImage: pdfSource
            ? { pdfName: pdfSource.pdfName, page: pdfSource.page }
            : undefined,
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

/** Extract a **FIELD:** value from content (multi-line, stops at next bold-caps label) */
function extractField(content: string, field: string): string {
  const re = new RegExp(
    `\\*\\*${field}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]+:\\*\\*|$)`,
    'i',
  )
  const m = content.match(re)
  return m ? m[1]!.trim() : ''
}

/** Extract a **FIELD:** single-line value (stops at end of line) */
function extractInlineField(content: string, field: string): string {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*([^\\n]+)`, 'i')
  const m = content.match(re)
  return m ? m[1]!.trim() : ''
}

/** Strip a **FIELD:** section from content, returning the remainder */
function stripField(content: string, field: string): string {
  return content
    .replace(new RegExp(`\\*\\*${field}:\\*\\*\\s*\\S+\\s*`, 'i'), '')
    .trim()
}

/** Extract restriction line ("X model only") from content */
function extractRestriction(content: string): string | undefined {
  const lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  return lines.find(l => /model only/i.test(l))
}

/** Format a detachmentId slug into a display name */
function formatDetachmentName(detId?: string): string {
  if (!detId) return ''
  const slug = detId.includes(':') ? detId.split(':').pop()! : detId
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
