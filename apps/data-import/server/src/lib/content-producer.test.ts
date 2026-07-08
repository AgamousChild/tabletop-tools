import { createClient } from '@libsql/client'
import { contentCanLead, contentEntity, createDbFromClient, dimDataslate } from '@tabletop-tools/db'
import { createTestTables } from '@tabletop-tools/db/src/test-ddl'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  type DatasheetRecord,
  type DetachmentAbilityRecord,
  type DetachmentRecord,
  type FactionRecord,
  produceAbilities,
  produceCanLead,
  produceCanSupport,
  produceDatasheets,
  produceDetachmentAbilities,
  produceDetachments,
  produceFactions,
  produceSubfactions,
  produceWeapons,
  type SubfactionRecord,
  type WeaponRecord,
} from './content-producer'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

// Mock R2 bucket — only the .put() method is exercised by the producer.
const r2Store = new Map<string, string>()
const r2 = {
  store: r2Store,
  async put(key: string, value: string) {
    r2Store.set(key, value)
  },
} as unknown as R2Bucket & { store: Map<string, string> }

afterAll(() => {
  client.close()
})

beforeAll(async () => {
  await createTestTables(client, { dimDataslate, contentEntity, contentCanLead })
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
    // One bulk R2 doc per type (not per record) — the producer collapsed
    // per-record R2 writes to stay under the Cloudflare Workers subrequest cap.
    expect(result.r2DocsWritten).toBe(1)
    expect(result.contentEntityUpserts).toBe(2)

    // R2 bulk doc — both records keyed by canonical id inside one JSON map.
    const store = (r2 as unknown as { store: Map<string, string> }).store
    const bulk = JSON.parse(store.get('content/datasheet.json') ?? '{}')
    expect(bulk['bsdata-guid-1'].name).toBe('Intercessors')
    expect(bulk['wahap-2'].name).toBe('Unmatched Unit')

    // content_entity rows — provenance preserved
    const rows = await db.select().from(contentEntity)
    expect(rows).toHaveLength(2)
    const matched = rows.find((r) => r.id === 'bsdata-guid-1')
    expect(matched?.type).toBe('datasheet')
    expect(matched?.wahapediaId).toBe('wahap-1')
    expect(matched?.bsdataId).toBe('bsdata-guid-1')
    expect(matched?.r2Key).toBe('content/datasheet.json')

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
    const localStore = new Map<string, string>()
    const r2b = {
      store: localStore,
      async put(key: string, value: string) {
        localStore.set(key, value)
      },
    } as unknown as R2Bucket & { store: Map<string, string> }

    const result = await produceDatasheets(r2b, undefined, [{ id: 'x1', name: 'No-DB Test' }])
    expect(result.r2DocsWritten).toBe(1)
    expect(result.contentEntityUpserts).toBe(0)
    const store = (r2b as unknown as { store: Map<string, string> }).store
    const bulk = JSON.parse(store.get('content/datasheet.json') ?? '{}')
    expect(bulk['x1'].name).toBe('No-DB Test')
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
    // One bulk R2 doc per type; both weapons keyed inside it.
    expect(result.r2DocsWritten).toBe(1)
    expect(result.contentEntityUpserts).toBe(2)

    const store = (r2 as unknown as { store: Map<string, string> }).store
    const bulk = JSON.parse(store.get('content/weapon.json') ?? '{}')
    expect(bulk['weapon:ds-weap-parent:bolt-pistol'].name).toBe('Bolt Pistol')
    expect(bulk['weapon:ds-weap-parent:power-sword'].name).toBe('Power Sword')

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

describe('produceFactions / produceDetachments / produceAbilities', () => {
  it('factions use slug(name) as canonical id; provenance is the wahapedia code', async () => {
    const factions: FactionRecord[] = [{ id: 'AM', name: 'Astra Militarum' }]
    const result = await produceFactions(r2 as unknown as R2Bucket, db, factions)
    expect(result.type).toBe('faction')
    expect(result.r2DocsWritten).toBe(1)
    expect(result.contentEntityUpserts).toBe(1)
    const row = (
      await db.select().from(contentEntity).where(eq(contentEntity.id, 'astra-militarum'))
    )[0]
    expect(row?.type).toBe('faction')
    expect(row?.name).toBe('Astra Militarum')
    expect(row?.wahapediaId).toBe('AM')
  })

  it('detachments have canonical id `detachment:{factionSlug}:{slug(name)}`, parent → faction', async () => {
    // faction must exist first
    await produceFactions(r2 as unknown as R2Bucket, db, [{ id: 'XX', name: 'Test Faction' }])
    const detachments: DetachmentRecord[] = [
      { id: 'wahap-det-1', factionId: 'Test Faction', name: 'Bold Strike' },
    ]
    const result = await produceDetachments(r2 as unknown as R2Bucket, db, detachments)
    expect(result.type).toBe('detachment')
    const row = (
      await db
        .select()
        .from(contentEntity)
        .where(eq(contentEntity.id, 'detachment:test-faction:bold-strike'))
    )[0]
    expect(row?.parentId).toBe('test-faction')
    expect(row?.factionId).toBe('test-faction')
    expect(row?.wahapediaId).toBe('wahap-det-1')
  })

  it('abilities use the Phase 1.1 canonical id; factionId slugified for FK', async () => {
    await produceFactions(r2 as unknown as R2Bucket, db, [{ id: 'SW', name: 'Stone Walkers' }])
    const abilities = [
      { id: 'A123', canonicalId: 'ability:A123', name: 'Oath of Iron', factionId: 'Stone Walkers' },
    ]
    const result = await produceAbilities(r2 as unknown as R2Bucket, db, abilities)
    expect(result.type).toBe('ability')
    const row = (
      await db.select().from(contentEntity).where(eq(contentEntity.id, 'ability:A123'))
    )[0]
    expect(row?.type).toBe('ability')
    expect(row?.factionId).toBe('stone-walkers')
    expect(row?.wahapediaId).toBe('A123')
  })

  it('backfill-only: a later run that omits factionId does NOT clear an existing one', async () => {
    // Establish a faction
    await produceFactions(r2 as unknown as R2Bucket, db, [{ id: 'BF', name: 'Backfill Faction' }])
    // Insert a datasheet with factionId set
    await produceDatasheets(r2 as unknown as R2Bucket, db, [
      {
        id: 'bf-ds-1',
        name: 'Some Unit',
        factionId: 'Backfill Faction',
        wahapediaId: 'bf-w-1',
        bsdataId: 'bf-ds-1',
      },
    ])
    let row = (await db.select().from(contentEntity).where(eq(contentEntity.id, 'bf-ds-1')))[0]
    expect(row?.factionId).toBe('backfill-faction')
    // Re-run without factionId — should NOT clear the existing one
    await produceDatasheets(r2 as unknown as R2Bucket, db, [
      { id: 'bf-ds-1', name: 'Some Unit (v2)' },
    ])
    row = (await db.select().from(contentEntity).where(eq(contentEntity.id, 'bf-ds-1')))[0]
    expect(row?.factionId).toBe('backfill-faction') // preserved
    expect(row?.name).toBe('Some Unit (v2)') // updated
  })
})

describe('produceSubfactions', () => {
  it('canonical id = slug(name); parent + faction → faction slug; bsdataId = provenance', async () => {
    // parent faction must exist
    await produceFactions(r2 as unknown as R2Bucket, db, [{ id: 'SM', name: 'Space Marines' }])
    const subfactions: SubfactionRecord[] = [
      { id: 'sf-bsdata-ultra', name: 'Ultramarines', factionId: 'space-marines' },
      { id: 'sf-bsdata-bt', name: 'Black Templars', factionId: 'space-marines' },
    ]
    const result = await produceSubfactions(r2 as unknown as R2Bucket, db, subfactions)
    expect(result.type).toBe('subfaction')
    // One bulk R2 doc per type; both subfactions keyed inside it.
    expect(result.r2DocsWritten).toBe(1)
    expect(result.contentEntityUpserts).toBe(2)
    const ultra = (
      await db.select().from(contentEntity).where(eq(contentEntity.id, 'ultramarines'))
    )[0]
    expect(ultra?.type).toBe('subfaction')
    expect(ultra?.factionId).toBe('space-marines')
    expect(ultra?.parentId).toBe('space-marines')
    expect(ultra?.bsdataId).toBe('sf-bsdata-ultra')
  })

  it('rejects a subfaction whose parent faction does not exist (FK)', async () => {
    await expect(
      produceSubfactions(r2 as unknown as R2Bucket, db, [
        { id: 'orphan-sf', name: 'Nobody', factionId: 'nonexistent-faction' },
      ]),
    ).rejects.toThrow()
  })
})

describe('produceCanLead', () => {
  // Seed two datasheets needed by the FK references in content_can_lead.
  beforeAll(async () => {
    await client.execute(
      `INSERT OR IGNORE INTO content_entity (id, type, name, updated_at) VALUES ('ds-a', 'datasheet', 'UnitA', 0)`,
    )
    await client.execute(
      `INSERT OR IGNORE INTO content_entity (id, type, name, updated_at) VALUES ('ds-b', 'datasheet', 'UnitB', 0)`,
    )
  })

  it('writes role=leader rows from leader_attachments', async () => {
    await client.execute('DELETE FROM content_can_lead')
    const r = await produceCanLead(
      db,
      [{ leaderId: 'ds-a', attachedId: 'ds-b', role: 'leader' }],
      new Set(['ds-a', 'ds-b']),
    )
    expect(r.rowsWritten).toBe(1)
    const rows = await client.execute('SELECT * FROM content_can_lead WHERE role = ?', ['leader'])
    expect(rows.rows).toHaveLength(1)
  })

  it('defaults to role=leader when role field is absent (backward compat)', async () => {
    await client.execute('DELETE FROM content_can_lead')
    const r = await produceCanLead(
      db,
      [{ leaderId: 'ds-a', attachedId: 'ds-b' }],
      new Set(['ds-a', 'ds-b']),
    )
    expect(r.rowsWritten).toBe(1)
    const rows = await client.execute('SELECT role FROM content_can_lead')
    expect(rows.rows[0]?.role).toBe('leader')
  })

  it('drops pairs where an endpoint is not in validDatasheetIds', async () => {
    await client.execute('DELETE FROM content_can_lead')
    const r = await produceCanLead(
      db,
      [{ leaderId: 'ds-x', attachedId: 'ds-b', role: 'leader' }],
      new Set(['ds-a', 'ds-b']),
    )
    expect(r.rowsWritten).toBe(0)
    expect(r.dropped).toBe(1)
  })
})

describe('produceCanSupport', () => {
  it('is a no-op scaffold — writes 0 rows when given empty input', async () => {
    await client.execute('DELETE FROM content_can_lead')
    const r = await produceCanSupport(db, [], new Set(['ds-a', 'ds-b']))
    // No 11th-ed per-codex support data ingested yet — scaffold produces 0 rows.
    expect(r.rowsWritten).toBe(0)
  })

  it('writes role=support rows when support_attachments data is provided', async () => {
    await client.execute('DELETE FROM content_can_lead')
    const r = await produceCanSupport(
      db,
      [{ leaderId: 'ds-a', attachedId: 'ds-b' }],
      new Set(['ds-a', 'ds-b']),
    )
    expect(r.rowsWritten).toBe(1)
    const rows = await client.execute('SELECT role FROM content_can_lead WHERE role = ?', [
      'support',
    ])
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]?.role).toBe('support')
  })
})

describe('produceDetachmentAbilities', () => {
  it('parent_id resolves via detachmentIdMap; canonical id from Phase 1.1', async () => {
    // Set up faction → detachment
    await produceFactions(r2 as unknown as R2Bucket, db, [{ id: 'DA', name: 'Det Faction' }])
    await produceDetachments(r2 as unknown as R2Bucket, db, [
      { id: 'wahap-det-A', factionId: 'Det Faction', name: 'Strike Force' },
    ])
    const idMap = new Map<string, string>([['wahap-det-A', 'detachment:det-faction:strike-force']])
    const records: DetachmentAbilityRecord[] = [
      {
        id: 'DA001',
        canonicalId: 'detachment_ability:DA001',
        detachmentId: 'wahap-det-A',
        factionId: 'Det Faction',
        name: 'Coordinated Push',
        wahapediaId: 'DA001',
      },
    ]
    const result = await produceDetachmentAbilities(r2 as unknown as R2Bucket, db, records, idMap)
    expect(result.type).toBe('detachment_ability')
    expect(result.contentEntityUpserts).toBe(1)
    const row = (
      await db.select().from(contentEntity).where(eq(contentEntity.id, 'detachment_ability:DA001'))
    )[0]
    expect(row?.type).toBe('detachment_ability')
    expect(row?.parentId).toBe('detachment:det-faction:strike-force')
    expect(row?.factionId).toBe('det-faction')
    expect(row?.wahapediaId).toBe('DA001')
  })
})
