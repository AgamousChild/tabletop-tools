# apps/admin/client/src/pages/Dashboard.tsx (implied)

> Platform overview — stat cards for users, sessions, per-app usage, BSData version.

## Prompt

Show aggregated platform stats from `trpc.stats.overview.useQuery()`. Display as `<StatCard>` grid: total users (+ 7-day signups), active sessions, per-app record counts. Also show BSData version from `trpc.stats.bsdataVersion.useQuery()`.
