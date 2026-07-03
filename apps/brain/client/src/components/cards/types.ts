// HIGH-SENSITIVITY AREA. The brain card components in this directory render
// the user-visible product surface. Regressions here are immediately apparent.
// Before claiming a change is safe:
//   - "Intact" (render bytes unchanged) is not the same as "correct" (card works).
//   - An "unused" prop or function (e.g. KeywordText, factionFilter) is usually
//     DROPPED WIRING, not dead code — the fix is to wire it back, not delete it.
//   - The [KEYWORD] clickable-button pattern is canonical across cards. Don't
//     change `lib/render-markdown.ts` to alter keyword behavior — it ripples.
//   - When intent is ambiguous (markdown vs clickable, etc.), ASK. Don't guess.

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
  /**
   * Core / Universal-Special-Rule chips on the datasheet. Each entry has the
   * keyword and an optional value (e.g. `FEEL NO PAIN 5+` → `{ keyword: 'FEEL
   * NO PAIN', value: '5+' }`; `LEADER` → `{ keyword: 'LEADER' }`). Rendered as
   * collapsed chips with tooltip rather than expanded ability text.
   *
   * Backwards-compatible string entries are still accepted — old call sites
   * pass `['LEADER', 'SCOUTS']` and the renderer falls back to no-value
   * display.
   */
  coreAbilities: Array<string | { keyword: string; value?: string }>
  keywords: string[]
  factionKeywords: string[]
  composition: string
  loadout: string
  wargearOptions?: string
  leaders: string[]
  transport?: string
  damaged?: { threshold: string; description: string }
  errata?: ErrataEntry[]
  /**
   * 11e attachment refs surfaced as collapsed panels on the unit card.
   *
   * For a character datasheet (has the `character` keyword) these list the
   * units the character can attach to via LEADER (`leaderChips`) or SUPPORT
   * (`supportChips`) — i.e. forward `can_lead` / `can_support` refs.
   *
   * For a non-character datasheet these list the characters that can attach
   * to THIS unit via either role — reverse refs of the same types.
   *
   * Populated by the brain server's `/browse/unit/:id` endpoint
   * (`leaders[]` and `support[]` arrays). Each entry is a chip rendered as a
   * Clickable that triggers `onContentClick(title)`.
   */
  leaderChips?: AttachmentChip[]
  supportChips?: AttachmentChip[]
}

export interface AttachmentChip {
  id: string
  title: string
  factionId?: string
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
  /** Whether the enhancement attaches to the leader or the bearer's unit. */
  attachesTo?: 'leader' | 'unit'
  errata?: ErrataEntry[]
}

export interface RuleCardData {
  id: string
  name: string
  description: string
  factionId: string
  detachmentName?: string
  isArmyRule: boolean
  isFaction?: boolean
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
  /** Does it require an action to score? Description of the action if yes. */
  action?: string
  /** How are points scored — the condition that must be met. */
  condition?: string
  /** When does it score — which phase/turn/timing. */
  when?: string
  /** VP value and maximum cap (e.g., "3VP per objective, max 15VP"). */
  scoring?: string
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

export interface CoreRuleCardData {
  id: string
  name: string
  description: string
  phase?: string
  tableHtml?: string
  sources?: SourceRef[]
  errata?: ErrataEntry[]
  qualityFlags?: string[]
}

export interface DeploymentZoneCardData {
  id: string
  name: string
  battleSize?: string
  description: string
  pdfImages?: Array<{ pdfName: string; page: number; label?: string }>
  sources?: SourceRef[]
  qualityFlags?: string[]
}

export interface ForceDispositionCardData {
  id: string
  name: string
  description: string
  pdfImage?: { pdfName: string; page: number }
  sources?: SourceRef[]
  qualityFlags?: string[]
}

export interface TerrainLayoutCardData {
  id: string
  name: string
  description: string
  pdfImage?: { pdfName: string; page: number }
  sources?: SourceRef[]
  qualityFlags?: string[]
}

export interface ErrataCardData {
  id: string
  name: string
  targetRule?: string
  targetNodeId?: string
  correctionText: string
  source?: string
  effectiveDate?: string
  qualityFlags?: string[]
}

export interface BalanceCardData {
  id: string
  name: string
  description: string
  effectiveDate?: string
  sources?: SourceRef[]
  qualityFlags?: string[]
}

export interface CommunityCardData {
  id: string
  name: string
  description: string
  sourceAttribution?: string
  qualityFlags?: string[]
}

export interface DetachmentCardData {
  id: string
  name: string
  factionId: string
  factionName?: string
  abilityText: string
  stratagems: StratagemCardData[]
  enhancements: EnhancementCardData[]
  chapterBadge?: string
  /** Detachment Points cost (11e MFM). */
  dp?: number
  /** Force-disposition category (11e MFM: PRIORITY ASSETS, etc.). */
  forceDisposition?: string
  sources?: SourceRef[]
  errata?: ErrataEntry[]
  qualityFlags?: string[]
}

export type CardData =
  | { type: 'unit'; data: UnitCardData }
  | { type: 'stratagem'; data: StratagemCardData }
  | { type: 'enhancement'; data: EnhancementCardData }
  | { type: 'rule'; data: RuleCardData }
  | { type: 'core-rule'; data: CoreRuleCardData }
  | { type: 'mission'; data: MissionCardData }
  | { type: 'twist'; data: TwistCardData }
  | { type: 'challenger'; data: ChallengerCardData }
  | { type: 'deployment-zone'; data: DeploymentZoneCardData }
  | { type: 'force-disposition'; data: ForceDispositionCardData }
  | { type: 'terrain-layout'; data: TerrainLayoutCardData }
  | { type: 'errata'; data: ErrataCardData }
  | { type: 'balance'; data: BalanceCardData }
  | { type: 'community'; data: CommunityCardData }
  | { type: 'detachment'; data: DetachmentCardData }

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
