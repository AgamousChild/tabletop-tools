import { describe, expect, it } from 'vitest'

import {
  listMissionCardImages,
  PRIMARY_CARDS_BY_DECK,
  PRIMARY_DECKS,
  SECONDARY_CARDS,
} from './mission-card-urls'

describe('mission-card-urls inventory', () => {
  it('lists 5 decks of 5 primary cards each', () => {
    expect(PRIMARY_DECKS).toHaveLength(5)
    for (const deck of PRIMARY_DECKS) {
      expect(PRIMARY_CARDS_BY_DECK[deck]).toHaveLength(5)
    }
  })

  it('lists 18 secondary cards', () => {
    expect(SECONDARY_CARDS).toHaveLength(18)
  })

  it('enumerates fronts + backs for primaries and both sides for secondaries', () => {
    const images = listMissionCardImages()
    const primaryFronts = images.filter((i) => i.kind === 'primary' && !i.back)
    const primaryBacks = images.filter((i) => i.kind === 'primary' && i.back)
    const secondaryAtk = images.filter((i) => i.kind === 'secondary' && i.group === 'attacker')
    const secondaryDef = images.filter((i) => i.kind === 'secondary' && i.group === 'defender')
    const fd = images.filter((i) => i.kind === 'force-disposition')

    expect(primaryFronts).toHaveLength(25)
    expect(primaryBacks).toHaveLength(25) // queued; downloader tolerates 404s
    expect(secondaryAtk).toHaveLength(18)
    expect(secondaryDef).toHaveLength(18)
    expect(fd).toHaveLength(5)
  })

  it('builds URLs against gdmissions.app', () => {
    const images = listMissionCardImages()
    for (const img of images) {
      expect(img.url).toMatch(/^https:\/\/gdmissions\.app\/assets\/11th\//)
      expect(img.url).toMatch(/\.png$/)
    }
  })
})
