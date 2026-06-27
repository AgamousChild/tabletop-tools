import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { IconField } from 'primereact/iconfield'
import { InputIcon } from 'primereact/inputicon'
import { InputText } from 'primereact/inputtext'
import { useState } from 'react'

import { Compare } from '../lib/Compare'
import { FACTION_STATS, type FactionStat } from '../lib/fixtures'

// LEFT — shape extracted from apps/new-meta/client/src/components/FactionTable.tsx
// (10-column meta table, click-row-to-drill, no sortable headers, no global
// filter, no paginator). Also seen in apps/admin/client/src/pages/UsersPage.tsx
// (raw <table>, no sort) and apps/tournament/client/src/components/MetricStackStandings.tsx.

export function DataTablePage() {
  return (
    <Compare
      pageTitle="DataTable (sort + filter + paginate)"
      pageSubtitle="The faction-stats table from new-meta. 30 rows here, but production has 100+ and it's an unscrollable wall. No sortable headers, no search, no paginator."
      left={{
        title: 'Raw <table>',
        body: <RawTableExample />,
        caption: {
          swap: 'every multi-column stat/standings/results table (new-meta FactionTable, tournament standings, admin user list, list-builder MyLists).',
          keep: 'simple 2-column display tables (key/value summaries) where the table tag is just layout — no need for the DataTable weight.',
          notes:
            "We don't even fake sorting today; columns are pre-sorted server-side. Switching to DataTable also gives column resize + reorder almost for free.",
        },
      }}
      right={{
        title: 'DataTable + global filter + paginator',
        body: <PrimeTableExample />,
        caption: {
          swap: 'sortable={true} on every column, paginator on tables > 25 rows, globalFilter for everything user-searchable.',
          keep: 'Same row data, same click handler. Cell renderers (WinRateBar, AllegianceDot) port over as body templates.',
          notes:
            "PrimeReact's DataTable handles row virtualization too — relevant when we get the full 100-faction cross-edition dataset in.",
        },
      }}
    />
  )
}

// ---- LEFT — current pattern (inlined from FactionTable.tsx) ----
function RawTableExample() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400 text-left text-xs">
            <th className="pb-2 pr-4">Faction</th>
            <th className="pb-2 pr-3 text-right">Win%</th>
            <th className="pb-2 pr-3 text-right">W</th>
            <th className="pb-2 pr-3 text-right">L</th>
            <th className="pb-2 pr-3 text-right">D</th>
            <th className="pb-2 pr-3 text-right">Games</th>
            <th className="pb-2 pr-3 text-right">Players</th>
            <th className="pb-2 pr-3 text-right">Meta%</th>
            <th className="pb-2 pr-3 text-right">1st</th>
            <th className="pb-2 text-right">T4</th>
          </tr>
        </thead>
        <tbody>
          {FACTION_STATS.map((s) => (
            <tr
              key={s.factionId}
              className="border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer"
              onClick={() => alert(`Drill into ${s.faction}`)}
            >
              <td className="py-2 pr-4">
                <span className="text-slate-100 font-medium">{s.faction}</span>
                <AllegianceDot allegiance={s.allegiance} />
              </td>
              <td className="py-2 pr-3 text-right">
                <WinRateBar rate={s.winRate} />
              </td>
              <td className="py-2 pr-3 text-right text-slate-300">{s.wins}</td>
              <td className="py-2 pr-3 text-right text-slate-300">{s.losses}</td>
              <td className="py-2 pr-3 text-right text-slate-300">{s.draws}</td>
              <td className="py-2 pr-3 text-right text-slate-400">{s.games}</td>
              <td className="py-2 pr-3 text-right text-slate-400">{s.players}</td>
              <td className="py-2 pr-3 text-right text-slate-300 font-mono text-xs">
                {(s.playerPopPct * 100).toFixed(1)}%
              </td>
              <td className="py-2 pr-3 text-right text-amber-400 font-mono">{s.eventWins || ''}</td>
              <td className="py-2 text-right text-slate-400 font-mono">{s.eventTop4 || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WinRateBar({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(1)
  const color = rate > 0.55 ? 'text-emerald-400' : rate < 0.45 ? 'text-red-400' : 'text-slate-300'
  return <span className={`font-mono ${color}`}>{pct}%</span>
}

function AllegianceDot({ allegiance }: { allegiance: string }) {
  const color =
    allegiance === 'imperium'
      ? 'bg-blue-400'
      : allegiance === 'chaos'
        ? 'bg-red-400'
        : 'bg-green-400'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color} ml-2 opacity-60`} />
}

// ---- RIGHT — PrimeReact ----
function PrimeTableExample() {
  const [filter, setFilter] = useState('')

  const header = (
    <div className="flex justify-between items-center">
      <span className="text-sm text-slate-400">Faction stats</span>
      <IconField iconPosition="left">
        <InputIcon className="pi pi-search" />
        <InputText
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search..."
        />
      </IconField>
    </div>
  )

  const winRateBody = (row: FactionStat) => {
    const color =
      row.winRate > 0.55
        ? 'text-emerald-400'
        : row.winRate < 0.45
          ? 'text-red-400'
          : 'text-slate-300'
    return <span className={`font-mono ${color}`}>{(row.winRate * 100).toFixed(1)}%</span>
  }

  const factionBody = (row: FactionStat) => (
    <span className="flex items-center gap-2">
      <span className="text-slate-100 font-medium">{row.faction}</span>
      <AllegianceDot allegiance={row.allegiance} />
    </span>
  )

  const pctBody = (row: FactionStat) => (
    <span className="font-mono text-xs">{(row.playerPopPct * 100).toFixed(1)}%</span>
  )

  return (
    <DataTable
      value={FACTION_STATS}
      header={header}
      paginator
      rows={10}
      rowsPerPageOptions={[10, 20, 30]}
      globalFilter={filter}
      globalFilterFields={['faction', 'allegiance']}
      sortMode="multiple"
      removableSort
      onRowClick={(e) => alert(`Drill into ${(e.data as FactionStat).faction}`)}
      rowClassName={() => 'cursor-pointer'}
      stripedRows
      size="small"
    >
      <Column field="faction" header="Faction" sortable body={factionBody} />
      <Column field="winRate" header="Win%" sortable body={winRateBody} />
      <Column field="wins" header="W" sortable />
      <Column field="losses" header="L" sortable />
      <Column field="draws" header="D" sortable />
      <Column field="games" header="Games" sortable />
      <Column field="players" header="Players" sortable />
      <Column field="playerPopPct" header="Meta%" sortable body={pctBody} />
      <Column field="eventWins" header="1st" sortable />
      <Column field="eventTop4" header="T4" sortable />
    </DataTable>
  )
}
