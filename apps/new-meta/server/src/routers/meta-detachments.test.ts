import { createClient } from '@libsql/client'
import { createRequestHelper, TEST_SECRET, TEST_USER } from '@tabletop-tools/auth/src/test-helpers'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer } from '../server.js'

/**
 * 11e armies take MULTIPLE detachments. meta_event_players.detachment_id and
 * fact_game_results.detachment_id hold only the PRIMARY (position 1) one, so
 * anything that reads them alone silently under-reports every detachment that
 * tends to be written second — measured on prod, Warptide showed 0 games
 * against 328 real ones and Skyshroud Spearhead 5 against 358.
 *
 * The fixture below reproduces exactly that shape: Cursed Legion is always
 * written first, Skyshroud Spearhead always second.
 */
const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)
// Driven over HTTP, matching server.test.ts — the app's routers are typed
// against server-core's BaseContext while its procedures use the local
// Context, so an in-process caller cannot be typed without restructuring
// trpc.ts. The HTTP path exercises the real stack anyway.
const makeRequest = createRequestHelper(() => createServer(db, [TEST_USER.email], TEST_SECRET))

interface FactionResponse {
  detachments: Array<{ detachmentId: string; games: number; winRate: number }>
  combos: Array<{
    comboId: string
    members: string
    memberCount: number
    totalDp: number | null
    games: number
    winRate: number
    players: number
  }>
  topLists: Array<{ playerName: string; detachment: string }>
}

async function faction(factionId: string): Promise<FactionResponse> {
  const res = await makeRequest(
    `/trpc/meta.faction?input=${encodeURIComponent(JSON.stringify({ factionId }))}`,
    { method: 'GET' },
  )
  expect(res.status).toBe(200)
  const json = (await res.json()) as { result: { data: FactionResponse } }
  return json.result.data
}

beforeAll(async () => {
  await applyTestSchema(client)
  await seedReferenceDims(client)
  await client.executeMultiple(`
    INSERT INTO dim_faction VALUES ('necrons','Necrons','xenos');
    INSERT INTO dim_detachment (id, name, faction_id, subfaction_id, dp) VALUES
      ('necrons:cursed-legion','Cursed Legion','necrons',NULL,2),
      ('necrons:skyshroud-spearhead','Skyshroud Spearhead','necrons',NULL,1),
      ('necrons:obeisance-phalanx','Obeisance Phalanx','necrons',NULL,3);
    INSERT INTO dim_detachment_combo (id, faction_id, member_count, total_dp, is_legal) VALUES
      ('necrons:cursed-legion+skyshroud-spearhead','necrons',2,3,1),
      ('necrons:obeisance-phalanx','necrons',1,3,1);
    INSERT INTO dim_detachment_combo_member (combo_id, detachment_id) VALUES
      ('necrons:cursed-legion+skyshroud-spearhead','necrons:cursed-legion'),
      ('necrons:cursed-legion+skyshroud-spearhead','necrons:skyshroud-spearhead'),
      ('necrons:obeisance-phalanx','necrons:obeisance-phalanx');
    INSERT INTO meta_events (id, name, date, format, player_count, source, source_id, imported_at)
      VALUES ('ev1','Event One',1780000000000,'GT',2,'bcp','src1',1780000000000);
    INSERT INTO meta_event_players
      (id, event_id, player_name, faction_id, detachment_id, combo_id, placement, wins, losses, draws)
      VALUES
      ('p1','ev1','Alice','necrons','necrons:cursed-legion','necrons:cursed-legion+skyshroud-spearhead',1,3,0,0),
      ('p2','ev1','Bob','necrons','necrons:obeisance-phalanx','necrons:obeisance-phalanx',2,0,3,0);
    INSERT INTO meta_event_player_detachment (player_id, detachment_id, position, detachment_points)
      VALUES
      ('p1','necrons:cursed-legion',1,2),
      ('p1','necrons:skyshroud-spearhead',2,1),
      ('p2','necrons:obeisance-phalanx',1,3);
  `)

  // 6 games for Alice's two-detachment army (all wins), 6 for Bob's single.
  const facts: string[] = []
  for (let i = 0; i < 6; i++) {
    facts.push(
      `('fa${i}','ev1','p1','p2',${i + 1},'necrons','necrons:cursed-legion','necrons:cursed-legion+skyshroud-spearhead',1.0)`,
    )
    facts.push(
      `('fb${i}','ev1','p2','p1',${i + 1},'necrons','necrons:obeisance-phalanx','necrons:obeisance-phalanx',0.0)`,
    )
  }
  await client.executeMultiple(`
    INSERT INTO fact_game_results
      (id, event_id, player_id, opponent_id, round, faction_id, detachment_id, combo_id, result)
      VALUES ${facts.join(',')};
  `)
})

afterAll(() => client.close())

describe('meta.faction detachment reporting', () => {
  it('counts a detachment written SECOND, which the primary-only column hides', async () => {
    const res = await faction('necrons')
    const byId = new Map(res.detachments.map((d) => [d.detachmentId, d]))

    // Skyshroud Spearhead is never the primary — it is position 2 in every one
    // of Alice's games. Reading fact_game_results.detachment_id would report 0.
    const skyshroud = byId.get('necrons:skyshroud-spearhead')
    expect(skyshroud).toBeDefined()
    expect(skyshroud!.games).toBe(6)
    expect(skyshroud!.winRate).toBe(1)

    // Its partner is counted for the same games, not double-counted.
    expect(byId.get('necrons:cursed-legion')!.games).toBe(6)
    expect(byId.get('necrons:obeisance-phalanx')!.games).toBe(6)
  })

  it('reports the combination as one army, not as its parts', async () => {
    const res = await faction('necrons')
    const pair = res.combos.find((c) => c.comboId === 'necrons:cursed-legion+skyshroud-spearhead')

    expect(pair).toBeDefined()
    expect(pair!.memberCount).toBe(2)
    expect(pair!.totalDp).toBe(3)
    expect(pair!.members).toBe('Cursed Legion + Skyshroud Spearhead')
    // Six games for the ARMY — the grain is one row per player per game, so a
    // two-detachment army must not count as twelve.
    expect(pair!.games).toBe(6)
    expect(pair!.winRate).toBe(1)
    expect(pair!.players).toBe(1)

    const single = res.combos.find((c) => c.comboId === 'necrons:obeisance-phalanx')
    expect(single!.memberCount).toBe(1)
    expect(single!.games).toBe(6)
  })

  it('labels a top list with every detachment it brought, in written order', async () => {
    const res = await faction('necrons')
    const alice = res.topLists.find((l) => l.playerName === 'Alice')
    // Position order, not alphabetical or id order.
    expect(alice!.detachment).toBe('Cursed Legion + Skyshroud Spearhead')

    const bob = res.topLists.find((l) => l.playerName === 'Bob')
    expect(bob!.detachment).toBe('Obeisance Phalanx')
  })
})
