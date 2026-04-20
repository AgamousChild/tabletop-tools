export interface ErrataEntry {
  nodeId: string
  title: string
  content: string
  source: { type: string; title: string; page?: number }
}

export interface UnitCardData {
  id: string
  name: string
  factionId: string
  subfaction?: string
  role: string
  derivedType: string
  points: string
  stats: {
    move: string
    toughness: string
    save: string
    wounds: string
    leadership: string
    oc: string
    invSv?: string
    fnp?: string
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
  errata?: ErrataEntry[]
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
  errata?: ErrataEntry[]
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
  errata?: ErrataEntry[]
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
  sources?: SourceRef[]
  errata?: ErrataEntry[]
}

export interface MissionCardData {
  id: string
  name: string
  missionType: 'primary' | 'secondary'
  side?: 'attacker' | 'defender'
  isFixed?: boolean
  content: string
  sources?: SourceRef[]
  errata?: ErrataEntry[]
}

export interface TwistCardData {
  id: string
  name: string
  description: string
  sources?: SourceRef[]
  errata?: ErrataEntry[]
}

export interface ChallengerCardData {
  id: string
  name: string
  content: string
  sources?: SourceRef[]
  errata?: ErrataEntry[]
}

export type CardData =
  | { type: 'unit'; data: UnitCardData }
  | { type: 'stratagem'; data: StratagemCardData }
  | { type: 'enhancement'; data: EnhancementCardData }
  | { type: 'rule'; data: RuleCardData }
  | { type: 'mission'; data: MissionCardData }
  | { type: 'twist'; data: TwistCardData }
  | { type: 'challenger'; data: ChallengerCardData }

export interface CardContext {
  highlightTerms: string[]
  onContentClick: (term: string) => void
  onDismiss: () => void
  onViewSource?: (
    pdfName: string,
    page: number,
    title: string,
    topPct?: number,
    heightPct?: number,
    leftPct?: number,
    widthPct?: number,
  ) => void
  onNodeNavigate?: (nodeId: string) => void
}

export interface SourceRef {
  type: string
  title: string
  page?: number
  topPct?: number
  heightPct?: number
  leftPct?: number
  widthPct?: number
  url?: string
}
