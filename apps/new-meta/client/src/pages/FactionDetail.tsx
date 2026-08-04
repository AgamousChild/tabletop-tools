import { SkeletonTable, SkeletonText } from '@tabletop-tools/ui'
import { useCallback, useMemo, useState } from 'react'

import { type ArmyListLayout, LAYOUT_LABELS, LAYOUTS } from '../components/ArmyList'
import { ListCard } from '../components/ListCard'
import { trpc } from '../lib/trpc'

const LAYOUT_STORAGE_KEY = 'new-meta:list-layout'

/**
 * Which of the three list layouts to render, remembered across visits.
 *
 * One setting for the whole page rather than per card — comparing two lists is
 * the point, and that only works if they are laid out the same way.
 */
function useListLayout(): [ArmyListLayout, () => void] {
  const [layout, setLayout] = useState<ArmyListLayout>(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
      return LAYOUTS.includes(saved as ArmyListLayout) ? (saved as ArmyListLayout) : 'roster'
    } catch {
      // Storage can be unavailable (private mode, blocked cookies) — the
      // layout toggle is not worth failing the page over.
      return 'roster'
    }
  })

  const cycle = useCallback(() => {
    setLayout((current) => {
      const next = LAYOUTS[(LAYOUTS.indexOf(current) + 1) % LAYOUTS.length]!
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, next)
      } catch {
        // Non-fatal, as above.
      }
      return next
    })
  }, [])

  return [layout, cycle]
}

interface Props {
  factionId: string
  onBack: () => void
  /** The meta window selected on the dashboard, carried through the URL. */
  frame: string | undefined
  granularityId: number | undefined
}

export function FactionDetail({ factionId, onBack, frame, granularityId }: Props) {
  const [layout, cycleLayout] = useListLayout()
  // Passing the frame is what scopes this page. Omitting it made every query
  // here fall back to the server's default frame, which is why a dashboard
  // filtered to one quarter still opened faction pages full of 2024 results.
  const { data, isLoading } = trpc.meta.faction.useQuery({ factionId, frame, granularityId })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonText lines={2} />
        <SkeletonTable rows={8} columns={5} />
      </div>
    )
  }

  if (!data || !data.stat) {
    return (
      <div>
        <button onClick={onBack} className="text-amber-400 text-sm hover:text-amber-300 mb-4">
          &larr; Back
        </button>
        <p className="text-slate-400">No data for this faction.</p>
      </div>
    )
  }

  const { stat, detachments, combos, timeline, topLists } = data
  // 11e armies take several detachments, so a pairing is its own thing to
  // evaluate — not the same question as how one detachment does across every
  // army it appears in.
  const multiCombos = combos.filter((c) => c.memberCount > 1)

  return (
    <div className="space-y-8">
      <div>
        <button onClick={onBack} className="text-amber-400 text-sm hover:text-amber-300 mb-4">
          &larr; Back
        </button>
        <h1 className="text-2xl font-semibold text-slate-100">{stat.faction}</h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <StatCard
            label="Win Rate"
            value={`${(stat.winRate * 100).toFixed(1)}%`}
            color={stat.winRate > 0.55 ? 'emerald' : stat.winRate < 0.45 ? 'red' : 'slate'}
          />
          <StatCard label="Games" value={stat.games.toLocaleString()} />
          <StatCard label="Players" value={stat.players.toLocaleString()} />
          <StatCard label="Event Wins" value={String(stat.eventWins)} color="amber" />
        </div>

        <div className="flex gap-4 mt-3 text-xs text-slate-500">
          <span>Top 4: {stat.eventTop4}</span>
          <span>Top 8: {stat.eventTop8}</span>
          <span>Meta Share: {(stat.playerPopPct * 100).toFixed(1)}%</span>
          <span>Draw Rate: {(stat.drawRate * 100).toFixed(1)}%</span>
        </div>
      </div>

      {multiCombos.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-slate-200 mb-1">Detachment Combinations</h2>
          <p className="text-xs text-slate-500 mb-3">
            11th edition armies take more than one detachment under a Detachment Points budget.
            These are the pairings actually played, scored as a whole army.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left text-xs">
                <th className="pb-2 pr-4">Combination</th>
                <th className="pb-2 pr-3 text-right">DP</th>
                <th className="pb-2 pr-3 text-right">Win%</th>
                <th className="pb-2 pr-3 text-right">W</th>
                <th className="pb-2 pr-3 text-right">L</th>
                <th className="pb-2 pr-3 text-right">D</th>
                <th className="pb-2 pr-3 text-right">Games</th>
                <th className="pb-2 text-right">Players</th>
              </tr>
            </thead>
            <tbody>
              {multiCombos.map((c) => (
                <tr key={c.comboId} className="border-b border-slate-800/50">
                  <td className="py-1.5 pr-4 text-slate-100">{c.members}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-500">{c.totalDp ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right">
                    <span
                      className={
                        c.winRate > 0.55
                          ? 'text-emerald-400'
                          : c.winRate < 0.45
                            ? 'text-red-400'
                            : 'text-slate-300'
                      }
                    >
                      {(c.winRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{c.wins}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{c.losses}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{c.draws}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{c.games}</td>
                  <td className="py-1.5 text-right text-slate-400">{c.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {detachments.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-slate-200 mb-1">Detachments</h2>
          <p className="text-xs text-slate-500 mb-3">
            Every game an army containing this detachment played, whichever position it was written
            in.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left text-xs">
                <th className="pb-2 pr-4">Detachment</th>
                <th className="pb-2 pr-3 text-right">Win%</th>
                <th className="pb-2 pr-3 text-right">W</th>
                <th className="pb-2 pr-3 text-right">L</th>
                <th className="pb-2 pr-3 text-right">D</th>
                <th className="pb-2 pr-3 text-right">Games</th>
                <th className="pb-2 text-right">Players</th>
              </tr>
            </thead>
            <tbody>
              {detachments.map((d) => (
                <tr key={d.detachmentId} className="border-b border-slate-800/50">
                  <td className="py-1.5 pr-4 text-slate-100">{d.detachment}</td>
                  <td className="py-1.5 pr-3 text-right">
                    <span
                      className={
                        d.winRate > 0.55
                          ? 'text-emerald-400'
                          : d.winRate < 0.45
                            ? 'text-red-400'
                            : 'text-slate-300'
                      }
                    >
                      {(d.winRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{d.wins}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{d.losses}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{d.draws}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{d.games}</td>
                  <td className="py-1.5 text-right text-slate-400">{d.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {timeline && timeline.length > 0 && <TimelineChart points={timeline} />}

      {topLists.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-slate-200">Top Lists</h2>
            <button
              onClick={cycleLayout}
              className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700 hover:text-slate-100 transition-colors"
              title="Cycle list layout"
            >
              Layout: <span className="text-amber-400">{LAYOUT_LABELS[layout]}</span>
            </button>
          </div>
          <div className="space-y-3">
            {topLists.map((list, i) => (
              <ListCard
                key={`${list.eventName}-${list.placement}-${i}`}
                layout={layout}
                list={{
                  eventName: list.eventName,
                  eventDate: list.eventDate
                    ? new Date(list.eventDate).toISOString().slice(0, 10)
                    : '',
                  placement: list.placement,
                  faction: stat.faction,
                  detachment: list.detachment,
                  listText: list.listText ?? undefined,
                  listTtt: list.listTtt,
                  wins: list.wins,
                  losses: list.losses,
                  draws: list.draws,
                  points: 0,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  color = 'slate',
}: {
  label: string
  value: string
  color?: string
}) {
  const textColor =
    color === 'emerald'
      ? 'text-emerald-400'
      : color === 'red'
        ? 'text-red-400'
        : color === 'amber'
          ? 'text-amber-400'
          : 'text-slate-100'
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-mono font-semibold ${textColor}`}>{value}</p>
    </div>
  )
}

/**
 * Win rate over time, as a line.
 *
 * This was a bar chart whose bar heights were `games / maxGames` — it plotted
 * sample size and encoded win rate only as the bar's colour, so the one thing
 * its title promised was the one thing it didn't show. A rate over time is a
 * line; 50% is drawn as the reference because parity is the number that matters.
 */
function TimelineChart({
  points,
}: {
  points: Array<{
    week: string
    winRate: number
    games: number
    wins: number
    losses: number
    draws: number
  }>
}) {
  const sorted = useMemo(() => [...points].sort((a, b) => a.week.localeCompare(b.week)), [points])

  // Fixed viewBox, scaled by CSS — keeps the geometry simple and responsive.
  const W = 600
  const H = 160
  const PAD_X = 8
  const PAD_Y = 12

  const { yMin, yMax } = useMemo(() => {
    const rates = sorted.map((p) => p.winRate)
    // Always keep 50% in view so the parity line stays meaningful, and never
    // let a flat series collapse to a zero-height domain.
    const lo = Math.min(...rates, 0.5)
    const hi = Math.max(...rates, 0.5)
    const pad = Math.max((hi - lo) * 0.15, 0.02)
    return { yMin: Math.max(0, lo - pad), yMax: Math.min(1, hi + pad) }
  }, [sorted])

  const x = (i: number) =>
    sorted.length <= 1 ? W / 2 : PAD_X + (i * (W - PAD_X * 2)) / (sorted.length - 1)
  const y = (rate: number) => PAD_Y + (1 - (rate - yMin) / (yMax - yMin || 1)) * (H - PAD_Y * 2)

  const linePath = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.winRate)}`).join(' ')
  const areaPath = sorted.length
    ? `${linePath} L${x(sorted.length - 1)},${H - PAD_Y} L${x(0)},${H - PAD_Y} Z`
    : ''
  const yParity = y(0.5)

  return (
    <section>
      <h2 className="text-lg font-medium text-slate-200 mb-3">Win Rate Over Time</h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-40 overflow-visible"
        role="img"
        aria-label="Win rate over time"
      >
        <defs>
          <linearGradient id="wrFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 50% parity reference */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={yParity}
          y2={yParity}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />

        {areaPath && <path d={areaPath} fill="url(#wrFill)" />}
        {sorted.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {sorted.map((p, i) => (
          <circle
            key={p.week}
            cx={x(i)}
            cy={y(p.winRate)}
            r={sorted.length > 40 ? 1.5 : 3}
            fill={p.winRate >= 0.55 ? '#34d399' : p.winRate >= 0.45 ? '#fbbf24' : '#f87171'}
            stroke="#020617"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${p.week}: ${(p.winRate * 100).toFixed(1)}% (${p.games} games)`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between mt-1 text-xs text-slate-600">
        <span>{sorted[0]?.week}</span>
        <span className="text-slate-700">50% parity</span>
        <span>{sorted[sorted.length - 1]?.week}</span>
      </div>
    </section>
  )
}
