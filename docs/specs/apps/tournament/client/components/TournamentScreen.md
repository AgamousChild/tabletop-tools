# apps/tournament/client/src/components/TournamentScreen.tsx

> Main tournament UI — hash-routed views for list, create, detail, standings, registration, rounds, play, profile, search.

## Prompt

Write the main tournament screen component. This is the largest client component in the app (~800+ lines). It uses `useHashRoute()` to determine which view to show, then renders the appropriate section.

### Props

`onSignOut: () => void`

### Views (by route)

1. **list** — Show user's tournaments (via `trpc.tournament.listMine.useQuery()`) as cards with status badges (DRAFT/REGISTRATION/CHECK_IN/IN_PROGRESS/COMPLETE, each with distinct color). "+ Create Tournament" button.

2. **create** — Form with all tournament creation fields: name, date, format, totalRounds, location, description (markdown preview via `SimpleMarkdown`), image URL, external link, start time, max players. Calls `trpc.tournament.create.useMutation()`.

3. **tournament detail** — Full tournament info card: name, status badge, TO name, date, format, location, description (rendered as markdown), player count, image, external link. Action buttons depend on status:
   - REGISTRATION → "Register" / "View Registered"
   - IN_PROGRESS → "Standings" / round list with clocks
   - COMPLETE → "View Results"
   - If user is TO → "Manage" / "Advance Status" / "Create Round" / "Generate Pairings" / "Close Round"

4. **tournament-standings** — Standings table via `trpc.tournament.standings.useQuery()`. Columns: rank, name, faction, W-L-D, VP margin, SOS.

5. **tournament-register** — Registration form: display name, faction dropdown (from game-data-store factions), detachment, army list text. Calls `trpc.player.register.useMutation()`.

6. **tournament-manage** — Renders `<ManageTournament>` sub-component.

7. **round** — Round detail: pairing table with player names/factions, VP inputs, result badges. Players can report results via `trpc.result.report.useMutation()`. Confirm/dispute buttons.

8. **play** — Tournament search/browse via `trpc.tournament.search.useQuery()`. Filter by status/query.

9. **my-info** — Player profile via `trpc.player.myProfile.useQuery()`. Shows W-L-D, tournaments, ELO, cards, bans.

10. **search-lists** — List search via `trpc.player.searchLists.useQuery()`. Filter by faction.

11. **search-players** — Player search via `trpc.player.searchPlayers.useQuery()`.

### Sub-components defined inline

**`StatusBadge`** — Colored status label (DRAFT=gray, REGISTRATION=amber, CHECK_IN=blue, IN_PROGRESS=green, COMPLETE=slate).

**`RoundClock`** — Live elapsed timer using `useElapsedTime(startTimestamp)` hook with `setInterval(tick, 1000)`. Displays HH:MM:SS.

**`useElapsedTime(startTimestamp)`** — Custom hook that ticks every second and formats elapsed time.

### Navigation

All navigation via `<a href="#/...">` elements + `navigate()` function. Hash-based URLs are bookmarkable/shareable.

## Dependencies

- `react` — `useState`, `useEffect`
- `@tabletop-tools/ui` — `HelpTip`, `SimpleMarkdown`
- `../lib/auth` — `authClient`
- `../lib/trpc` — `trpc`
- `../lib/router` — `useHashRoute`, `navigate`, `Route` (type)
- `./ManageTournament` — `ManageTournament`
