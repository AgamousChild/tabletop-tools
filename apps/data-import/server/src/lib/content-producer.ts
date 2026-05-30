/**
 * Canonical content-doc producer (Phase 1.4 step 7+).
 *
 * For each content entity in the re-keyed import data, this writes a per-entity
 * R2 doc (`content/{type}/{id}.json`) AND upserts a row into `content_entity`
 * (the relational index). Upserts are idempotent — re-runs do not duplicate
 * or churn unchanged rows.
 *
 * Datasheets first; weapons / factions / abilities follow the same shape.
 *
 * `factionId` / `parentId` are intentionally NOT set here for datasheets —
 * those FKs are populated once the referenced content entity types exist
 * (factions in step 9; weapon parents already exist by the time weapons run).
 *
 * @see docs/superpowers/specs/2026-05-28-content-silo-bridge-design.md
 * @see docs/superpowers/plans/2026-05-29-phase-1.4-unified-etl.md
 */
import { contentEntity, type Db } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'

export interface DatasheetRecord {
  id: string // canonical id (BSData GUID if mapped, else Wahapedia id)
  name: string
  factionId?: string // Wahapedia faction code (pre-canonicalization) — not used as FK here
  wahapediaId?: string // original given id from Wahapedia
  bsdataId?: string // BSData GUID if mapped (equals id by convention for datasheets)
}

export interface ProducerResult {
  type: string
  r2DocsWritten: number
  contentEntityUpserts: number
}

/**
 * Produces canonical content for the datasheet type.
 * - R2: writes `content/datasheet/{id}.json` per datasheet.
 * - DB: upserts a content_entity row per datasheet (id, type, name, r2_key,
 *   wahapedia_id, bsdata_id, updated_at). factionId left null — populated in
 *   the faction step. parentId is null for datasheets (top-level).
 *
 * `db` is optional — when absent (e.g., dev/test with no DB), only R2 is
 * written. Caller (sync.ts) decides whether to provide a db client based on
 * the presence of TURSO_DB_URL/TURSO_AUTH_TOKEN.
 */
export async function produceDatasheets(
  bucket: R2Bucket,
  db: Db | undefined,
  datasheets: DatasheetRecord[],
): Promise<ProducerResult> {
  let r2DocsWritten = 0
  for (const ds of datasheets) {
    await bucket.put(`content/datasheet/${ds.id}.json`, JSON.stringify(ds))
    r2DocsWritten++
  }

  let contentEntityUpserts = 0
  if (db) {
    const now = new Date()
    for (const ds of datasheets) {
      await db
        .insert(contentEntity)
        .values({
          id: ds.id,
          type: 'datasheet',
          name: ds.name,
          r2Key: `content/datasheet/${ds.id}.json`,
          wahapediaId: ds.wahapediaId,
          bsdataId: ds.bsdataId,
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
            // factionId / parentId / dataslateId NOT updated — those are owned by other steps
          },
        })
      contentEntityUpserts++
    }
  }

  return { type: 'datasheet', r2DocsWritten, contentEntityUpserts }
}
