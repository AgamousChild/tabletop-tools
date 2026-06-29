/**
 * Brain emitter for the 11e Chapter Approved Deployment Zone cards.
 *
 * Mirrors the 10e deployment-zone shape (see `build-graph.ts` 10e block):
 * image-only nodes. The 11e source is a single JPG scan of 6 cards laid out
 * 3×2; the scan is cropped + rotated locally (see
 * `scripts/crop-deployment-zone-images.ts`) and the per-zone PNGs are
 * uploaded to R2 under `pages/ca11-deployment-zones/page-{1..6}.png` via
 * `scripts/upload-deployment-zone-images.ts`.
 *
 * Per Rule 6, the zone list is a fixed, complete deck (6 cards). It is
 * encoded as parser-side metadata here in the same shape as TWIST_TITLES
 * and the mission-cards URL list.
 *
 * The source title in each node's `Source` is the literal string
 * `'CA11 Deployment Zones'` — the client's `card-display.ts` slugifies it
 * to derive `pdfName`, which routes the worker's `/pages/:pdfName/page-:n.png`
 * endpoint to `pages/ca11-deployment-zones/page-N.png` in R2.
 */
import type { Node } from '../model'

/** Canonical 11e deployment-zone slug list — 6 zones, fixed order. */
export const DEPLOYMENT_ZONE_SLUGS = [
  'hammer-and-anvil',
  'tipping-point',
  'sweeping-engagement',
  'dawn-of-war',
  'search-and-destroy',
  'crucible-of-battle',
] as const
export type DeploymentZoneSlug = (typeof DEPLOYMENT_ZONE_SLUGS)[number]

/**
 * Display titles, uppercased to match the 10e deployment-zone shape (see
 * `build-graph.ts` 10e block, `title: zone.name` uses uppercase like
 * 'DAWN OF WAR').
 */
export const DEPLOYMENT_ZONE_TITLES: Record<DeploymentZoneSlug, string> = {
  'hammer-and-anvil': 'HAMMER AND ANVIL',
  'tipping-point': 'TIPPING POINT',
  'sweeping-engagement': 'SWEEPING ENGAGEMENT',
  'dawn-of-war': 'DAWN OF WAR',
  'search-and-destroy': 'SEARCH AND DESTROY',
  'crucible-of-battle': 'CRUCIBLE OF BATTLE',
}

/**
 * Page number (1-based) inside the synthetic `ca11-deployment-zones` "pdf"
 * for each zone. Matches the order in which the crop script writes pages —
 * see `scripts/crop-deployment-zone-images.ts`. Keep these two in lock-step.
 */
export const DEPLOYMENT_ZONE_PAGE: Record<DeploymentZoneSlug, number> = {
  'hammer-and-anvil': 1,
  'tipping-point': 2,
  'sweeping-engagement': 3,
  'dawn-of-war': 4,
  'search-and-destroy': 5,
  'crucible-of-battle': 6,
}

export interface BuildDeploymentZoneNodesOptions {
  retrievedAt?: string
  /**
   * Override for the source-attribution title. The client slugifies this to
   * derive the `pdfName` used in the `/pages/:pdfName/page-:n.png` URL, so
   * this string MUST slugify to `ca11-deployment-zones` (the R2 prefix where
   * upload-deployment-zone-images.ts puts the PNGs).
   */
  sourceTitle?: string
  /** Override for the source `publishedAt` date. */
  publishedAt?: string
}

/**
 * Emit the 6 11e deployment-zone nodes. No external input — the zone list is
 * fixed and the images live in R2 (uploaded out-of-band by
 * `scripts/upload-deployment-zone-images.ts`).
 *
 * Shape mirrors the 10e deployment-zone block in `build-graph.ts`:
 *   - id: `ca11:deployment-zone:<slug>`
 *   - category: 'deployment-zone'
 *   - title: uppercase zone name
 *   - content: brief structural body — no rules text, the image is the truth
 *   - source: one `pdf` source with `page` matching `DEPLOYMENT_ZONE_PAGE`
 */
export function buildDeploymentZoneNodes(opts: BuildDeploymentZoneNodesOptions = {}): Node[] {
  const retrievedAt = opts.retrievedAt ?? new Date().toISOString()
  // The slugify the client runs (lowercase, [^a-z0-9]+ → '-') maps this title
  // to exactly `ca11-deployment-zones`, which is the R2 prefix where the
  // upload script puts the PNGs. Do not rename without updating both ends.
  const sourceTitle = opts.sourceTitle ?? 'CA11 Deployment Zones'
  const publishedAt = opts.publishedAt

  const nodes: Node[] = []
  for (const slug of DEPLOYMENT_ZONE_SLUGS) {
    const title = DEPLOYMENT_ZONE_TITLES[slug]
    const page = DEPLOYMENT_ZONE_PAGE[slug]
    nodes.push({
      id: `ca11:deployment-zone:${slug}`,
      layer: 'core',
      category: 'deployment-zone',
      title,
      edition: '11th',
      content: `**Battle Size:** Strike Force (2000pts)\n\nSee deployment card image.`,
      summary: `${title} — 11e deployment zone`,
      sources: [
        {
          type: 'pdf',
          title: sourceTitle,
          page,
          retrievedAt,
          ...(publishedAt ? { publishedAt } : {}),
        },
      ],
      refs: [],
      version: 1,
      keywords: ['deployment', 'deployment zone', '11th edition', slug.replace(/-/g, ' ')],
    })
  }
  return nodes
}
