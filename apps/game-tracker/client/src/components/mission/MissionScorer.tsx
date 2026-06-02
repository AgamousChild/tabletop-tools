import { ActionScorer } from './ActionScorer'
import { ChecklistScorer } from './ChecklistScorer'
import { CountScorer } from './CountScorer'
import { TierScorer } from './TierScorer'
import type { Zone } from './ZonedCountScorer'
import { ZonedCountScorer } from './ZonedCountScorer'

export type GameStateRow = {
  id: string
  gameStateId: string
  label: string
  points: number | null
  countMode: string
  sortOrder: number
}

export type ScorerMission = {
  id: string
  name: string
  uiPattern: string
}

// The scored state — union of all pattern state shapes.
// Caller manages state; MissionScorer is stateless.
export type ScorerState = {
  countValues?: Record<string, number> // pattern: count, zoned_count
  checkedIds?: string[] // pattern: checklist
  selectedTierId?: string | null // pattern: tier
  actionCompleted?: boolean // pattern: action
}

type Props = {
  mission: ScorerMission
  gameStates: GameStateRow[]
  state: ScorerState
  onChange: (state: ScorerState) => void
}

// Registry map: pattern → renderer function
// Adding a new ui_pattern = add one entry here + one component file.
type PatternRenderer = (props: Props) => React.JSX.Element

const PATTERN_REGISTRY: Record<string, PatternRenderer> = {
  count: ({ gameStates, state, onChange }) => {
    const countValues = state.countValues ?? {}
    const sorted = [...gameStates].sort((a, b) => a.sortOrder - b.sortOrder)
    return (
      <div className="space-y-3">
        {sorted.map((gs) => (
          <CountScorer
            key={gs.gameStateId}
            label={gs.label}
            value={countValues[gs.gameStateId] ?? 0}
            min={0}
            max={99}
            onChange={(v) =>
              onChange({ ...state, countValues: { ...countValues, [gs.gameStateId]: v } })
            }
          />
        ))}
      </div>
    )
  },

  checklist: ({ gameStates, state, onChange }) => {
    const checkedIds = new Set(state.checkedIds ?? [])
    const sorted = [...gameStates].sort((a, b) => a.sortOrder - b.sortOrder)
    const items = sorted.map((gs) => ({
      id: gs.gameStateId,
      label: gs.label,
      checked: checkedIds.has(gs.gameStateId),
    }))
    return (
      <ChecklistScorer
        items={items}
        onChange={(updated) =>
          onChange({
            ...state,
            checkedIds: updated.filter((i) => i.checked).map((i) => i.id),
          })
        }
      />
    )
  },

  tier: ({ gameStates, state, onChange }) => {
    const sorted = [...gameStates].sort((a, b) => a.sortOrder - b.sortOrder)
    const tiers = sorted.map((gs) => ({
      id: gs.gameStateId,
      label: gs.points != null ? `${gs.points} VP — ${gs.label}` : gs.label,
      value: gs.points ?? 0,
    }))
    return (
      <TierScorer
        tiers={tiers}
        selected={state.selectedTierId ?? null}
        onChange={(id) => onChange({ ...state, selectedTierId: id })}
      />
    )
  },

  action: ({ gameStates, state, onChange }) => {
    const label = gameStates[0]?.label ?? 'Action'
    return (
      <ActionScorer
        label={label}
        completed={state.actionCompleted ?? false}
        onChange={(v) => onChange({ ...state, actionCompleted: v })}
      />
    )
  },

  zoned_count: ({ gameStates, state, onChange }) => {
    const countValues = state.countValues ?? {}
    const sorted = [...gameStates].sort((a, b) => a.sortOrder - b.sortOrder)
    const zones: Zone[] = sorted.map((gs) => ({
      id: gs.gameStateId,
      label: gs.label,
      count: countValues[gs.gameStateId] ?? 0,
    }))
    return (
      <ZonedCountScorer
        zones={zones}
        onChange={(updated) =>
          onChange({
            ...state,
            countValues: Object.fromEntries(updated.map((z) => [z.id, z.count])),
          })
        }
      />
    )
  },
}

export function MissionScorer({ mission, gameStates, state, onChange }: Props) {
  const renderer = PATTERN_REGISTRY[mission.uiPattern]
  if (!renderer) {
    return (
      <div className="text-slate-500 text-sm p-3 rounded bg-slate-900">
        Unsupported scoring pattern: <code>{mission.uiPattern}</code>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{mission.name}</p>
      {renderer({ mission, gameStates, state, onChange })}
    </div>
  )
}
