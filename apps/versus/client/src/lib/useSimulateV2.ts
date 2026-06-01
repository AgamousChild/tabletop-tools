/**
 * useSimulateV2 — client hook for the simulateV2 tRPC router.
 *
 * Provides:
 *   - `saveSimulation(input)` — builds the v2 save payload and fires the mutation
 *   - `weaponAbilityToModifier(ability, source)` — maps a WeaponAbility to a modifier input row
 *   - `isSaving` — mutation loading state
 *   - `lastSavedId` — id of the most recently saved simulation
 *
 * No hardcoded ability arrays. weaponAbilityToModifier is a pure function that maps
 * the WeaponAbility union type to modifier columns — data comes from the weapon profile.
 */
import type { WeaponAbility } from '@tabletop-tools/game-content'

import type { WeaponBreakdown } from '../components/SimulationResult'
import { trpc } from './trpc'

// ---- Types ----

export interface ModifierInput {
  side: 'ATTACK' | 'DEFENSE'
  source: string
  key: string
  value: string | null
}

export interface WeaponSaveInput {
  profileKind: 'ranged' | 'melee'
  profileId?: string | null
  weaponName: string
  modelCount: number
  weaponsPerModel: number
  attacksNotation: string
  expectedWounds: number
  expectedModelsRemoved: number
}

export interface SimV2SaveInput {
  label?: string
  attackerName: string
  defenderName: string
  attackerUnitId?: string
  defenderUnitId?: string
  dataslateId?: string
  expectedWounds: number
  expectedModelsRemoved: number
  survivors: number
  worstWounds: number
  worstModels: number
  bestWounds: number
  bestModels: number
  weapons: WeaponSaveInput[]
  modifiers: ModifierInput[]
}

// ---- weaponAbilityToModifier ----

/**
 * Maps a WeaponAbility union variant to a modifier row.
 * source indicates where the ability came from ('weapon_ability', 'special_rule', 'leader').
 * No hardcoded arrays — the WeaponAbility type is the complete enumeration.
 */
export function weaponAbilityToModifier(ability: WeaponAbility, source: string): ModifierInput {
  switch (ability.type) {
    case 'SUSTAINED_HITS':
      return { side: 'ATTACK', source, key: 'SUSTAINED_HITS', value: String(ability.value) }
    case 'LETHAL_HITS':
      return { side: 'ATTACK', source, key: 'LETHAL_HITS', value: null }
    case 'DEVASTATING_WOUNDS':
      return { side: 'ATTACK', source, key: 'DEVASTATING_WOUNDS', value: null }
    case 'TORRENT':
      return { side: 'ATTACK', source, key: 'TORRENT', value: null }
    case 'TWIN_LINKED':
      return { side: 'ATTACK', source, key: 'TWIN_LINKED', value: null }
    case 'BLAST':
      return { side: 'ATTACK', source, key: 'BLAST', value: null }
    case 'REROLL_HITS_OF_1':
      return { side: 'ATTACK', source, key: 'REROLL_HITS_OF_1', value: null }
    case 'REROLL_HITS':
      return { side: 'ATTACK', source, key: 'REROLL_HITS', value: null }
    case 'REROLL_WOUNDS':
      return { side: 'ATTACK', source, key: 'REROLL_WOUNDS', value: null }
    case 'HIT_MOD':
      return { side: 'ATTACK', source, key: 'HIT_MOD', value: String(ability.value) }
    case 'WOUND_MOD':
      return { side: 'ATTACK', source, key: 'WOUND_MOD', value: String(ability.value) }
    case 'STRENGTH_MOD':
      return { side: 'ATTACK', source, key: 'STRENGTH_MOD', value: String(ability.value) }
    case 'ATTACKS_MOD':
      return { side: 'ATTACK', source, key: 'ATTACKS_MOD', value: String(ability.value) }
    case 'TOUGHNESS_MOD':
      return { side: 'DEFENSE', source, key: 'TOUGHNESS_MOD', value: String(ability.value) }
    case 'ANTI':
      return {
        side: 'ATTACK',
        source,
        key: 'ANTI',
        value: JSON.stringify({ keyword: ability.keyword, value: ability.value }),
      }
    case 'MELTA':
      return { side: 'ATTACK', source, key: 'MELTA', value: String(ability.value) }
    case 'IGNORES_COVER':
      return { side: 'ATTACK', source, key: 'IGNORES_COVER', value: null }
    case 'HAZARDOUS':
      return { side: 'ATTACK', source, key: 'HAZARDOUS', value: null }
    case 'PRECISION':
      return { side: 'ATTACK', source, key: 'PRECISION', value: null }
    case 'INDIRECT_FIRE':
      return { side: 'ATTACK', source, key: 'INDIRECT_FIRE', value: null }
    case 'ASSAULT':
      return { side: 'ATTACK', source, key: 'ASSAULT', value: null }
    case 'PISTOL':
      return { side: 'ATTACK', source, key: 'PISTOL', value: null }
    case 'ONE_SHOT':
      return { side: 'ATTACK', source, key: 'ONE_SHOT', value: null }
    case 'PSYCHIC':
      return { side: 'ATTACK', source, key: 'PSYCHIC', value: null }
    default: {
      // Exhaustive check — TypeScript will error here if a new ability type is added
      const _exhaustive: never = ability
      throw new Error(
        `weaponAbilityToModifier: unhandled ability type ${JSON.stringify(_exhaustive)}`,
      )
    }
  }
}

// ---- buildWeaponSaveInput ----

/**
 * Converts a WeaponBreakdown + context into a WeaponSaveInput.
 * The attacksNotation is preserved as-is from the profile (string).
 */
export function buildWeaponSaveInput(
  breakdown: WeaponBreakdown,
  opts: {
    profileKind: 'ranged' | 'melee'
    profileId?: string | null
    modelCount: number
    weaponsPerModel: number
    attacksNotation: string
  },
): WeaponSaveInput {
  return {
    profileKind: opts.profileKind,
    profileId: opts.profileId ?? null,
    weaponName: breakdown.weaponName,
    modelCount: opts.modelCount,
    weaponsPerModel: opts.weaponsPerModel,
    attacksNotation: opts.attacksNotation,
    expectedWounds: breakdown.expectedWounds,
    expectedModelsRemoved: breakdown.expectedModelsRemoved,
  }
}

// ---- useSimulateV2 hook ----

/**
 * React hook wrapping `simulateV2.save` mutation.
 * Call `save(input)` to persist a completed simulation.
 */
export function useSimulateV2() {
  const mutation = trpc.simulateV2.save.useMutation()

  return {
    save: (input: SimV2SaveInput) => mutation.mutate(input),
    isSaving: mutation.isPending,
    lastSavedId: mutation.data?.id ?? null,
    isError: mutation.isError,
    error: mutation.error,
  }
}
