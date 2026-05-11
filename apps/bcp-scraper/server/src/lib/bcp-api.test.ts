import { describe, it, expect, vi } from 'vitest'
import { BcpApiClient } from './bcp-api'

const BASE_URL = 'https://newprod-api.bestcoastpairings.com'

function mockFetchOk(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  })
}

function mockFetchError(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message: 'Something went wrong' }),
  })
}

describe('BcpApiClient', () => {
  describe('searchEvents', () => {
    it('builds correct URL with query params and sends auth header', async () => {
      const rawEvent = {
        id: 'evt-1',
        name: 'GT Finals',
        dates: { start: '2026-01-10', end: '2026-01-12' },
        location: { city: 'Austin', state: 'TX', country: 'US', point: { latitude: 30.2, longitude: -97.7 } },
        status: { numberOfRounds: 6, started: true, ended: true },
        playerCounts: { total: 128 },
        format: { teamEvent: false },
      }
      const mockFetch = mockFetchOk({ data: [rawEvent] })
      const client = new BcpApiClient('my-token', mockFetch)

      const events = await client.searchEvents({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        minPlayers: 20,
        minRounds: 5,
      })

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({
        id: 'evt-1',
        name: 'GT Finals',
        startDate: '2026-01-10',
        endDate: '2026-01-12',
        city: 'Austin',
        state: 'TX',
        country: 'US',
        latitude: 30.2,
        longitude: -97.7,
        rounds: 6,
        playerCount: 128,
        isTeamEvent: false,
      })

      const [url, opts] = mockFetch.mock.calls[0]!
      expect(url).toBe(
        `${BASE_URL}/v1/events?gameSystemId=WGMSzfKFYA&startDate=2026-01-01&endDate=2026-01-31&numberOfPlayers=20&numberOfRounds=5&sortAsc=false&eventStatus=ended&sortKey=eventDate`,
      )
      expect(opts.headers['authorization']).toBe('Bearer my-token')
      expect(opts.headers['client-id']).toBe('web-app')
      expect(opts.headers['env']).toBe('bcp')
      expect(opts.headers['content-type']).toBe('application/json')
    })
  })

  describe('getEvent', () => {
    it('calls v2 endpoint and maps response', async () => {
      const rawEvent = {
        id: 'evt-2',
        name: 'Local RTT',
        dates: { start: '2026-03-01', end: '2026-03-01' },
        location: { city: 'Portland', state: 'OR', country: 'US' },
        status: { numberOfRounds: 3, started: true, ended: true },
        playerCounts: { total: 24 },
        format: { teamEvent: false },
      }
      const mockFetch = mockFetchOk(rawEvent)
      const client = new BcpApiClient('my-token', mockFetch)

      const event = await client.getEvent('evt-2')

      expect(event).toEqual({
        id: 'evt-2',
        name: 'Local RTT',
        startDate: '2026-03-01',
        endDate: '2026-03-01',
        city: 'Portland',
        state: 'OR',
        country: 'US',
        latitude: undefined,
        longitude: undefined,
        rounds: 3,
        playerCount: 24,
        isTeamEvent: false,
      })

      const [url] = mockFetch.mock.calls[0]!
      expect(url).toBe(`${BASE_URL}/v2/events/evt-2`)
    })
  })

  describe('getPairings', () => {
    it('fetches pairings for a round and maps player names', async () => {
      const rawPairing = {
        round: 2,
        table: 5,
        player1: {
          user: { firstName: 'John', lastName: 'Doe' },
          faction: 'Aeldari',
          listId: 'list-abc',
        },
        player2: {
          user: { firstName: 'Jane', lastName: 'Smith' },
          faction: 'Space Marines',
          listId: null,
        },
        player1Game: { result: 2, points: 85 },
        player2Game: { result: 0, points: 60 },
      }
      const mockFetch = mockFetchOk({ active: [rawPairing] })
      const client = new BcpApiClient('my-token', mockFetch)

      const pairings = await client.getPairings('evt-1', 2)

      expect(pairings).toHaveLength(1)
      expect(pairings[0]).toEqual({
        round: 2,
        table: 5,
        player1: { name: 'John Doe', faction: 'Aeldari', listId: 'list-abc' },
        player2: { name: 'Jane Smith', faction: 'Space Marines', listId: undefined },
        player1Game: { result: 2, points: 85 },
        player2Game: { result: 0, points: 60 },
      })

      const [url, opts] = mockFetch.mock.calls[0]!
      expect(url).toBe(
        `${BASE_URL}/v1/events/evt-1/pairings?eventId=evt-1&round=2&pairingType=Pairing`,
      )
      expect(opts.headers['authorization']).toBe('Bearer my-token')
    })
  })

  describe('error handling', () => {
    it('throws on non-OK response from searchEvents', async () => {
      const client = new BcpApiClient('bad-token', mockFetchError(401))
      await expect(client.searchEvents({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        minPlayers: 20,
        minRounds: 5,
      })).rejects.toThrow('BCP API error 401')
    })

    it('throws on non-OK response from getEvent', async () => {
      const client = new BcpApiClient('token', mockFetchError(404))
      await expect(client.getEvent('bad-id')).rejects.toThrow('BCP API error 404')
    })

    it('throws on non-OK response from getPairings', async () => {
      const client = new BcpApiClient('token', mockFetchError(500))
      await expect(client.getPairings('evt-1', 1)).rejects.toThrow('BCP API error 500')
    })
  })
})
