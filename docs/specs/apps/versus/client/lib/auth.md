# apps/versus/client/src/lib/auth.ts

> Better Auth client instance for the versus app.

## Prompt

Write a thin auth client module. Add `/// <reference types="vite/client" />` at the top so TypeScript understands `import.meta.env`.

Read `VITE_AUTH_SERVER_URL` from Vite env vars, falling back to `'http://localhost:3000/api/auth'` for local development. Guard against SSR by checking `typeof window !== 'undefined'` before accessing `import.meta.env`.

Call `createAuthClient(url)` from `@tabletop-tools/ui` and export the result as `authClient`. Also destructure and re-export `useSession`, `signIn`, `signOut`, `signUp` for convenience.

## Dependencies

- `@tabletop-tools/ui` — `createAuthClient`

## Pattern

This exact file is duplicated across all 8 client apps with identical structure. Only the import path and env var are the same everywhere.
