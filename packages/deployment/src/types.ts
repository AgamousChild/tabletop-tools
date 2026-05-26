// ── Game Rules Config ─────────────────────────────────────────────────────

export interface GameRulesConfig {
  deepStrikeExclusion: number
  infiltratorExclusionModels: number
  infiltratorExclusionZone: number
  scoutExclusionModels: number
  coherency: {
    distance: number
    minConnections: number
    minConnectionsLarge: number
    largeUnitThreshold: number
  }
  engagementRange: number
  chargeRange: { min: number; max: number; avg: number }
  advanceRange: { min: number; max: number; avg: number }
  objectiveControlRange: number
  reserves: {
    maxUnitsPct: number
    maxPointsPct: number
    embarkedCount: boolean
    noArrivalTurn1: boolean
    mustArriveByRound: number
  }
}

export const DEFAULT_10E_RULES: GameRulesConfig = {
  deepStrikeExclusion: 9,
  infiltratorExclusionModels: 9,
  infiltratorExclusionZone: 9,
  scoutExclusionModels: 9,
  coherency: {
    distance: 2,
    minConnections: 1,
    minConnectionsLarge: 2,
    largeUnitThreshold: 7,
  },
  engagementRange: 1,
  chargeRange: { min: 2, max: 12, avg: 7 },
  advanceRange: { min: 1, max: 6, avg: 3.5 },
  objectiveControlRange: 3,
  reserves: {
    maxUnitsPct: 50,
    maxPointsPct: 50,
    embarkedCount: true,
    noArrivalTurn1: true,
    mustArriveByRound: 3,
  },
}

// ── Geometry ──────────────────────────────────────────────────────────────

export interface Point {
  x: number
  y: number
}

export interface Rect {
  center: Point
  width: number
  height: number
}

export interface LineSegment {
  a: Point
  b: Point
}

// ── Battlefield ───────────────────────────────────────────────────────────

export interface TerrainPiece {
  id: string
  position: Point
  footprint: Rect
  losBlocking: boolean
}

export interface Objective {
  id: string
  position: Point
  classification?: 'home' | 'safe' | 'center' | 'expansion' | 'enemy-home'
}

export type DeploymentType =
  | 'search-and-destroy'
  | 'dawn-of-war'
  | 'hammer-and-anvil'
  | 'crucible-of-battle'
  | 'tipping-point'
  | 'sweeping-engagement'

export type PlayerZone =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'

export interface Battlefield {
  width: number
  depth: number
  terrain: TerrainPiece[]
  objectives: Objective[]
  deploymentType: DeploymentType
  playerZone: PlayerZone
}

// ── Units ─────────────────────────────────────────────────────────────────

export type StrategicPurpose = 'scoring' | 'killing' | 'holding'

export type TacticalRole =
  | 'holder'
  | 'screen'
  | 'hammer'
  | 'gunline'
  | 'mid-range-shooter'
  | 'transport'
  | 'infiltrator'
  | 'scout'
  | 'deep-strike'
  | 'anchor'
  | 'counter-charge'

export type BaseSize = 25 | 28 | 32 | 40 | 50 | 60 | 80 | 'oval-75x42' | 'hull'

export interface DeploymentUnit {
  id: string
  name: string
  models: number
  baseSize: BaseSize
  points: number
  move: number
  toughness: number
  save: number
  wounds: number
  invulnSave?: number
  fnp?: number
  keywords: string[]
  abilities: {
    scouts?: number
    infiltrate?: boolean
    deepStrike?: boolean
    advanceAndCharge?: boolean
  }
  weapons: {
    name: string
    range: number | 'melee'
    isAssault?: boolean
    isHeavy?: boolean
  }[]
  strategicPurpose?: StrategicPurpose
  tacticalRole?: TacticalRole
}

export interface TransportDeclaration {
  transportId: string
  embarkedUnitIds: string[]
}

export interface ArmyList {
  units: DeploymentUnit[]
  transports: TransportDeclaration[]
}

// ── Enemy ─────────────────────────────────────────────────────────────────

export interface EnemyUnit {
  id: string
  name: string
  models: number
  move: number
  abilities: {
    scouts?: number
    infiltrate?: boolean
    deepStrike?: boolean
    advanceAndCharge?: boolean
  }
  weapons: {
    name: string
    range: number | 'melee'
    isAssault?: boolean
  }[]
  threatLevel: 'low' | 'medium' | 'high'
}

export interface EnemyArmy {
  units: EnemyUnit[]
}

// ── Algorithm Input ───────────────────────────────────────────────────────

export interface DeploymentInput {
  rules: GameRulesConfig
  battlefield: Battlefield
  army: ArmyList
  enemy: EnemyArmy
}

// ── Algorithm Output ──────────────────────────────────────────────────────

export type FormationType = 'block' | 'dog-bone' | 'line' | 'wide-line' | 'blob'

export interface ModelPlacement {
  modelIndex: number
  position: Point
}

export interface UnitPlacement {
  unitId: string
  formation: FormationType
  models: ModelPlacement[]
  reasoning: string
  deploymentMethod: 'deploy' | 'infiltrate' | 'scout-destination'
  scoutDestination?: Point
  reservesCandidate: boolean
  reservesReason?: string
}

export interface ThreatOverlay {
  shootingHeatMap: number[][]
  meleeHeatMap: number[][]
  gridResolution: number
}

export interface DeploymentPlan {
  placements: UnitPlacement[]
  dropOrder: string[]
  objectives: Objective[]
  threats: ThreatOverlay
  reasoning: string
}
