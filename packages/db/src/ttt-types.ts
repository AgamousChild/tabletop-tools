export interface TTTPackage {
  version: 1
  parsedWith: string
  parseStatus: 'ok' | 'partial' | 'failed'
  parseError?: string

  meta: {
    name: string
    totalPoints: number
    edition: '10th' | '11th'
    battleSize: 'Combat Patrol' | 'Incursion' | 'Strike Force' | 'Onslaught' | 'unknown'
    source: 'bcp-import'
  }

  list: {
    factionId: string
    factionName: string
    subfactionId?: string
    subfactionName?: string
    /** Primary (position 1) detachment. Kept for back-compat; see detachments. */
    detachmentId?: string
    detachmentName?: string
    /**
     * Every detachment the list declared, in written order.
     *
     * 11e armies take more than one (measured: 64% of scraped lists carry a
     * Detachment Points marker, and 418 of 600 join them with " and ").
     *
     * `id` here is a best-effort slug only. Authoritative resolution against
     * dim_detachment happens in server-core's detachment backfill, which is the
     * only place that has the registry — necessary because real detachment
     * names contain "and" ("Penitents and Pilgrims"), so a split cannot be
     * trusted without checking the full string against the dim first.
     */
    detachments?: Array<{ id: string; name: string }>
    /** Total Detachment Points the list spent, from "(N Detachment Points)". */
    detachmentPoints?: number
    units: TTTUnit[]
  }

  exports?: {
    rawSource: string
  }
}

export interface TTTUnit {
  name: string
  role:
    | 'Epic Hero'
    | 'Character'
    | 'Battleline'
    | 'Other'
    | 'Dedicated Transport'
    | 'Fortification'
    | 'Allied'
    | 'unknown'
  models: number
  points: number
  wargear: string[]
  enhancement?: string
  isWarlord?: boolean
}
