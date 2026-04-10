/** Convert a title string to a stable kebab-case slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['\u2018\u2019\u2032]/g, '')  // remove apostrophes/smart quotes
    .replace(/[^a-z0-9]+/g, '-')            // non-alphanumeric -> hyphen
    .replace(/-+/g, '-')                     // collapse multiple hyphens
    .replace(/^-|-$/g, '')                   // trim leading/trailing hyphens
}

// ── Node ID builders ────────────────────────────────────────────────────────

export function coreId(title: string): string {
  return `core:${slugify(title)}`
}

export function factionId(faction: string, title: string): string {
  return `faction:${faction}:${slugify(title)}`
}

export function detachmentId(faction: string, detachment: string, title: string): string {
  return `det:${faction}:${detachment}:${slugify(title)}`
}

export function errataId(sourceDoc: string, page: number, index: number): string {
  return `errata:${sourceDoc}:p${page}:${index}`
}

export function balanceId(faction: string, title: string): string {
  return `balance:${faction}:${slugify(title)}`
}

export function weaponId(datasheetId: string, weaponTitle: string): string {
  return `weapon:${datasheetId}:${slugify(weaponTitle)}`
}

export function abilityId(datasheetId: string, abilityTitle: string): string {
  return `ability:${datasheetId}:${slugify(abilityTitle)}`
}

export function communityId(slug: string): string {
  return `community:${slug}`
}
