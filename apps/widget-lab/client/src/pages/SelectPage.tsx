import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { Dropdown } from 'primereact/dropdown'
import { MultiSelect } from 'primereact/multiselect'
import { useState } from 'react'

import { Compare } from '../lib/Compare'
import { type Faction, FACTIONS } from '../lib/fixtures'

// Searchable select / combobox page.
//
// LEFT — shape extracted from these real files (NOT imported, inlined so the
// diff stays honest):
//   - apps/list-builder/client/src/components/UnitSelectionScreen.tsx (faction <select>)
//   - apps/game-tracker/client/src/components/MatchSetupScreen.tsx L131-146
//       (yourFaction <select> with placeholder option, slate-900 border, amber focus)
//   - apps/tournament/client/src/components/FactionDetachmentPicker.tsx
// Repeats across 6+ apps, always native <select>, no search/typeahead, no
// multi-select. The pattern in MatchSetupScreen is verbatim the one mimicked
// below.

type AutoValue = string | Faction

export function SelectPage() {
  return (
    <Compare
      pageTitle="Searchable Select / Combobox"
      pageSubtitle="Faction pickers exist in 6+ apps. Today they're all native <select>. Three PrimeReact variants on the right cover the use-cases we keep reaching for and faking."
      left={{
        title: 'Native <select>',
        body: <NativeSelectExample />,
        caption: {
          swap: 'every <select> for faction/detachment/unit picking (list-builder, game-tracker, tournament, new-meta admin).',
          keep: 'native <select> for plain 2-option enum dropdowns (allegiance toggle, sort order) where typeahead is overkill.',
          notes:
            "Today there's no search. With 30+ factions Micah scrolls. Multi-select doesn't exist anywhere; we fake it with chips.",
        },
      }}
      right={{
        title: 'Dropdown / MultiSelect / AutoComplete',
        body: <PrimeSelectExample />,
        caption: {
          swap: 'Dropdown replaces all native <select>. MultiSelect replaces hand-rolled chip pickers. AutoComplete for free-text-with-suggestions like opponent name.',
          keep: 'Same data shape (id + name + allegiance). API contracts unchanged — drop-in at the JSX layer.',
          notes:
            'Filter prop on Dropdown gives free typeahead. itemTemplate gives the allegiance dot without a wrapper component.',
        },
      }}
    />
  )
}

// ---- LEFT — current pattern (inlined verbatim from MatchSetupScreen.tsx) ----
function NativeSelectExample() {
  const [yourFaction, setYourFaction] = useState('')
  const [opponentFaction, setOpponentFaction] = useState('')

  return (
    <div className="space-y-4 max-w-sm">
      <div>
        <label className="block text-sm text-slate-400 mb-1">Your Faction</label>
        <select
          value={yourFaction}
          onChange={(e) => setYourFaction(e.target.value)}
          aria-label="Your faction"
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
        >
          <option value="">Select faction...</option>
          {FACTIONS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm text-slate-400 mb-1">Opponent Faction</label>
        <select
          value={opponentFaction}
          onChange={(e) => setOpponentFaction(e.target.value)}
          aria-label="Opponent faction"
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
        >
          <option value="">Select faction...</option>
          {FACTIONS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-slate-500">
        30 options. No search, no filter, no multi-select. Scrolling is the UX.
      </p>
    </div>
  )
}

// ---- RIGHT — PrimeReact ----
function PrimeSelectExample() {
  const [single, setSingle] = useState<Faction | null>(null)
  const [multi, setMulti] = useState<Faction[]>([])
  const [autoText, setAutoText] = useState<AutoValue>('')
  const [autoSuggestions, setAutoSuggestions] = useState<Faction[]>([])

  const search = (e: AutoCompleteCompleteEvent) => {
    const q = e.query.toLowerCase()
    setAutoSuggestions(FACTIONS.filter((f) => f.name.toLowerCase().includes(q)))
  }

  return (
    <div className="space-y-5 max-w-sm">
      <div>
        <label className="block text-sm text-slate-400 mb-1">Dropdown (typeable)</label>
        <Dropdown
          value={single}
          onChange={(e) => setSingle(e.value)}
          options={FACTIONS}
          optionLabel="name"
          placeholder="Select faction..."
          filter
          showClear
          itemTemplate={(opt: Faction) => (
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${allegianceColor(opt.allegiance)}`}
              />
              <span>{opt.name}</span>
            </div>
          )}
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-400 mb-1">MultiSelect</label>
        <MultiSelect
          value={multi}
          onChange={(e) => setMulti(e.value)}
          options={FACTIONS}
          optionLabel="name"
          placeholder="Filter factions..."
          filter
          display="chip"
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-400 mb-1">AutoComplete (free text)</label>
        <AutoComplete
          value={autoText}
          suggestions={autoSuggestions}
          completeMethod={search}
          field="name"
          onChange={(e) => setAutoText(e.value as AutoValue)}
          placeholder="Type to search..."
          className="w-full"
        />
      </div>
    </div>
  )
}

function allegianceColor(a: Faction['allegiance']) {
  return a === 'imperium' ? 'bg-blue-400' : a === 'chaos' ? 'bg-red-400' : 'bg-green-400'
}
