# apps/new-meta/client/src/App.tsx

> Hash-routed SPA — NO auth gate. new-meta is publicly viewable (meta queries don't require auth).

## Prompt

Write the root App component with hash-based routing. Unlike other apps, new-meta does NOT wrap content in AuthScreen — meta analytics are public. Auth is only needed for the admin import page (handled by the admin router's adminProcedure).

### Hash routes

```typescript
type Page =
  | { id: 'dashboard' }
  | { id: 'faction'; faction: string }
  | { id: 'players' }
  | { id: 'player'; playerId: string }
  | { id: 'source' }
  | { id: 'tournament'; importId: string }
  | { id: 'admin' }
```

`parseHash(hash)`: Decode from `#/faction/{encoded}`, `#/player/{id}`, `#/players`, `#/tournament/{id}`, `#/source`, `#/admin`. Default: dashboard.

### Navigation bar

Fixed `<nav>` with tabs: Meta (dashboard), Players, Source Data, Admin. Active tab highlighted. "NEW META" brand in amber. Home link with house icon.

Below nav: one-line description text.

### Page rendering

Switch on `page.id` to render: `Dashboard`, `FactionDetail`, `PlayerRanking`, `PlayerProfile`, `SourceData`, `TournamentDetail`, `Admin`. Each page receives relevant props + navigation callbacks.

### Navigation function

Export `navigate(hash: string)` that sets `window.location.hash`. Used by child pages for links.

## Dependencies

- `react` — `useState`, `useEffect`, `useCallback`
- `@tabletop-tools/ui` — `HelpTip`
- All page components from `./pages/`
