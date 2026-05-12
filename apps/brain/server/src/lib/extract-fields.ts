/**
 * extract-fields.ts — Parse structured fields from node content text.
 * Runs post-massage on finalized nodes. Extracts:
 * - CP cost from stratagems
 * - Target keywords from stratagems and detachment rules
 * - Model restrictions from enhancements
 * - Upgrade flag from enhancements
 * - Epic Hero flag from datasheets
 */
import type { Node } from './model'

/**
 * Extract CP cost from stratagem content/title.
 * Looks for patterns like "(1CP)", "(2CP)", "1 CP", etc.
 */
function extractCpCost(node: Node): number | undefined {
  const text = `${node.title} ${node.content}`
  const match = text.match(/\((\d+)\s*CP\)/i) || text.match(/(\d+)\s*CP/i)
  if (match) return parseInt(match[1]!, 10)
  return undefined
}

/**
 * Extract target keywords from stratagem/detachment-rule content.
 * Looks for patterns like "friendly DEATH COMPANY unit", "VEHICLE unit",
 * "ADEPTUS ASTARTES INFANTRY CHARACTER unit", etc.
 */
function extractTargetKeywords(node: Node): string[] {
  const text = node.content || ''
  const keywords: string[] = []

  // Pattern: "friendly KEYWORD unit" or "friendly KEYWORD/KEYWORD unit"
  // Also: "TARGET: That KEYWORD unit"
  const patterns = [
    /(?:friendly|target[:\s]+that)\s+((?:[A-Z][A-Z\s/''-]+(?:\/[A-Z][A-Z\s/''-]+)*?))\s+(?:unit|model|squad)/gi,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1]!.trim()
      // Split on / for multi-keyword targets
      const parts = raw.split('/').map(p => p.trim()).filter(p => p.length > 1)
      for (const part of parts) {
        // Only keep if it looks like a game keyword (mostly uppercase)
        const upper = part.replace(/[^A-Z]/g, '').length
        const total = part.replace(/\s/g, '').length
        if (upper / total > 0.6 && !keywords.includes(part)) {
          keywords.push(part)
        }
      }
    }
  }

  return keywords.length > 0 ? keywords : []
}

/**
 * Extract model restriction from enhancement content.
 * Looks for patterns like "PHOBOS model only", "DEATH COMPANY model only",
 * "ADEPTUS ASTARTES INFANTRY model only", etc.
 */
function extractModelRestriction(node: Node): string | undefined {
  const text = node.content || ''
  const match = text.match(/([A-Z][A-Z\s/''-]+(?:model|unit))\s+only/i)
  if (match) return match[1]!.trim()
  return undefined
}

/**
 * Check if an enhancement is a unit upgrade (not character-only).
 * Looks for "(Upgrade)" in the title or content.
 */
function isUpgrade(node: Node): boolean {
  return /\(upgrade\)/i.test(node.title) || /\(upgrade\)/i.test(node.content || '')
}

/**
 * Check if a datasheet is an Epic Hero (named character).
 * Looks for EPIC HERO in keywords.
 */
function isEpicHero(node: Node): boolean {
  return node.keywords.some(k => k.toLowerCase() === 'epic hero')
}

/**
 * Extract structured fields from all nodes. Mutates nodes in place.
 * Returns count of nodes updated.
 */
export function extractStructuredFields(allNodes: Node[]): {
  stratagemsParsed: number
  enhancementsParsed: number
  detachmentRulesParsed: number
  epicHeroes: number
} {
  let stratagemsParsed = 0
  let enhancementsParsed = 0
  let detachmentRulesParsed = 0
  let epicHeroes = 0

  for (const node of allNodes) {
    if (node.category === 'stratagem') {
      const cp = extractCpCost(node)
      if (cp !== undefined) {
        ;(node as any).cpCost = cp
        stratagemsParsed++
      }
      const targets = extractTargetKeywords(node)
      if (targets.length > 0) {
        ;(node as any).targetKeywords = targets
      }
    }

    if (node.category === 'enhancement') {
      const restriction = extractModelRestriction(node)
      if (restriction) {
        ;(node as any).modelRestriction = restriction
        enhancementsParsed++
      }
      if (isUpgrade(node)) {
        ;(node as any).isUpgrade = true
      }
    }

    if (node.category === 'detachment-rule') {
      const targets = extractTargetKeywords(node)
      if (targets.length > 0) {
        ;(node as any).targetKeywords = targets
        detachmentRulesParsed++
      }
    }

    if (node.category === 'datasheet') {
      if (isEpicHero(node)) {
        ;(node as any).isEpicHero = true
        epicHeroes++
      }
    }
  }

  return { stratagemsParsed, enhancementsParsed, detachmentRulesParsed, epicHeroes }
}
