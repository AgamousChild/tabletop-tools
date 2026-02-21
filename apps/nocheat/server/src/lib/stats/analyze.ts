import { chiSquaredGoodnessOfFit } from 'simple-statistics'

const FACES = [1, 2, 3, 4, 5, 6]
const EXPECTED_FREQ = 1 / FACES.length // ~0.1667 per face

// Confidence thresholds (total individual pip readings)
const LOW_THRESHOLD = 30
const HIGH_THRESHOLD = 60

// A z-score at or above this value on any single face triggers the loaded flag.
// Corresponds to ~p < 0.012 one-tailed — conservative enough to avoid false positives.
const Z_THRESHOLD = 2.5

export type AnalysisResult = {
  zScore: number            // worst-case z-score across all faces
  isLoaded: boolean
  confidence: 'low' | 'medium' | 'high'
  outlierFace: number       // face (1–6) with the highest deviation; 0 if insufficient data
  observedRate: number      // observed proportion for the outlier face; 0 if insufficient data
}

/**
 * Analyse a set of dice rolls for evidence of loaded dice.
 *
 * @param rolls  Array of rolls; each roll is an array of pip values captured
 *               in one photo (e.g. [3, 5, 2] if three dice were in frame).
 */
export function analyze(rolls: number[][]): AnalysisResult {
  // Flatten all pip values from all rolls into one array
  const pips = rolls.flat()
  const n = pips.length

  const confidence = n < LOW_THRESHOLD ? 'low' : n < HIGH_THRESHOLD ? 'medium' : 'high'

  // Not enough data to make a determination
  if (n < LOW_THRESHOLD) {
    return { zScore: 0, isLoaded: false, confidence, outlierFace: 0, observedRate: 0 }
  }

  // Count observed frequency per face
  const counts = Object.fromEntries(FACES.map((f) => [f, 0])) as Record<number, number>
  for (const pip of pips) {
    if (pip >= 1 && pip <= 6) counts[pip]++
  }

  // Compute z-score per face: (observed proportion - expected proportion) / std error
  // std error = sqrt(p * (1-p) / n)
  const stdErr = Math.sqrt(EXPECTED_FREQ * (1 - EXPECTED_FREQ) / n)
  const zScores = FACES.map((f) => {
    const observed = counts[f] / n
    return (observed - EXPECTED_FREQ) / stdErr
  })

  // Worst-case (most extreme) z-score across all faces
  const absZScores = zScores.map(Math.abs)
  const maxZ = Math.max(...absZScores)
  const outlierIdx = absZScores.indexOf(maxZ)
  const outlierFace = FACES[outlierIdx]!
  const observedRate = counts[outlierFace] / n

  // Also run a chi-squared goodness-of-fit test as a secondary check
  const observedCounts = FACES.map((f) => counts[f])
  const expectedCounts = FACES.map(() => n * EXPECTED_FREQ)
  let chiSquaredP: number
  try {
    chiSquaredP = chiSquaredGoodnessOfFit(observedCounts, expectedCounts, 5)
  } catch {
    chiSquaredP = 1
  }

  // Loaded if either: any face z-score is extreme, or chi-squared p < 0.05
  const isLoaded = maxZ >= Z_THRESHOLD || chiSquaredP < 0.05

  return {
    zScore: Math.round(maxZ * 100) / 100,
    isLoaded,
    confidence,
    outlierFace,
    observedRate: Math.round(observedRate * 1000) / 1000,
  }
}
