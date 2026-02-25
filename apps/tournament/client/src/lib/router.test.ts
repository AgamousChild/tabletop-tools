import { describe, it, expect } from 'vitest'
import { parseHash } from './router'

describe('parseHash', () => {
  it('returns list view for empty hash', () => {
    expect(parseHash('')).toEqual({ view: 'list' })
  })

  it('returns list view for #/', () => {
    expect(parseHash('#/')).toEqual({ view: 'list' })
  })

  it('returns create view for #/create', () => {
    expect(parseHash('#/create')).toEqual({ view: 'create' })
  })

  it('returns tournament view with id', () => {
    expect(parseHash('#/tournament/abc')).toEqual({ view: 'tournament', id: 'abc' })
  })

  it('returns tournament-standings view', () => {
    expect(parseHash('#/tournament/abc/standings')).toEqual({ view: 'tournament-standings', id: 'abc' })
  })

  it('returns tournament-register view', () => {
    expect(parseHash('#/tournament/abc/register')).toEqual({ view: 'tournament-register', id: 'abc' })
  })

  it('returns round view with both IDs', () => {
    expect(parseHash('#/tournament/abc/round/r1')).toEqual({
      view: 'round',
      tournamentId: 'abc',
      roundId: 'r1',
    })
  })
})
