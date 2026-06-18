# apps/admin/client/src/App.tsx

> Auth gate + tabbed navigation across 9 admin pages.

## Prompt

Write the admin dashboard root component. Auth gate (loading → AuthScreen → content). After auth, show a tabbed navigation bar across 9 pages.

### Pages (simple string-based routing, not hash)

```typescript
type Page = 'dashboard' | 'users' | 'sessions' | 'activity' | 'imports' | 'pipeline' | 'tasks' | 'scraper' | 'ingest'
```

Navigation array defines tab order and labels: Overview, Tasks, Pipeline, Scraper, Ingest, Users, Sessions, Activity, Events.

### Layout

Nav bar with home link, "ADMIN" brand, tab buttons (active = white/bold, inactive = slate-400). Below nav, render the selected page component:
- `dashboard` → `<Dashboard />`
- `users` → `<UsersPage />`
- `sessions` → `<SessionsPage />`
- `activity` → `<ActivityPage />`
- `imports` → `<ImportsPage />`
- `pipeline` → `<PipelinePage />`
- `tasks` → `<TasksPage />`
- `scraper` → `<ScraperPage />`
- `ingest` → `<IngestPage />`

## Dependencies

- `react` — `useState`
- `@tabletop-tools/ui` — `AuthScreen`
- `./lib/auth` — `authClient`
- All page components
