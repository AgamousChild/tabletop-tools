import { createClient } from '@libsql/client'
import { createRequestHelper, TEST_SECRET, TEST_USER } from '@tabletop-tools/auth/src/test-helpers'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { buildCubeForEvents } from '@tabletop-tools/server-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer } from '../server.js'

/**
 * Everything on the faction page must belong to the selected meta window.
 *
 * Two of its queries did not filter by frame at all. The top-lists query
 * selected on faction alone, and the timeline pulled every Month frame in the
 * database — so a page scoped to one quarter led with a tournament from two
 * years earlier and drew a chart spanning the entire dataset.
 *
 * The fixture is deliberately split across frames: one event inside 2026 Q3 and
 * one well outside it, with the out-of-frame event holding the BETTER placement
 * so an unfiltered query is guaranteed to surface it first.
 */
const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)
const makeRequest = createRequestHelper(() => createServer(db, [TEST_USER.email], TEST_SECRET))

const IN_FRAME = Date.UTC(2026, 6, 15) // 2026-07-15, inside Q3
const OUT_OF_FRAME = Date.UTC(2024, 10, 15) // 2024-11-15, two years earlier

interface FactionResponse {
  stat: { faction: string } | null
  timeline: Array<{ week: string; games: number }>
  topLists: Array<{
    playerName: string
    eventName: string
    eventDate: number
    listTtt: { list: { units: Array<{ name: string }> } } | null
    listText: string | null
  }>
}

async function faction(frame?: string): Promise<FactionResponse> {
  const input = JSON.stringify(frame ? { factionId: 'necrons', frame } : { factionId: 'necrons' })
  const res = await makeRequest(`/trpc/meta.faction?input=${encodeURIComponent(input)}`, {
    method: 'GET',
  })
  expect(res.status).toBe(200)
  const json = (await res.json()) as { result: { data: FactionResponse } }
  return json.result.data
}

beforeAll(async () => {
  await applyTestSchema(client)
  await seedReferenceDims(client)

  const parsedList = JSON.stringify({
    version: 1,
    parsedWith: 'gw-app-v1',
    parseStatus: 'ok',
    meta: { name: 'Recent List', totalPoints: 2000, edition: '11th', battleSize: 'Strike Force' },
    list: {
      factionId: 'necrons',
      factionName: 'Necrons',
      units: [{ name: 'Overlord', role: 'Character', models: 1, points: 90, wargear: [] }],
    },
  })

  await client.executeMultiple(`
    INSERT INTO dim_faction VALUES ('necrons','Necrons','xenos');
    INSERT INTO meta_events (id, name, date, format, player_count, source, source_id, imported_at)
      VALUES
      ('ev-old','Ancient Open ${2024}',${OUT_OF_FRAME},'GT',2,'bcp','old',${OUT_OF_FRAME}),
      ('ev-new','Recent Open 2026',${IN_FRAME},'GT',2,'bcp','new',${IN_FRAME});
    INSERT INTO meta_event_players
      (id, event_id, player_name, faction_id, placement, wins, losses, draws, list_text, list_ttt)
      VALUES
      ('old1','ev-old','AncientWinner','necrons',1,3,0,0,'raw old text',NULL),
      ('old2','ev-old','AncientRunnerUp','necrons',2,0,3,0,NULL,NULL),
      ('new1','ev-new','RecentWinner','necrons',4,3,0,0,'raw new text',NULL),
      ('new2','ev-new','RecentRunnerUp','necrons',5,0,3,0,NULL,NULL);
  `)

  // Bound, not interpolated — the parse is JSON full of double quotes.
  await client.execute({
    sql: `UPDATE meta_event_players SET list_ttt = ? WHERE id = 'new1'`,
    args: [parsedList],
  })

  const pairings: string[] = []
  for (let i = 1; i <= 3; i++) {
    pairings.push(`('po${i}','ev-old',${i},'old1','old2',90,50,'old1')`)
    pairings.push(`('pn${i}','ev-new',${i},'new1','new2',90,50,'new1')`)
  }
  await client.executeMultiple(`
    INSERT INTO meta_pairings
      (id, event_id, round, player1_id, player2_id, player1_score, player2_score, result)
      VALUES ${pairings.join(',')};
  `)

  await buildCubeForEvents(db, ['ev-old', 'ev-new'])
})

afterAll(() => client.close())

describe('meta.faction frame scoping', () => {
  it('excludes top lists from events outside the selected frame', async () => {
    const res = await faction('quarter:2026:3')

    const events = res.topLists.map((l) => l.eventName)
    expect(events).toContain('Recent Open 2026')
    // The 2024 entries place 1st and 2nd; an unfiltered ORDER BY placement puts
    // them at the top of the list. They must not appear at all.
    expect(events).not.toContain('Ancient Open 2024')
    for (const list of res.topLists) {
      expect(list.eventDate).toBeGreaterThanOrEqual(IN_FRAME)
    }
  })

  it('returns the out-of-frame lists when that frame is the one selected', async () => {
    const res = await faction('quarter:2024:4')
    const events = res.topLists.map((l) => l.eventName)
    expect(events).toContain('Ancient Open 2024')
    expect(events).not.toContain('Recent Open 2026')
  })

  it('confines the timeline to the selected frame', async () => {
    const res = await faction('quarter:2026:3')
    expect(res.timeline.length).toBeGreaterThan(0)
    // Q3 2026 is July–September. A 2024 month in here is the old all-frames bug.
    for (const point of res.timeline) {
      expect(point.week >= '2026-07-01' && point.week <= '2026-09-30').toBe(true)
    }
  })

  it('serves the stored parse so the client never has to render the raw blob', async () => {
    const res = await faction('quarter:2026:3')
    const winner = res.topLists.find((l) => l.playerName === 'RecentWinner')
    expect(winner!.listTtt).not.toBeNull()
    expect(winner!.listTtt!.list.units[0]!.name).toBe('Overlord')
  })

  it('reports no parse rather than a failed one, so the client falls back to raw', async () => {
    // A stored parse with parseStatus "failed" carries no units — handing it to
    // the list renderer would show an empty army instead of the raw text.
    await client.execute(
      `UPDATE meta_event_players SET list_ttt = '{"parseStatus":"failed","meta":{},"list":{"units":[]}}' WHERE id = 'new1'`,
    )
    const res = await faction('quarter:2026:3')
    const winner = res.topLists.find((l) => l.playerName === 'RecentWinner')
    expect(winner!.listTtt).toBeNull()
    expect(winner!.listText).toBe('raw new text')

    await client.execute(`UPDATE meta_event_players SET list_ttt = NULL WHERE id = 'new1'`)
  })
})
