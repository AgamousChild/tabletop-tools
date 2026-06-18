# apps/data-import/client/src/App.tsx

> Root component — renders ImportScreen directly.

## Prompt

Minimal root component. Default export `App` that renders `<ImportScreen />`. No auth gate (data-import is a public app), no tRPC provider, no query client — just a direct render of the import screen.

## Dependencies

- `./pages/ImportScreen` — `ImportScreen`
