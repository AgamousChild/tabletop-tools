/**
 * Dice-notation parsing and resolution (W2 roadmap Phase 2 / D2-07 item 3).
 *
 * Reconciles two prior, independently-forked implementations into one:
 *   - versus client (`apps/versus/client/src/lib/rules/pipeline.ts`):
 *     regex `/^(\d*)D(\d+)([+-]\d+)?$/i`, supported `+`/`-` modifiers,
 *     returned 0 silently on unrecognized input.
 *   - versus server (`apps/versus/server/src/lib/attackCount.ts`):
 *     regex `/^(\d+)?[Dd](\d+)(?:\+(\d+))?$/`, `+` only, threw on
 *     unrecognized input, and also accepted plain numeric strings.
 *
 * The union regex below is the client's superset (supports both `+` and
 * `-`) plus the server's plain-numeric-string acceptance. Error behavior
 * is preserved per call site via the `onInvalid` option rather than
 * collapsed to one default: pass `{ onInvalid: 'throw' }` to reproduce the
 * server's throwing behavior; omit it (default `'zero'`) to reproduce the
 * client's silent-0 behavior.
 */

const DICE_NOTATION = /^(\d*)[Dd](\d+)([+-]\d+)?$/

export interface DiceNotationOptions {
  /**
   * Behavior when the input string is neither a plain number nor valid
   * dice notation.
   *   - 'zero' (default): return 0 — matches the former client behavior.
   *   - 'throw': throw an Error — matches the former server behavior.
   */
  onInvalid?: 'zero' | 'throw'
}

interface ParsedDice {
  count: number
  sides: number
  mod: number
}

function parseDice(notation: string): ParsedDice | null {
  const m = DICE_NOTATION.exec(notation.trim())
  if (!m) return null
  const count = m[1] ? parseInt(m[1], 10) : 1
  const sides = parseInt(m[2]!, 10)
  const mod = m[3] ? parseInt(m[3], 10) : 0
  return { count, sides, mod }
}

function onInvalidResult(notation: string, options: DiceNotationOptions | undefined): number {
  if (options?.onInvalid === 'throw') {
    throw new Error(`dice-notation: unrecognised notation "${notation}"`)
  }
  return 0
}

/**
 * Parse a dice notation string or flat number to its expected (average)
 * value. Supports: flat integers/decimals, D6, 2D6, D3+1, D6-1, etc.
 */
export function resolveAvg(value: number | string, options?: DiceNotationOptions): number {
  if (typeof value === 'number') return value

  const trimmed = value.trim()
  const asNum = Number(trimmed)
  if (trimmed !== '' && !Number.isNaN(asNum)) {
    return asNum
  }

  const parsed = parseDice(trimmed)
  if (!parsed) return onInvalidResult(value, options)

  const { count, sides, mod } = parsed
  return (count * (1 + sides)) / 2 + mod
}

/**
 * Returns the minimum possible value for a dice notation or flat number.
 * D6 -> 1, 2D6 -> 2, D6+1 -> 2, D6-1 -> 1 (floored), flat 3 -> 3.
 */
export function resolveMin(value: number | string, options?: DiceNotationOptions): number {
  if (typeof value === 'number') return value

  const trimmed = value.trim()
  const asNum = Number(trimmed)
  if (trimmed !== '' && !Number.isNaN(asNum)) {
    return asNum
  }

  const parsed = parseDice(trimmed)
  if (!parsed) return onInvalidResult(value, options)

  const { count, mod } = parsed
  return Math.max(1, count + mod)
}

/**
 * Returns the maximum possible value for a dice notation or flat number.
 * D6 -> 6, 2D6 -> 12, D3+1 -> 4, flat 3 -> 3.
 */
export function resolveMax(value: number | string, options?: DiceNotationOptions): number {
  if (typeof value === 'number') return value

  const trimmed = value.trim()
  const asNum = Number(trimmed)
  if (trimmed !== '' && !Number.isNaN(asNum)) {
    return asNum
  }

  const parsed = parseDice(trimmed)
  if (!parsed) return onInvalidResult(value, options)

  const { count, sides, mod } = parsed
  return count * sides + mod
}
