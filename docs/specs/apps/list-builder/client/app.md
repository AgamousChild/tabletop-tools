# apps/list-builder/client/src/App.tsx

> Root component — auth gate, then ListBuilderScreen.

## Prompt

Same auth pattern as versus. Three states: loading, unauthenticated (show `AuthScreen` with title "List Builder", subtitle "40K meta list builder"), authenticated (show `<ListBuilderScreen onSignOut={() => void refetch()} />`).

Note: `refetch()` returns a Promise, so wrap in `void` to satisfy lint.

## Dependencies

- `@tabletop-tools/ui` — `AuthScreen`
- `./components/ListBuilderScreen` — `ListBuilderScreen`
- `./lib/auth` — `authClient`
