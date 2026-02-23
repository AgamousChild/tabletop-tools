export type SwissPlayer = {
  id: string
  displayName: string
  wins: number
  losses: number
  draws: number
  margin: number
  strengthOfSchedule: number
  registeredAt: number
}

export type PreviousPairing = {
  player1Id: string
  player2Id: string | null
}

export type GeneratedPairing = {
  player1Id: string
  player2Id: string
  tableNumber: number
}

export type PairingResult = {
  pairings: GeneratedPairing[]
  bye: string | null
}

function sortPlayers(players: SwissPlayer[]): SwissPlayer[] {
  return [...players].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.margin !== a.margin) return b.margin - a.margin
    if (b.strengthOfSchedule !== a.strengthOfSchedule) return b.strengthOfSchedule - a.strengthOfSchedule
    return a.registeredAt - b.registeredAt
  })
}

function havePlayed(a: string, b: string, prev: PreviousPairing[]): boolean {
  return prev.some(
    (p) =>
      (p.player1Id === a && p.player2Id === b) ||
      (p.player1Id === b && p.player2Id === a),
  )
}

function groupByRecord(players: SwissPlayer[]): SwissPlayer[][] {
  const groups = new Map<string, SwissPlayer[]>()
  for (const p of players) {
    const key = `${p.wins}-${p.losses}-${p.draws}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }
  // Return groups sorted by wins desc
  return [...groups.values()].sort((a, b) => b[0].wins - a[0].wins)
}

function pairGroup(
  group: SwissPlayer[],
  prev: PreviousPairing[],
  tableStart: number,
): { paired: GeneratedPairing[]; unpaired: SwissPlayer[]; nextTable: number } {
  const paired: GeneratedPairing[] = []
  const used = new Set<string>()
  const remaining = [...group]

  const half = Math.floor(remaining.length / 2)

  for (let i = 0; i < half; i++) {
    const top = remaining[i]
    if (used.has(top.id)) continue

    // Try to pair top with half+i
    let paired_with: SwissPlayer | null = null

    // Try the natural swiss opponent first (top-half vs bottom-half)
    const naturalOpponent = remaining[half + i]
    if (naturalOpponent && !used.has(naturalOpponent.id) && !havePlayed(top.id, naturalOpponent.id, prev)) {
      paired_with = naturalOpponent
    }

    // If not possible, search for an adjacent swap
    if (!paired_with) {
      for (let j = half; j < remaining.length; j++) {
        const candidate = remaining[j]
        if (used.has(candidate.id)) continue
        if (!havePlayed(top.id, candidate.id, prev)) {
          paired_with = candidate
          break
        }
      }
    }

    // If still no match found — allow rematch (unavoidable)
    if (!paired_with) {
      for (let j = half; j < remaining.length; j++) {
        const candidate = remaining[j]
        if (!used.has(candidate.id)) {
          paired_with = candidate
          break
        }
      }
    }

    if (paired_with) {
      used.add(top.id)
      used.add(paired_with.id)
      paired.push({
        player1Id: top.id,
        player2Id: paired_with.id,
        tableNumber: tableStart + paired.length,
      })
    }
  }

  const unpaired = remaining.filter((p) => !used.has(p.id))
  return { paired, unpaired, nextTable: tableStart + paired.length }
}

export function generatePairings(players: SwissPlayer[], prev: PreviousPairing[]): PairingResult {
  if (players.length === 0) return { pairings: [], bye: null }
  if (players.length === 1) return { pairings: [], bye: players[0].id }

  const sorted = sortPlayers(players)

  // If odd players, remove the lowest-ranked for a bye
  let byePlayer: SwissPlayer | null = null
  let active = sorted

  if (sorted.length % 2 !== 0) {
    byePlayer = sorted[sorted.length - 1]
    active = sorted.slice(0, sorted.length - 1)
  }

  const groups = groupByRecord(active)

  const allPaired: GeneratedPairing[] = []
  let tableNumber = 1
  let overflow: SwissPlayer[] = []

  for (const group of groups) {
    const combined = [...overflow, ...group]
    const { paired, unpaired, nextTable } = pairGroup(combined, prev, tableNumber)
    allPaired.push(...paired)
    tableNumber = nextTable
    overflow = unpaired
  }

  // If there are still unpaired players from overflow (shouldn't happen normally), force-pair them
  if (overflow.length >= 2) {
    for (let i = 0; i < overflow.length - 1; i += 2) {
      allPaired.push({
        player1Id: overflow[i].id,
        player2Id: overflow[i + 1].id,
        tableNumber: tableNumber++,
      })
    }
  }

  return {
    pairings: allPaired,
    bye: byePlayer?.id ?? null,
  }
}
