/**
 * Derive the unit type designation from keywords.
 * Priority hierarchy — most specific wins. No "Other".
 *
 * CANONICAL SOURCE: apps/brain/shared/derive-unit-type.ts
 * This is a local copy for tsx CLI compatibility (build-graph.ts).
 * tsx cannot resolve imports outside the server's rootDir.
 * Keep in sync with the shared file.
 */
export function deriveUnitType(keywords: string[]): string {
  const kw = new Set(keywords.map(k => k.toLowerCase()))
  const has = (k: string) => kw.has(k)

  if (has('epic hero')) return 'Epic Hero'
  if (has('imperial knights')) return 'Imperial Knight'
  if (has('chaos knights')) return 'Chaos Knight'
  if (has('daemon') && (has('vehicle') || has('walker') || has('dreadnought'))) return 'Daemon Engine'
  if (has('daemon')) return 'Daemon'
  if (has('dreadknight')) return 'Dreadknight'
  if (has('dreadnought')) return 'Dreadnought'
  if (has('battlesuit')) return 'Battlesuit'
  if (has('monster')) return 'Monster'
  if (has('towering')) return 'Towering'
  if (has('walker')) return 'Walker'
  if (has('vehicle')) return 'Vehicle'
  if (has('beast') || has('beasts')) return 'Beast'
  if (has('fortification')) return 'Fortification'
  if (has('mounted') && !has('character')) return 'Mounted'
  if (has('battleline')) return 'Battleline'
  if (has('swarm')) return 'Swarm'
  if (has('character')) return 'Character'
  if (has('infantry')) return 'Infantry'

  return ''
}
