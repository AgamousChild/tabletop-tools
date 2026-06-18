# apps/versus/client/src/App.tsx

> Root component — shows auth screen or simulator based on session state.

## Prompt

Write the root App component for the versus combat simulator. It has three states:

1. **Loading**: While `authClient.useSession()` returns `isPending: true`, show a centered "Loading..." text on a slate-950 background.

2. **Unauthenticated**: When there's no session, render `<AuthScreen>` from `@tabletop-tools/ui` with title "Versus" and subtitle "40K combat simulator". Pass the `authClient` and an `onAuthenticated` callback that calls `refetch()` to re-check the session.

3. **Authenticated**: Render `<SimulatorScreen onSignOut={() => refetch()} />`.

The component destructures `{ data: session, isPending, refetch }` from `authClient.useSession()`. The session is aliased to just check truthiness — the actual user data flows through tRPC context, not the session object.

## Dependencies

- `@tabletop-tools/ui` — `AuthScreen`
- `./components/SimulatorScreen` — `SimulatorScreen`
- `./lib/auth` — `authClient`
