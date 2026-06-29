import { describe, expect, it } from 'vitest'

import { DEPLOYMENT_ZONE_SLUGS, matchZoneSlug, parseDeploymentZones } from './deployment-zones'

// Synthetic OCR sidecar: real GW reference sheet OCR mangles T/L/I and
// inserts garbage lines between names. Fixture below mimics that pattern
// without reproducing real OCR output.
const SYNTHETIC_OCR_INPUT = `
HAMMER AND ANVIT

TIPPING PtIINT

IIANV 0NU UII^ll,,lUH

SWEEPING ENGAGEMENT

DAWN t]F WAR

SEARCH AND DESTROY

CRUCIBTE ()F BATTTE
`

describe('matchZoneSlug', () => {
  it('matches clean names', () => {
    expect(matchZoneSlug('HAMMER AND ANVIL')).toBe('hammer-and-anvil')
    expect(matchZoneSlug('Dawn of War')).toBe('dawn-of-war')
  })

  it('tolerates OCR T↔L confusion (Hammer and Anvit)', () => {
    expect(matchZoneSlug('HAMMER AND ANVIT')).toBe('hammer-and-anvil')
  })

  it('tolerates OCR garbage characters in the middle (Crucibte of Battte)', () => {
    expect(matchZoneSlug('CRUCIBTE ()F BATTTE')).toBe('crucible-of-battle')
  })

  it('returns null for non-matching lines', () => {
    expect(matchZoneSlug('completely unrelated text')).toBeNull()
    expect(matchZoneSlug('z: C, :e :c m')).toBeNull()
  })
})

describe('parseDeploymentZones', () => {
  it('emits one node per recognized zone slug', () => {
    const result = parseDeploymentZones(SYNTHETIC_OCR_INPUT, {
      retrievedAt: '2026-06-29T00:00:00Z',
    })
    expect(result.recognized.sort()).toEqual([...DEPLOYMENT_ZONE_SLUGS].sort())
    expect(result.nodes).toHaveLength(6)
    expect(result.missing).toEqual([])
  })

  it('uses placeholder content when no bodyBySlug is provided', () => {
    const result = parseDeploymentZones(SYNTHETIC_OCR_INPUT)
    expect(result.bodyPlaceholderUsed).toBe(true)
    for (const node of result.nodes) {
      expect(node.content).toContain('Body text for this Deployment Zone card has not yet')
      expect(node.category).toBe('deployment-zone')
      expect(node.edition).toBe('11th')
      expect(node.id).toMatch(/^ca11:deployment-zone:/)
    }
  })

  it('uses provided bodyBySlug when present', () => {
    const result = parseDeploymentZones(SYNTHETIC_OCR_INPUT, {
      bodyBySlug: new Map([
        ['hammer-and-anvil', 'Synthetic rules text for hammer-and-anvil deployment.'],
      ]),
    })
    const hammer = result.nodes.find((n) => n.id === 'ca11:deployment-zone:hammer-and-anvil')!
    expect(hammer.content).toBe('Synthetic rules text for hammer-and-anvil deployment.')
    // Other zones still have placeholder.
    expect(result.bodyPlaceholderUsed).toBe(true)
  })

  it('reports missing slugs when input lacks them', () => {
    const result = parseDeploymentZones('HAMMER AND ANVIL\nDAWN OF WAR')
    expect(result.recognized.sort()).toEqual(['dawn-of-war', 'hammer-and-anvil'])
    expect(result.missing).toHaveLength(DEPLOYMENT_ZONE_SLUGS.length - 2)
  })

  it('tags nodes consistently', () => {
    const result = parseDeploymentZones(SYNTHETIC_OCR_INPUT)
    for (const node of result.nodes) {
      expect(node.layer).toBe('core')
      expect(node.category).toBe('deployment-zone')
      expect(node.edition).toBe('11th')
      expect(node.sources[0]!.type).toBe('community')
      expect(node.keywords).toContain('deployment zone')
      expect(node.keywords).toContain('11th edition')
    }
  })
})
