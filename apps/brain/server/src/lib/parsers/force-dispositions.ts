/**
 * Brain emitter for the 11e Chapter Approved Force Disposition cards.
 *
 * Mirrors the 11e deployment-zone shape (see `deployment-zones.ts`):
 *   - 5 image-only nodes (one per disposition)
 *   - source `type: 'pdf'`, `title` slugifies to `ca11-force-dispositions`
 *   - per-disposition `page` in 1..5
 *
 * The source is `IMG_0007.pdf` on Micah's local disk. The PDF is rendered to
 * page PNGs and the 5 cards are cropped out by
 * `scripts/crop-disposition-card-images.ts`. Cropped PNGs upload to R2 under
 * `pages/ca11-force-dispositions/page-{1..5}.png` via
 * `scripts/upload-disposition-card-images.ts`.
 *
 * This file also emits the 25 primary-mission stubs the dispositions index.
 * The disposition × opponent-disposition matrix is fixed (5×5 = 25 missions)
 * and was hand-verified from the cards in IMG_0007.pdf. Mission bodies have
 * NOT yet been scanned; each stub carries a placeholder body that names the
 * disposition pairing.
 *
 * Per Rule 6, the disposition list + matrix are parser-side metadata about a
 * fixed-size deck (5 dispositions, names won't change without a new GW
 * publication). Same pattern as TWIST_TITLES / DEPLOYMENT_ZONE_TITLES /
 * mission-card-urls.
 */
import type { Node, NodeRef } from '../model'

// ── Dispositions ─────────────────────────────────────────────────────────────

/** Canonical 11e force-disposition slug list — 5 dispositions, fixed order. */
export const FORCE_DISPOSITION_SLUGS = [
  'priority-assets',
  'purge-the-foe',
  'disruption',
  'reconnaissance',
  'take-and-hold',
] as const
export type ForceDispositionSlug = (typeof FORCE_DISPOSITION_SLUGS)[number]

/**
 * Display titles. Mixed-case to match the visible card-title shape (e.g.
 * "Priority Assets", "Purge the Foe"). Deployment zones use uppercase to
 * match the 10e shape; force-disposition cards print mixed-case in product
 * and that's what we surface to the client. The disposition card UI bigger-
 * cases the title on screen if needed.
 */
export const FORCE_DISPOSITION_TITLES: Record<ForceDispositionSlug, string> = {
  'priority-assets': 'Priority Assets',
  'purge-the-foe': 'Purge the Foe',
  disruption: 'Disruption',
  reconnaissance: 'Reconnaissance',
  'take-and-hold': 'Take and Hold',
}

/**
 * Page number (1-based) inside the synthetic `ca11-force-dispositions` "pdf"
 * for each disposition. Matches the order in which the crop script writes
 * pages — see `scripts/crop-disposition-card-images.ts`. Keep these two in
 * lock-step.
 *
 * The source PDF has 4 cards on page 0 (top-to-bottom: priority-assets,
 * reconnaissance, disruption, purge-the-foe) and 1 card on page 1
 * (take-and-hold). The crop script flattens that into the 1..5 ordering
 * below; the per-page R2 PNG filenames match these numbers.
 */
export const FORCE_DISPOSITION_PAGE: Record<ForceDispositionSlug, number> = {
  'priority-assets': 1,
  'purge-the-foe': 2,
  disruption: 3,
  reconnaissance: 4,
  'take-and-hold': 5,
}

// ── Primary missions ─────────────────────────────────────────────────────────

/** Canonical 11e primary-mission slug list — 25 missions, one per matrix cell. */
export const PRIMARY_MISSION_SLUGS = [
  // priority-assets row
  'secure-asset',
  'vital-link',
  'extract-relic',
  'vanguard-operation',
  'sabotage',
  // purge-the-foe row
  'unstoppable-force',
  'meatgrinder',
  'punishment',
  'consecrate',
  'destroyers-wrath',
  // disruption row
  'death-trap',
  'delaying-action',
  'outmaneuvre',
  'smoke-and-mirrors',
  'locate-and-deny',
  // reconnaissance row
  'reconnaissance-sweep',
  'triangulation',
  'surveil-the-foe',
  'gather-intel',
  'search-and-scour',
  // take-and-hold row
  'battlefield-dominance',
  'immovable-object',
  'determined-acquisition',
  'purge-and-secure',
  'inescapable-dominion',
] as const
export type PrimaryMissionSlug = (typeof PRIMARY_MISSION_SLUGS)[number]

/**
 * Display titles for the 25 primary missions. Mixed-case (matches card art).
 */
export const PRIMARY_MISSION_TITLES: Record<PrimaryMissionSlug, string> = {
  // priority-assets row
  'secure-asset': 'Secure Asset',
  'vital-link': 'Vital Link',
  'extract-relic': 'Extract Relic',
  'vanguard-operation': 'Vanguard Operation',
  sabotage: 'Sabotage',
  // purge-the-foe row
  'unstoppable-force': 'Unstoppable Force',
  meatgrinder: 'Meatgrinder',
  punishment: 'Punishment',
  consecrate: 'Consecrate',
  'destroyers-wrath': "Destroyer's Wrath",
  // disruption row
  'death-trap': 'Death Trap',
  'delaying-action': 'Delaying Action',
  outmaneuvre: 'Outmaneuvre',
  'smoke-and-mirrors': 'Smoke and Mirrors',
  'locate-and-deny': 'Locate and Deny',
  // reconnaissance row
  'reconnaissance-sweep': 'Reconnaissance Sweep',
  triangulation: 'Triangulation',
  'surveil-the-foe': 'Surveil the Foe',
  'gather-intel': 'Gather Intel',
  'search-and-scour': 'Search and Scour',
  // take-and-hold row
  'battlefield-dominance': 'Battlefield Dominance',
  'immovable-object': 'Immovable Object',
  'determined-acquisition': 'Determined Acquisition',
  'purge-and-secure': 'Purge and Secure',
  'inescapable-dominion': 'Inescapable Dominion',
}

/**
 * The disposition × opponent-disposition matrix.
 *
 * Rows = player's force disposition (also slug for the disposition card).
 * Columns = opponent's force disposition.
 * Cell = the primary mission slug the player draws for that pairing.
 *
 * The matrix is intentionally asymmetric — both players consult their own
 * card. The 25 mission names are unique across the matrix (each name appears
 * in exactly one cell), which is why we can index primary-mission nodes by
 * slug alone.
 *
 * Verified by hand against IMG_0007.pdf (the 5 force-disposition cards).
 */
export const PRIMARY_MISSION_MATRIX: Record<
  ForceDispositionSlug,
  Record<ForceDispositionSlug, PrimaryMissionSlug>
> = {
  'priority-assets': {
    'priority-assets': 'secure-asset',
    'purge-the-foe': 'vital-link',
    disruption: 'extract-relic',
    reconnaissance: 'vanguard-operation',
    'take-and-hold': 'sabotage',
  },
  'purge-the-foe': {
    'priority-assets': 'unstoppable-force',
    'purge-the-foe': 'meatgrinder',
    disruption: 'punishment',
    reconnaissance: 'consecrate',
    'take-and-hold': 'destroyers-wrath',
  },
  disruption: {
    'priority-assets': 'death-trap',
    'purge-the-foe': 'delaying-action',
    disruption: 'outmaneuvre',
    reconnaissance: 'smoke-and-mirrors',
    'take-and-hold': 'locate-and-deny',
  },
  reconnaissance: {
    'priority-assets': 'reconnaissance-sweep',
    'purge-the-foe': 'triangulation',
    disruption: 'surveil-the-foe',
    reconnaissance: 'gather-intel',
    'take-and-hold': 'search-and-scour',
  },
  'take-and-hold': {
    'priority-assets': 'battlefield-dominance',
    'purge-the-foe': 'immovable-object',
    disruption: 'determined-acquisition',
    reconnaissance: 'purge-and-secure',
    'take-and-hold': 'inescapable-dominion',
  },
}

// ── Node IDs (declared up front so cross-refs stay consistent) ──────────────

export function dispositionNodeId(slug: ForceDispositionSlug): string {
  return `ca11:force-disposition:${slug}`
}

export function primaryMissionNodeId(slug: PrimaryMissionSlug): string {
  return `ca11:primary-mission:${slug}`
}

// ── Build options ───────────────────────────────────────────────────────────

export interface BuildForceDispositionNodesOptions {
  retrievedAt?: string
  /**
   * Override for the source-attribution title. The client slugifies this to
   * derive the `pdfName` used in the `/pages/:pdfName/page-:n.png` URL, so
   * this string MUST slugify to `ca11-force-dispositions` (the R2 prefix
   * where upload-disposition-card-images.ts puts the PNGs).
   */
  sourceTitle?: string
  /** Override for the source `publishedAt` date. */
  publishedAt?: string
}

export type BuildPrimaryMissionNodesOptions = BuildForceDispositionNodesOptions

// ── Implementation: force-disposition nodes ─────────────────────────────────

/**
 * Emit the 5 11e force-disposition nodes. No external input — the list is
 * fixed and the images live in R2 (uploaded out-of-band by
 * `scripts/upload-disposition-card-images.ts`).
 *
 * Shape mirrors the 11e deployment-zone block:
 *   - id: `ca11:force-disposition:<slug>`
 *   - category: 'force-disposition'
 *   - title: mixed-case disposition name
 *   - content: brief structural body + the disposition's matchup row
 *   - source: one `pdf` source with `page` matching `FORCE_DISPOSITION_PAGE`
 *   - refs: 5 cross-refs (`part_of`) to the primary-mission stubs this
 *     disposition selects (one per matrix column)
 */
export function buildForceDispositionNodes(opts: BuildForceDispositionNodesOptions = {}): Node[] {
  const retrievedAt = opts.retrievedAt ?? new Date().toISOString()
  // Slugify (lowercase, [^a-z0-9]+ → '-') maps this title to exactly
  // `ca11-force-dispositions`, the R2 prefix where the upload script puts
  // the PNGs. Do not rename without updating both ends.
  const sourceTitle = opts.sourceTitle ?? 'CA11 Force Dispositions'
  const publishedAt = opts.publishedAt

  const nodes: Node[] = []
  for (const slug of FORCE_DISPOSITION_SLUGS) {
    const title = FORCE_DISPOSITION_TITLES[slug]
    const page = FORCE_DISPOSITION_PAGE[slug]
    const matchups = FORCE_DISPOSITION_SLUGS.map((opp) => {
      const missionSlug = PRIMARY_MISSION_MATRIX[slug][opp]
      const oppTitle = FORCE_DISPOSITION_TITLES[opp]
      const missionTitle = PRIMARY_MISSION_TITLES[missionSlug]
      return `- vs **${oppTitle}**: ${missionTitle}`
    }).join('\n')

    // Player-facing flavor placeholder — we do NOT reproduce the printed
    // flavor copy from the card (that's GW IP, see CLAUDE.md data boundary).
    const content = [
      'Player-facing disposition card. See card image for the printed art and flavor text.',
      '',
      '**Primary Mission Selection** (this disposition vs opponent):',
      matchups,
    ].join('\n')

    // Cross-refs: each disposition links to the 5 primary missions it
    // selects (one per matrix column). Same `part_of` shape stratagems use
    // to link to their parent detachment.
    const refs: NodeRef[] = FORCE_DISPOSITION_SLUGS.map((opp) => {
      const missionSlug = PRIMARY_MISSION_MATRIX[slug][opp]
      return {
        sourceId: dispositionNodeId(slug),
        targetId: primaryMissionNodeId(missionSlug),
        rel: 'part_of',
        context: `${PRIMARY_MISSION_TITLES[missionSlug]} is the primary mission when ${title} faces ${FORCE_DISPOSITION_TITLES[opp]}.`,
      }
    })

    nodes.push({
      id: dispositionNodeId(slug),
      layer: 'core',
      category: 'force-disposition',
      title,
      edition: '11th',
      content,
      summary: `${title} — 11e force disposition`,
      sources: [
        {
          type: 'pdf',
          title: sourceTitle,
          page,
          retrievedAt,
          ...(publishedAt ? { publishedAt } : {}),
        },
      ],
      refs,
      version: 1,
      keywords: ['force disposition', '11th edition', 'chapter approved', slug.replace(/-/g, ' ')],
    })
  }
  return nodes
}

// ── Implementation: primary-mission stub nodes ──────────────────────────────

/**
 * Emit the 25 11e primary-mission stub nodes. Each node corresponds to one
 * cell in the disposition matrix and carries:
 *   - id: `ca11:primary-mission:<slug>`
 *   - title: mission display name
 *   - content: a placeholder body identifying the disposition pairing —
 *     mission bodies have NOT yet been scanned (separate follow-up will
 *     overlay them).
 *   - source: the disposition card image where this mission appears (the
 *     card lists this mission in its matchup row).
 *   - refs: 1 cross-ref (`part_of`) back to the owning disposition (the
 *     row this mission lives in).
 *
 * Since each mission appears in exactly one matrix cell, the (row, column)
 * pair is unique per slug and we don't need a deck-prefix on the ID.
 *
 * Note: the existing `mission-cards.ts` parser ALSO emits primary-mission
 * nodes from gdmissions.app OCR with IDs like `ca11:primary:<deck>:<slug>`.
 * Those nodes carry OCR'd body text from the community site. The stubs
 * here use a DIFFERENT id prefix (`ca11:primary-mission:`) so they do not
 * collide; the eventual scan of the physical mission cards will overlay
 * bodies onto THESE stubs (the canonical Chapter Approved source).
 */
export function buildPrimaryMissionNodes(opts: BuildPrimaryMissionNodesOptions = {}): Node[] {
  const retrievedAt = opts.retrievedAt ?? new Date().toISOString()
  const sourceTitle = opts.sourceTitle ?? 'CA11 Force Dispositions'
  const publishedAt = opts.publishedAt

  // Reverse-lookup: mission slug → (player disposition, opp disposition).
  // Each mission appears in exactly one cell, so the first hit wins.
  const lookup = new Map<
    PrimaryMissionSlug,
    { player: ForceDispositionSlug; opp: ForceDispositionSlug }
  >()
  for (const player of FORCE_DISPOSITION_SLUGS) {
    for (const opp of FORCE_DISPOSITION_SLUGS) {
      const missionSlug = PRIMARY_MISSION_MATRIX[player][opp]
      if (!lookup.has(missionSlug)) {
        lookup.set(missionSlug, { player, opp })
      }
    }
  }

  const nodes: Node[] = []
  for (const slug of PRIMARY_MISSION_SLUGS) {
    const title = PRIMARY_MISSION_TITLES[slug]
    const cell = lookup.get(slug)
    if (!cell) {
      // Should not happen — the slug list and matrix are kept in lock-step.
      // Guard the type system here so a future matrix edit fails loudly.
      throw new Error(`primary-mission slug ${slug} not in matrix`)
    }
    const playerTitle = FORCE_DISPOSITION_TITLES[cell.player]
    const oppTitle = FORCE_DISPOSITION_TITLES[cell.opp]
    const page = FORCE_DISPOSITION_PAGE[cell.player]

    const content = [
      `Primary mission selected when **${playerTitle}** faces **${oppTitle}**.`,
      '',
      '_(Body text not yet ingested — primary mission cards have not been scanned.)_',
    ].join('\n')

    const refs: NodeRef[] = [
      {
        sourceId: primaryMissionNodeId(slug),
        targetId: dispositionNodeId(cell.player),
        rel: 'part_of',
        context: `${title} is a primary mission on the ${playerTitle} force-disposition card.`,
      },
    ]

    nodes.push({
      id: primaryMissionNodeId(slug),
      layer: 'core',
      category: 'primary-mission',
      title,
      edition: '11th',
      content,
      summary: `${title} — 11e primary mission (body pending)`,
      sources: [
        {
          type: 'pdf',
          title: sourceTitle,
          page,
          retrievedAt,
          ...(publishedAt ? { publishedAt } : {}),
        },
      ],
      refs,
      version: 1,
      keywords: ['primary mission', '11th edition', title.toLowerCase()],
    })
  }
  return nodes
}
