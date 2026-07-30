import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  backfillDetachmentsFromLists,
  buildDetachmentIndex,
  compactKey,
  type DetachmentDim,
  extractDetachment,
  resolveDetachmentId,
} from './meta-detachment-backfill'

// Shapes taken verbatim from dim_detachment in prod: the id is
// "{faction}:{slug}" and the slug collapses every non-alphanumeric run to "-",
// so a curly apostrophe becomes a dash.
const DIMS: DetachmentDim[] = [
  { id: 'drukhari:reaper-s-wager', name: 'Reaper’s Wager', factionId: 'drukhari' },
  {
    id: 'chaos-space-marines:huron-s-marauders',
    name: 'Huron’s Marauders',
    factionId: 'chaos-space-marines',
  },
  { id: 'tau-empire:mont-ka', name: 'Mont’ka', factionId: 'tau-empire' },
  {
    id: 'tau-empire:retaliation-cadre',
    name: 'Retaliation Cadre',
    factionId: 'tau-empire',
  },
  {
    id: 'emperors-children:coterie-of-the-conceited',
    name: 'Coterie of the Conceited',
    factionId: 'emperors-children',
  },
  { id: 'adeptus-custodes:shield-host', name: 'Shield Host', factionId: 'adeptus-custodes' },
  {
    id: 'adepta-sororitas:hallowed-martyrs',
    name: 'Hallowed Martyrs',
    factionId: 'adepta-sororitas',
  },
]

const index = buildDetachmentIndex(DIMS)

describe('compactKey', () => {
  it('reduces both slug conventions to the same key', () => {
    // dim side vs list-parser side for the same detachment
    expect(compactKey('reaper-s-wager')).toBe(compactKey("reaper's-wager"))
    expect(compactKey('mont-ka')).toBe(compactKey('mont’ka'))
  })
})

describe('resolveDetachmentId', () => {
  it('matches a plain slug', () => {
    expect(resolveDetachmentId('hallowed-martyrs', 'adepta-sororitas', index)).toBe(
      'adepta-sororitas:hallowed-martyrs',
    )
  })

  it('matches across the apostrophe mismatch the two slugifiers produce', () => {
    expect(resolveDetachmentId("reaper's-wager", 'drukhari', index)).toBe('drukhari:reaper-s-wager')
    expect(resolveDetachmentId("huron's-marauders", 'chaos-space-marines', index)).toBe(
      'chaos-space-marines:huron-s-marauders',
    )
  })

  it('strips a faction name baked into the front of the slug', () => {
    // Real values seen in prod exports.
    expect(resolveDetachmentId('t’au-empire-mont’ka', 'tau-empire', index)).toBe(
      'tau-empire:mont-ka',
    )
    expect(resolveDetachmentId('t’au-empire-retaliation-cadre', 'tau-empire', index)).toBe(
      'tau-empire:retaliation-cadre',
    )
    expect(
      resolveDetachmentId(
        'emperor’s-children-coterie-of-the-conceited',
        'emperors-children',
        index,
      ),
    ).toBe('emperors-children:coterie-of-the-conceited')
  })

  it('strips trailing battle-size and force-disposition noise', () => {
    expect(resolveDetachmentId('shield-host-strike-force', 'adeptus-custodes', index)).toBe(
      'adeptus-custodes:shield-host',
    )
    expect(
      resolveDetachmentId(
        'emperor’s-children-coterie-of-the-conceited-force-dispositions:-purge-the-foe',
        'emperors-children',
        index,
      ),
    ).toBe('emperors-children:coterie-of-the-conceited')
  })

  it('is scoped by faction — never matches another faction detachment', () => {
    expect(resolveDetachmentId('hallowed-martyrs', 'tau-empire', index)).toBeNull()
  })

  it('returns null for a detachment dim_detachment does not have', () => {
    // "Steel Hammer" / "Armoured Speartip" show up in real lists but are not
    // in the dim table — must be reported, not guessed at.
    expect(resolveDetachmentId('steel-hammer', 'tau-empire', index)).toBeNull()
    expect(resolveDetachmentId('armoured-speartip', 'adeptus-custodes', index)).toBeNull()
  })

  it('returns null for an unknown faction', () => {
    expect(resolveDetachmentId('shield-host', 'not-a-faction', index)).toBeNull()
  })
})

describe('extractDetachment', () => {
  it('prefers detachmentId, falls back to detachmentName', () => {
    expect(extractDetachment(JSON.stringify({ list: { detachmentId: 'shield-host' } }))).toBe(
      'shield-host',
    )
    expect(extractDetachment(JSON.stringify({ list: { detachmentName: 'Shield Host' } }))).toBe(
      'Shield Host',
    )
  })

  it('returns null when there is no detachment or the blob is not JSON', () => {
    expect(extractDetachment(JSON.stringify({ list: {} }))).toBeNull()
    expect(extractDetachment('not json')).toBeNull()
  })
})

describe('backfillDetachmentsFromLists', () => {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)

  beforeAll(async () => {
    await client.executeMultiple(`
      CREATE TABLE dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL);
      CREATE TABLE dim_detachment (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT);
      CREATE TABLE meta_events (id TEXT PRIMARY KEY, name TEXT NOT NULL, date INTEGER NOT NULL, format TEXT NOT NULL, player_count INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT, imported_at INTEGER NOT NULL);
      CREATE TABLE meta_event_players (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, player_name TEXT NOT NULL, faction_id TEXT NOT NULL, detachment_id TEXT, placement INTEGER NOT NULL, list_ttt TEXT, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0);
      INSERT INTO dim_faction VALUES ('tau-empire','T''au Empire','xenos'),('drukhari','Drukhari','xenos');
      INSERT INTO dim_detachment VALUES
        ('tau-empire:mont-ka','Mont''ka','tau-empire',NULL),
        ('drukhari:reaper-s-wager','Reaper''s Wager','drukhari',NULL);
      INSERT INTO meta_events VALUES ('ev1','Event One',1780000000000,'GT',20,'bcp','src1',1780000000000);
    `)

    const ok = (detachment: string) =>
      JSON.stringify({ parseStatus: 'ok', list: { detachmentId: detachment } })

    await client.executeMultiple(`
      INSERT INTO meta_event_players (id,event_id,player_name,faction_id,detachment_id,placement,list_ttt) VALUES
        ('p1','ev1','A','tau-empire',NULL,1,'${ok('t’au-empire-mont’ka').replace(/'/g, "''")}'),
        ('p2','ev1','B','drukhari',NULL,2,'${ok("reaper's-wager").replace(/'/g, "''")}'),
        ('p3','ev1','C','tau-empire',NULL,3,'${ok('steel-hammer').replace(/'/g, "''")}'),
        ('p4','ev1','D','tau-empire',NULL,4,'${JSON.stringify({ parseStatus: 'ok', list: {} }).replace(/'/g, "''")}');
    `)
  })

  afterAll(() => client.close())

  it('resolves what it can, reports what it cannot, and returns touched events', async () => {
    const res = await backfillDetachmentsFromLists(db)

    expect(res.scanned).toBe(4)
    expect(res.updated).toBe(2)
    expect(res.noDetachmentInList).toBe(1)
    expect(res.unmatched).toEqual([{ raw: 'steel-hammer', factionId: 'tau-empire', count: 1 }])
    expect(res.eventIds).toEqual(['ev1'])

    const rows = (await db.all(
      sql`SELECT id, detachment_id FROM meta_event_players ORDER BY id`,
    )) as unknown as Array<{ id: string; detachment_id: string | null }>
    expect(rows.find((r) => r.id === 'p1')!.detachment_id).toBe('tau-empire:mont-ka')
    expect(rows.find((r) => r.id === 'p2')!.detachment_id).toBe('drukhari:reaper-s-wager')
    expect(rows.find((r) => r.id === 'p3')!.detachment_id).toBeNull()
  })

  it('is idempotent — a second pass finds nothing left to do', async () => {
    const res = await backfillDetachmentsFromLists(db)
    expect(res.updated).toBe(0)
  })
})
