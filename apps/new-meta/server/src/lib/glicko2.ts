// ============================================================
// Glicko-2 rating system
// Reference: Glickman (2012) — http://www.glicko.net/glicko/glicko2.pdf
//
// Scale constant: SCALE = 173.7178
// Working scale: μ = (r - 1500) / SCALE, φ = RD / SCALE
// System constant: τ = 0.5 (controls volatility change speed)
// ============================================================

const SCALE = 173.7178
const TAU = 0.5
const EPSILON = 0.000001  // convergence criterion for Illinois algorithm

export interface Glicko2Player {
  rating: number          // r — display value, starts 1500
  ratingDeviation: number // RD — starts 350
  volatility: number      // σ — starts 0.06
}

export interface Glicko2Game {
  opponentRating: number
  opponentRD: number
  score: number           // 1 = win, 0.5 = draw, 0 = loss
}

export interface Glicko2Result {
  rating: number
  ratingDeviation: number
  volatility: number
}

/**
 * Update a player's Glicko-2 rating after a period of games.
 * If games is empty, only RD increases (inactivity step).
 */
export function updateGlicko2(player: Glicko2Player, games: Glicko2Game[]): Glicko2Result {
  const mu = toMu(player.rating)
  const phi = toPhi(player.ratingDeviation)
  const sigma = player.volatility

  // Step 2: If no games in this period, only increase RD and return
  if (games.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma)
    return {
      rating: player.rating,
      ratingDeviation: toRD(phiStar),
      volatility: sigma,
    }
  }

  // Step 3: Compute g and E for each opponent
  const gs = games.map((g) => gPhi(toPhi(g.opponentRD)))
  const Es = games.map((g, i) => eScore(mu, toMu(g.opponentRating), toPhi(g.opponentRD), gs[i]!))

  // Step 3: Compute estimated variance v
  let vInv = 0
  for (let i = 0; i < games.length; i++) {
    vInv += gs[i]! * gs[i]! * Es[i]! * (1 - Es[i]!)
  }
  const v = 1 / vInv

  // Step 4: Compute improvement estimate Δ
  let deltaSum = 0
  for (let i = 0; i < games.length; i++) {
    deltaSum += gs[i]! * (games[i]!.score - Es[i]!)
  }
  const delta = v * deltaSum

  // Step 5: Update volatility σ' via Illinois algorithm
  const sigmaPrime = newVolatility(sigma, phi, v, delta)

  // Step 6: Update RD
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime)
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)

  // Step 7: Update rating
  const muPrime = mu + phiPrime * phiPrime * deltaSum

  return {
    rating: toRating(muPrime),
    ratingDeviation: toRD(phiPrime),
    volatility: sigmaPrime,
  }
}

// ---- Internal helpers ----

function toMu(r: number): number {
  return (r - 1500) / SCALE
}

function toPhi(rd: number): number {
  return rd / SCALE
}

function toRating(mu: number): number {
  return SCALE * mu + 1500
}

function toRD(phi: number): number {
  return SCALE * phi
}

/** g(φ) = 1 / sqrt(1 + 3φ²/π²) */
function gPhi(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
}

/** E(μ, μ_j, φ_j) = 1 / (1 + exp(-g(φ_j)(μ - μ_j))) */
function eScore(mu: number, muJ: number, _phiJ: number, gJ: number): number {
  return 1 / (1 + Math.exp(-gJ * (mu - muJ)))
}

/**
 * Illinois algorithm to find new volatility σ'.
 * Finds x such that f(x) = 0 where x = ln(σ'²).
 */
function newVolatility(sigma: number, phi: number, v: number, delta: number): number {
  const a = Math.log(sigma * sigma)

  function f(x: number): number {
    const ex = Math.exp(x)
    const d2 = delta * delta
    const phi2 = phi * phi
    const denom = phi2 + v + ex
    return (
      (ex * (d2 - phi2 - v - ex)) / (2 * denom * denom) - (x - a) / (TAU * TAU)
    )
  }

  // Step 5.2 — find bracket [A, B]
  let A = a
  let B: number
  const d2 = delta * delta
  if (d2 > phi * phi + v) {
    B = Math.log(d2 - phi * phi - v)
  } else {
    let k = 1
    while (f(a - k * TAU) < 0) {
      k++
    }
    B = a - k * TAU
  }

  let fA = f(A)
  let fB = f(B)

  // Illinois iterative root-finding
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)

    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else {
      fA = fA / 2
    }
    B = C
    fB = fC
  }

  return Math.exp(A / 2)
}
