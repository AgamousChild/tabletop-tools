import type { Enhancement } from '@tabletop-tools/game-data-store'
import { useUnit as useUnitProfile } from '@tabletop-tools/game-data-store'
import { CollapsibleSection, htmlToText } from '@tabletop-tools/ui'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { BattleSize, ValidationError } from '../lib/armyRules'
import { validateArmy } from '../lib/armyRules'
import type { DetachmentRestriction } from '../lib/detachmentRestrictions'
import { formatRestrictionText, parseDetachmentRestrictions } from '../lib/detachmentRestrictions'
import { trpc, trpcClient } from '../lib/trpc'
import {
  useGameDetachment,
  useGameDetachmentAbilities,
  useGameEnhancements,
  useGameUnitKeywords,
  useLegendsUnitIds,
  useUnitModelOptions,
  useUnitRoles,
  useUnits,
} from '../lib/useGameData'
import {
  addUnitV2Imperative,
  deleteListV2Imperative,
  type ListUnitV2,
  removeUnitV2Imperative,
  updateListV2Imperative,
  updateUnitV2Imperative,
  useInvalidateListsV2,
  useListV2,
} from '../lib/useListsV2'
import { RatingBadge } from './RatingBadge'

type Props = {
  listId: string
  factionId: string
  detachmentId: string
  battleSize: BattleSize
  onDone: () => void
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the display name for a unit from the catalog. Falls back to datasheetId. */
function useUnitDisplayName(datasheetId: string | null): string {
  const { data: profile } = useUnitProfile(datasheetId ?? '')
  if (!datasheetId) return 'Unknown unit'
  return profile?.name ?? datasheetId
}

/** Resolve an enhancement's display name + cost from the catalog. */
function useEnhancementDisplay(
  enhancementId: string | null,
  detachmentId: string,
): { name: string | null; cost: number } {
  const { data: enhancements } = useGameEnhancements(detachmentId)
  const enh = enhancements.find((e: Enhancement) => e.id === enhancementId)
  if (!enh) return { name: null, cost: 0 }
  return { name: enh.name, cost: parseInt(enh.cost, 10) || 0 }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModelCountPicker({
  unitId,
  unitName,
  defaultPoints,
  remaining,
  onSelect,
}: {
  unitId: string
  unitName: string
  defaultPoints: number
  remaining: number
  onSelect: (unitId: string, unitName: string, unitPoints: number, modelCount?: number) => void
}) {
  const options = useUnitModelOptions(unitId)

  if (options.length <= 1) {
    const pts = options.length === 1 ? options[0]!.points : defaultPoints
    const mc = options.length === 1 ? options[0]!.modelCount : undefined
    return (
      <button
        onClick={() => onSelect(unitId, unitName, pts, mc)}
        disabled={pts > remaining}
        className="ml-3 px-3 py-1 rounded bg-amber-400 text-slate-950 text-sm font-semibold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Add
      </button>
    )
  }

  return (
    <div className="ml-3 flex gap-1 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.modelCount}
          onClick={() => onSelect(unitId, unitName, opt.points, opt.modelCount)}
          disabled={opt.points > remaining}
          className="px-2 py-1 rounded bg-amber-400 text-slate-950 text-xs font-semibold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
          title={opt.description}
        >
          {opt.modelCount}m/{opt.points}pts
        </button>
      ))}
    </div>
  )
}

function UnitKeywordBadges({ unitId }: { unitId: string }) {
  const { data: keywords } = useGameUnitKeywords(unitId)
  const charKeyword = keywords.find((k) => k.keyword.toUpperCase() === 'CHARACTER')
  const legendKeyword = keywords.find(
    (k) => k.keyword.toUpperCase() === 'LEGENDS' || k.keyword.toUpperCase() === 'LEGEND',
  )
  return (
    <>
      {charKeyword && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-400 font-semibold">
          CHARACTER
        </span>
      )}
      {legendKeyword && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/20 text-red-400 font-semibold">
          LEGENDS
        </span>
      )}
    </>
  )
}

function useIsCharacter(unitId: string): boolean {
  const { data: keywords } = useGameUnitKeywords(unitId)
  return keywords.some((k) => k.keyword.toUpperCase() === 'CHARACTER')
}

function WarlordButton({
  unit,
  datasheetId,
  onToggle,
}: {
  unit: ListUnitV2
  datasheetId: string
  onToggle: () => void
}) {
  const isCharacter = useIsCharacter(datasheetId)
  if (!isCharacter && !unit.isWarlord) return null
  return (
    <button
      onClick={onToggle}
      className={`px-2 py-1 rounded text-xs ${
        unit.isWarlord
          ? 'bg-amber-400 text-slate-950 font-bold'
          : 'bg-slate-700 text-slate-400 hover:bg-amber-400/20 hover:text-amber-400'
      }`}
      title={unit.isWarlord ? 'Remove as Warlord' : 'Set as Warlord'}
    >
      {unit.isWarlord ? 'Warlord' : 'Set Warlord'}
    </button>
  )
}

function EnhancementPicker({
  unit,
  detachmentId,
  onSelect,
}: {
  unit: ListUnitV2
  detachmentId: string
  onSelect: (enhId: string | undefined) => void
}) {
  const { data: enhancements } = useGameEnhancements(detachmentId)
  if (enhancements.length === 0) return null
  return (
    <select
      value={unit.enhancementId ?? ''}
      onChange={(e) => {
        onSelect(e.target.value || undefined)
      }}
      className="text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:border-amber-400"
      title="Select enhancement"
    >
      <option value="">No enhancement</option>
      {enhancements.map((enh: Enhancement) => (
        <option key={enh.id} value={enh.id}>
          {enh.name} (+{parseInt(enh.cost) || 0}pts)
        </option>
      ))}
    </select>
  )
}

/**
 * AttachmentPicker — shown on CHARACTER units.
 *
 * Displays a Leader/Support role selector and a bodyguard dropdown populated
 * from listV2.eligibleBodyguards (server-side, data-driven from content_can_lead).
 * Shows a "Deploy solo" option unless can_deploy_solo=false for this datasheet.
 *
 * All attachment data comes from server queries — no hardcoded character or
 * bodyguard lists anywhere in this component.
 */
export function AttachmentPicker({
  listId,
  unit,
  getBodyguardName,
  onAttach,
}: {
  listId: string
  unit: ListUnitV2
  /** Resolves a datasheetId to a display name (from the unit catalog). */
  getBodyguardName: (datasheetId: string | null) => string
  onAttach: (attachedToUnitId: string | null, attachRole: 'leader' | 'support' | null) => void
}) {
  const [role, setRole] = useState<'leader' | 'support'>(
    (unit.attachRole as 'leader' | 'support' | null) ?? 'leader',
  )

  const { data: eligibleUnits = [] } = trpc.listV2.eligibleBodyguards.useQuery(
    { listId, datasheetId: unit.datasheetId!, role },
    { enabled: !!unit.datasheetId },
  )
  const { data: soloData } = trpc.listV2.canDeploySolo.useQuery(
    { datasheetId: unit.datasheetId! },
    { enabled: !!unit.datasheetId },
  )
  const canDeploySolo = soloData?.canDeploySolo ?? true

  // Current selection: the attached unit's id if the role matches, else empty.
  const currentAttachId = unit.attachRole === role ? (unit.attachedToUnitId ?? '') : ''

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '' || val === '__solo__') {
      onAttach(null, null)
    } else {
      onAttach(val, role)
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {/* Role selector */}
      <select
        aria-label="role"
        value={role}
        onChange={(e) => setRole(e.target.value as 'leader' | 'support')}
        className="text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:border-amber-400"
      >
        <option value="leader">Leader</option>
        <option value="support">Support</option>
      </select>
      {/* Bodyguard picker — populated from server query (data-driven) */}
      <select
        aria-label="Attach to"
        value={currentAttachId}
        onChange={handleSelect}
        className="text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:border-amber-400"
      >
        {canDeploySolo && <option value="">Deploy solo</option>}
        {eligibleUnits.map((bg) => (
          <option key={bg.id} value={bg.id}>
            {getBodyguardName(bg.datasheetId)}
          </option>
        ))}
      </select>
    </div>
  )
}

function UnitStatLine({ datasheetId }: { datasheetId: string }) {
  const { data: profile } = useUnitProfile(datasheetId)
  if (!profile) return null
  return (
    <span className="text-[11px] text-slate-500 font-mono" data-testid="unit-stat-line">
      M{profile.move}" T{profile.toughness} Sv{profile.save}+
      {profile.invulnSave ? `/${profile.invulnSave}++` : ''} W{profile.wounds} Ld
      {profile.leadership}+ OC{profile.oc}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Unit row — reads catalog data per-unit
// ---------------------------------------------------------------------------

function UnitRow({
  unit,
  listId,
  detachmentId,
  ratingMap,
  onRemove,
  onToggleWarlord,
  onSetEnhancement,
  onSetAttachment,
  getBodyguardName,
}: {
  unit: ListUnitV2
  listId: string
  detachmentId: string
  ratingMap: Map<string, string>
  onRemove: () => void
  onToggleWarlord: () => void
  onSetEnhancement: (enhId: string | undefined) => void
  onSetAttachment: (
    attachedToUnitId: string | null,
    attachRole: 'leader' | 'support' | null,
  ) => void
  getBodyguardName: (datasheetId: string | null) => string
}) {
  const datasheetId = unit.datasheetId ?? ''
  const unitName = useUnitDisplayName(unit.datasheetId)
  const { name: enhName, cost: enhCost } = useEnhancementDisplay(unit.enhancementId, detachmentId)
  const isCharacter = useIsCharacter(datasheetId)

  return (
    <div
      className={`p-3 rounded-lg bg-slate-900 border ${unit.isWarlord ? 'border-amber-400' : 'border-slate-800'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-100">{unitName}</span>
            <RatingBadge rating={ratingMap.get(datasheetId) ?? null} />
            {unit.isWarlord && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-bold">
                WARLORD
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            {unit.points}pts
            {enhName && (
              <span className="text-amber-400">
                {' '}
                · {enhName} +{enhCost}pts
              </span>
            )}
          </p>
          {datasheetId && <UnitStatLine datasheetId={datasheetId} />}
          {isCharacter && datasheetId && (
            <AttachmentPicker
              listId={listId}
              unit={unit}
              getBodyguardName={getBodyguardName}
              onAttach={onSetAttachment}
            />
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <WarlordButton unit={unit} datasheetId={datasheetId} onToggle={onToggleWarlord} />
          <EnhancementPicker unit={unit} detachmentId={detachmentId} onSelect={onSetEnhancement} />
          <button
            onClick={onRemove}
            className="px-2 py-1 rounded bg-slate-700 text-slate-400 hover:bg-red-900 hover:text-red-400 text-xs"
          >
            X
          </button>
        </div>
      </div>
    </div>
  )
}

const ROLE_FILTERS = [
  'All',
  'Battleline',
  'Characters',
  'Other',
  'Dedicated Transports',
  'Fortifications',
] as const
type RoleFilter = (typeof ROLE_FILTERS)[number]

// ---------------------------------------------------------------------------
// MyArmyView — shows the list of chosen units
// ---------------------------------------------------------------------------

function MyArmyView({
  listUnits,
  listId,
  listName,
  factionId,
  detachmentId,
  detachmentName,
  totalPts,
  remaining,
  battleSize,
  errors,
  suggestion,
  ratingMap,
  onAddUnit,
  onRemoveUnit,
  onToggleWarlord,
  onSetEnhancement,
  onSetAttachment,
  getBodyguardName,
  onExport,
  onDone,
  onDeleteList,
  onBack,
  exportCopied,
  editingName,
  editingDesc,
  nameValue,
  descValue,
  onStartEditName,
  onChangeName,
  onSaveName,
  onStartEditDesc,
  onChangeDesc,
  onSaveDesc,
  detachmentAbilities,
  restrictions,
}: {
  listUnits: ListUnitV2[]
  listId: string
  listName: string
  _listDescription: string
  factionId: string
  detachmentId: string
  detachmentName: string
  totalPts: number
  remaining: number
  battleSize: BattleSize
  errors: ValidationError[]
  suggestion: {
    addedName: string
    addedRating: string | null
    alternatives: Array<{ datasheetId: string; unitName: string; rating: string; points: number }>
  } | null
  ratingMap: Map<string, string>
  onAddUnit: () => void
  onRemoveUnit: (id: string) => void
  onToggleWarlord: (unit: ListUnitV2) => void
  onSetEnhancement: (unit: ListUnitV2, enhId: string | undefined) => void
  onSetAttachment: (
    unit: ListUnitV2,
    attachedToUnitId: string | null,
    attachRole: 'leader' | 'support' | null,
  ) => void
  getBodyguardName: (datasheetId: string | null) => string
  onExport: () => void
  onDone: () => void
  onDeleteList: () => void
  onBack: () => void
  exportCopied: boolean
  editingName: boolean
  editingDesc: boolean
  nameValue: string
  descValue: string
  onStartEditName: () => void
  onChangeName: (v: string) => void
  onSaveName: () => void
  onStartEditDesc: () => void
  onChangeDesc: (v: string) => void
  onSaveDesc: () => void
  detachmentAbilities: Array<{ id: string; name: string; legend: string; description: string }>
  restrictions: DetachmentRestriction[]
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-sm">
            &larr; Lists
          </button>
          <div>
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => onChangeName(e.target.value)}
                onBlur={onSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveName()
                }}
                className="bg-slate-900 border border-amber-400 rounded px-2 py-0.5 text-slate-100 font-semibold focus:outline-none"
              />
            ) : (
              <h2
                className="font-semibold text-slate-100 cursor-pointer hover:text-amber-400"
                onClick={onStartEditName}
                title="Click to rename"
              >
                {listName || 'List'}
              </h2>
            )}
            <p className="text-xs text-slate-400">
              {factionId} — {detachmentName}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-amber-400 tabular-nums">
            {totalPts}
            <span className="text-sm text-slate-500">/{battleSize.points}pts</span>
          </p>
          <p className="text-xs text-slate-400">{remaining}pts remaining</p>
        </div>
      </div>

      {/* Description */}
      {editingDesc ? (
        <textarea
          autoFocus
          value={descValue}
          onChange={(e) => onChangeDesc(e.target.value)}
          onBlur={onSaveDesc}
          placeholder="Add notes about this list..."
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-amber-400 text-slate-100 placeholder-slate-500 focus:outline-none text-sm resize-none"
          rows={2}
        />
      ) : (
        <button
          onClick={onStartEditDesc}
          className="text-left w-full text-sm text-slate-500 hover:text-slate-300 py-1"
        >
          {descValue || 'Add notes about this list...'}
        </button>
      )}

      {/* Detachment rules */}
      {detachmentAbilities.length > 0 && (
        <CollapsibleSection title={`${detachmentName} Rules`} count={detachmentAbilities.length}>
          <div className="space-y-2">
            {detachmentAbilities.map((ability) => (
              <div key={ability.id} className="text-xs">
                <p className="font-semibold text-amber-400">{ability.name}</p>
                {ability.legend && <p className="text-slate-500 italic">{ability.legend}</p>}
                <p className="text-slate-400 mt-0.5 whitespace-pre-wrap">
                  {htmlToText(ability.description)}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Detachment restrictions banner */}
      {restrictions.length > 0 && (
        <div className="space-y-2">
          {restrictions.map((r, i) => (
            <div
              key={i}
              className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/30"
              data-testid="restriction-banner"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                  Restriction
                </span>
                {r.chapterName && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-400/20 text-red-300 font-semibold">
                    {r.chapterName} only
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 whitespace-pre-wrap">
                {formatRestrictionText(r.text)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Validation errors */}
      {errors.map((err, i) => (
        <div
          key={i}
          className={`px-3 py-2 rounded-lg text-sm ${err.type === 'NO_WARLORD' ? 'bg-amber-900/20 border border-amber-500/30 text-amber-400' : 'bg-red-900/20 border border-red-500/30 text-red-400'}`}
        >
          {err.message}
        </div>
      ))}

      {/* Add Unit button */}
      <button
        onClick={onAddUnit}
        disabled={remaining <= 0}
        className="w-full py-3 rounded-lg border-2 border-dashed border-slate-700 text-slate-400 hover:border-amber-400 hover:text-amber-400 transition-colors font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Add Unit
      </button>

      {/* Suggestion banner */}
      {suggestion && (
        <div className="p-3 rounded-lg bg-slate-800 border border-amber-400/30 text-sm">
          <p className="text-slate-400">
            Added: <span className="text-slate-100">{suggestion.addedName}</span>{' '}
            <RatingBadge rating={suggestion.addedRating} />
          </p>
          <p className="text-amber-400 mt-1 mb-1">Better alternatives at same or lower cost:</p>
          {suggestion.alternatives.map((alt, i) => (
            <p key={i} className="text-slate-300 ml-2">
              {alt.unitName} ({alt.points}pts) <RatingBadge rating={alt.rating} />
            </p>
          ))}
        </div>
      )}

      {/* Chosen units list */}
      <div className="space-y-2">
        {listUnits.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">
            No units yet. Tap "Add Unit" to get started.
          </p>
        )}
        {listUnits.map((unit) => (
          <UnitRow
            key={unit.id}
            unit={unit}
            listId={listId}
            detachmentId={detachmentId}
            ratingMap={ratingMap}
            onRemove={() => onRemoveUnit(unit.id)}
            onToggleWarlord={() => onToggleWarlord(unit)}
            onSetEnhancement={(enhId) => onSetEnhancement(unit, enhId)}
            onSetAttachment={(attachedToUnitId, attachRole) =>
              onSetAttachment(unit, attachedToUnitId, attachRole)
            }
            getBodyguardName={getBodyguardName}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-3 border-t border-slate-800">
        <button
          onClick={onExport}
          className={`flex-1 py-2 rounded-lg font-semibold text-sm ${exportCopied ? 'bg-emerald-400 text-slate-950' : 'bg-amber-400 text-slate-950 hover:bg-amber-300'}`}
        >
          {exportCopied ? 'Copied!' : 'Export list'}
        </button>
        <button
          onClick={onDone}
          className="flex-1 py-2 rounded-lg border border-amber-400 text-amber-400 hover:bg-amber-400/10 font-semibold text-sm"
        >
          Done
        </button>
        <button
          onClick={onDeleteList}
          className="px-4 py-2 rounded-lg bg-slate-800 text-red-400 hover:bg-red-900 text-sm"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddUnitView — unit browser
// ---------------------------------------------------------------------------

function AddUnitView({
  units,
  unitsLoading,
  searchQuery,
  onSearchChange,
  showLegends,
  onShowLegendsChange,
  roleFilter,
  onRoleFilterChange,
  remaining,
  ratingMap,
  unitRoles,
  onAddUnit,
  onBack,
  totalPts,
  battleSize,
  restrictions,
}: {
  units: Array<{ id: string; name: string; points: number }>
  unitsLoading: boolean
  searchQuery: string
  onSearchChange: (v: string) => void
  showLegends: boolean
  onShowLegendsChange: (v: boolean) => void
  roleFilter: RoleFilter
  onRoleFilterChange: (v: RoleFilter) => void
  remaining: number
  ratingMap: Map<string, string>
  unitRoles: Map<string, string>
  onAddUnit: (unitId: string, unitName: string, unitPoints: number, modelCount?: number) => void
  onBack: () => void
  totalPts: number
  battleSize: BattleSize
  restrictions: DetachmentRestriction[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-slate-200 text-sm flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
              clipRule="evenodd"
            />
          </svg>
          Back to List
        </button>
        <div className="text-right">
          <p className="text-lg font-bold text-amber-400 tabular-nums">
            {totalPts}
            <span className="text-sm text-slate-500">/{battleSize.points}pts</span>
          </p>
          <p className="text-xs text-slate-400">{remaining}pts remaining</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-slate-100">Add Unit</h2>

      {restrictions.length > 0 && (
        <div className="space-y-1">
          {restrictions.map((r, i) => (
            <div
              key={i}
              className="px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-500/30 text-xs text-red-300"
              data-testid="restriction-reminder"
            >
              {r.chapterName ? (
                <span>
                  <span className="font-bold text-red-400">{r.chapterName} only</span> —{' '}
                  {formatRestrictionText(r.text).slice(0, 100)}
                  {r.text.length > 100 ? '...' : ''}
                </span>
              ) : (
                <span>
                  {formatRestrictionText(r.text).slice(0, 120)}
                  {r.text.length > 120 ? '...' : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search units..."
          autoFocus
          className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showLegends}
            onChange={(e) => onShowLegendsChange(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-400 focus:ring-amber-400"
          />
          Legends
        </label>
      </div>

      <div className="flex gap-1 flex-wrap">
        {ROLE_FILTERS.map((role) => (
          <button
            key={role}
            onClick={() => onRoleFilterChange(role)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              roleFilter === role
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            {role}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {unitsLoading && <p className="text-slate-500 text-sm">Loading units...</p>}
        {!unitsLoading && units.length === 0 && (
          <p className="text-slate-500 text-sm">No units found.</p>
        )}
        {units.map((unit) => (
          <div
            key={unit.id}
            className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-100">{unit.name}</span>
                <RatingBadge rating={ratingMap.get(unit.id) ?? null} />
                {unitRoles.get(unit.id) && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-500">
                    {unitRoles.get(unit.id)}
                  </span>
                )}
                <UnitKeywordBadges unitId={unit.id} />
              </div>
              <p className="text-sm text-slate-400 mt-0.5">{unit.points}pts</p>
              <UnitStatLine datasheetId={unit.id} />
            </div>
            <ModelCountPicker
              unitId={unit.id}
              unitName={unit.name}
              defaultPoints={unit.points}
              remaining={remaining}
              onSelect={onAddUnit}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UnitSelectionScreen({
  listId,
  factionId,
  detachmentId,
  battleSize,
  onDone,
  onBack,
}: Props) {
  const [subScreen, setSubScreen] = useState<'list' | 'add'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [showLegends, setShowLegends] = useState(false)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All')
  const { data: detachmentData } = useGameDetachment(detachmentId)
  const detachmentName = detachmentData?.name ?? detachmentId
  const [suggestion, setSuggestion] = useState<{
    addedName: string
    addedRating: string | null
    alternatives: Array<{ datasheetId: string; unitName: string; rating: string; points: number }>
  } | null>(null)

  const [editingName, setEditingName] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [descValue, setDescValue] = useState('')
  const [exportCopied, setExportCopied] = useState(false)
  const nameInitialized = useRef(false)

  const invalidateLists = useInvalidateListsV2()
  const { data: activeList } = useListV2(listId)

  const { data: allUnits = [], isLoading: unitsLoading } = useUnits(
    { faction: factionId, name: searchQuery || undefined },
    true,
  )
  const legendsIds = useLegendsUnitIds()
  const unitRoles = useUnitRoles()
  const units = useMemo(() => {
    let filtered = showLegends ? allUnits : allUnits.filter((u) => !legendsIds.has(u.id))
    if (roleFilter !== 'All') {
      filtered = filtered.filter((u) => {
        const role = unitRoles.get(u.id) ?? ''
        return role.toLowerCase() === roleFilter.toLowerCase()
      })
    }
    return filtered
  }, [allUnits, legendsIds, showLegends, roleFilter, unitRoles])

  const { data: detachmentAbilities = [] } = useGameDetachmentAbilities(detachmentId)
  const restrictions = useMemo(
    () => parseDetachmentRestrictions(detachmentAbilities),
    [detachmentAbilities],
  )

  const { data: allRatings = [] } = trpc.rating.alternatives.useQuery({})
  const ratingMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of allRatings) {
      map.set(r.unitContentId, r.rating)
    }
    return map
  }, [allRatings])

  const unitPointsMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const u of units) {
      map.set(u.id, u.points)
    }
    return map
  }, [units])

  // Initialize name/desc from server list data
  useEffect(() => {
    if (activeList && !nameInitialized.current) {
      setNameValue(activeList.name)
      setDescValue(activeList.description ?? '')
      nameInitialized.current = true
    }
  }, [activeList])

  const listUnits = activeList?.units ?? []
  const totalPts = listUnits.reduce((sum, u) => sum + u.points, 0)
  const remaining = battleSize.points - totalPts

  const errors: ValidationError[] = activeList
    ? validateArmy(
        listUnits.map((u) => ({
          unitContentId: u.datasheetId ?? '',
          unitName: u.datasheetId ?? '',
          unitPoints: u.points,
          count: 1,
          isWarlord: u.isWarlord,
          role: unitRoles.get(u.datasheetId ?? ''),
        })),
        battleSize,
      )
    : []

  async function handleAddUnit(
    unitId: string,
    unitName: string,
    unitPoints: number,
    _modelCount?: number,
  ) {
    if (!activeList) return

    await addUnitV2Imperative({
      listId,
      datasheetId: unitId,
      isWarlord: false,
      points: unitPoints,
    })

    // Recompute totalPoints on the list
    await trpcClient.listV2.computePoints.mutate({ listId })

    invalidateLists()
    setSubScreen('list')

    // Fetch alternatives and show suggestions
    try {
      const alternatives = await trpcClient.rating.alternatives.query({})
      const addedRating = ratingMap.get(unitId) ?? null
      const ratingOrder = ['S', 'A', 'B', 'C', 'D']
      const addedRank = addedRating ? ratingOrder.indexOf(addedRating) : 999
      const filtered = alternatives
        .filter((alt: { unitContentId: string; rating: string }) => {
          if (alt.unitContentId === unitId) return false
          const altPts = unitPointsMap.get(alt.unitContentId) ?? 0
          if (altPts === 0 || altPts > unitPoints) return false
          const altRank = ratingOrder.indexOf(alt.rating)
          return altRank < addedRank
        })
        .slice(0, 3)
        .map((alt: { unitContentId: string; rating: string }) => ({
          datasheetId: alt.unitContentId,
          unitName: units.find((u) => u.id === alt.unitContentId)?.name ?? alt.unitContentId,
          rating: alt.rating,
          points: unitPointsMap.get(alt.unitContentId) ?? 0,
        }))

      if (filtered.length > 0) {
        setSuggestion({ addedName: unitName, addedRating, alternatives: filtered })
      } else {
        setSuggestion(null)
      }
    } catch {
      setSuggestion(null)
    }
  }

  async function handleToggleWarlord(unit: ListUnitV2) {
    if (!activeList) return
    const newValue = !unit.isWarlord
    // Clear all other warlord flags first
    for (const u of listUnits) {
      if (u.isWarlord && u.id !== unit.id) {
        await updateUnitV2Imperative({ id: u.id, isWarlord: false })
      }
    }
    await updateUnitV2Imperative({ id: unit.id, isWarlord: newValue })
    invalidateLists()
  }

  async function handleSetEnhancement(unit: ListUnitV2, enhId: string | undefined) {
    if (!activeList) return
    await updateUnitV2Imperative({
      id: unit.id,
      enhancementId: enhId ?? null,
    })
    invalidateLists()
  }

  async function handleSetAttachment(
    unit: ListUnitV2,
    attachedToUnitId: string | null,
    attachRole: 'leader' | 'support' | null,
  ) {
    if (!activeList) return
    await updateUnitV2Imperative({ id: unit.id, attachedToUnitId, attachRole })
    invalidateLists()
  }

  async function handleRemoveUnit(listUnitId: string) {
    if (!activeList) return
    await removeUnitV2Imperative(listUnitId)
    await trpcClient.listV2.computePoints.mutate({ listId })
    invalidateLists()
  }

  async function handleDeleteList() {
    if (!activeList) return
    if (!confirm(`Delete "${activeList.name}"?`)) return
    await deleteListV2Imperative(listId)
    invalidateLists()
    onBack()
  }

  async function handleSaveName() {
    setEditingName(false)
    if (!activeList || nameValue === activeList.name) return
    await updateListV2Imperative({ id: listId, name: nameValue })
    invalidateLists()
  }

  async function handleSaveDescription() {
    setEditingDesc(false)
    if (!activeList || descValue === (activeList.description ?? '')) return
    await updateListV2Imperative({ id: listId, description: descValue || null })
    invalidateLists()
  }

  // Build datasheet id → display name from the loaded catalog so export shows
  // human-readable unit names instead of opaque content_entity ids.
  const unitNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of allUnits) m.set(u.id, u.name)
    return m
  }, [allUnits])

  function unitDisplayName(u: { datasheetId: string | null }): string {
    if (!u.datasheetId) return 'Unknown unit'
    return unitNameById.get(u.datasheetId) ?? u.datasheetId
  }

  function exportList(): string {
    if (!activeList) return ''
    const lines: string[] = [
      `++ ${factionId} — ${detachmentName} [${totalPts}/${battleSize.points}pts] ++`,
      `[List] ${activeList.name}`,
    ]
    if (activeList.description) lines.push(activeList.description)
    lines.push('')
    const warlord = listUnits.find((u) => u.isWarlord)
    if (warlord) {
      lines.push(`Warlord: ${unitDisplayName(warlord)}`)
      lines.push('')
    }
    for (const unit of listUnits) {
      lines.push(`${unitDisplayName(unit)} [${unit.points}pts]`)
    }
    lines.push('')
    lines.push(`++ Total: [${totalPts}/${battleSize.points}pts] ++`)
    return lines.join('\n')
  }

  function handleExport() {
    const text = exportList()
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setExportCopied(true)
        setTimeout(() => setExportCopied(false), 2000)
      })
      .catch(() => {
        const w = window.open('')
        w?.document.write(`<pre>${text}</pre>`)
      })
  }

  if (subScreen === 'add') {
    return (
      <AddUnitView
        units={units}
        unitsLoading={unitsLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showLegends={showLegends}
        onShowLegendsChange={setShowLegends}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        remaining={remaining}
        ratingMap={ratingMap}
        unitRoles={unitRoles}
        onAddUnit={(id, name, pts, mc) => void handleAddUnit(id, name, pts, mc)}
        onBack={() => setSubScreen('list')}
        totalPts={totalPts}
        battleSize={battleSize}
        restrictions={restrictions}
      />
    )
  }

  function getBodyguardName(datasheetId: string | null): string {
    if (!datasheetId) return 'unknown'
    return unitNameById.get(datasheetId) ?? datasheetId
  }

  return (
    <MyArmyView
      listUnits={listUnits}
      listId={listId}
      listName={nameValue || activeList?.name || 'List'}
      _listDescription={descValue}
      factionId={factionId}
      detachmentId={detachmentId}
      detachmentName={detachmentName}
      totalPts={totalPts}
      remaining={remaining}
      battleSize={battleSize}
      errors={errors}
      suggestion={suggestion}
      ratingMap={ratingMap}
      onAddUnit={() => {
        setSuggestion(null)
        setSubScreen('add')
      }}
      onRemoveUnit={(id) => void handleRemoveUnit(id)}
      onToggleWarlord={(u) => void handleToggleWarlord(u)}
      onSetEnhancement={(u, enhId) => void handleSetEnhancement(u, enhId)}
      onSetAttachment={(u, attachedToUnitId, attachRole) =>
        void handleSetAttachment(u, attachedToUnitId, attachRole)
      }
      getBodyguardName={getBodyguardName}
      onExport={handleExport}
      onDone={onDone}
      onDeleteList={() => void handleDeleteList()}
      onBack={onBack}
      exportCopied={exportCopied}
      editingName={editingName}
      editingDesc={editingDesc}
      nameValue={nameValue}
      descValue={descValue}
      onStartEditName={() => setEditingName(true)}
      onChangeName={setNameValue}
      onSaveName={() => void handleSaveName()}
      onStartEditDesc={() => setEditingDesc(true)}
      onChangeDesc={setDescValue}
      onSaveDesc={() => void handleSaveDescription()}
      detachmentAbilities={detachmentAbilities}
      restrictions={restrictions}
    />
  )
}
