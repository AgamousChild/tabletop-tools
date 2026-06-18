# apps/list-builder/client/src/main.tsx

> Vite entry point — same pattern as versus. tRPC + React Query providers wrapping App.

## Prompt

Same as versus/client/main.tsx. Import `./index.css`, create `Root` with `QueryClient` + tRPC client in `useState`, wrap `<App />` in providers, call `renderApp(Root)`.
