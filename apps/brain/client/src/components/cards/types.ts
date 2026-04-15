export interface UnitCardData {
  id: string
  name: string
  factionId: string
  subfaction?: string
  role: string
  derivedType: string
  points: string
  stats: {
    move: string; toughness: string; save: string; wounds: string;
    leadership: string; oc: string; invSv?: string
  }
  rangedWeapons: WeaponProfile[]
  meleeWeapons: WeaponProfile[]
  abilities: { name: string; description: string; type: string }[]
  coreAbilities: string[]
  keywords: string[]
  factionKeywords: string[]
  composition: string
  loadout: string
  leaders: string[]
  transport?: string
  damaged?: { threshold: string; description: string }
}

export interface WeaponProfile {
  name: string
  range: string
  attacks: string
  skill: string
  strength: string
  ap: string
  damage: string
  abilities: string
}

export interface StratagemCardData {
  id: string
  name: string
  type: string
  cpCost: string
  turn: string
  phase: string
  when: string
  target: string
  effect: string
  detachmentName: string
  factionId: string
  subfaction?: string
}

export interface EnhancementCardData {
  id: string
  name: string
  cost: string
  description: string
  restriction?: string
  detachmentName: string
  factionId: string
  subfaction?: string
}

export interface RuleCardData {
  id: string
  name: string
  description: string
  factionId: string
  subfaction?: string
  detachmentName?: string
  isArmyRule: boolean
  subRules?: { name: string; description: string }[]
  appliesTo?: number
}

export type CardData =
  | { type: 'unit'; data: UnitCardData }
  | { type: 'stratagem'; data: StratagemCardData }
  | { type: 'enhancement'; data: EnhancementCardData }
  | { type: 'rule'; data: RuleCardData }

export interface CardContext {
  highlightTerms: string[]
  onContentClick: (term: string) => void
  onDismiss: () => void
}
