import { SelectButton } from 'primereact/selectbutton'
import { TabPanel, TabView } from 'primereact/tabview'
import { useState } from 'react'

import { Compare } from '../lib/Compare'

// LEFT — extracted from apps/tournament/client/src/components/ManageTournament.tsx
// L11, L88-101 (the `(['players','cards','awards'] as const).map` over pill
// buttons). Same shape repeats in:
//   - apps/list-builder/client/src/components/MyListsScreen.tsx
//   - apps/new-meta/client/src/components/MetaWindowSelector.tsx
//   - apps/admin/client/src/App.tsx (page selector)

export function TabsPage() {
  return (
    <Compare
      pageTitle="Tabs / SegmentedControl"
      pageSubtitle="The pill-button-map pattern is repeated in 5+ apps. It's serving two distinct UX roles: tab navigation and segmented control selection. PrimeReact splits them."
      left={{
        title: '(["a","b","c"] as const).map pill buttons',
        body: <CurrentTabs />,
        caption: {
          swap: 'every "tabs that show different panels" → TabView. Every "pick one of N" filter pill row → SelectButton.',
          keep: "when there are exactly 2 options (yes/no) the toggle pattern is fine — it doesn't need SelectButton.",
          notes:
            "We're conflating navigation tabs (tournament Manage screen) with filter selectors (meta window). PrimeReact separating them is healthy.",
        },
      }}
      right={{
        title: 'TabView + SelectButton',
        body: <PrimeTabs />,
        caption: {
          swap: 'ManageTournament tabs → TabView. MetaWindowSelector → SelectButton. View toggles → SelectButton.',
          keep: 'Tab labels and panel content unchanged. Click handlers become onTabChange / onChange.',
          notes:
            'TabView handles ARIA tablist roles + keyboard arrow nav for free. SelectButton supports multi=true if a filter row needs it.',
        },
      }}
    />
  )
}

// ---- LEFT — current pattern (verbatim shape from ManageTournament.tsx) ----
function CurrentTabs() {
  const [tab, setTab] = useState<'players' | 'cards' | 'awards'>('players')
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'compact'>('list')

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-500 mb-2">Navigation tabs (ManageTournament shape):</p>
        <div className="flex gap-2 mb-4">
          {(['players', 'cards', 'awards'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded text-sm font-medium capitalize ${
                tab === t
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded p-4 text-sm text-slate-300">
          Panel: <span className="text-amber-400">{tab}</span>
        </div>
      </div>

      <div className="border-t border-slate-800 pt-5">
        <p className="text-xs text-slate-500 mb-2">View toggle (same shape, different intent):</p>
        <div className="flex gap-2">
          {(['list', 'grid', 'compact'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setViewMode(t)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize ${
                viewMode === t
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- RIGHT — PrimeReact ----
function PrimeTabs() {
  const [view, setView] = useState<'list' | 'grid' | 'compact'>('list')

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-500 mb-2">TabView (navigation):</p>
        <TabView>
          <TabPanel header="Players">
            <p className="text-sm text-slate-300">Panel: Players</p>
          </TabPanel>
          <TabPanel header="Cards">
            <p className="text-sm text-slate-300">Panel: Cards</p>
          </TabPanel>
          <TabPanel header="Awards">
            <p className="text-sm text-slate-300">Panel: Awards</p>
          </TabPanel>
        </TabView>
      </div>

      <div className="border-t border-slate-800 pt-5">
        <p className="text-xs text-slate-500 mb-2">SelectButton (segmented control):</p>
        <SelectButton
          value={view}
          onChange={(e) => e.value && setView(e.value)}
          options={[
            { label: 'List', value: 'list' },
            { label: 'Grid', value: 'grid' },
            { label: 'Compact', value: 'compact' },
          ]}
        />
      </div>
    </div>
  )
}
