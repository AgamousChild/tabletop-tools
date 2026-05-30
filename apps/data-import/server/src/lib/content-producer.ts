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
 * `factionId` / `parentId` / `dataslateId` are only set on initial insert (when
 * the extractor provides them); subsequent re-runs do NOT overwrite them. This
 * lets later steps populate them once the referenced entity type exists,
 * without later runs of an earlier step clobbering the FK.
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
 * supplied) upsert the content_entity row. Idempotent.
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
            // factionId / parentId / dataslateId NOT updated — owned by initial-insert path
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

export interface DatasheetRecord {
  id: string // canonical id (BSData GUID if mapped, else Wahapedia id)
  name: string
  factionId?: string // rekeyed full faction name — not used as FK here yet
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
    wahapediaId: (d) => d.wahapediaId,
    bsdataId: (d) => d.bsdataId,
    // factionId deferred — populated when factions exist (step 9 wires the FK)
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

/**
 * Weapons are scoped to their parent datasheet. Canonical id is
 * `weapon:{datasheetId}:{slug(name)}`. If two rows produce the same canonical
 * id (e.g., the same weapon appearing on multiple composition lines), the
 * upsert dedupes them — last write wins for the R2 doc and content_entity.
 */
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
