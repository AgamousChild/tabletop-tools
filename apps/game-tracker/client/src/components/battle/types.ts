import type { StratagemEntry } from './StratagemPicker'
import type { DestroyedUnit } from './UnitPicker'

export type TurnData = {
  cpGained: number
  primaryVp: number
  secondaryScores: { secondaryId: string; vp: number }[]
  stratagems: StratagemEntry[]
  unitsDestroyed: DestroyedUnit[]
  photoDataUrl: string | null
  notes: string
}

export type RoundStep =
  | 'your-command'
  | 'your-action'
  | 'your-photo'
  | 'their-command'
  | 'their-action'
  | 'their-photo'
  | 'summary'

export type RoundState = {
  yourTurn: TurnData
  theirTurn: TurnData
  currentStep: RoundStep
}

export function createEmptyTurnData(): TurnData {
  return {
    cpGained: 1,
    primaryVp: 0,
    secondaryScores: [],
    stratagems: [],
    unitsDestroyed: [],
    photoDataUrl: null,
    notes: '',
  }
}
