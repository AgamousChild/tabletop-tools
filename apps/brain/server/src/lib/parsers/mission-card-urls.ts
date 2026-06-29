/**
 * URL + slug inventory for the 11e Chapter Approved mission deck as cached on
 * `gdmissions.app`. GW publishes no PDF for the 11e mission cards; the
 * community site renders them as PNG images. We mirror those images locally
 * (see `apps/brain/server/scripts/download-mission-cards.ts`), OCR them, and
 * ingest the text into the brain.
 *
 * The inventory lives here (a `lib/`-side module) rather than in the script so
 * the OCR + parser pipelines can iterate the same list — single source of
 * truth per platform Rule 1.
 */

/** Primary decks — five decks of 5 cards each. */
export const PRIMARY_DECKS = [
  'take-and-hold',
  'purge-the-foe',
  'reconnaissance',
  'priority-assets',
  'disruption',
] as const
export type PrimaryDeck = (typeof PRIMARY_DECKS)[number]

/** Cards in each primary deck. Verified from gdmissions.app's service worker. */
export const PRIMARY_CARDS_BY_DECK: Record<PrimaryDeck, readonly string[]> = {
  'take-and-hold': [
    'battlefield-dominance',
    'determined-acquisition',
    'immovable-object',
    'inescapable-dominion',
    'purge-and-secure',
  ],
  'purge-the-foe': [
    'consecrate',
    'destroyers-wrath',
    'meatgrinder',
    'punishment',
    'unstoppable-force',
  ],
  reconnaissance: [
    'gather-intel',
    'reconnaissance-sweep',
    'search-and-scour',
    'surveil-the-foe',
    'triangulation',
  ],
  'priority-assets': [
    'extract-relic',
    'sabotage',
    'secure-asset',
    'vanguard-operation',
    'vital-link',
  ],
  disruption: [
    'death-trap',
    'delaying-action',
    'locate-and-deny',
    'outmanoeuvre',
    'smoke-and-mirrors',
  ],
}

/** Secondary mission card slugs — same 18 cards in both attacker + defender decks. */
export const SECONDARY_CARDS = [
  'a-grievous-blow',
  'a-tempting-target',
  'assassination',
  'beacon',
  'behind-enemy-lines',
  'bring-it-down',
  'burden-of-trust',
  'centre-ground',
  'cleanse',
  'defend-stronghold',
  'display-of-might',
  'engage-on-all-fronts',
  'forward-position',
  'no-prisoners',
  'outflank',
  'overwhelming-force',
  'plunder',
  'secure-no-man-s-land',
] as const

export const SECONDARY_SIDES = ['attacker', 'defender'] as const
export type SecondarySide = (typeof SECONDARY_SIDES)[number]

export const FORCE_DISPOSITION_ICONS = PRIMARY_DECKS

const BASE = 'https://gdmissions.app/assets/11th'

export interface MissionCardImage {
  /** `primary | secondary | force-disposition` */
  kind: 'primary' | 'secondary' | 'force-disposition'
  /** Full URL on gdmissions.app */
  url: string
  /** Path on disk relative to the cache root (e.g. `primary-missions/take-and-hold/...png`) */
  relPath: string
  /** Card slug (`take-and-hold`, `assassination`, etc.) */
  slug: string
  /** Deck (primary deck name) or side (attacker/defender for secondary) */
  group: string
  /** `true` if this is a `*-back.png` card-back image. */
  back: boolean
}

/**
 * Enumerate every mission-card image we expect to download.
 *
 * Note: card backs (`<slug>-back.png`) are only present for some primary cards.
 * The download script tolerates 404s on backs; the OCR + parser layers skip
 * backs that didn't download.
 */
export function listMissionCardImages(): MissionCardImage[] {
  const out: MissionCardImage[] = []

  for (const deck of PRIMARY_DECKS) {
    for (const slug of PRIMARY_CARDS_BY_DECK[deck]) {
      const dir = `primary-missions/${deck}`
      out.push({
        kind: 'primary',
        url: `${BASE}/${dir}/${slug}.png`,
        relPath: `${dir}/${slug}.png`,
        slug,
        group: deck,
        back: false,
      })
      // Backs are optional — we still queue them; downloader silently skips 404.
      out.push({
        kind: 'primary',
        url: `${BASE}/${dir}/${slug}-back.png`,
        relPath: `${dir}/${slug}-back.png`,
        slug,
        group: deck,
        back: true,
      })
    }
  }

  for (const side of SECONDARY_SIDES) {
    for (const slug of SECONDARY_CARDS) {
      const dir = `secondary-missions/${side}`
      out.push({
        kind: 'secondary',
        url: `${BASE}/${dir}/${slug}.png`,
        relPath: `${dir}/${slug}.png`,
        slug,
        group: side,
        back: false,
      })
    }
  }

  for (const deck of FORCE_DISPOSITION_ICONS) {
    out.push({
      kind: 'force-disposition',
      url: `${BASE}/force-disposition/${deck}.png`,
      relPath: `force-disposition/${deck}.png`,
      slug: deck,
      group: 'force-disposition',
      back: false,
    })
  }

  return out
}
