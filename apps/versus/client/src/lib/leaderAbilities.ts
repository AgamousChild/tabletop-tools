import type { WeaponAbility } from '@tabletop-tools/game-content'

/**
 * Known patterns in leader ability descriptions that map to simulation-relevant
 * WeaponAbility rules. These patterns are matched against the full description
 * text of each leader ability.
 *
 * The patterns are case-insensitive and look for standard 40K rule phrasings
 * like "re-roll hit rolls", "add 1 to wound rolls", etc.
 */
interface AbilityPattern {
  /** Regex to test against the ability description (case-insensitive) */
  pattern: RegExp
  /** WeaponAbility to produce if matched */
  create: (match: RegExpMatchArray) => WeaponAbility | null
}

const ABILITY_PATTERNS: AbilityPattern[] = [
  // Re-roll hit rolls of 1 — must come BEFORE generic re-roll hits to avoid false match
  {
    pattern: /re-?roll\s+(?:the\s+)?hit\s+rolls?\s+of\s+1/i,
    create: () => ({ type: 'REROLL_HITS_OF_1' }),
  },
  // Re-roll all hit rolls (or "re-roll the hit roll")
  {
    pattern: /re-?roll\s+(?:all\s+)?(?:the\s+)?hit\s+rolls?/i,
    create: () => ({ type: 'REROLL_HITS' }),
  },
  // Re-roll wound rolls (or "re-roll the wound roll")
  {
    pattern: /re-?roll\s+(?:all\s+)?(?:the\s+)?wound\s+rolls?/i,
    create: () => ({ type: 'REROLL_WOUNDS' }),
  },
  // Lethal Hits
  {
    pattern: /\blethal\s+hits\b/i,
    create: () => ({ type: 'LETHAL_HITS' }),
  },
  // Sustained Hits N
  {
    pattern: /\bsustained\s+hits\s+(\d+)\b/i,
    create: (m) => ({ type: 'SUSTAINED_HITS', value: parseInt(m[1]!, 10) }),
  },
  // Devastating Wounds
  {
    pattern: /\bdevastating\s+wounds\b/i,
    create: () => ({ type: 'DEVASTATING_WOUNDS' }),
  },
  // +1 to hit / add 1 to hit rolls
  {
    pattern: /(?:add\s+1|(?:\+\s*1))\s+to\s+(?:the\s+)?hit\s+rolls?/i,
    create: () => ({ type: 'HIT_MOD', value: 1 }),
  },
  // +1 to wound / add 1 to wound rolls
  {
    pattern: /(?:add\s+1|(?:\+\s*1))\s+to\s+(?:the\s+)?wound\s+rolls?/i,
    create: () => ({ type: 'WOUND_MOD', value: 1 }),
  },
  // -1 to hit (penalty, e.g. on enemy)
  {
    pattern: /(?:subtract\s+1|(?:-\s*1))\s+to\s+(?:the\s+)?hit\s+rolls?/i,
    create: () => ({ type: 'HIT_MOD', value: -1 }),
  },
]

/**
 * Parses a single ability description and extracts any simulation-relevant
 * WeaponAbility rules it describes.
 *
 * A single ability may contain multiple rules (e.g., a leader ability that
 * grants both re-roll hits and +1 to wound).
 */
export function parseAbilityDescription(description: string): WeaponAbility[] {
  if (!description) return []

  const results: WeaponAbility[] = []
  const seenTypes = new Set<string>()

  for (const { pattern, create } of ABILITY_PATTERNS) {
    const match = description.match(pattern)
    if (match) {
      const ability = create(match)
      if (ability) {
        // Deduplicate by type+value key
        const key = ability.type + ('value' in ability ? `:${ability.value}` : '')
        if (!seenTypes.has(key)) {
          seenTypes.add(key)
          results.push(ability)
        }
      }
    }
  }

  return results
}

export interface UnitAbilityRecord {
  name: string
  description: string
}

/**
 * Extracts all simulation-relevant WeaponAbility rules from a leader's
 * unit abilities. Each returned ability includes source information so it
 * can be labeled in the UI.
 */
export function extractLeaderRules(
  abilities: UnitAbilityRecord[],
): { rule: WeaponAbility; source: string }[] {
  const results: { rule: WeaponAbility; source: string }[] = []
  const seenTypes = new Set<string>()

  for (const ability of abilities) {
    const parsed = parseAbilityDescription(ability.description)
    for (const rule of parsed) {
      const key = rule.type + ('value' in rule ? `:${(rule as { value: number }).value}` : '')
      if (!seenTypes.has(key)) {
        seenTypes.add(key)
        results.push({ rule, source: ability.name })
      }
    }
  }

  return results
}
