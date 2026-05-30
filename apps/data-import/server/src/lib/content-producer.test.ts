import { createClient } from '@libsql/client'
import { contentEntity } from '@tabletop-tools/db'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  type DatasheetRecord,
  produceDatasheets,
  produceWeapons,
  type WeaponRecord,
} from './content-producer'

const client = createClient({ url: ':memory:' })
const db = drizzle(client)

// Mock R2 bucket — only the .put() method is exercised by the producer.
const r2 = {
  store: new Map<string, string>(),
  async put(key: string, value: string) {
    this.store.set(key, value)
  },
} as unknown as R2Bucket

afterAll(() => {
  client.close()
})

beforeAll(async () => {
  // Match packages/db/src/schema.ts content_entity definition (post-migration 0003).
  await client.execute(`CREATE TABLE content_entity (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    faction_id TEXT REFERENCES content_entity(id),
    parent_id TEXT REFERENCES content_entity(id),
    dataslate_id TEXT,
    r2_key TEXT,
    wahapedia_id TEXT,
    bsdata_id TEXT,
    updated_at INTEGER NOT NULL
  )`)
})

describe('produceDatasheets', () => {
  it('writes a canonical R2 doc per datasheet and upserts content_entity rows', async () => {
    const datasheets: DatasheetRecord[] = [
      {
        id: 'bsdata-guid-1',
        name: 'Intercessors',
        wahapediaId: 'wahap-1',
        bsdataId: 'bsdata-guid-1',
      },
      { id: 'wahap-2', name: 'Unmatched Unit', wahapediaId: 'wahap-2' }, // no BSData mapping
    ]
    const result = await produceDatasheets(r2 as unknown as R2Bucket, db, datasheets)

    expect(result.type).toBe('datasheet')
    expect(result.r2DocsWritten).toBe(2)
    expect(result.contentEntityUpserts).toBe(2)

    // R2 docs
    const store = (r2 as unknown as { store: Map<string, string> }).store
    expect(store.get('content/datasheet/bsdata-guid-1.json')).toContain('Intercessors')
    expect(store.get('content/datasheet/wahap-2.json')).toContain('Unmatched Unit')

    // content_entity rows — provenance preserved
    const rows = await db.select().from(contentEntity)
    expect(rows).toHaveLength(2)
    const matched = rows.find((r) => r.id === 'bsdata-guid-1')
    expect(matched?.type).toBe('datasheet')
    expect(matched?.wahapediaId).toBe('wahap-1')
    expect(matched?.bsdataId).toBe('bsdata-guid-1')
    expect(matched?.r2Key).toBe('content/datasheet/bsdata-guid-1.json')

    const unmatched = rows.find((r) => r.id === 'wahap-2')
    expect(unmatched?.wahapediaId).toBe('wahap-2')
    expect(unmatched?.bsdataId).toBeNull()
  })

  it('is idempotent — re-running with the same id updates name/provenance, never duplicates', async () => {
    await produceDatasheets(r2 as unknown as R2Bucket, db, [
      {
        id: 'bsdata-guid-1',
        name: 'Intercessors (renamed)',
        wahapediaId: 'wahap-1',
        bsdataId: 'bsdata-guid-1',
      },
    ])

    const rows = await db.select().from(contentEntity).where(eq(contentEntity.id, 'bsdata-guid-1'))
    expect(rows).toHaveLength(1) // no duplicate
    expect(rows[0]?.name).toBe('Intercessors (renamed)') // updated
  })

  it('writes R2 docs even when no db client is supplied (R2-only mode)', async () => {
    const r2b = {
      store: new Map<string, string>(),
      async put(key: string, value: string) {
        this.store.set(key, value)
      },
    } as unknown as R2Bucket

    const result = await produceDatasheets(r2b, undefined, [{ id: 'x1', name: 'No-DB Test' }])
    expect(result.r2DocsWritten).toBe(1)
    expect(result.contentEntityUpserts).toBe(0)
    const store = (r2b as unknown as { store: Map<string, string> }).store
    expect(store.get('content/datasheet/x1.json')).toContain('No-DB Test')
  })
})

describe('produceWeapons', () => {
  it('writes a canonical R2 doc per weapon and upserts content_entity rows with parent → datasheet', async () => {
    // Parent datasheet must exist first for the FK to satisfy
    await produceDatasheets(r2 as unknown as R2Bucket, db, [
      {
        id: 'ds-weap-parent',
        name: 'Captain',
        wahapediaId: 'wahap-cap',
        bsdataId: 'ds-weap-parent',
      },
    ])

    const weapons: WeaponRecord[] = [
      {
        id: 'ds-weap-parent-1-0', // positional id from datasheet_wargear (provenance)
        datasheetId: 'ds-weap-parent',
        name: 'Bolt Pistol',
        range: '12"',
        type: 'Pistol 1',
        attacks: '1',
        skill: '3+',
        strength: '4',
        ap: '0',
        damage: '1',
      },
      {
        id: 'ds-weap-parent-1-1',
        datasheetId: 'ds-weap-parent',
        name: 'Power Sword',
        range: 'Melee',
        type: 'Melee',
        attacks: '4',
        skill: '3+',
        strength: '5',
        ap: '-2',
        damage: '1',
      },
    ]
    const result = await produceWeapons(r2 as unknown as R2Bucket, db, weapons)
    expect(result.type).toBe('weapon')
    expect(result.r2DocsWritten).toBe(2)
    expect(result.contentEntityUpserts).toBe(2)

    // canonical id: weapon:{datasheetId}:{slug(name)}
    const store = (r2 as unknown as { store: Map<string, string> }).store
    expect(store.get('content/weapon/weapon:ds-weap-parent:bolt-pistol.json')).toContain(
      'Bolt Pistol',
    )
    expect(store.get('content/weapon/weapon:ds-weap-parent:power-sword.json')).toContain(
      'Power Sword',
    )

    // content_entity row exists with parent → datasheet
    const bolt = await db
      .select()
      .from(contentEntity)
      .where(eq(contentEntity.id, 'weapon:ds-weap-parent:bolt-pistol'))
    expect(bolt[0]?.type).toBe('weapon')
    expect(bolt[0]?.parentId).toBe('ds-weap-parent')
    expect(bolt[0]?.wahapediaId).toBe('ds-weap-parent-1-0') // provenance preserved
    expect(bolt[0]?.name).toBe('Bolt Pistol')
  })

  it('rejects a weapon whose parent datasheet does not exist (FK)', async () => {
    await expect(
      produceWeapons(r2 as unknown as R2Bucket, db, [
        {
          id: 'orphan-weap',
          datasheetId: 'no-such-datasheet',
          name: 'Ghost Cannon',
        },
      ]),
    ).rejects.toThrow()
  })
})
