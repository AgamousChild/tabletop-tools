# packages/ui/src/ — UI Package

> Shared client library eliminating 6x duplication across 8 apps.

## lib/auth.ts
`createAuthClient(baseURL?)` — wraps Better Auth client with configurable baseURL (default localhost:3000/api/auth).

## lib/trpc.ts
`createTRPCLinks(url?)` — returns httpBatchLink array with `credentials: 'include'` for cross-origin cookie transmission.

## lib/render.tsx
`renderApp(Component)` — mount React to #root with StrictMode. Apps add own QueryClient/tRPC providers.

## lib/htmlToText.ts
`htmlToText(html)` — convert HTML block elements to newlines, strip tags, decode entities.

## Components

### AuthScreen.tsx
Login/register form. Manages mode, email/password/name state. Calls authClient.signIn/signUp, handles errors, calls onAuthenticated callback. Configurable title/subtitle.

### AppShell.tsx
Fixed header with home link, app title, sign-out button. Wraps children in main content area.

### ErrorBoundary.tsx
Class-based error boundary. "Something went wrong" + reload button fallback.

### GameContentDisclaimer.tsx
BSData attribution + GW copyright + not-affiliated disclaimer.

### HelpTip.tsx
Small "?" button toggling tooltip on click.

### SimpleMarkdown.tsx
Lightweight markdown → Tailwind-styled HTML. Headers, lists, bold/italic/code/links. No external deps.

### CollapsibleSection.tsx
Title + count badge + chevron toggle. Hidden children when collapsed. Returns null if count is 0.

## index.ts
Barrel export of all components + lib functions.
