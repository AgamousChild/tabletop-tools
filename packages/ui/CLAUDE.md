# CLAUDE.md — packages/ui

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

`packages/ui` is the shared client library for all apps in the platform. Eliminates the
6x duplication of AuthScreen, 7x auth.ts, 7x trpc.ts, 7x main.tsx, and 8x tailwind.config
that existed in V1 (~600+ lines of client-side duplication across 42 files).

Provides:

1. **AuthScreen** — Login/register form with configurable title/subtitle and proper error handling
2. **AppShell** — Header with app title, sign out button, content area
3. **ErrorBoundary** — Catches rendering exceptions, shows fallback UI with reload button
4. **GameContentDisclaimer** — BSData attribution notice
5. **Auth client factory** — `createAuthClient(baseURL?)` for Better Auth
6. **tRPC link factory** — `createTRPCLinks(url?)` with httpBatchLink + credentials
7. **App renderer** — `renderApp(App)` mounts React with StrictMode
8. **Tailwind preset** — Shared colors (slate-950, amber-400), Geist font, design tokens

---

## File Structure

```
packages/ui/
  src/
    index.ts                          <- barrel export
    components/
      AuthScreen.tsx                  <- login/register form (7 tests)
      AuthScreen.test.tsx
      AppShell.tsx                    <- header + sign out + children (4 tests)
      AppShell.test.tsx
      ErrorBoundary.tsx               <- class component, catches render errors (3 tests)
      ErrorBoundary.test.tsx
      GameContentDisclaimer.tsx       <- BSData attribution
    lib/
      auth.ts                         <- createAuthClient() factory (2 tests)
      auth.test.ts
      trpc.ts                         <- createTRPCLinks() factory (3 tests)
      trpc.test.ts
      render.tsx                      <- renderApp() — mounts React with StrictMode
  test/
    setup.ts                          <- vitest setup (jest-dom)
  tailwind-preset.ts                  <- shared Tailwind config
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## Exports

```typescript
// Components
export { AuthScreen } from './components/AuthScreen'       // title, subtitle?, onAuthenticated, authClient
export { AppShell } from './components/AppShell'           // title, onSignOut, children
export { ErrorBoundary } from './components/ErrorBoundary' // children, fallback?
export { GameContentDisclaimer } from './components/GameContentDisclaimer'

// Auth client factory
export { createAuthClient } from './lib/auth'              // (baseURL?) => Better Auth client

// tRPC link factory
export { createTRPCLinks } from './lib/trpc'               // (url?) => [httpBatchLink]

// App entry point
export { renderApp } from './lib/render'                   // (App) => void, mounts to #root with StrictMode
```

**Note:** `renderApp` wraps in `StrictMode` only. Apps are responsible for their own
QueryClient and tRPC providers (composed in each app's `main.tsx`).

### Tailwind Preset

```typescript
// tailwind-preset.ts
export default {
  theme: {
    extend: {
      fontFamily: { sans: ['Geist', 'system-ui', 'sans-serif'] },
      colors: {
        background: '#0f172a',  // slate-950
        surface: '#0f172a',     // slate-900
        border: '#1e293b',      // slate-800
        accent: { DEFAULT: '#fbbf24' },  // amber-400
      },
    },
  },
}
```

Apps extend this preset in their own `tailwind.config.ts`:
```typescript
import { tailwindPreset } from '@tabletop-tools/ui'
export default { presets: [tailwindPreset], content: ['./index.html', './src/**/*.{ts,tsx}'] }
```

---

## How Apps Use packages/ui

Every app client imports from this package:

```typescript
// main.tsx — renderApp + QueryClient + tRPC providers
import { renderApp } from '@tabletop-tools/ui'

// App.tsx — auth gate + main content
import { AuthScreen } from '@tabletop-tools/ui'

// lib/auth.ts — Better Auth client
import { createAuthClient } from '@tabletop-tools/ui'

// lib/trpc.ts — tRPC links with credentials
import { createTRPCLinks } from '@tabletop-tools/ui'

// tailwind.config.ts — shared preset
import { tailwindPreset } from '@tabletop-tools/ui'
```

---

## Testing

**21 tests** across 5 test files:

- `AuthScreen.test.tsx` (7): renders login form, switches to register mode with name field,
  handles successful login/registration, shows auth errors, catches network errors
- `AppShell.test.tsx` (4): renders title, renders children, shows sign-out button, calls onSignOut
- `ErrorBoundary.test.tsx` (3): renders children normally, shows default fallback on error,
  supports custom fallback
- `auth.test.ts` (2): creates client with custom baseURL, falls back to default baseURL
- `trpc.test.ts` (3): returns link array, includes httpBatchLink, accepts custom URL

```bash
cd packages/ui && pnpm test
```
