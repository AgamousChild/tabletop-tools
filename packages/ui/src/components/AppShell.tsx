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
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-slate-400 hover:text-slate-200 transition-colors"
            title="Back to Home"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
            </svg>
          </a>
          <h1 className="text-xl font-bold text-amber-400">{title}</h1>
        </div>
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
