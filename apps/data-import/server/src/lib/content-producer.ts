/**
 * Canonical content-doc producer (Phase 1.4 steps 7+).
 *
 * For each content entity in the re-keyed import data, this writes a per-entity
 * R2 doc (`content/{type}/{id}.json`) AND upserts a row into `content_entity`
 * (the relational index). Upserts are idempotent — re-runs do not duplicate
 * or churn unchanged rows.
 *
 * Generic core: `produceContentEntities`. Per-type thin wrappers below.
 *
 * `factionId` / `parentId` use **backfill-only** semantics on conflict
 * (COALESCE keeps an existing non-null value; fills if currently null). This
 * lets later steps populate FKs once the referenced type exists, without later
 * runs of an earlier step clobbering a deliberately-set value.
 *
 * @see docs/superpowers/specs/2026-05-28-content-silo-bridge-design.md
 * @see docs/superpowers/plans/2026-05-29-phase-1.4-unified-etl.md
 */
import { contentEntity, type Db } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'

type ContentEntityType = (typeof contentEntity.$inferInsert)['type']

export interface ProducerResult {
  type: ContentEntityType
  r2DocsWritten: number
  contentEntityUpserts: number
}

interface ProducerConfig<T> {
  type: ContentEntityType
  records: T[]
  /** Canonical id derived from given source ids — must be deterministic. */
  canonicalId: (r: T) => string
  name: (r: T) => string
  factionId?: (r: T) => string | undefined
  parentId?: (r: T) => string | undefined
  wahapediaId?: (r: T) => string | undefined
  bsdataId?: (r: T) => string | undefined
}

/**
 * Generic producer: for each record, write the canonical R2 doc and (if db
 * supplied) upsert the content_entity row. Idempotent. FK fields are
 * backfill-only on conflict (COALESCE) so an existing set value is never
 * silently overwritten by a later pass with no value.
 */
async function produceContentEntities<T>(
  bucket: R2Bucket,
  db: Db | undefined,
  config: ProducerConfig<T>,
): Promise<ProducerResult> {
  let r2DocsWritten = 0
  for (const r of config.records) {
    const id = config.canonicalId(r)
    await bucket.put(`content/${config.type}/${id}.json`, JSON.stringify(r))
    r2DocsWritten++
  }

  let contentEntityUpserts = 0
  if (db) {
    const now = new Date()
    for (const r of config.records) {
      const id = config.canonicalId(r)
      await db
        .insert(contentEntity)
        .values({
          id,
          type: config.type,
          name: config.name(r),
          factionId: config.factionId?.(r),
          parentId: config.parentId?.(r),
          r2Key: `content/${config.type}/${id}.json`,
          wahapediaId: config.wahapediaId?.(r),
          bsdataId: config.bsdataId?.(r),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: contentEntity.id,
          set: {
            name: sql`excluded.name`,
            r2Key: sql`excluded.r2_key`,
            wahapediaId: sql`excluded.wahapedia_id`,
            bsdataId: sql`excluded.bsdata_id`,
            updatedAt: sql`excluded.updated_at`,
            // Backfill-only: keep an existing FK value, fill if currently null.
            factionId: sql`COALESCE(${contentEntity.factionId}, excluded.faction_id)`,
            parentId: sql`COALESCE(${contentEntity.parentId}, excluded.parent_id)`,
          },
        })
      contentEntityUpserts++
    }
  }

  return { type: config.type, r2DocsWritten, contentEntityUpserts }
}

/** Deterministic slug for canonical id construction (mirrors brain build). */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

// ── Per-type producers ───────────────────────────────────────────────────────

export interface FactionRecord {
  id: string // Wahapedia faction code (e.g., 'SM') — preserved as wahapediaId
  name: string // full faction name (e.g., 'Space Marines')
}

/** Faction canonical id = slug(name), e.g. 'space-marines' (matches dim_faction convention). */
export async function produceFactions(
  bucket: R2Bucket,
  db: Db | undefined,
  factions: FactionRecord[],
): Promise<ProducerResult> {
  return produceContentEntities(bucket, db, {
    type: 'faction',
    records: factions,
    canonicalId: (f) => slug(f.name),
    name: (f) => f.name,
    wahapediaId: (f) => f.id,
  })
}

export interface DetachmentRecord {
  id: string // Wahapedia detachment id (provenance)
  factionId: string // rekeyed: full faction name (e.g., 'Space Marines')
  name: string
  legend?: string
  type?: string
}

/** Detachment canonical id = 'detachment:{factionSlug}:{slug(name)}'. Parent = faction. */
export async function produceDetachments(
  bucket: R2Bucket,
  db: Db | undefined,
  detachments: DetachmentRecord[],
): Promise<ProducerResult> {
  return produceContentEntities(bucket, db, {
    type: 'detachment',
    records: detachments,
    canonicalId: (d) => `detachment:${slug(d.factionId)}:${slug(d.name)}`,
    name: (d) => d.name,
    factionId: (d) => slug(d.factionId),
    parentId: (d) => slug(d.factionId),
    wahapediaId: (d) => d.id,
  })
}

export interface DatasheetRecord {
  id: string // canonical id (BSData GUID if mapped, else Wahapedia id)
  name: string
  factionId?: string // rekeyed full faction name — slugified for FK
  wahapediaId?: string
  bsdataId?: string
}

export async function produceDatasheets(
  bucket: R2Bucket,
  db: Db | undefined,
  datasheets: DatasheetRecord[],
): Promise<ProducerResult> {
  return produceContentEntities(bucket, db, {
    type: 'datasheet',
    records: datasheets,
    canonicalId: (d) => d.id,
    name: (d) => d.name,
    factionId: (d) => (d.factionId ? slug(d.factionId) : undefined),
    wahapediaId: (d) => d.wahapediaId,
    bsdataId: (d) => d.bsdataId,
  })
}

export interface WeaponRecord {
  id: string // original positional id from datasheet_wargear (provenance)
  datasheetId: string // canonical (rekeyed) datasheet id — the FK parent
  name: string
  range?: string
  type?: string
  attacks?: string
  skill?: string
  strength?: string
  ap?: string
  damage?: string
  description?: string
}

export async function produceWeapons(
  bucket: R2Bucket,
  db: Db | undefined,
  weapons: WeaponRecord[],
): Promise<ProducerResult> {
  return produceContentEntities(bucket, db, {
    type: 'weapon',
    records: weapons,
    canonicalId: (w) => `weapon:${w.datasheetId}:${slug(w.name)}`,
    name: (w) => w.name,
    parentId: (w) => w.datasheetId,
    wahapediaId: (w) => w.id,
  })
}

/** Common shape for ability/stratagem/enhancement/detachment_ability records (after Phase 1.1 rekey). */
interface NamespacedRecord {
  id: string // Wahapedia id (provenance)
  canonicalId: string // namespaced canonical id from Phase 1.1 (e.g., 'ability:A1')
  name: string
  factionId?: string // rekeyed full faction name (may be empty for core abilities)
  wahapediaId?: string
}

function produceNamespaced(
  type: ContentEntityType,
  bucket: R2Bucket,
  db: Db | undefined,
  records: NamespacedRecord[],
): Promise<ProducerResult> {
  return produceContentEntities(bucket, db, {
    type,
    records,
    canonicalId: (r) => r.canonicalId,
    name: (r) => r.name,
    factionId: (r) => (r.factionId ? slug(r.factionId) : undefined),
    wahapediaId: (r) => r.wahapediaId ?? r.id,
  })
}

export const produceAbilities = (bucket: R2Bucket, db: Db | undefined, rs: NamespacedRecord[]) =>
  produceNamespaced('ability', bucket, db, rs)

export const produceStratagems = (bucket: R2Bucket, db: Db | undefined, rs: NamespacedRecord[]) =>
  produceNamespaced('stratagem', bucket, db, rs)

export const produceEnhancements = (bucket: R2Bucket, db: Db | undefined, rs: NamespacedRecord[]) =>
  produceNamespaced('enhancement', bucket, db, rs)

// NOTE: detachment_abilities are NOT produced here. They exist in the Phase 1.1
// canonical id scheme (`detachment_ability:{id}`), but the content_entity.type
// enum does not currently include 'detachment_ability'. Either extend the enum
// (schema migration) or fold them under 'ability' with parent_id → detachment
// in a follow-up step.
