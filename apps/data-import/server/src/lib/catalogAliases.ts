/**
 * Consolidated faction/alias FACTS for the data-import pipeline.
 *
 * @see wargame/w2/95-consolidation-roadmap.md — Phase 3, D2-04 classes A/B:
 * "alias tables ×4 → one catalogAliases.ts module (build-time constant —
 * deliberately *not* a DB table, it changes only with source formats)".
 *
 * Before this module, four separate hand-maintained tables encoded
 * overlapping SM-chapter and faction-name-drift facts across `sync.ts`,
 * `sources/bsdata.ts`, and `sources/faction-pack.ts` — most visibly the "11
 * Space Marines chapter catalogs" list, spelled out three different ways
 * (lowercase keys, Title-Case keys, and a reverse slug→name map). This module
 * is the single source of those underlying facts; each consumer below
 * projects the facts into the exact shape/casing/direction it needs. The
 * four original lookup BEHAVIORS are unchanged — see characterization tests
 * in sync.test.ts / bsdata.test.ts / catalogAliases.test.ts.
 *
 * Kept app-local (not in packages/game-content) because only
 * apps/data-import consumes these facts — confirmed by repo-wide grep for
 * every exported symbol name before this module existed. If a second app
 * needs faction-naming data, promote this module to packages/game-content
 * at that point; don't promote speculatively (Rule: no features that aren't
 * needed yet).
 */

/** One BSData-published Space Marines chapter catalog. */
export interface SmChapter {
  /** BSData catalog / display name, Title Case (e.g. "Blood Angels"). */
  titleCase: string
  /** Canonical subfaction slug (e.g. "blood-angels"). */
  slug: string
  /** Whether BSData/wh40k-11e-mfm ships a dedicated MFM YAML for this chapter. */
  hasMfmFile: boolean
}

/**
 * The 11 Space Marines chapter catalogs BSData ships as separate factions.
 * Every catalog rolls up to the parent `Space Marines` faction with this
 * slug as its `subfaction`. Grounded in actual repo enumeration (BSData/
 * wh40k-10e main branch — see prior CATALOG_FACTION_ALIASES history) and the
 * BSData/wh40k-11e-mfm YAML listing for the `hasMfmFile` split: Black
 * Templars, Blood Angels, Dark Angels, Deathwatch, and Space Wolves each
 * have a dedicated MFM YAML (their MFM slug matches the chapter, not
 * `space-marines`); the other 6 have no dedicated MFM file and roll up to
 * `space-marines` for MFM costing lookups specifically.
 */
export const SM_CHAPTERS: readonly SmChapter[] = [
  { titleCase: 'Black Templars', slug: 'black-templars', hasMfmFile: true },
  { titleCase: 'Blood Angels', slug: 'blood-angels', hasMfmFile: true },
  { titleCase: 'Dark Angels', slug: 'dark-angels', hasMfmFile: true },
  { titleCase: 'Deathwatch', slug: 'deathwatch', hasMfmFile: true },
  { titleCase: 'Imperial Fists', slug: 'imperial-fists', hasMfmFile: false },
  { titleCase: 'Iron Hands', slug: 'iron-hands', hasMfmFile: false },
  { titleCase: 'Raven Guard', slug: 'raven-guard', hasMfmFile: false },
  { titleCase: 'Salamanders', slug: 'salamanders', hasMfmFile: false },
  { titleCase: 'Space Wolves', slug: 'space-wolves', hasMfmFile: true },
  { titleCase: 'Ultramarines', slug: 'ultramarines', hasMfmFile: false },
  { titleCase: 'White Scars', slug: 'white-scars', hasMfmFile: false },
]

/** SM chapters with no dedicated MFM YAML — they roll up to `space-marines` for MFM lookups. */
export const SM_CHAPTERS_WITHOUT_MFM: ReadonlySet<string> = new Set(
  SM_CHAPTERS.filter((c) => !c.hasMfmFile).map((c) => c.slug),
)

/**
 * String drift between BSData catalog naming and canonical faction ids/slugs
 * that generic slugify can't bridge. Lowercase-keyed (case-insensitive
 * lookup convention shared by both consumers below).
 */
export const FACTION_NAME_ALIASES: Record<string, string> = {
  // Wahapedia calls this `imperial-agents`; BSData says `Agents of the Imperium`.
  'agents of the imperium': 'imperial-agents',
}

/**
 * Catalog alias map: lowercase BSData catalog string → canonical faction
 * SLUG. Consumed by `sync.ts`'s `resolveCatalogToCanonicalFactionId` (catalog
 * → Wahapedia-canonical-faction-id resolution).
 */
export const CATALOG_TO_FACTION_SLUG: Record<string, string> = {
  ...Object.fromEntries(SM_CHAPTERS.map((c) => [c.titleCase.toLowerCase(), 'space-marines'])),
  ...FACTION_NAME_ALIASES,
}

/**
 * Catalog alias map: Title-Case BSData catalog name → subfaction SLUG (not
 * the parent faction — the parent is always literal `Space Marines`).
 * Consumed by `sources/bsdata.ts`'s `rollupChapterFaction` (catalog →
 * human-readable parent faction name + subfaction slug).
 */
export const SM_CHAPTER_TO_SUBFACTION: Record<string, string> = Object.fromEntries(
  SM_CHAPTERS.map((c) => [c.titleCase, c.slug]),
)

/**
 * MFM faction slugs that exist in the upstream `BSData/wh40k-11e-mfm` repo as
 * standalone YAML files (data/*.yaml minus meta.yaml). Determines which SM
 * chapter / sub-faction BSData catalogs keep their own slug versus rolling up
 * to the parent faction for MFM costing lookups.
 *
 * Hardcoded from the actual MFM repo listing. Update when MFM adds or
 * removes a faction file. Source registry rule (root CLAUDE.md Rule 1) is
 * upheld because this is presentation-only ID-mapping logic — the underlying
 * costing data still lives in MFM upstream, not duplicated here.
 */
export const MFM_FACTION_SLUGS: ReadonlySet<string> = new Set([
  'adepta-sororitas',
  'adeptus-custodes',
  'adeptus-mechanicus',
  'aeldari',
  'astra-militarum',
  'black-templars',
  'blood-angels',
  'chaos-daemons',
  'chaos-knights',
  'chaos-space-marines',
  'chaos-titan-legions',
  'dark-angels',
  'death-guard',
  'deathwatch',
  'drukhari',
  'emperors-children',
  'genestealer-cults',
  'grey-knights',
  'imperial-agents',
  'imperial-knights',
  'leagues-of-votann',
  'necrons',
  'orks',
  'space-marines',
  'space-wolves',
  'tau-empire',
  'thousand-sons',
  'titan-legions',
  'tyranids',
  'world-eaters',
])

/**
 * Reverse map: canonical faction SLUG → BSData catalog display name. Used
 * when reading a canonical faction slug (e.g. from a faction-pack's
 * `factionSlug` input) and needing to look up matching BSData rows by their
 * post-rollup display name.
 *
 * This is NOT simply the inverse of `SM_CHAPTER_TO_SUBFACTION` /
 * `CATALOG_TO_FACTION_SLUG` — several distinct slugs collapse to the single
 * BSData display name `Space Marines` (the chapters), and a few slugs are
 * defensive duplicates for slug-generation variance (`tau-empire` /
 * `t-au-empire`, `emperors-children` / `emperor-s-children`) where the same
 * concept can arrive slugified two different ways depending on which
 * apostrophe-stripping rule produced it. Preserve both keys exactly.
 */
export const FACTION_SLUG_TO_BSDATA_NAME: Record<string, string> = {
  'space-marines': 'Space Marines',
  'chaos-space-marines': 'Chaos Space Marines',
  'chaos-daemons': 'Chaos Daemons',
  'chaos-knights': 'Chaos Knights',
  'imperial-agents': 'Agents of the Imperium',
  'imperial-knights': 'Imperial Knights',
  'blood-angels': 'Space Marines',
  'dark-angels': 'Space Marines',
  'black-templars': 'Space Marines',
  deathwatch: 'Space Marines',
  'space-wolves': 'Space Marines',
  'grey-knights': 'Grey Knights',
  orks: 'Orks',
  tyranids: 'Tyranids',
  necrons: 'Necrons',
  aeldari: 'Aeldari',
  drukhari: 'Drukhari',
  'thousand-sons': 'Thousand Sons',
  'world-eaters': 'World Eaters',
  'death-guard': 'Death Guard',
  'astra-militarum': 'Astra Militarum',
  'adepta-sororitas': 'Adepta Sororitas',
  'adeptus-custodes': 'Adeptus Custodes',
  'adeptus-mechanicus': 'Adeptus Mechanicus',
  'genestealer-cults': 'Genestealer Cults',
  'leagues-of-votann': 'Leagues of Votann',
  'tau-empire': "T'au Empire",
  't-au-empire': "T'au Empire",
  'emperors-children': "Emperor's Children",
  'emperor-s-children': "Emperor's Children",
}
