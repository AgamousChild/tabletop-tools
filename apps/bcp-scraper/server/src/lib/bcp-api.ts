const BASE_URL = 'https://newprod-api.bestcoastpairings.com'
const GAME_SYSTEM_ID = 'WGMSzfKFYA'

export interface BcpEvent {
  id: string
  name: string
  startDate: string
  endDate: string
  city?: string
  state?: string
  country?: string
  latitude?: number
  longitude?: number
  rounds: number
  playerCount: number
  isTeamEvent: boolean
}

export interface BcpPairing {
  round: number
  table: number
  player1: { name: string; faction: string; listId?: string }
  player2: { name: string; faction: string; listId?: string }
  player1Game: { result: number; points: number } | null
  player2Game: { result: number; points: number } | null
}

interface BcpEventRaw {
  id: string
  name: string
  dates: { start: string; end: string }
  location?: {
    city?: string
    state?: string
    country?: string
    point?: { latitude: number; longitude: number }
  }
  status: { numberOfRounds: number; started: boolean; ended: boolean }
  playerCounts: { total: number }
  format: { teamEvent: boolean }
}

interface BcpPairingRaw {
  round: number
  table: number
  player1: {
    user: { firstName: string; lastName: string }
    faction: string
    listId?: string | null
  }
  player2: {
    user: { firstName: string; lastName: string }
    faction: string
    listId?: string | null
  }
  player1Game: { result: number; points: number }
  player2Game: { result: number; points: number }
}

function mapEvent(raw: BcpEventRaw): BcpEvent {
  return {
    id: raw.id,
    name: raw.name,
    startDate: raw.dates.start,
    endDate: raw.dates.end,
    city: raw.location?.city,
    state: raw.location?.state,
    country: raw.location?.country,
    latitude: raw.location?.point?.latitude,
    longitude: raw.location?.point?.longitude,
    rounds: raw.status.numberOfRounds,
    playerCount: raw.playerCounts.total,
    isTeamEvent: raw.format.teamEvent,
  }
}

function mapPairing(raw: BcpPairingRaw): BcpPairing | null {
  // Skip BYEs (no player2)
  if (!raw.player1 || !raw.player2) return null

  return {
    round: raw.round,
    table: raw.table,
    player1: {
      name: `${raw.player1.user?.firstName || ''} ${raw.player1.user?.lastName || ''}`.trim(),
      faction: raw.player1.faction || '',
      listId: raw.player1.listId ?? undefined,
    },
    player2: {
      name: `${raw.player2.user?.firstName || ''} ${raw.player2.user?.lastName || ''}`.trim(),
      faction: raw.player2.faction || '',
      listId: raw.player2.listId ?? undefined,
    },
    player1Game: raw.player1Game
      ? { result: raw.player1Game.result, points: raw.player1Game.points }
      : null,
    player2Game: raw.player2Game
      ? { result: raw.player2Game.result, points: raw.player2Game.points }
      : null,
  }
}

export class BcpApiClient {
  private token: string
  private fetch: typeof globalThis.fetch

  constructor(token: string, fetchFn?: typeof globalThis.fetch) {
    this.token = token
    this.fetch = fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  }

  private headers(auth: boolean): Record<string, string> {
    const h: Record<string, string> = {
      'client-id': 'web-app',
      env: 'bcp',
      'content-type': 'application/json',
    }
    if (auth) {
      h['authorization'] = `Bearer ${this.token}`
    }
    return h
  }

  private async request<T>(url: string, auth: boolean): Promise<T> {
    const resp = await this.fetch(url, { headers: this.headers(auth) })
    if (!resp.ok) {
      throw new Error(`BCP API error ${resp.status}`)
    }
    return resp.json() as Promise<T>
  }

  async searchEvents(params: {
    startDate: string
    endDate: string
    minPlayers: number
    minRounds: number
  }): Promise<BcpEvent[]> {
    // Exact URL format captured from BCP website network requests
    const qs = new URLSearchParams({
      limit: '40',
      sortAscending: 'false',
      sortKey: 'eventDate',
      startDate: `${params.startDate}T00:00:00Z`,
      endDate: `${params.endDate}T00:00:00Z`,
      gameSystemId: GAME_SYSTEM_ID,
      numberOfRounds: String(params.minRounds),
      numberOfPlayers: String(params.minPlayers),
    })
    const data = await this.request<{ data: BcpEventRaw[] }>(`${BASE_URL}/v2/events?${qs}`, true)
    return data.data.map(mapEvent)
  }

  async getEvent(eventId: string): Promise<BcpEvent> {
    const raw = await this.request<BcpEventRaw>(`${BASE_URL}/v2/events/${eventId}`, true)
    return mapEvent(raw)
  }

  async getPairings(eventId: string, round: number): Promise<BcpPairing[]> {
    const qs = new URLSearchParams({
      eventId,
      round: String(round),
      pairingType: 'Pairing',
    })
    const data = await this.request<{ active: BcpPairingRaw[] }>(
      `${BASE_URL}/v1/events/${eventId}/pairings?${qs}`,
      true,
    )
    return data.active.map(mapPairing).filter((p): p is BcpPairing => p !== null)
  }
}
