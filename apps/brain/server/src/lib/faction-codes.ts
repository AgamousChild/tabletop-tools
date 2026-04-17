import { slugify } from './slugify'

/** Map Wahapedia short codes to kebab-case slugs matching faction pack filenames. */
export const FACTION_CODE_TO_SLUG: Record<string, string> = {
  AS: 'adepta-sororitas',
  AC: 'adeptus-custodes',
  AdM: 'adeptus-mechanicus',
  TL: 'adeptus-titanicus',
  AE: 'aeldari',
  AM: 'astra-militarum',
  CD: 'chaos-daemons',
  QT: 'chaos-knights',
  CSM: 'chaos-space-marines',
  DG: 'death-guard',
  DRU: 'drukhari',
  EC: 'emperors-children',
  GC: 'genestealer-cults',
  GK: 'grey-knights',
  AoI: 'imperial-agents',
  QI: 'imperial-knights',
  LoV: 'leagues-of-votann',
  NEC: 'necrons',
  ORK: 'orks',
  SM: 'space-marines',
  TS: 'thousand-sons',
  TYR: 'tyranids',
  TAU: 't-au-empire',
  UN: 'unaligned',
  UA: 'unbound-adversaries',
  WE: 'world-eaters',
}

/** Reverse map: slug → list of codes that map to it. */
export const SLUG_TO_CODES: Record<string, string[]> = {}
for (const [code, slug] of Object.entries(FACTION_CODE_TO_SLUG)) {
  if (!SLUG_TO_CODES[slug]) SLUG_TO_CODES[slug] = []
  SLUG_TO_CODES[slug]!.push(code)
}

/** Normalize a faction ID from Wahapedia short code to canonical kebab-case slug. */
export function normalizeFactionId(code: string): string {
  if (Object.values(FACTION_CODE_TO_SLUG).includes(code)) return code
  return FACTION_CODE_TO_SLUG[code] ?? slugify(code)
}
