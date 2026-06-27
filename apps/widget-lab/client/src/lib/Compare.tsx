import type { ReactNode } from 'react'

type Side = {
  title: string
  body: ReactNode
  caption: {
    swap?: string
    keep?: string
    notes?: string
  }
}

type Props = {
  pageTitle: string
  pageSubtitle?: string
  left: Side
  right: Side
}

// Two-column comparison layout used by every page. Left = current pattern in
// the platform today (inlined, NOT imported, so the diff is honest). Right =
// PrimeReact equivalent. Caption under each side documents the migration call.
export function Compare({ pageTitle, pageSubtitle, left, right }: Props) {
  return (
    <div>
      <header className="mb-6">
        <h2 className="text-xl font-bold text-amber-400">{pageTitle}</h2>
        {pageSubtitle && <p className="text-sm text-slate-400 mt-1">{pageSubtitle}</p>}
      </header>
      <div className="grid grid-cols-2 gap-8">
        <div>
          <section className="border border-slate-800 rounded-lg p-5 bg-slate-900/40 min-h-[200px]">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-3">
              Current pattern · {left.title}
            </div>
            {left.body}
          </section>
          <Caption {...left.caption} />
        </div>
        <div>
          <section className="border border-slate-800 rounded-lg p-5 bg-slate-900/40 min-h-[200px]">
            <div className="text-[11px] text-amber-400/80 uppercase tracking-wider mb-3">
              PrimeReact · {right.title}
            </div>
            {right.body}
          </section>
          <Caption {...right.caption} />
        </div>
      </div>
    </div>
  )
}

function Caption({ swap, keep, notes }: Side['caption']) {
  return (
    <aside className="mt-3 px-1 text-xs text-slate-400 space-y-1">
      {swap && (
        <div>
          <span className="text-amber-400/90 font-semibold">Swap: </span>
          {swap}
        </div>
      )}
      {keep && (
        <div>
          <span className="text-emerald-400/90 font-semibold">Keep: </span>
          {keep}
        </div>
      )}
      {notes && (
        <div>
          <span className="text-slate-500 font-semibold">Notes: </span>
          {notes}
        </div>
      )}
    </aside>
  )
}
