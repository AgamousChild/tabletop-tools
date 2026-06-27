import { useCallback, useEffect, useState } from 'react'

import { DataTablePage } from './pages/DataTablePage'
import { DialogPage } from './pages/DialogPage'
import { NumberPage } from './pages/NumberPage'
import { SelectPage } from './pages/SelectPage'
import { TabsPage } from './pages/TabsPage'
import { ToastPage } from './pages/ToastPage'

type PageId = 'select' | 'datatable' | 'dialog' | 'toast' | 'tabs' | 'number'

const PAGES: { id: PageId; hash: string; label: string; blurb: string }[] = [
  {
    id: 'select',
    hash: '#/select',
    label: 'Select / Combobox',
    blurb: 'Native <select> vs Dropdown / MultiSelect / AutoComplete',
  },
  {
    id: 'datatable',
    hash: '#/datatable',
    label: 'DataTable',
    blurb: 'Raw <table> vs DataTable with sort + filter + paginator',
  },
  {
    id: 'dialog',
    hash: '#/dialog',
    label: 'Dialog + Confirm',
    blurb: 'Fixed-div modal + inline confirm vs Dialog + ConfirmDialog',
  },
  {
    id: 'toast',
    hash: '#/toast',
    label: 'Toast / Messages',
    blurb: 'No system today vs PrimeReact Toast',
  },
  {
    id: 'tabs',
    hash: '#/tabs',
    label: 'Tabs / Segmented',
    blurb: 'Pill-button map vs TabView + SelectButton',
  },
  {
    id: 'number',
    hash: '#/number',
    label: 'Number / Slider / Chip',
    blurb: 'Stepper + range + pills vs InputNumber + Slider + Chip',
  },
]

function parseHash(hash: string): PageId {
  const found = PAGES.find((p) => p.hash === hash)
  return found?.id ?? 'select'
}

export function App() {
  const [pageId, setPageId] = useState<PageId>(() => parseHash(window.location.hash))

  const onHashChange = useCallback(() => {
    setPageId(parseHash(window.location.hash))
  }, [])

  useEffect(() => {
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [onHashChange])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-64 shrink-0 border-r border-slate-800 px-4 py-6 sticky top-0 h-screen overflow-y-auto">
        <h1 className="text-amber-400 font-bold text-sm tracking-wider mb-1">WIDGET LAB</h1>
        <p className="text-[11px] text-slate-500 mb-6">
          PrimeReact vs platform current-patterns. Local eval app.
        </p>
        <nav className="space-y-1">
          {PAGES.map((p) => (
            <a
              key={p.id}
              href={p.hash}
              className={`block rounded px-3 py-2 text-sm transition-colors ${
                pageId === p.id
                  ? 'bg-slate-900 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{p.blurb}</div>
            </a>
          ))}
        </nav>
        <p className="text-[10px] text-slate-600 mt-8 leading-relaxed">
          Theme: <span className="text-amber-400">lara-dark-amber</span>. Background:{' '}
          <span className="text-slate-300">slate-950</span>. Synthetic data only — no live calls.
        </p>
      </aside>
      <main className="flex-1 px-8 py-6 max-w-[1400px]">
        {pageId === 'select' && <SelectPage />}
        {pageId === 'datatable' && <DataTablePage />}
        {pageId === 'dialog' && <DialogPage />}
        {pageId === 'toast' && <ToastPage />}
        {pageId === 'tabs' && <TabsPage />}
        {pageId === 'number' && <NumberPage />}
      </main>
    </div>
  )
}
