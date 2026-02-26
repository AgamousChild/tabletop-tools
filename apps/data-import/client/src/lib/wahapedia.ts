import {
  saveDetachments,
  saveDetachmentAbilities,
  saveStratagems,
  saveEnhancements,
  saveLeaderAttachments,
  saveUnitCompositions,
  saveUnitCosts,
  saveWargearOptions,
  saveUnitKeywords,
  saveUnitAbilities,
  setRulesImportMeta,
} from '@tabletop-tools/game-data-store'
import type {
  Detachment,
  DetachmentAbility,
  Stratagem,
  Enhancement,
  LeaderAttachment,
  UnitComposition,
  UnitCost,
  WargearOption,
  UnitKeyword,
  UnitAbility,
} from '@tabletop-tools/game-data-store'

export interface RulesImportProgress {
  current: number
  total: number
  currentStep: string
}

const STEPS = [
  { file: 'detachments.json', label: 'Detachments', save: saveDetachments as (items: unknown[]) => Promise<void>, key: 'detachments' as const },
  { file: 'detachment_abilities.json', label: 'Detachment Abilities', save: saveDetachmentAbilities as (items: unknown[]) => Promise<void>, key: 'detachmentAbilities' as const },
  { file: 'stratagems.json', label: 'Stratagems', save: saveStratagems as (items: unknown[]) => Promise<void>, key: 'stratagems' as const },
  { file: 'enhancements.json', label: 'Enhancements', save: saveEnhancements as (items: unknown[]) => Promise<void>, key: 'enhancements' as const },
  { file: 'leader_attachments.json', label: 'Leader Attachments', save: saveLeaderAttachments as (items: unknown[]) => Promise<void>, key: 'leaderAttachments' as const },
  { file: 'unit_compositions.json', label: 'Unit Compositions', save: saveUnitCompositions as (items: unknown[]) => Promise<void>, key: 'unitCompositions' as const },
  { file: 'unit_costs.json', label: 'Unit Costs', save: saveUnitCosts as (items: unknown[]) => Promise<void>, key: 'unitCosts' as const },
  { file: 'wargear_options.json', label: 'Wargear Options', save: saveWargearOptions as (items: unknown[]) => Promise<void>, key: 'wargearOptions' as const },
  { file: 'unit_keywords.json', label: 'Unit Keywords', save: saveUnitKeywords as (items: unknown[]) => Promise<void>, key: 'unitKeywords' as const },
  { file: 'unit_abilities.json', label: 'Unit Abilities', save: saveUnitAbilities as (items: unknown[]) => Promise<void>, key: 'unitAbilities' as const },
] as const

type CountKey = typeof STEPS[number]['key']
type Counts = Record<CountKey, number>

export interface RulesImportResult {
  counts: Counts
  errors: string[]
}

export async function importWahapediaRules(
  onProgress: (progress: RulesImportProgress) => void,
): Promise<RulesImportResult> {
  const counts = {} as Counts
  const errors: string[] = []
  const baseUrl = `${import.meta.env.BASE_URL}wahapedia`

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]!
    onProgress({ current: i + 1, total: STEPS.length, currentStep: step.label })

    try {
      const resp = await fetch(`${baseUrl}/${step.file}`)
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} fetching ${step.file}`)
      }
      const data = await resp.json()
      if (!Array.isArray(data)) {
        throw new Error(`${step.file} is not an array`)
      }
      await step.save(data)
      counts[step.key] = data.length
    } catch (err) {
      errors.push(`${step.label}: ${err instanceof Error ? err.message : String(err)}`)
      counts[step.key] = 0
    }
  }

  await setRulesImportMeta({
    lastImport: Date.now(),
    counts,
  })

  return { counts, errors }
}

export function isWahapediaAvailable(): Promise<boolean> {
  // Check if the first JSON file is accessible
  const baseUrl = `${import.meta.env.BASE_URL}wahapedia`
  return fetch(`${baseUrl}/factions.json`, { method: 'HEAD' })
    .then(r => r.ok)
    .catch(() => false)
}
