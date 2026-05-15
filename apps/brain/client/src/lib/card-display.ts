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
        const subRules = subRuleLines.map(line => {
          const m = line.match(/^\*\*([^:*]+):\*\*\s*(.+)$/)
          return m ? { name: m[1]!.trim(), description: m[2]!.trim() } : null
        }).filter((sr): sr is { name: string; description: string } => sr !== null)

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
          pdfName: s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
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

/** Extract a FIELD: value from content — handles both **FIELD:** (bold) and plain FIELD: formats */
function extractField(content: string, field: string): string {
  // Try bold format first: **FIELD:** value
  const boldRe = new RegExp(
    `\\*\\*${field}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]+:\\*\\*|$)`,
    'i',
  )
  const boldMatch = content.match(boldRe)
  if (boldMatch) return boldMatch[1]!.trim()

  // Try plain format: FIELD: value (stops at next ALLCAPS label or double newline)
  const plainRe = new RegExp(
    `(?:^|\\n)${field}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`,
    'i',
  )
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

/**
 * Parse structured fields from mission content text.
 * Extracts: action, condition, when, scoring (VP value + cap).
 */
function parseMissionFields(content: string): {
  action?: string
  condition?: string
  when?: string
  scoring?: string
} {
  const result: { action?: string; condition?: string; when?: string; scoring?: string } = {}

  // Extract WHEN: timing
  const whenMatch = content.match(/\bWHEN:\s*([^.]+(?:\.[^A-Z])?)/i) ||
    content.match(/\*\*WHEN:\*\*\s*([^\n]+)/i)
  if (whenMatch) result.when = whenMatch[1]!.trim().replace(/\*\*/g, '')

  // Extract VP scoring — look for "X VP" patterns and caps like "max XVP" or "to a maximum of"
  const vpPatterns = content.match(/(\d+)\s*VP/gi)
  const maxMatch = content.match(/(?:max(?:imum)?(?:\s+of)?)\s*(\d+)\s*VP/i) ||
    content.match(/(\d+)\s*VP.*?(?:max|cap|limit)/i)
  if (vpPatterns && vpPatterns.length > 0) {
    const scores = vpPatterns.map(p => p.trim()).join(', ')
    const cap = maxMatch ? maxMatch[1] + 'VP' : ''
    result.scoring = cap ? `${scores} (max ${cap})` : scores
  }

  // Detect action requirement
  const hasAction = /\baction\b/i.test(content) &&
    (/\bperform\b|\bstart\b|\bcomplete\b|\bselect.*action\b/i.test(content))
  if (hasAction) {
    const actionMatch = content.match(/(?:perform|start|complete)\s+(?:the\s+)?([^.]+action[^.]*)/i)
    result.action = actionMatch ? actionMatch[0]!.trim() : 'Yes — see description'
  }

  // Extract condition — the "how" of scoring
  // Look for text near VP values that describes conditions
  const condMatch = content.match(/(?:you\s+(?:score|earn)|each\s+(?:time|objective)|for\s+each|if\s+you\s+control)[^.]+/i)
  if (condMatch) {
    result.condition = condMatch[0]!.trim()
    // Clean up markdown
    result.condition = result.condition.replace(/\*\*/g, '')
  }

  return result
}

/** Format a detachmentId slug into a display name */
function formatDetachmentName(detId?: string): string {
  if (!detId) return ''
  const slug = detId.includes(':') ? detId.split(':').pop()! : detId
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
