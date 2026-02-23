export type PlayerStandingInput = {
  id: string
  displayName: string
  faction: string
  registeredAt: number
}

export type ResultInput = {
  player1Id: string
  player2Id: string | null
  player1Vp: number
  player2Vp: number
  result: 'P1_WIN' | 'P2_WIN' | 'DRAW' | 'BYE'
}

export type PlayerStanding = {
  rank: number
  id: string
  displayName: string
  faction: string
  wins: number
  losses: number
  draws: number
  totalVP: number
  vpAgainst: number
  margin: number
  strengthOfSchedule: number
}

export function computeStandings(
  players: PlayerStandingInput[],
  results: ResultInput[],
): PlayerStanding[] {
  // Build per-player record
  const record = new Map<
    string,
    { wins: number; losses: number; draws: number; totalVP: number; vpAgainst: number; opponents: string[] }
  >()

  for (const p of players) {
    record.set(p.id, { wins: 0, losses: 0, draws: 0, totalVP: 0, vpAgainst: 0, opponents: [] })
  }

  for (const r of results) {
    const p1 = record.get(r.player1Id)
    if (!p1) continue

    if (r.result === 'BYE') {
      p1.wins += 1
      // bye contributes 0 VP to margin
      continue
    }

    const p2 = r.player2Id ? record.get(r.player2Id) : undefined

    p1.totalVP += r.player1Vp
    p1.vpAgainst += r.player2Vp
    if (p2) {
      p2.totalVP += r.player2Vp
      p2.vpAgainst += r.player1Vp
      if (r.player2Id) {
        p1.opponents.push(r.player2Id)
        p2.opponents.push(r.player1Id)
      }
    }

    if (r.result === 'P1_WIN') {
      p1.wins += 1
      if (p2) p2.losses += 1
    } else if (r.result === 'P2_WIN') {
      p1.losses += 1
      if (p2) p2.wins += 1
    } else if (r.result === 'DRAW') {
      p1.draws += 1
      if (p2) p2.draws += 1
    }
  }

  // Compute SOS for each player = average win % of all opponents
  const computeSOS = (playerId: string): number => {
    const r = record.get(playerId)
    if (!r || r.opponents.length === 0) return 0
    let total = 0
    for (const oppId of r.opponents) {
      const opp = record.get(oppId)
      if (!opp) continue
      const gamesPlayed = opp.wins + opp.losses + opp.draws
      const winPct = gamesPlayed > 0 ? opp.wins / gamesPlayed : 0
      total += winPct
    }
    return total / r.opponents.length
  }

  // Sort by: wins DESC → margin DESC → SOS DESC → totalVP DESC → registeredAt ASC
  const sorted = [...players].sort((a, b) => {
    const ra = record.get(a.id)!
    const rb = record.get(b.id)!
    const marginA = ra.totalVP - ra.vpAgainst
    const marginB = rb.totalVP - rb.vpAgainst
    const sosA = computeSOS(a.id)
    const sosB = computeSOS(b.id)

    if (rb.wins !== ra.wins) return rb.wins - ra.wins
    if (marginB !== marginA) return marginB - marginA
    if (sosB !== sosA) return sosB - sosA
    if (rb.totalVP !== ra.totalVP) return rb.totalVP - ra.totalVP
    return a.registeredAt - b.registeredAt
  })

  return sorted.map((p, i) => {
    const r = record.get(p.id)!
    return {
      rank: i + 1,
      id: p.id,
      displayName: p.displayName,
      faction: p.faction,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      totalVP: r.totalVP,
      vpAgainst: r.vpAgainst,
      margin: r.totalVP - r.vpAgainst,
      strengthOfSchedule: computeSOS(p.id),
    }
  })
}
