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
import { contentCanLead, contentEntity, type Db } from '@tabletop-tools/db'
import { slugify } from '@tabletop-tools/server-core'
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
 * DB upsert batch size. Cloudflare Workers caps subrequests at 1,000 per
 * request; one-row-at-a-time across ~17K records blows the cap. Multi-row
 * INSERT … ON CONFLICT collapses each chunk into a single libSQL HTTP call.
 * 500 chosen to stay well under SQLite's default 999 parameter limit
 * (each row uses 8 params: id/type/name/factionId/parentId/r2Key/wahapediaId/
 * bsdataId/updatedAt = 9; 500 × 9 = 4,500 — exceeds SQLite default but
 * libSQL's HTTP API allows the bigger limit). If hitting a parameter cap,
 * lower to 100.
 */
const DB_BATCH_SIZE = 100

/**
 * Generic producer: for each record, write the canonical R2 doc (per-type
 * bulk doc + per-record doc — see writeR2) and (if db supplied) upsert the
 * content_entity row in chunks. Idempotent. FK fields are backfill-only on
 * conflict (COALESCE) so an existing set value is never silently
 * overwritten by a later pass with no value.
 */
async function produceContentEntities<T>(
  bucket: R2Bucket,
  db: Db | undefined,
  config: ProducerConfig<T>,
): Promise<ProducerResult> {
  // One per-type bulk doc (1 subrequest per producer). Per-record docs are
  // optional; default OFF to stay under the subrequest cap. Consumers
  // already load bulk JSON via the /data/ endpoints — per-record R2 docs
  // were aspirational, not load-bearing.
  const r2DocsWritten = await writeR2(bucket, config)

  let contentEntityUpserts = 0
  if (db) {
    const now = new Date()
    const rows = config.records.map((r) => {
      const id = config.canonicalId(r)
      return {
        id,
        type: config.type,
        name: config.name(r),
        factionId: config.factionId?.(r),
        parentId: config.parentId?.(r),
        r2Key: `content/${config.type}.json`,
        wahapediaId: config.wahapediaId?.(r),
        bsdataId: config.bsdataId?.(r),
        updatedAt: now,
      }
    })

    for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
      const chunk = rows.slice(i, i + DB_BATCH_SIZE)
      await db
        .insert(contentEntity)
        .values(chunk)
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
      contentEntityUpserts += chunk.length
    }
  }

  return { type: config.type, r2DocsWritten, contentEntityUpserts }
}

/**
 * Per-type bulk R2 doc (1 subrequest). Each record is keyed by canonical id
 * so consumers can index into the bulk doc directly, equivalent to per-doc
 * fetch with one network roundtrip instead of N.
 */
async function writeR2<T>(bucket: R2Bucket, config: ProducerConfig<T>): Promise<number> {
  const byId: Record<string, T & { canonicalId: string }> = {}
  for (const r of config.records) {
    const id = config.canonicalId(r)
    byId[id] = { ...(r as object), canonicalId: id } as T & { canonicalId: string }
  }
  await bucket.put(`content/${config.type}.json`, JSON.stringify(byId))
  return 1
}

/**
 * Deterministic slug for canonical id construction — matches the brain's
 * build slug rule. Apostrophes / smart quotes are STRIPPED (not replaced
 * with `-`) so that "Emperor's Children" → "emperors-children" and
 * "T'au Empire" → "tau-empire", matching the brain's existing factionIds
 * and detachment node ids.
 */
const slug = (s: string): string => slugify(s, { stripChars: /[’ʼ'‘"”“]/g, maxLength: 60 })

// ── Per-type producers ───────────────────────────────────────────────────────

export interface FactionRecord {
  id: string // Wahapedia faction code (e.g., 'SM') — preserved as wahapediaId
  name: string // full faction name (e.g., 'Space Marines')
}

export interface SubfactionRecord {
  id: string // BSData id of the upgrade selectionEntry (preserved as bsdataId)
  name: string // subfaction display name (e.g., 'Ultramarines')
  /**
   * Resolved canonical faction id (e.g. 'chaos-daemons'). Resolution from the
   * BSData catalog filename to a canonical faction id is the source layer's
   * responsibility (`sync.ts`'s resolver); the producer trusts this is valid
   * and uses it directly as both factionId and parentId.
   */
  factionId: string
}

/**
 * Subfaction canonical id = slug(name) (e.g., 'ultramarines'), matching the
 * `dim_subfaction` slug convention. parent_id and faction_id both point at
 * the parent faction's already-canonical id (resolved by `sync.ts`).
 */
export async function produceSubfactions(
  bucket: R2Bucket,
  db: Db | undefined,
  subfactions: SubfactionRecord[],
): Promise<ProducerResult> {
  return produceContentEntities(bucket, db, {
    type: 'subfaction',
    records: subfactions,
    canonicalId: (s) => slug(s.name),
    name: (s) => s.name,
    factionId: (s) => s.factionId,
    parentId: (s) => s.factionId,
    bsdataId: (s) => s.id,
  })
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

/** Helper used by sync.ts to build a wahapedia-detachment-id → canonical-detachment-id map. */
export const canonicalDetachmentId = (factionName: string, name: string): string =>
  `detachment:${slug(factionName)}:${slug(name)}`

export interface DetachmentAbilityRecord {
  id: string // Wahapedia id (provenance)
  canonicalId: string // Phase 1.1 canonical id (e.g., 'detachment_ability:DA1')
  detachmentId: string // Wahapedia detachment id (resolved via detachmentIdMap)
  factionId?: string // rekeyed full faction name
  name: string
  wahapediaId?: string
}

/**
 * Detachment abilities reference a parent detachment by its Wahapedia id; the
 * caller passes a map from Wahapedia detachment id → canonical detachment id so
 * the FK on content_entity.parent_id resolves correctly.
 */
export async function produceDetachmentAbilities(
  bucket: R2Bucket,
  db: Db | undefined,
  records: DetachmentAbilityRecord[],
  detachmentIdMap: Map<string, string>,
): Promise<ProducerResult> {
  return produceContentEntities(bucket, db, {
    type: 'detachment_ability',
    records,
    canonicalId: (r) => r.canonicalId,
    name: (r) => r.name,
    factionId: (r) => (r.factionId ? slug(r.factionId) : undefined),
    parentId: (r) => detachmentIdMap.get(r.detachmentId),
    wahapediaId: (r) => r.wahapediaId ?? r.id,
  })
}

// ── content_can_lead — leader datasheet → bodyguard datasheet relationships ─

export interface LeaderAttachmentRecord {
  id?: string
  /** Canonical content_entity id of the Leader character datasheet. */
  leaderId: string
  /** Canonical content_entity id of the bodyguard datasheet. */
  attachedId: string
  /** Defaults to 'leader' when absent — backward compat with Wahapedia source. */
  role?: 'leader' | 'support'
}

/**
 * Populates content_can_lead from Wahapedia's leader_attachments table
 * (already re-keyed to canonical content ids by the rekey step). Pre-filters
 * pairs whose endpoints don't exist in content_entity to avoid FK violations
 * mid-batch (same resolve-at-boundary pattern as the other producers).
 *
 * Idempotent: composite PK (leader, bodyguard, role) + ON CONFLICT DO NOTHING.
 * Skips bulk-R2 write — this is a graph relationship, not a per-entity doc.
 *
 * The `role` field defaults to 'leader' when absent for backward compatibility
 * with the Wahapedia source which pre-dates the 11th-edition Support mechanic.
 */
export async function produceCanLead(
  db: Db | undefined,
  attachments: LeaderAttachmentRecord[],
  validDatasheetIds: Set<string>,
): Promise<{ type: 'can_lead'; rowsWritten: number; dropped: number }> {
  if (!db) return { type: 'can_lead', rowsWritten: 0, dropped: 0 }
  const valid: Array<{
    leaderDatasheetId: string
    bodyguardDatasheetId: string
    role: 'leader' | 'support'
  }> = []
  let dropped = 0
  for (const a of attachments) {
    if (validDatasheetIds.has(a.leaderId) && validDatasheetIds.has(a.attachedId)) {
      valid.push({
        leaderDatasheetId: a.leaderId,
        bodyguardDatasheetId: a.attachedId,
        role: a.role ?? 'leader',
      })
    } else {
      dropped++
    }
  }
  const CHUNK = 100
  let rowsWritten = 0
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK)
    await db.insert(contentCanLead).values(chunk).onConflictDoNothing()
    rowsWritten += chunk.length
  }
  return { type: 'can_lead', rowsWritten, dropped }
}

/**
 * Scaffold producer for 11th-edition Support attachments.
 *
 * Support characters list which Bodyguard units they can join (§24.34, rule
 * SUPPORT / Appui). This is distinct from the Leader ability. Per-character
 * support lists will come from a future 11th-ed per-codex source.
 *
 * DATA GAP (2026-06-01): No ingested source provides per-character Support
 * attachment data. The 11th-leak reference.md confirms the rule exists but
 * contains no character-level lists. This function is wired into runSync so
 * the path exists — it will produce 0 rows until a source is added.
 *
 * When support data becomes available, pass it here. Rows are written with
 * role='support', so they are immediately queryable by the role-aware
 * updateUnit + eligibleBodyguards endpoints without any code change.
 */
export async function produceCanSupport(
  db: Db | undefined,
  attachments: LeaderAttachmentRecord[],
  validDatasheetIds: Set<string>,
): Promise<{ type: 'can_support'; rowsWritten: number; dropped: number }> {
  const r = await produceCanLead(
    db,
    attachments.map((a) => ({ ...a, role: 'support' as const })),
    validDatasheetIds,
  )
  return { type: 'can_support', rowsWritten: r.rowsWritten, dropped: r.dropped }
}
