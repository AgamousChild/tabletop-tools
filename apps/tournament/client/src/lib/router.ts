import { useState, useEffect, useCallback } from 'react'

export type Route =
  | { view: 'list' }
  | { view: 'create' }
  | { view: 'play' }
  | { view: 'my-info' }
  | { view: 'search-lists' }
  | { view: 'search-players' }
  | { view: 'tournament'; id: string }
  | { view: 'tournament-standings'; id: string }
  | { view: 'tournament-register'; id: string }
  | { view: 'tournament-manage'; id: string }
  | { view: 'round'; tournamentId: string; roundId: string }

export function parseHash(hash: string): Route {
  if (hash === '#/create') return { view: 'create' }
  if (hash === '#/play') return { view: 'play' }
  if (hash === '#/my-info') return { view: 'my-info' }
  if (hash === '#/search/lists') return { view: 'search-lists' }
  if (hash === '#/search/players') return { view: 'search-players' }

  const tournamentMatch = hash.match(/^#\/tournament\/([^/]+)(?:\/(.+))?$/)
  if (tournamentMatch) {
    const id = tournamentMatch[1]!
    const sub = tournamentMatch[2]
    if (sub === 'standings') return { view: 'tournament-standings', id }
    if (sub === 'register') return { view: 'tournament-register', id }
    if (sub === 'manage') return { view: 'tournament-manage', id }
    if (sub?.startsWith('round/')) {
      return { view: 'round', tournamentId: id, roundId: sub.slice('round/'.length) }
    }
    return { view: 'tournament', id }
  }

  return { view: 'list' }
}

export function navigate(hash: string) {
  window.location.hash = hash
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  const onHashChange = useCallback(() => {
    setRoute(parseHash(window.location.hash))
  }, [])

  useEffect(() => {
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [onHashChange])

  return route
}
