import { useState } from 'react'

import { factionDisplayName } from '../../lib/faction-names'
import { ErrataSection } from './ErrataSection'
import type { CardContext, UnitCardData, WeaponProfile } from './types'

// Universal Special Rules — these are core rules, not unit-specific abilities.
// Displayed as collapsible badges rather than expanded ability boxes.
const USR_NAMES = new Set([
  'deep strike',
  'deadly demise',
  'feel no pain',
  'fights first',
  'firing deck',
  'hover',
  'infiltrators',
  'scouts',
  'stealth',
  'lone operative',
  'leader',
  'assault',
  'heavy',
  'rapid fire',
])

function isUSR(name: string): boolean {
  return USR_NAMES.has(
    name
      .toLowerCase()
      .replace(/\s*\d+\+?\s*$/, '')
      .trim(),
  )
}

interface UnitCardProps {
  data: UnitCardData
  context: CardContext
}

function isHighlighted(text: string, terms: string[]): boolean {
  if (!terms.length || !text) return false
  const lower = text.toLowerCase()
  return terms.some((t) => lower.includes(t.toLowerCase()))
}

function Clickable({
  term,
  onClick,
  className,
  children,
}: {
  term: string
  onClick: (t: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={className}
      onClick={() => onClick(term)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(term)
      }}
      style={{ cursor: 'pointer' }}
    >
      {children}
    </span>
  )
}

function CollapsibleUSR({
  ability,
  highlighted,
  onContentClick,
}: {
  ability: { name: string; description: string }
  highlighted: boolean
  onContentClick: (term: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className={`rounded border p-1.5 cursor-pointer transition-colors ${
        highlighted
          ? 'border-green-500 bg-green-900/30'
          : 'border-green-900 bg-slate-800/50 hover:border-green-700'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <span
          role="button"
          tabIndex={0}
          className="text-xs font-bold text-green-300 uppercase tracking-wide hover:text-green-200 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onContentClick(ability.name)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
              onContentClick(ability.name)
            }
          }}
        >
          {ability.name}
        </span>
        <span className="text-[10px] text-slate-500">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <p className="text-[11px] text-slate-300 mt-1 leading-snug">{ability.description}</p>
      )}
    </div>
  )
}

// Keyword → Core Stratagem mapping
// These are core stratagems gated by unit keywords.
const KEYWORD_STRATAGEMS: Record<
  string,
  { name: string; cp: string; when: string; effect: string }
> = {
  grenades: {
    name: 'GRENADE',
    cp: '1',
    when: 'Your Shooting phase.',
    effect:
      'Select one enemy unit within 8" and visible. Roll 6 dice — for each 4+, the target takes 1 mortal wound.',
  },
  smoke: {
    name: 'SMOKESCREEN',
    cp: '1',
    when: "Opponent's Shooting phase, after targets selected.",
    effect: 'Until end of phase, all models in your unit have Benefit of Cover and Stealth.',
  },
  infantry: {
    name: 'GO TO GROUND',
    cp: '1',
    when: "Opponent's Shooting phase, after targets selected.",
    effect:
      'Until end of phase, all models in your unit have a 6+ invulnerable save and Benefit of Cover.',
  },
}

function KeywordWithStratagem({
  kw,
  display,
  onContentClick,
}: {
  kw: string
  display: string
  onContentClick: (term: string) => void
}) {
  const strat = KEYWORD_STRATAGEMS[kw.toLowerCase()]
  const [showTooltip, setShowTooltip] = useState(false)

  if (!strat) {
    return (
      <Clickable
        term={kw}
        onClick={onContentClick}
        className="text-[11px] text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded hover:text-amber-400 hover:bg-slate-600 transition-colors"
      >
        {display}
      </Clickable>
    )
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Clickable
        term={kw}
        onClick={onContentClick}
        className="text-[11px] text-amber-300 bg-slate-700 px-1.5 py-0.5 rounded hover:text-amber-200 hover:bg-slate-600 transition-colors border border-amber-900/50"
      >
        {display} ⚡
      </Clickable>
      {showTooltip && (
        <div
          className="absolute z-50 bottom-full left-0 mb-1 w-64 bg-slate-900 border border-blue-800 rounded-md shadow-xl p-2.5"
          style={{ fontFamily: "'Source Sans 3', sans-serif" }}
        >
          <div className="flex items-start justify-between mb-1">
            <span
              className="text-xs font-bold text-white uppercase tracking-wide"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              {strat.name}
            </span>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/20 px-1.5 py-0.5 rounded">
              {strat.cp}CP
            </span>
          </div>
          <div className="text-[10px] text-blue-400 mb-1">Core Stratagem</div>
          <div className="text-[10px] mb-0.5">
            <span className="font-bold text-blue-400 uppercase mr-1">WHEN:</span>
            <span className="text-slate-300">{strat.when}</span>
          </div>
          <div className="text-[10px]">
            <span className="font-bold text-blue-400 uppercase mr-1">EFFECT:</span>
            <span className="text-slate-300">{strat.effect}</span>
          </div>
        </div>
      )}
    </span>
  )
}

function ToughnessStat({ value }: { value: string }) {
  const [showTooltip, setShowTooltip] = useState(false)
  return (
    <div
      className="flex flex-col items-center min-w-[32px] relative cursor-pointer"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="text-[10px] text-amber-400 uppercase tracking-widest font-medium">T ⚡</span>
      <span
        className="text-[17px] font-bold text-white leading-tight"
        style={{ fontFamily: "'Oswald', sans-serif" }}
      >
        {value}
      </span>
      {showTooltip && (
        <div
          className="absolute z-50 top-full mt-1 w-56 bg-slate-900 border border-blue-800 rounded-md shadow-xl p-2.5"
          style={{
            fontFamily: "'Source Sans 3', sans-serif",
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-start justify-between mb-1">
            <span
              className="text-xs font-bold text-white uppercase tracking-wide"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              TANK SHOCK
            </span>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/20 px-1.5 py-0.5 rounded">
              1CP
            </span>
          </div>
          <div className="text-[10px] text-blue-400 mb-1">Core Stratagem</div>
          <div className="text-[10px] mb-0.5">
            <span className="font-bold text-blue-400 uppercase mr-1">WHEN:</span>
            <span className="text-slate-300">
              Your Charge phase, after this unit ends a Charge move.
            </span>
          </div>
          <div className="text-[10px]">
            <span className="font-bold text-blue-400 uppercase mr-1">EFFECT:</span>
            <span className="text-slate-300">
              Roll {value} D6 (= Toughness). Each 5+ deals 1 mortal wound (max 6).
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function WeaponAbilityTags({
  abilities,
  onClick,
}: {
  abilities: string
  onClick: (t: string) => void
}) {
  if (!abilities) return null
  // Extract [TAG] tokens
  const tags = Array.from(abilities.matchAll(/\[([^\]]+)\]/g)).map((m) => m[1])
  if (!tags.length) return null
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Clickable
          key={tag}
          term={tag!}
          onClick={onClick}
          className="text-[10px] font-semibold uppercase tracking-wide bg-slate-700 text-amber-300 px-1 rounded hover:bg-slate-600 hover:text-amber-200 transition-colors cursor-pointer"
        >
          {tag}
        </Clickable>
      ))}
    </span>
  )
}

function WeaponTable({
  weapons,
  headerColor,
  highlightTerms,
  onContentClick,
}: {
  weapons: WeaponProfile[]
  headerColor: 'amber' | 'red'
  highlightTerms: string[]
  onContentClick: (t: string) => void
}) {
  if (!weapons.length) return null
  const headerBg = headerColor === 'amber' ? 'bg-amber-600' : 'bg-red-700'
  const label = headerColor === 'amber' ? 'RANGED WEAPONS' : 'MELEE WEAPONS'

  return (
    <div className="mb-2">
      <div
        className={`${headerBg} text-white text-[11px] font-bold uppercase tracking-widest px-2 py-0.5`}
      >
        {label}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] md:text-[13px] border-collapse">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-[9px] md:text-[10px] uppercase tracking-wider">
              <th className="text-left px-2 py-0.5 font-medium">Weapon</th>
              <th className="text-center px-1 py-0.5 font-medium">Range</th>
              <th className="text-center px-1 py-0.5 font-medium">A</th>
              <th className="text-center px-1 py-0.5 font-medium">BS/WS</th>
              <th className="text-center px-1 py-0.5 font-medium">S</th>
              <th className="text-center px-1 py-0.5 font-medium">AP</th>
              <th className="text-center px-1 py-0.5 font-medium">D</th>
            </tr>
          </thead>
          <tbody>
            {weapons.map((w, i) => {
              const highlight = isHighlighted(w.abilities, highlightTerms)
              return (
                <tr
                  key={`${w.name}-${i}`}
                  data-weapon="true"
                  data-highlight={highlight ? 'true' : undefined}
                  className={
                    highlight
                      ? 'bg-amber-900/40 border-b border-slate-700'
                      : 'bg-slate-900 border-b border-slate-700 odd:bg-slate-850'
                  }
                >
                  <td className="px-2 py-0.5 text-slate-200">
                    {w.name}
                    <WeaponAbilityTags abilities={w.abilities} onClick={onContentClick} />
                  </td>
                  <td className="text-center px-1 py-0.5 text-slate-300">{w.range}</td>
                  <td className="text-center px-1 py-0.5 text-slate-300">{w.attacks}</td>
                  <td className="text-center px-1 py-0.5 text-slate-300">{w.skill}</td>
                  <td className="text-center px-1 py-0.5 text-slate-300">{w.strength}</td>
                  <td className="text-center px-1 py-0.5 text-slate-300">{w.ap}</td>
                  <td className="text-center px-1 py-0.5 text-slate-300">{w.damage}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function UnitCard({ data, context }: UnitCardProps) {
  const { highlightTerms, onContentClick } = context
  const stats = data.stats

  return (
    <div
      className="rounded-lg overflow-hidden bg-slate-900 border border-slate-700 text-slate-100 font-sans w-full"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      {/* Header */}
      <div
        className="px-2 py-2 md:px-3 flex items-start justify-between"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 60%, #1d4ed8 100%)' }}
      >
        <div>
          <h2
            className="text-xl font-bold uppercase tracking-wide text-white leading-tight"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {data.name}
          </h2>
          <div className="text-[13px] text-blue-200 mt-0.5 uppercase tracking-wide">
            {(() => {
              const raw = data.subfaction || data.factionKeywords[0] || data.factionId
              if (!raw) return null
              const label = factionDisplayName(raw)
              return (
                <Clickable
                  term={raw}
                  onClick={onContentClick}
                  className="hover:text-white transition-colors"
                >
                  {label}
                </Clickable>
              )
            })()}
          </div>
        </div>
        <div className="ml-3 text-right flex-shrink-0">
          <span
            className="text-amber-400 font-bold text-[15px]"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {data.points}
          </span>
          <div className="text-blue-300 text-[11px] uppercase tracking-wider mt-0.5">
            {data.derivedType}
          </div>
        </div>
      </div>

      {/* Stat line */}
      <div className="bg-slate-800 border-b border-slate-700 px-2 py-1.5 flex flex-wrap items-center justify-around gap-1">
        {[
          { label: 'M', value: stats.move },
          { label: 'T', value: stats.toughness },
          { label: 'SV', value: stats.save },
          { label: 'W', value: stats.wounds },
          { label: 'LD', value: stats.leadership },
          { label: 'OC', value: stats.oc },
          ...(stats.invSv ? [{ label: 'INV', value: stats.invSv }] : []),
          ...(stats.fnp ? [{ label: 'FNP', value: stats.fnp }] : []),
        ].map(({ label, value }) => {
          const isVehicle = data.keywords.some((k) => k.toLowerCase() === 'vehicle')
          const isToughness = label === 'T' && isVehicle
          return isToughness ? (
            <ToughnessStat key={label} value={value} />
          ) : (
            <div key={label} className="flex flex-col items-center min-w-[32px]">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">
                {label}
              </span>
              <span
                className="text-[17px] font-bold text-white leading-tight"
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                {value}
              </span>
            </div>
          )
        })}
      </div>

      {/* Two-column body */}
      <div className="flex flex-col md:grid md:grid-cols-2 gap-0 border-b border-slate-700">
        {/* Left: Weapons */}
        <div className="border-b border-slate-700 md:border-b-0 md:border-r p-2">
          <WeaponTable
            weapons={data.rangedWeapons}
            headerColor="amber"
            highlightTerms={highlightTerms}
            onContentClick={onContentClick}
          />
          <WeaponTable
            weapons={data.meleeWeapons}
            headerColor="red"
            highlightTerms={highlightTerms}
            onContentClick={onContentClick}
          />
        </div>

        {/* Right: Abilities */}
        <div className="p-2">
          <div className="bg-green-800 text-white text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 mb-2">
            ABILITIES
          </div>

          {/* Core ability badges */}
          {data.coreAbilities.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {data.coreAbilities.map((ca) => {
                const highlighted = isHighlighted(ca, highlightTerms)
                return (
                  <Clickable
                    key={ca}
                    term={ca}
                    onClick={onContentClick}
                    className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                      highlighted
                        ? 'bg-green-800/60 border-green-500 text-green-200'
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-green-600 hover:text-green-300'
                    }`}
                  >
                    {ca}
                  </Clickable>
                )
              })}
            </div>
          )}

          {/* Custom/unique abilities — always expanded */}
          <div className="flex flex-col gap-2">
            {data.abilities
              .filter((a) => !isUSR(a.name))
              .map((ability) => {
                const highlighted = isHighlighted(
                  ability.name + ' ' + ability.description,
                  highlightTerms,
                )
                return (
                  <div
                    key={ability.name}
                    data-highlight={highlighted ? 'true' : undefined}
                    className={`rounded border p-1.5 ${
                      highlighted
                        ? 'border-green-400 bg-green-900/40'
                        : 'border-green-800 bg-green-950/30'
                    }`}
                  >
                    <Clickable
                      term={ability.name}
                      onClick={onContentClick}
                      className="text-xs font-bold text-green-200 uppercase tracking-wide hover:text-green-100 transition-colors block"
                    >
                      {ability.name}
                    </Clickable>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                      {ability.description}
                    </p>
                  </div>
                )
              })}
          </div>

          {/* USR abilities — collapsed, click to expand rule text */}
          {data.abilities.filter((a) => isUSR(a.name)).length > 0 && (
            <div className="flex flex-col gap-1 mt-2">
              {data.abilities
                .filter((a) => isUSR(a.name))
                .map((ability) => (
                  <CollapsibleUSR
                    key={ability.name}
                    ability={ability}
                    highlighted={isHighlighted(
                      ability.name + ' ' + ability.description,
                      highlightTerms,
                    )}
                    onContentClick={onContentClick}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Keywords bar */}
      <div className="bg-slate-800 border-b border-slate-700 px-3 py-1.5 flex flex-wrap gap-1 items-center justify-between">
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mr-1">
            Keywords:
          </span>
          {data.keywords
            .filter((kw) => !kw.startsWith('type:'))
            .map((kw) => {
              const display = kw.toLowerCase() === 'characters' ? 'Character' : kw
              return (
                <KeywordWithStratagem
                  key={kw}
                  kw={kw}
                  display={display}
                  onContentClick={onContentClick}
                />
              )
            })}
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          {data.factionKeywords.map((fk) => (
            <Clickable
              key={`fk-${fk}`}
              term={fk}
              onClick={onContentClick}
              className="text-[11px] text-blue-300 bg-blue-900/40 border border-blue-800 px-1.5 py-0.5 rounded hover:text-blue-200 transition-colors"
            >
              {factionDisplayName(fk)}
            </Clickable>
          ))}
        </div>
      </div>

      <ErrataSection errata={data.errata} />

      {/* Footer */}
      <div className="px-3 py-2 bg-slate-950 text-[11px] text-slate-400 space-y-1">
        {data.composition && (
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              Composition:{' '}
            </span>
            <span className="text-slate-300">{data.composition}</span>
          </div>
        )}
        {data.loadout && (
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              Loadout:{' '}
            </span>
            <span className="text-slate-300">{data.loadout}</span>
          </div>
        )}
        {data.wargearOptions && (
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              Wargear Options:{' '}
            </span>
            <span className="text-slate-300 whitespace-pre-line">{data.wargearOptions}</span>
          </div>
        )}
        {data.leaders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              Eligible Leaders:{' '}
            </span>
            {data.leaders.map((leader) => (
              <Clickable
                key={leader}
                term={leader}
                onClick={onContentClick}
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
              >
                {leader}
              </Clickable>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
