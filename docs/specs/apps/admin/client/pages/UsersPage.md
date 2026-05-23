# apps/admin/client/src/pages/UsersPage.tsx

> User management — list recent users with revoke/delete actions.

## Prompt

Show recent users from `trpc.stats.recentUsers.useQuery()`. Table columns: name, email, created date. Per-user actions: "Revoke All Sessions" (`trpc.stats.revokeAllSessions.useMutation()`), "Delete User" (`trpc.stats.deleteUser.useMutation()`) with confirmation. Delete cascades all user data.
