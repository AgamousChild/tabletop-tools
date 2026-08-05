/**
 * Renders a parsed army list in one of three layouts.
 *
 * BCP hands us list text with every newline stripped, so the raw column is a
 * single run-on string — unreadable as written, which is why this page used to
 * dump it into a <pre>. The scraper's parser recovers the structure into
 * meta_event_players.list_ttt; this renders that.
 *
 * The shape is declared structurally rather than imported from
 * @tabletop-tools/db so the client keeps no dependency on the server's DB
 * package. Canonical definition: packages/db/src/ttt-types.ts.
 */

import { Fragment } from 'react'

export interface ArmyUnit {
  name: string
  role: string
  models: number
  points: number
  wargear: string[]
  enhancement?: string
  isWarlord?: boolean
}

export interface ArmyPackage {
  parseStatus: 'ok' | 'partial' | 'failed'
  meta: { name: string; totalPoints: number; battleSize: string }
  list: {
    factionName: string
    detachmentName?: string
    detachments?: Array<{ id: string; name: string }>
    detachmentPoints?: number
    units: ArmyUnit[]
  }
}

export const LAYOUTS = ['roster', 'ledger', 'tiles'] as const
export type ArmyListLayout = (typeof LAYOUTS)[number]

export const LAYOUT_LABELS: Record<ArmyListLayout, string> = {
  roster: 'Roster',
  ledger: 'Ledger',
  tiles: 'Tiles',
}

/** Battlefield-role order as it appears on a printed list. */
const ROLE_ORDER = [
  'Epic Hero',
  'Character',
  'Battleline',
  'Dedicated Transport',
  'Other',
  'Fortification',
  'Allied',
  'unknown',
]

const ROLE_HEADINGS: Record<string, string> = {
  'Epic Hero': 'Epic Heroes',
  Character: 'Characters',
  Battleline: 'Battleline',
  'Dedicated Transport': 'Dedicated Transports',
  Other: 'Other Datasheets',
  Fortification: 'Fortifications',
  Allied: 'Allied Units',
  unknown: 'Other',
}

/** Left-edge colour per role, used by the tile layout. */
const ROLE_SPINE: Record<string, string> = {
  'Epic Hero': 'border-l-fuchsia-400',
  Character: 'border-l-amber-400',
  Battleline: 'border-l-emerald-400',
  'Dedicated Transport': 'border-l-sky-400',
  Other: 'border-l-slate-600',
  Fortification: 'border-l-stone-400',
  Allied: 'border-l-violet-400',
  unknown: 'border-l-slate-600',
}

interface UnitGroup {
  /** Identity of the collapsed entry — name, cost, enhancement, wargear, warlord. */
  key: string
  unit: ArmyUnit
  count: number
  points: number
}

interface RoleSection {
  role: string
  heading: string
  points: number
  groups: UnitGroup[]
}

/**
 * Group units by battlefield role, collapsing identical entries to a count.
 *
 * Lists routinely take the same datasheet three or four times (three Abominants,
 * four squads of Acolytes). Rendered one per row that reads as noise; collapsed
 * it reads as the army's actual shape.
 */
function buildSections(units: ArmyUnit[]): RoleSection[] {
  const byRole = new Map<string, UnitGroup[]>()

  for (const unit of units) {
    const role = ROLE_ORDER.includes(unit.role) ? unit.role : 'unknown'
    const groups = byRole.get(role) ?? []
    // Enhancements and wargear make otherwise-identical units distinct, so they
    // are part of the identity — two Abominants with different enhancements are
    // two rows, not one row of ×2.
    const key = `${unit.name}|${unit.points}|${unit.enhancement ?? ''}|${unit.wargear.join(',')}|${unit.isWarlord ? 'wl' : ''}`
    const existing = groups.find((g) => g.key === key)

    if (existing) {
      existing.count += 1
      existing.points += unit.points
    } else {
      groups.push({ key, unit, count: 1, points: unit.points })
    }
    byRole.set(role, groups)
  }

  return ROLE_ORDER.filter((role) => byRole.has(role)).map((role) => {
    const groups = byRole.get(role)!
    return {
      role,
      heading: ROLE_HEADINGS[role] ?? role,
      points: groups.reduce((sum, g) => sum + g.points, 0),
      groups,
    }
  })
}

function gearLine(unit: ArmyUnit): string {
  return unit.wargear.join(' · ')
}

export function ArmyList({ pkg, layout }: { pkg: ArmyPackage; layout: ArmyListLayout }) {
  const sections = buildSections(pkg.list.units)

  if (sections.length === 0) {
    return <p className="text-slate-600 text-xs mt-3">List could not be read.</p>
  }

  if (layout === 'ledger') return <LedgerLayout sections={sections} pkg={pkg} />
  if (layout === 'tiles') return <TilesLayout sections={sections} />
  return <RosterLayout sections={sections} />
}

/** Role sections, dense rows, points right-aligned, wargear muted underneath. */
function RosterLayout({ sections }: { sections: RoleSection[] }) {
  return (
    <div className="mt-3 space-y-3">
      {sections.map((section) => (
        <div key={section.role}>
          <div className="flex justify-between items-baseline border-b border-slate-800 pb-1 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {section.heading}
            </span>
            <span className="text-[10px] font-mono text-slate-600">{section.points}</span>
          </div>
          {section.groups.map((g) => (
            <div key={g.key}>
              <div className="flex justify-between items-baseline gap-3 py-0.5">
                <span className="text-slate-200 text-[13px]">
                  {g.unit.name}
                  {g.count > 1 && (
                    <span className="text-amber-400 font-mono text-[11px]"> ×{g.count}</span>
                  )}
                  {g.unit.isWarlord && (
                    <span className="text-red-400 text-[10px] tracking-wide ml-1.5">WARLORD</span>
                  )}
                  {g.unit.enhancement && (
                    <span className="ml-1.5 inline-block rounded border border-amber-400/25 bg-amber-400/10 px-1 text-[10px] text-amber-400">
                      {g.unit.enhancement}
                    </span>
                  )}
                </span>
                <span className="text-slate-400 text-xs font-mono whitespace-nowrap">
                  {g.points}
                </span>
              </div>
              {g.unit.wargear.length > 0 && (
                <div className="text-slate-600 text-[11px] pl-2.5 leading-snug">
                  {gearLine(g.unit)}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** One points column with section subtotals and an army total at the foot. */
function LedgerLayout({ sections, pkg }: { sections: RoleSection[]; pkg: ArmyPackage }) {
  const total = sections.reduce((sum, s) => sum + s.points, 0)

  return (
    <table className="mt-3 w-full text-[13px]">
      <tbody>
        {sections.map((section) => (
          <Fragment key={section.role}>
            <tr>
              <td className="pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                {section.heading}
              </td>
              <td className="pt-3 pb-1 text-right text-[10px] font-mono text-slate-600 border-b border-slate-800">
                {section.points}
              </td>
            </tr>
            {section.groups.map((g) => (
              <tr key={g.key}>
                <td className="py-1 text-slate-200 border-b border-dotted border-slate-800/70">
                  {g.unit.name}
                  {g.count > 1 && (
                    <span className="text-amber-400 font-mono text-[11px]"> ×{g.count}</span>
                  )}
                  {g.unit.isWarlord && (
                    <span className="text-red-400 text-[10px] tracking-wide ml-1.5">WARLORD</span>
                  )}
                  {g.unit.enhancement && (
                    <div className="text-slate-600 text-[11px]">{g.unit.enhancement}</div>
                  )}
                </td>
                <td className="py-1 pl-4 text-right font-mono text-xs text-slate-300 whitespace-nowrap border-b border-dotted border-slate-800/70">
                  {g.points}
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
        <tr>
          <td className="pt-2 font-semibold text-slate-100 border-t border-slate-700">Total</td>
          <td className="pt-2 text-right font-mono font-semibold text-amber-400 border-t border-slate-700">
            {total}
            {pkg.meta.totalPoints > 0 && total !== pkg.meta.totalPoints && (
              <span className="text-slate-600"> / {pkg.meta.totalPoints}</span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/** Each unit a tile with a role-coloured spine and the points as the loud number. */
function TilesLayout({ sections }: { sections: RoleSection[] }) {
  return (
    <div className="mt-3">
      {sections.map((section) => (
        <div key={section.role}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1.5">
            {section.heading} · {section.points}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {section.groups.map((g) => (
              <div
                key={g.key}
                className={`rounded border border-l-[3px] border-slate-800 bg-slate-950/60 px-2.5 py-2 ${
                  ROLE_SPINE[section.role] ?? 'border-l-slate-600'
                }`}
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-slate-200 text-xs font-medium leading-tight">
                    {g.unit.name}
                    {g.count > 1 && <span className="text-amber-400"> ×{g.count}</span>}
                  </span>
                  <span className="text-slate-100 text-[13px] font-mono font-semibold">
                    {g.points}
                  </span>
                </div>
                {g.unit.wargear.length > 0 && (
                  <div className="text-slate-600 text-[10px] mt-1 leading-snug">
                    {gearLine(g.unit)}
                  </div>
                )}
                {(g.unit.isWarlord || g.unit.enhancement) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {g.unit.isWarlord && (
                      <span className="rounded bg-red-400/10 px-1 py-px text-[9px] text-red-400">
                        Warlord
                      </span>
                    )}
                    {g.unit.enhancement && (
                      <span className="rounded bg-amber-400/10 px-1 py-px text-[9px] text-amber-400">
                        {g.unit.enhancement}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
