# apps/versus/client/src/main.tsx

> Vite entry point that bootstraps the React app with tRPC + React Query providers.

## Prompt

Write the Vite entry point for a React SPA that uses tRPC with React Query. Import `./index.css` for Tailwind styles first.

Create a `Root` component that initializes two pieces of state with `useState` (lazy initializers, not inline — prevents recreation on re-render):
1. A `QueryClient` from `@tanstack/react-query`
2. A tRPC client created by `createTRPCClient()` from `./lib/trpc`

Wrap the `<App />` component in two providers:
- `trpc.Provider` (with the tRPC client and query client)
- `QueryClientProvider` (with the query client)

Call `renderApp(Root)` from `@tabletop-tools/ui` to mount into the DOM. `renderApp` handles `StrictMode` and the root element lookup.

## Dependencies

- `@tanstack/react-query` — `QueryClient`, `QueryClientProvider`
- `react` — `useState`
- `@tabletop-tools/ui` — `renderApp`
- `./App` — default export `App`
- `./lib/trpc` — `createTRPCClient`, `trpc`
