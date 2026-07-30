import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  backfillDetachmentsFromLists,
  buildDetachmentIndex,
  compactKey,
  type DetachmentDim,
  extractDeclaredDetachments,
  resolveDeclaredDetachments,
  resolveDetachmentExact,
  resolveDetachmentId,
  splitDetachmentNames,
} from './meta-detachment-backfill'
import { enumerateLegalCombos, loadDetachmentsWithDp, upsertCombos } from './meta-detachment-combos'

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
  // THE TRAP: a single detachment whose real name contains "and". Splitting it
  // invents two detachments that do not exist.
  {
    id: 'adepta-sororitas:penitents-and-pilgrims',
    name: 'Penitents and Pilgrims',
    factionId: 'adepta-sororitas',
  },
  { id: 'necrons:cursed-legion', name: 'Cursed Legion', factionId: 'necrons' },
  {
    id: 'necrons:skyshroud-spearhead',
    name: 'Skyshroud Spearhead',
    factionId: 'necrons',
  },
  { id: 'tau-empire:kauyon', name: 'Kauyon', factionId: 'tau-empire' },
  {
    id: 'tau-empire:advanced-acquisition-cadre',
    name: 'Advanced Acquisition Cadre',
    factionId: 'tau-empire',
  },
  { id: 'adeptus-custodes:silent-hunters', name: 'Silent Hunters', factionId: 'adeptus-custodes' },
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

describe('splitDetachmentNames', () => {
  it('splits on the conjunctions 11e exports use', () => {
    expect(splitDetachmentNames('Cursed Legion and Skyshroud Spearhead')).toEqual([
      'Cursed Legion',
      'Skyshroud Spearhead',
    ])
    expect(splitDetachmentNames('Shield Host, Silent Hunters')).toEqual([
      'Shield Host',
      'Silent Hunters',
    ])
    // Slug form, which is all some old blobs carry.
    expect(splitDetachmentNames('cursed-legion-and-skyshroud-spearhead')).toEqual([
      'cursed-legion',
      'skyshroud-spearhead',
    ])
  })

  it('leaves a single name alone', () => {
    expect(splitDetachmentNames('Gladius Task Force')).toEqual(['Gladius Task Force'])
    expect(splitDetachmentNames('   ')).toEqual([])
  })
})

// Every input below is a verbatim meta_event_players.list_ttt detachmentName
// value from prod. The old parser dumped everything after the faction and
// subfaction into detachmentName, so 2,109 of 6,000 sampled values carry
// newlines and 1,163 carry a "Force Dispositions" line — all of which contain
// their own "and"s and commas that a naive split would treat as detachments.
describe('extractDeclaredDetachments', () => {
  const blob = (list: Record<string, unknown>) => JSON.stringify({ parseStatus: 'ok', list })

  it('takes the declaration line and the DP total, dropping the list body', () => {
    const d = extractDeclaredDetachments(
      blob({
        factionId: 'necrons',
        factionName: 'Necrons',
        detachmentName:
          'Cursed Legion and Skyshroud Spearhead (3 Detachment Points)\nReconnaissance\n\nAttached Units\nAttached Unit 1\n\nLokhust Lord (90 points)',
      }),
    )
    expect(d.declared).toBe('Cursed Legion and Skyshroud Spearhead')
    expect(d.parts).toEqual(['Cursed Legion', 'Skyshroud Spearhead'])
    expect(d.declaredDp).toBe(3)
  })

  it('skips a leading faction-name line and finds the declaration below it', () => {
    const d = extractDeclaredDetachments(
      blob({
        factionId: 'tau-empire',
        factionName: 'T’au Empire',
        detachmentName:
          'T’au Empire\nAdvanced Acquisition Cadre and Kauyon \n(3 Detachment Points)\nForce Disposition: Priority Assets\n\n\nATTACHED UNITS\n\nEthereal (50 Points)',
      }),
    )
    expect(d.declared).toBe('Advanced Acquisition Cadre and Kauyon')
    expect(d.parts).toEqual(['Advanced Acquisition Cadre', 'Kauyon'])
    expect(d.declaredDp).toBe(3)
  })

  it('handles a comma-joined pair with no DP marker', () => {
    const d = extractDeclaredDetachments(
      blob({ factionId: 'adeptus-custodes', detachmentName: 'Shield Host, Silent Hunters' }),
    )
    expect(d.declared).toBe('Shield Host, Silent Hunters')
    expect(d.parts).toEqual(['Shield Host', 'Silent Hunters'])
    expect(d.declaredDp).toBeNull()
  })

  it('strips a Force Dispositions tail sharing the declaration line', () => {
    const d = extractDeclaredDetachments(
      blob({
        factionId: 'chaos-daemons',
        detachmentName: 'Blood Legion Force Dispositions: Purge the Foe, Reconnaissance',
      }),
    )
    // Without the strip, "Purge the Foe" and "Reconnaissance" become bogus
    // detachments — they are mission picks, not detachments.
    expect(d.declared).toBe('Blood Legion')
    expect(d.parts).toEqual(['Blood Legion'])
  })

  it('skips a faction header line using the caller faction when the blob lacks one', () => {
    // Measured: only 46 of 400 sampled tau blobs carry list.factionId, so the
    // faction to strip has to come from the meta_event_players row.
    const d = extractDeclaredDetachments(
      blob({
        detachmentName:
          'T’au Empire\n\nAdvanced Acquisition Cadre and Retaliation Cadre (3 Detachment Points)\nReconnaissance',
      }),
      { factionId: 'tau-empire', factionNames: ['T’au Empire'] },
    )
    expect(d.declared).toBe('Advanced Acquisition Cadre and Retaliation Cadre')
    expect(d.parts).toEqual(['Advanced Acquisition Cadre', 'Retaliation Cadre'])
  })

  it('strips a chapter name glued to the front of the declaration', () => {
    // Real value, 69 rows: no separator between the subfaction and the
    // detachment. Without the strip the whole thing resolves to nothing.
    const d = extractDeclaredDetachments(
      blob({ detachmentName: 'Space WolvesSaga of the Great Wolf (3 Detachment Points)' }),
      { factionId: 'space-marines', factionNames: ['Space Wolves', 'Space Marines (Astartes)'] },
    )
    expect(d.declared).toBe('Saga of the Great Wolf')
  })

  it('prefers the parser detachments array when the blob has one', () => {
    const d = extractDeclaredDetachments(
      blob({
        factionId: 'necrons',
        detachmentName: 'Cursed Legion',
        detachments: [
          { id: 'cursed-legion', name: 'Cursed Legion' },
          { id: 'skyshroud-spearhead', name: 'Skyshroud Spearhead' },
        ],
        detachmentPoints: 3,
      }),
    )
    expect(d.parts).toEqual(['Cursed Legion', 'Skyshroud Spearhead'])
    // detachmentName holds only the PRIMARY once the array exists, so the
    // full-string candidate is rebuilt from the members.
    expect(d.declared).toBe('Cursed Legion and Skyshroud Spearhead')
    expect(d.declaredDp).toBe(3)
  })

  it('returns nothing when the list named no detachment', () => {
    expect(extractDeclaredDetachments(blob({ factionId: 'orks' })).declared).toBeNull()
    expect(extractDeclaredDetachments('not json').declared).toBeNull()
    // DP marker with nothing before it — no declaration to read.
    expect(
      extractDeclaredDetachments(
        blob({ factionId: 'orks', detachmentName: '(3 Detachment Points)\nTake and Hold' }),
      ).declared,
    ).toBeNull()
  })
})

describe('parent-faction fallback', () => {
  // The marine chapters are BOTH a dim_faction row and a dim_subfaction of
  // space-marines, and dim_detachment keeps the shared marine detachments only
  // under space-marines (46 rows vs dark-angels' 3). A Dark Angels army taking
  // Gladius Task Force is legal and common, so resolution has to reach the
  // parent faction's detachments — measured 1,500 unresolved rows before this,
  // dominated by exactly that.
  const marineIndex = buildDetachmentIndex(
    [
      {
        id: 'space-marines:gladius-task-force',
        name: 'Gladius Task Force',
        factionId: 'space-marines',
      },
      {
        id: 'space-marines:librarius-conclave',
        name: 'Librarius Conclave',
        factionId: 'space-marines',
      },
      {
        id: 'dark-angels:unforgiven-task-force',
        name: 'Unforgiven Task Force',
        factionId: 'dark-angels',
      },
    ],
    { parents: new Map([['dark-angels', 'space-marines']]) },
  )

  it('resolves a parent-faction detachment for a subfaction army', () => {
    expect(resolveDetachmentId('Gladius Task Force', 'dark-angels', marineIndex)).toBe(
      'space-marines:gladius-task-force',
    )
  })

  it('still prefers the subfaction own detachments', () => {
    expect(resolveDetachmentId('Unforgiven Task Force', 'dark-angels', marineIndex)).toBe(
      'dark-angels:unforgiven-task-force',
    )
  })

  it('does not leak a subfaction detachment up to the parent', () => {
    expect(resolveDetachmentId('Unforgiven Task Force', 'space-marines', marineIndex)).toBeNull()
  })

  it('resolves a mixed own + parent pair as a two-detachment combo', () => {
    const r = resolveDeclaredDetachments(
      {
        declared: 'Librarius Conclave and Unforgiven Task Force',
        parts: ['Librarius Conclave', 'Unforgiven Task Force'],
        declaredDp: 3,
      },
      'dark-angels',
      marineIndex,
    )
    expect(r.ids).toEqual(['space-marines:librarius-conclave', 'dark-angels:unforgiven-task-force'])
  })
})

describe('resolveDetachmentExact', () => {
  it('refuses the prefix fallback that resolveDetachmentId allows', () => {
    // resolveDetachmentId matches a prefix so trailing noise resolves...
    expect(resolveDetachmentId('shield-host-strike-force', 'adeptus-custodes', index)).toBe(
      'adeptus-custodes:shield-host',
    )
    // ...but the full-string check must not, or "Cursed Legion and Skyshroud
    // Spearhead" would match "Cursed Legion" and the second detachment would be
    // silently dropped.
    expect(resolveDetachmentExact('shield-host-strike-force', 'adeptus-custodes', index)).toBeNull()
  })

  it('still tolerates the apostrophe and faction-prefix mismatches', () => {
    expect(resolveDetachmentExact("reaper's-wager", 'drukhari', index)).toBe(
      'drukhari:reaper-s-wager',
    )
    expect(resolveDetachmentExact('t’au-empire-mont’ka', 'tau-empire', index)).toBe(
      'tau-empire:mont-ka',
    )
  })
})

describe('resolveDeclaredDetachments', () => {
  const declare = (declared: string) => ({
    declared,
    parts: splitDetachmentNames(declared),
    declaredDp: null,
  })

  it('resolves a real name containing "and" as ONE detachment', () => {
    const r = resolveDeclaredDetachments(
      declare('Penitents and Pilgrims'),
      'adepta-sororitas',
      index,
    )
    expect(r.ids).toEqual(['adepta-sororitas:penitents-and-pilgrims'])
    expect(r.unresolved).toEqual([])
  })

  it('resolves a two-detachment declaration to both members', () => {
    const r = resolveDeclaredDetachments(
      declare('Cursed Legion and Skyshroud Spearhead'),
      'necrons',
      index,
    )
    expect(r.ids).toEqual(['necrons:cursed-legion', 'necrons:skyshroud-spearhead'])
    expect(r.unresolved).toEqual([])
  })

  it('keeps what resolves and reports the rest', () => {
    const r = resolveDeclaredDetachments(
      declare('Shield Host and Armoured Speartip'),
      'adeptus-custodes',
      index,
    )
    expect(r.ids).toEqual(['adeptus-custodes:shield-host'])
    expect(r.unresolved).toEqual(['Armoured Speartip'])
  })

  it('deduplicates a detachment written twice', () => {
    const r = resolveDeclaredDetachments(declare('Kauyon and Kauyon'), 'tau-empire', index)
    expect(r.ids).toEqual(['tau-empire:kauyon'])
  })

  it('segments a pair where one member own name contains "and"', () => {
    // Real value, 60 rows: "Legends of Saga and Song" is ONE Space Wolves
    // detachment and "Saga of the Beastslayer" is another. A flat split yields
    // ["Legends of Saga", "Song", "Saga of the Beastslayer"] — two names that do
    // not exist plus one that does, so the row would record a single wrong
    // detachment. Only covering the string with registry entries gets this right.
    const swIndex = buildDetachmentIndex(
      [
        {
          id: 'space-wolves:legends-of-saga-and-song',
          name: 'Legends of Saga and Song',
          factionId: 'space-wolves',
          dp: 1,
        },
        {
          id: 'space-marines:saga-of-the-beastslayer',
          name: 'Saga of the Beastslayer',
          factionId: 'space-marines',
          dp: 2,
        },
      ],
      { parents: new Map([['space-wolves', 'space-marines']]) },
    )
    const declared = 'Legends of Saga and Song and Saga of the Beastslayer'
    const r = resolveDeclaredDetachments(
      { declared, parts: splitDetachmentNames(declared), declaredDp: 3 },
      'space-wolves',
      swIndex,
    )
    expect(r.ids).toEqual([
      'space-wolves:legends-of-saga-and-song',
      'space-marines:saga-of-the-beastslayer',
    ])
    expect(r.unresolved).toEqual([])
  })

  it('falls back to the split when the registry cannot cover the string', () => {
    // "Armoured Speartip" is not in this index, so no segmentation covers the
    // whole declaration and the per-part path has to run.
    const r = resolveDeclaredDetachments(
      {
        declared: 'Shield Host and Armoured Speartip',
        parts: ['Shield Host', 'Armoured Speartip'],
        declaredDp: null,
      },
      'adeptus-custodes',
      index,
    )
    expect(r.ids).toEqual(['adeptus-custodes:shield-host'])
    expect(r.unresolved).toEqual(['Armoured Speartip'])
  })

  it('reports the whole declaration when nothing in it resolves', () => {
    const r = resolveDeclaredDetachments(declare('Steel Hammer'), 'tau-empire', index)
    expect(r.ids).toEqual([])
    expect(r.unresolved).toEqual(['Steel Hammer'])
  })
})

describe('backfillDetachmentsFromLists', () => {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)

  beforeAll(async () => {
    await applyTestSchema(client)
    await seedReferenceDims(client)
    await client.executeMultiple(`
      INSERT INTO dim_faction VALUES
        ('tau-empire','T''au Empire','xenos'),
        ('drukhari','Drukhari','xenos'),
        ('necrons','Necrons','xenos'),
        ('adepta-sororitas','Adepta Sororitas','imperium');
      INSERT INTO dim_detachment (id, name, faction_id, subfaction_id, dp) VALUES
        ('tau-empire:mont-ka','Mont''ka','tau-empire',NULL,3),
        ('tau-empire:kauyon','Kauyon','tau-empire',NULL,1),
        ('tau-empire:advanced-acquisition-cadre','Advanced Acquisition Cadre','tau-empire',NULL,2),
        ('drukhari:reaper-s-wager','Reaper''s Wager','drukhari',NULL,3),
        ('necrons:cursed-legion','Cursed Legion','necrons',NULL,2),
        ('necrons:skyshroud-spearhead','Skyshroud Spearhead','necrons',NULL,1),
        ('adepta-sororitas:penitents-and-pilgrims','Penitents and Pilgrims','adepta-sororitas',NULL,3);
      INSERT INTO meta_events
        (id, name, date, format, player_count, source, source_id, imported_at)
        VALUES ('ev1','Event One',1780000000000,'GT',20,'bcp','src1',1780000000000);
    `)

    // Seed the legal combos the way prod has them — enumerated from the DP
    // rules ahead of any list being read. The backfill should reuse these, not
    // mint duplicates.
    await upsertCombos(db, enumerateLegalCombos(await loadDetachmentsWithDp(db)), true)

    const q = (s: string) => s.replace(/'/g, "''")
    // Old-shape blob: the pre-array parser put the raw declaration (and often
    // the whole list body) in detachmentName.
    const old = (detachmentName: string, factionId: string) =>
      q(JSON.stringify({ parseStatus: 'ok', list: { factionId, detachmentName } }))

    await client.executeMultiple(`
      INSERT INTO meta_event_players (id,event_id,player_name,faction_id,detachment_id,placement,list_ttt) VALUES
        ('p1','ev1','A','tau-empire',NULL,1,'${old('t’au-empire-mont’ka', 'tau-empire')}'),
        ('p2','ev1','B','drukhari',NULL,2,'${old("reaper's-wager", 'drukhari')}'),
        ('p3','ev1','C','tau-empire',NULL,3,'${old('steel-hammer', 'tau-empire')}'),
        ('p4','ev1','D','tau-empire',NULL,4,'${q(JSON.stringify({ parseStatus: 'ok', list: {} }))}'),
        ('p5','ev1','E','necrons',NULL,5,'${old('Cursed Legion and Skyshroud Spearhead (3 Detachment Points)\nReconnaissance\n\nAttached Units\nLokhust Lord (90 points)', 'necrons')}'),
        ('p6','ev1','F','adepta-sororitas',NULL,6,'${old('Penitents and Pilgrims (3 Detachment Points)\nTake and Hold', 'adepta-sororitas')}'),
        ('p7','ev1','G','tau-empire',NULL,7,'${old('Mont’ka and Kauyon (3 Detachment Points)', 'tau-empire')}'),
        ('p8','ev1','H','necrons','necrons:cursed-legion',8,'${old('Cursed Legion and Skyshroud Spearhead (3 Detachment Points)', 'necrons')}'),
        ('p9','ev1','I','tau-empire',NULL,9,'${old('Kauyon and Steel Hammer (2 Detachment Points)', 'tau-empire')}');
    `)
  })

  afterAll(() => client.close())

  it('resolves what it can, reports what it cannot, and returns touched events', async () => {
    const res = await backfillDetachmentsFromLists(db)

    // p8 already has a detachment_id from the old single-detachment model and
    // must still be processed — the work unit is a MISSING combo_id, not a
    // missing detachment_id.
    expect(res.scanned).toBe(9)
    expect(res.updated).toBe(7)
    expect(res.noDetachmentInList).toBe(1) // p4
    expect(res.multiDetachment).toBe(3) // p5, p7, p8
    // The declared DP total disagreeing with the members' costs is the signal a
    // split went wrong: p7 declared 3 but Mont'ka + Kauyon cost 4, and p9
    // declared 2 while only a 1 DP detachment resolved.
    expect(res.dpMismatch).toBe(2) // p7, p9
    expect(res.eventIds).toEqual(['ev1'])
    // "Steel Hammer" is not in dim_detachment — reported from both the row that
    // named only it (p3) and the row that named it alongside a real one (p9).
    expect(res.unmatched.map((u) => u.raw).sort()).toEqual(['Steel Hammer', 'steel-hammer'])

    const rows = (await db.all(
      sql`SELECT id, detachment_id, combo_id FROM meta_event_players ORDER BY id`,
    )) as unknown as Array<{ id: string; detachment_id: string | null; combo_id: string | null }>
    const byId = new Map(rows.map((r) => [r.id, r]))

    // detachment_id keeps holding the position-1 detachment.
    expect(byId.get('p1')).toMatchObject({
      detachment_id: 'tau-empire:mont-ka',
      combo_id: 'tau-empire:mont-ka',
    })
    expect(byId.get('p5')).toMatchObject({
      detachment_id: 'necrons:cursed-legion',
      combo_id: 'necrons:cursed-legion+skyshroud-spearhead',
    })
    // THE TRAP: one detachment whose name contains "and", not two.
    expect(byId.get('p6')).toMatchObject({
      detachment_id: 'adepta-sororitas:penitents-and-pilgrims',
      combo_id: 'adepta-sororitas:penitents-and-pilgrims',
    })
    // Partial resolution still records the half that resolved.
    expect(byId.get('p9')).toMatchObject({
      detachment_id: 'tau-empire:kauyon',
      combo_id: 'tau-empire:kauyon',
    })
    expect(byId.get('p3')!.combo_id).toBeNull()
    expect(byId.get('p4')!.combo_id).toBeNull()
  })

  it('writes one bridge row per detachment with its position and cost', async () => {
    const bridge = (await db.all(sql`
      SELECT player_id, detachment_id, position, detachment_points
      FROM meta_event_player_detachment ORDER BY player_id, position
    `)) as unknown as Array<{
      player_id: string
      detachment_id: string
      position: number
      detachment_points: number | null
    }>

    expect(bridge.filter((b) => b.player_id === 'p5')).toEqual([
      {
        player_id: 'p5',
        detachment_id: 'necrons:cursed-legion',
        position: 1,
        detachment_points: 2,
      },
      {
        player_id: 'p5',
        detachment_id: 'necrons:skyshroud-spearhead',
        position: 2,
        detachment_points: 1,
      },
    ])
    // One row for the "and"-named detachment, not two.
    expect(bridge.filter((b) => b.player_id === 'p6')).toHaveLength(1)
    // Nothing written for rows that resolved nothing.
    expect(bridge.filter((b) => b.player_id === 'p3' || b.player_id === 'p4')).toEqual([])
    expect(bridge).toHaveLength(10)
  })

  it('reuses enumerated combos and records an observed illegal one', async () => {
    // p7 brought Mont'ka (3 DP) + Kauyon (1 DP) = 4 DP, over the Strike Force
    // budget, so enumeration never produced it. It still needs a row for p7's
    // combo_id to point at — recorded with is_legal = 0 rather than dropped.
    const combos = (await db.all(sql`
      SELECT id, member_count, total_dp, is_legal FROM dim_detachment_combo
      WHERE id IN ('tau-empire:kauyon+mont-ka','necrons:cursed-legion+skyshroud-spearhead')
      ORDER BY id
    `)) as unknown as Array<{
      id: string
      member_count: number
      total_dp: number | null
      is_legal: number
    }>
    expect(combos).toEqual([
      {
        id: 'necrons:cursed-legion+skyshroud-spearhead',
        member_count: 2,
        total_dp: 3,
        is_legal: 1,
      },
      { id: 'tau-empire:kauyon+mont-ka', member_count: 2, total_dp: 4, is_legal: 0 },
    ])

    // The membership bridge is filled for the observed-illegal combo too, so
    // "every combo containing Kauyon" stays answerable without parsing ids.
    const members = (await db.all(sql`
      SELECT detachment_id FROM dim_detachment_combo_member
      WHERE combo_id = 'tau-empire:kauyon+mont-ka' ORDER BY detachment_id
    `)) as unknown as Array<{ detachment_id: string }>
    expect(members.map((m) => m.detachment_id)).toEqual(['tau-empire:kauyon', 'tau-empire:mont-ka'])
  })

  it('advances the cursor past unresolvable rows instead of re-reading them', async () => {
    // p3 ("steel-hammer") can never resolve, so it keeps combo_id NULL and a
    // bare LIMIT would return it on every pass forever. Walk with the cursor
    // one row at a time and confirm each pass sees a NEW row.
    const seen: string[] = []
    let afterId: string | undefined
    for (let i = 0; i < 10; i++) {
      const r = await backfillDetachmentsFromLists(db, { limit: 1, afterId, dryRun: true })
      if (r.scanned === 0) break
      expect(r.lastId).not.toBeNull()
      expect(seen).not.toContain(r.lastId!)
      seen.push(r.lastId!)
      afterId = r.lastId!
    }
    // Each remaining row visited exactly once, in ascending id order, and the
    // walk terminates. With a bare LIMIT, `seen` would be ['p3','p3','p3',...].
    expect(seen).toEqual(['p3', 'p4'])
  })

  it('writes a chunk in a bounded number of round trips, not one per statement', async () => {
    // Turso latency dominates this backfill: a statement-per-round-trip pass
    // over 10,056 players extrapolated to 5+ hours (measured: 216 players in
    // ~7 minutes). The writes for a whole chunk go in one batch instead.
    const fresh = createClient({ url: ':memory:' })
    const freshDb = createDbFromClient(fresh)
    await applyTestSchema(fresh)
    await seedReferenceDims(fresh)
    await fresh.executeMultiple(`
      INSERT INTO dim_faction VALUES ('necrons','Necrons','xenos');
      INSERT INTO dim_detachment (id, name, faction_id, subfaction_id, dp) VALUES
        ('necrons:cursed-legion','Cursed Legion','necrons',NULL,2),
        ('necrons:skyshroud-spearhead','Skyshroud Spearhead','necrons',NULL,1);
      INSERT INTO dim_detachment_combo (id, faction_id, member_count, total_dp, is_legal)
        VALUES ('necrons:cursed-legion+skyshroud-spearhead','necrons',2,3,1);
      INSERT INTO meta_events
        (id, name, date, format, player_count, source, source_id, imported_at)
        VALUES ('ev2','Event Two',1780000000000,'GT',20,'bcp','src2',1780000000000);
    `)
    const blob = JSON.stringify({
      parseStatus: 'ok',
      list: { factionId: 'necrons', detachmentName: 'Cursed Legion and Skyshroud Spearhead' },
    }).replace(/'/g, "''")
    const values = Array.from(
      { length: 12 },
      (_, i) => `('q${i}','ev2','P${i}','necrons',NULL,${i + 1},'${blob}')`,
    ).join(',')
    await fresh.executeMultiple(`
      INSERT INTO meta_event_players
        (id,event_id,player_name,faction_id,detachment_id,placement,list_ttt) VALUES ${values};
    `)

    // Count at the real network boundary — the libSQL client. Counting drizzle's
    // db.run() would measure nothing, since a batched run() is a lazy statement
    // builder rather than a request.
    let roundTrips = 0
    const countingClient = new Proxy(fresh, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (prop === 'execute' || prop === 'batch') {
          return (...args: unknown[]) => {
            roundTrips++
            return (value as (...a: unknown[]) => unknown).apply(target, args)
          }
        }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })

    const res = await backfillDetachmentsFromLists(createDbFromClient(countingClient), {
      limit: 12,
    })
    expect(res.updated).toBe(12)
    expect(res.detachmentRows).toBe(24)
    // 12 players would be 36 statements written one at a time. Reads (dims,
    // subfactions, names, combos, the page itself) plus ONE write batch is the
    // budget — well under a per-statement floor.
    expect(roundTrips).toBeLessThanOrEqual(8)

    const bridge = await freshDb.all(sql`SELECT * FROM meta_event_player_detachment`)
    expect(bridge).toHaveLength(24)
    fresh.close()
  })

  it('is idempotent — a second pass finds nothing left to do', async () => {
    const res = await backfillDetachmentsFromLists(db)
    expect(res.updated).toBe(0)
    const [{ n }] = (await db.all(
      sql`SELECT COUNT(*) AS n FROM meta_event_player_detachment`,
    )) as unknown as Array<{ n: number }>
    expect(n).toBe(10)
  })
})
