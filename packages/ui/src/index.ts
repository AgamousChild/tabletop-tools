// Components
export { AuthScreen } from './components/AuthScreen'
export { AppShell } from './components/AppShell'
export { ErrorBoundary } from './components/ErrorBoundary'
export { GameContentDisclaimer } from './components/GameContentDisclaimer'
export { HelpTip } from './components/HelpTip'
export { CollapsibleSection } from './components/CollapsibleSection'

// Auth client factory
export { createAuthClient } from './lib/auth'

// tRPC client factory
export { createTRPCLinks } from './lib/trpc'

// App entry point
export { renderApp } from './lib/render'
