import { useState } from 'react'
import { trpc } from '../lib/trpc'

export function UsersPage() {
  const { data, isLoading, error, refetch } = trpc.stats.recentUsers.useQuery({ limit: 50 })
  const deleteUser = trpc.stats.deleteUser.useMutation({ onSuccess: () => void refetch() })
  const revokeAll = trpc.stats.revokeAllSessions.useMutation()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (isLoading) {
    return <p className="text-slate-400">Loading users...</p>
  }

  if (error) {
    return (
      <div className="bg-red-950 border border-red-800 rounded-lg p-4">
        <p className="text-red-400">{error.message}</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <p className="text-slate-400">No users yet.</p>
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-100 mb-4">Recent Users</h2>
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Email</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Joined</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((user) => (
              <tr key={user.id} className="border-b border-slate-800/50 last:border-0">
                <td className="px-4 py-3 text-slate-100">{user.name}</td>
                <td className="px-4 py-3 text-slate-300">{user.email}</td>
                <td className="px-4 py-3 text-slate-400">
                  {user.createdAt ? formatDate(user.createdAt) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {confirmId === user.id ? (
                    <span className="flex gap-2 justify-end items-center">
                      <span className="text-red-400 text-xs">Confirm?</span>
                      <button
                        onClick={() => {
                          deleteUser.mutate({ userId: user.id })
                          setConfirmId(null)
                        }}
                        className="text-xs px-2 py-1 rounded bg-red-400/20 text-red-400 hover:bg-red-400/30"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-xs px-2 py-1 text-slate-400"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <span className="flex gap-2 justify-end">
                      <button
                        onClick={() => revokeAll.mutate({ userId: user.id })}
                        className="text-xs px-2 py-1 rounded bg-amber-400/20 text-amber-400 hover:bg-amber-400/30"
                      >
                        Revoke Sessions
                      </button>
                      <button
                        onClick={() => setConfirmId(user.id)}
                        className="text-xs px-2 py-1 rounded bg-red-400/20 text-red-400 hover:bg-red-400/30"
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatDate(ts: Date | number | string): string {
  const d = ts instanceof Date ? ts : new Date(typeof ts === 'number' ? ts * 1000 : ts)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
