# apps/tournament/client/src/lib/router.ts

> Hash-based client-side routing for bookmarkable tournament URLs.

## Prompt

Write a hash-based routing system for the tournament app. No external router library — just `window.location.hash` + `hashchange` event.

### Route type (discriminated union)

```typescript
type Route =
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
```

### Functions

**`parseHash(hash: string): Route`** — Parse the hash fragment to a Route object. Static routes: `#/create`, `#/play`, `#/my-info`, `#/search/lists`, `#/search/players`. Dynamic route: `#/tournament/{id}` with optional sub-paths `/standings`, `/register`, `/manage`, `/round/{roundId}`. Default: `{ view: 'list' }`.

Use regex: `/^#\/tournament\/([^/]+)(?:\/(.+))?$/` to match tournament routes with optional sub-path.

**`navigate(hash: string)`** — Set `window.location.hash = hash`.

**`useHashRoute(): Route`** — React hook. Initialize state from current hash. Listen to `hashchange` event via `useEffect`. Clean up listener on unmount. Return current route.

## Dependencies

- `react` — `useState`, `useEffect`, `useCallback`
