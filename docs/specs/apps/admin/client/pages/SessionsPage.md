# apps/admin/client/src/pages/SessionsPage.tsx

> Active session list with revoke action.

## Prompt

Show active sessions from `trpc.stats.activeSessions.useQuery()`. Table: user name, email, IP, user agent, created, expires. "Revoke" button per session calls `trpc.stats.revokeSession.useMutation()`.
