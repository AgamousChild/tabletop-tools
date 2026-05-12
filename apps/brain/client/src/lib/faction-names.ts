/**
 * Faction display name mapping.
 * Converts internal faction slugs to preferred English display names.
 * The build pipeline will eventually add `factionName` to nodes directly;
 * this serves as the interim client-side mapping.
 */

const FACTION_DISPLAY_NAMES: Record<string, string> = {
  'space-marines': 'SPACE MARINES',
  'chaos-space-marines': 'CHAOS SPACE MARINES',
  't-au-empire': "T'AU EMPIRE",
  'astra-militarum': 'ASTRA MILITARUM',
  'adepta-sororitas': 'ADEPTA SORORITAS',
  'adeptus-custodes': 'ADEPTUS CUSTODES',
  'adeptus-mechanicus': 'ADEPTUS MECHANICUS',
  'grey-knights': 'GREY KNIGHTS',
  'imperial-agents': 'IMPERIAL AGENTS',
  'imperial-knights': 'IMPERIAL KNIGHTS',
  'chaos-knights': 'CHAOS KNIGHTS',
  'death-guard': 'DEATH GUARD',
  'thousand-sons': 'THOUSAND SONS',
  'world-eaters': 'WORLD EATERS',
  'chaos-daemons': 'CHAOS DAEMONS',
  'leagues-of-votann': 'LEAGUES OF VOTANN',
  'genestealer-cults': 'GENESTEALER CULTS',
  'aeldari': 'AELDARI',
  'drukhari': 'DRUKHARI',
  'tyranids': 'TYRANIDS',
  'necrons': 'NECRONS',
  'orks': 'ORKS',
}

const SUBFACTION_DISPLAY_NAMES: Record<string, string> = {
  'blood angels': 'BLOOD ANGELS',
  'dark angels': 'DARK ANGELS',
  'space wolves': 'SPACE WOLVES',
  'black templars': 'BLACK TEMPLARS',
  'deathwatch': 'DEATHWATCH',
  'ultramarines': 'ULTRAMARINES',
  'iron hands': 'IRON HANDS',
  'imperial fists': 'IMPERIAL FISTS',
  'salamanders': 'SALAMANDERS',
  'raven guard': 'RAVEN GUARD',
  'white scars': 'WHITE SCARS',
  'crimson fists': 'CRIMSON FISTS',
  'blood ravens': 'BLOOD RAVENS',
  'ynnari': 'YNNARI',
  'harlequins': 'HARLEQUINS',
  'asuryani': 'ASURYANI',
}

/** Convert a faction slug or name to the preferred ALL CAPS display name */
export function factionDisplayName(slugOrName: string): string {
  if (!slugOrName) return ''
  const fromSlug = FACTION_DISPLAY_NAMES[slugOrName]
  if (fromSlug) return fromSlug
  const fromSub = SUBFACTION_DISPLAY_NAMES[slugOrName.toLowerCase()]
  if (fromSub) return fromSub
  // Already looks like a display name (has spaces, no hyphens)
  if (slugOrName.includes(' ') && !slugOrName.includes('-')) return slugOrName.toUpperCase()
  // Unknown slug — best effort
  return slugOrName.replace(/-/g, ' ').toUpperCase()
}
