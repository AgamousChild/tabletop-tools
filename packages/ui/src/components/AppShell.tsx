import type { ReactNode } from 'react'

type AppShellProps = {
  title: string
  onSignOut: () => void
  children: ReactNode
}

export function AppShell({ title, onSignOut, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-amber-400">{title}</h1>
        <button
          onClick={onSignOut}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Sign out
        </button>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
