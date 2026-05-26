export interface TTTPackage {
  version: 1
  parsedWith: string
  parseStatus: 'ok' | 'partial' | 'failed'
  parseError?: string

  meta: {
    name: string
    totalPoints: number
    edition: '10th' | '11th'
    battleSize: 'Combat Patrol' | 'Incursion' | 'Strike Force' | 'Onslaught' | 'unknown'
    source: 'bcp-import'
  }

  list: {
    factionId: string
    factionName: string
    subfactionId?: string
    subfactionName?: string
    detachmentId?: string
    detachmentName?: string
    units: TTTUnit[]
  }

  exports?: {
    rawSource: string
  }
}

export interface TTTUnit {
  name: string
  role:
    | 'Epic Hero'
    | 'Character'
    | 'Battleline'
    | 'Other'
    | 'Dedicated Transport'
    | 'Fortification'
    | 'Allied'
    | 'unknown'
  models: number
  points: number
  wargear: string[]
  enhancement?: string
  isWarlord?: boolean
}
