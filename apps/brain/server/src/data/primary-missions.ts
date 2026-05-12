/**
 * Hand-transcribed primary mission card data from Chapter Approved 2025 PDFs.
 * Each entry corresponds to one page in the primary missions PDF.
 * Source of truth — NOT parsed from markdown.
 */

export interface ScoringCondition {
  condition: string
  vp: string
}

export interface ScoringBlock {
  timing: string        // e.g., "SECOND BATTLE ROUND ONWARDS" or "ANY BATTLE ROUND (DEF)"
  when: string          // e.g., "End of the Command phase..."
  preamble?: string     // text before conditions (e.g., "Each player scores:")
  conditions: ScoringCondition[]
  connector?: 'AND' | 'OR'  // between conditions
}

export interface MissionAction {
  name: string
  starts: string
  units: string
  completes: string
  ifCompleted: string
}

export interface PrimaryMissionData {
  name: string
  page: number
  isAsymmetric: boolean
  description?: string
  setupNote?: string
  scoringBlocks: ScoringBlock[]
  action?: MissionAction
  maxVp?: string
  designerNote?: string
}

export const PRIMARY_MISSIONS: PrimaryMissionData[] = [
  // ── Page 1: HIDDEN SUPPLIES ──
  {
    name: 'HIDDEN SUPPLIES',
    page: 1,
    isAsymmetric: false,
    description: 'In the Place Objective Markers step, players must set up one additional objective marker in No Man\'s Land. Before setting up this new objective marker, players must first move the objective marker in the center of the battlefield 6" directly towards one of the corners of the battlefield (if No Man\'s Land touches any of the corners of the battlefield, you must move the objective marker towards one of those corners). Otherwise, the players roll-off, and the winner selects which corner the objective marker is moved towards. Players then set up the new objective marker 6" from the center of the battlefield towards the diagonally opposite corner.',
    scoringBlocks: [{
      timing: 'SECOND BATTLE ROUND ONWARDS',
      when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
      preamble: 'The player whose turn it is scores as follows:',
      conditions: [
        { condition: 'They control one objective marker not within their deployment zone', vp: '5 VP' },
        { condition: 'They control two objective markers not within their deployment zone', vp: '5 VP' },
        { condition: 'They control more objective markers than their opponent controls', vp: '5 VP' },
      ],
      connector: 'AND',
    }],
  },

  // ── Page 2: BURDEN OF TRUST ──
  {
    name: 'BURDEN OF TRUST',
    page: 2,
    isAsymmetric: false,
    description: 'At the end of the Command phase, for each objective marker that player whose turn it is controls, they can select one unit from their army (excluding AIRCRAFT) within range of that objective marker to guard it until the start of their next turn.',
    scoringBlocks: [
      {
        timing: 'SECOND BATTLE ROUND ONWARDS',
        when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
        preamble: 'The player whose turn it is scores:',
        conditions: [
          { condition: 'For each objective marker they control that is not within their deployment zone', vp: '4 VP' },
        ],
      },
      {
        timing: 'SECOND BATTLE ROUND ONWARDS',
        when: 'End of each player\'s turn.',
        preamble: 'The opponent of the player whose turn it is:',
        conditions: [
          { condition: 'For each of their units (excluding Battle-shocked units) that are within range of and guarding an objective marker they control', vp: '2 VP' },
        ],
      },
    ],
    designerNote: 'Note that the player going second has the first chance to score VP in this way, as they can guard objectives in their first turn and score VP in their opponent\'s next turn.',
  },

  // ── Page 3: LINCHPIN ──
  {
    name: 'LINCHPIN',
    page: 3,
    isAsymmetric: false,
    scoringBlocks: [{
      timing: 'SECOND BATTLE ROUND ONWARDS',
      when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
      conditions: [
        { condition: 'If the player does NOT control the objective marker in their deployment zone: For each objective marker that the player controls', vp: '3 VP' },
        { condition: 'If the player DOES control the objective marker in their deployment zone: For controlling the objective marker in their deployment zone', vp: '3 VP' },
        { condition: 'For each other objective marker that the player controls', vp: '5 VP' },
      ],
      connector: 'OR',
    }],
    maxVp: '15VP',
  },

  // ── Page 4: PURGE THE FOE ──
  {
    name: 'PURGE THE FOE',
    page: 4,
    isAsymmetric: false,
    scoringBlocks: [
      {
        timing: 'SECOND BATTLE ROUND ONWARDS',
        when: 'End of the battle round.',
        preamble: 'Each player scores:',
        conditions: [
          { condition: 'If one or more enemy units were destroyed this battle round', vp: '4 VP' },
        ],
      },
      {
        timing: 'SECOND BATTLE ROUND ONWARDS',
        when: 'End of the battle round.',
        preamble: 'Each player scores:',
        conditions: [
          { condition: 'If more enemy units than friendly units were destroyed this battle round', vp: '4 VP' },
        ],
      },
      {
        timing: 'SECOND BATTLE ROUND ONWARDS',
        when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
        preamble: 'The player whose turn it is:',
        conditions: [
          { condition: 'If the player controls one or more objective markers', vp: '4 VP' },
          { condition: 'If the player controls more objective markers than their opponent controls', vp: '4 VP' },
        ],
        connector: 'AND',
      },
    ],
  },

  // ── Page 5: SCORCHED EARTH ──
  {
    name: 'SCORCHED EARTH',
    page: 5,
    isAsymmetric: false,
    action: {
      name: 'BURN OBJECTIVE',
      starts: 'Your Shooting phase, from the second battle round onwards.',
      units: 'One unit from your army within range of an objective marker that is not within your deployment zone.',
      completes: 'End of your opponent\'s next turn or the end of the battle (whichever comes first), if your unit is still within range of the same objective marker and you control that objective marker.',
      ifCompleted: 'That objective marker is burned and removed from the battlefield.',
    },
    scoringBlocks: [
      {
        timing: 'SECOND BATTLE ROUND ONWARDS',
        when: 'Any time.',
        preamble: 'Each time a player burns an objective marker:',
        conditions: [
          { condition: 'Objective marker was in No Man\'s Land', vp: '5 VP' },
          { condition: 'Objective marker was in their opponent\'s deployment zone', vp: '10 VP' },
        ],
      },
      {
        timing: 'SECOND BATTLE ROUND ONWARDS',
        when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
        conditions: [
          { condition: 'For each objective marker that the player controls', vp: '5 VP' },
        ],
      },
    ],
    maxVp: '10VP',
  },

  // ── Page 6: SUPPLY DROP ──
  {
    name: 'SUPPLY DROP',
    page: 6,
    isAsymmetric: false,
    setupNote: 'Start of the Battle: Players randomly select two different objective markers in No Man\'s Land that are not in the center of the battlefield. The first selected is the Alpha \u03b1 objective, the second selected is the Omega \u03a9 objective. Start of the Fourth Battle Round: The Alpha \u03b1 Objective is removed from the battlefield. Start of the Fifth Battle Round: The Omega \u03a9 Objective is removed from the battlefield.',
    scoringBlocks: [{
      timing: 'SECOND BATTLE ROUND ONWARDS',
      when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
      preamble: 'The player whose turn it is scores VP for each objective marker within No Man\'s Land that they control, depending on the current battle round:',
      conditions: [
        { condition: 'The second and third battle rounds', vp: '5 VP' },
        { condition: 'The fourth battle round', vp: '8 VP' },
        { condition: 'The fifth battle round', vp: '15 VP' },
      ],
    }],
  },

  // ── Page 7: TAKE AND HOLD ──
  {
    name: 'TAKE AND HOLD',
    page: 7,
    isAsymmetric: false,
    scoringBlocks: [{
      timing: 'SECOND BATTLE ROUND ONWARDS',
      when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
      preamble: 'The player whose turn it is scores:',
      conditions: [
        { condition: 'For each objective marker that they control', vp: '5 VP' },
      ],
    }],
    maxVp: '15VP',
  },

  // ── Page 8: TERRAFORM ──
  {
    name: 'TERRAFORM',
    page: 8,
    isAsymmetric: false,
    action: {
      name: 'TERRAFORM',
      starts: 'Your Shooting phase.',
      units: 'One or more units from your army, each within range of a different objective marker that is not within your deployment zone.',
      completes: 'End of the turn, if the unit performing this Action is still within range of the same objective marker and you control that objective marker.',
      ifCompleted: 'Each of those objective markers is terraformed by you. If that objective marker was terraformed by your opponent, it no longer is.',
    },
    scoringBlocks: [
      {
        timing: 'SECOND BATTLE ROUND ONWARDS',
        when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
        preamble: 'The player whose turn it is scores:',
        conditions: [
          { condition: 'For each objective marker they control', vp: '4 VP' },
        ],
      },
      {
        timing: 'SECOND BATTLE ROUND ONWARDS',
        when: 'End of the turn.',
        preamble: 'Each player scores:',
        conditions: [
          { condition: 'For each objective marker that is terraformed by them', vp: '1 VP' },
        ],
      },
    ],
    maxVp: '12VP',
  },

  // ── Page 9: THE RITUAL ──
  {
    name: 'THE RITUAL',
    page: 9,
    isAsymmetric: false,
    action: {
      name: 'THE RITUAL',
      starts: 'Your Shooting phase.',
      units: 'One unit from your army.',
      completes: 'End of your turn.',
      ifCompleted: 'Set up one objective marker anywhere on the battlefield wholly within No Man\'s Land and within 1" of your unit, provided it can be set up exactly 12" from one other objective marker within No Man\'s Land and not within 6" of any other objective marker.',
    },
    scoringBlocks: [{
      timing: 'SECOND BATTLE ROUND ONWARDS',
      when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
      conditions: [
        { condition: 'For each objective marker that the player controls in No Man\'s Land', vp: '5 VP' },
      ],
    }],
    maxVp: '15VP',
  },

  // ── Page 10: UNEXPLODED ORDNANCE ──
  {
    name: 'UNEXPLODED ORDNANCE',
    page: 10,
    isAsymmetric: false,
    setupNote: 'Start of the Battle: The objective markers within No Man\'s Land become Hazard objective markers.',
    action: {
      name: 'MOVE HAZARD',
      starts: 'Your Shooting phase.',
      units: 'One or more units from your army, each within range of a different Hazard objective marker you control.',
      completes: 'End of your turn, if the unit performing this Action is still within range of the same Hazard objective marker and you control that objective marker.',
      ifCompleted: 'You can move each of those objective markers up to 6". That objective marker cannot end that move on top of any other objective marker or model, or inside impassable parts of terrain features.',
    },
    scoringBlocks: [{
      timing: 'SECOND BATTLE ROUND ONWARDS',
      when: 'End of each player\'s turn.',
      preamble: 'The player whose turn it is scores for each Hazard objective marker that is:',
      conditions: [
        { condition: 'Wholly within their opponent\'s deployment zone', vp: '8 VP' },
        { condition: 'Wholly within 6" of their opponent\'s deployment zone', vp: '5 VP' },
        { condition: 'Wholly within 12" of their opponent\'s deployment zone', vp: '2 VP' },
      ],
    }],
  },

  // ── Page 11: SYPHONED POWER (Asymmetric) ──
  {
    name: 'SYPHONED POWER',
    page: 11,
    isAsymmetric: true,
    setupNote: 'Start of the Battle: The Defender scores 50VP.',
    action: {
      name: 'SYPHON POWER',
      starts: 'Your Shooting phase, from the second battle round onwards, if you are the Attacker.',
      units: 'Any number of units from your army, each within range of a different objective marker.',
      completes: 'End of your turn, if your unit is still within range of the same objective marker and you control that objective marker.',
      ifCompleted: 'That objective marker is syphoned.',
    },
    scoringBlocks: [{
      timing: 'ANY TIME (ATTACKER)',
      when: 'Any time.',
      preamble: 'Each time you syphon an objective marker, the Defender loses VP (to a minimum of 0) and you score the same amount of VP, depending on where that objective marker is:',
      conditions: [
        { condition: 'If it is within your deployment zone', vp: '2 VP' },
        { condition: 'If it is wholly within No Man\'s Land', vp: '3 VP' },
        { condition: 'If it is within your opponent\'s deployment zone', vp: '5 VP' },
      ],
      connector: 'AND',
    }],
    maxVp: '15VP',
  },

  // ── Page 12: HOLD OUT (Asymmetric) ──
  {
    name: 'HOLD OUT',
    page: 12,
    isAsymmetric: true,
    scoringBlocks: [{
      timing: 'SECOND BATTLE ROUND ONWARDS',
      when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
      preamble: 'The player whose turn it is scores:',
      conditions: [
        { condition: 'For each objective marker that they control', vp: '5 VP' },
      ],
    }],
    maxVp: '15VP',
  },

  // ── Page 13: DENIED RESOURCES (Asymmetric) ──
  {
    name: 'DENIED RESOURCES',
    page: 13,
    isAsymmetric: true,
    description: 'At the start of your turn, select one objective marker. At the end of your opponent\'s next turn or the end of the battle (whichever comes first), if you control that objective marker, it is denied and removed from the battlefield.',
    scoringBlocks: [
      {
        timing: 'ANY BATTLE ROUND (DEF)',
        when: 'Any time.',
        preamble: 'Each time you deny an objective marker, you score VP depending on where that objective marker is:',
        conditions: [
          { condition: 'If it is within your deployment zone', vp: '7 VP' },
          { condition: 'If it is wholly within No Man\'s Land', vp: '10 VP' },
          { condition: 'If it is within your opponent\'s deployment zone', vp: '16 VP' },
        ],
      },
      {
        timing: 'SECOND BATTLE ROUND ONWARDS (ATK)',
        when: 'End of your Command phase.',
        preamble: 'You score VP as follows:',
        conditions: [
          { condition: 'For each objective marker you control within your deployment zone', vp: '3 VP' },
          { condition: 'For each objective marker you control within No Man\'s Land', vp: '5 VP' },
          { condition: 'For each objective marker you control within your opponent\'s deployment zone', vp: '8 VP' },
        ],
      },
    ],
    maxVp: '15VP',
  },

  // ── Page 14: ESTABLISH CONTROL (Asymmetric) ──
  {
    name: 'ESTABLISH CONTROL',
    page: 14,
    isAsymmetric: true,
    scoringBlocks: [{
      timing: 'SECOND BATTLE ROUND ONWARDS',
      when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
      conditions: [
        { condition: 'If the player does NOT control each objective marker in their deployment zone: For each objective marker that the player controls', vp: '3 VP' },
        { condition: 'If the player DOES control each objective marker in their deployment zone: For controlling each objective marker in their deployment zone', vp: '3 VP' },
        { condition: 'For each other objective marker that the player controls', vp: '5 VP' },
      ],
      connector: 'OR',
    }],
    maxVp: '15VP',
  },

  // ── Page 15: UNEVEN GROUND (Asymmetric) ──
  {
    name: 'UNEVEN GROUND',
    page: 15,
    isAsymmetric: true,
    scoringBlocks: [{
      timing: 'SECOND BATTLE ROUND ONWARDS',
      when: 'End of the Command phase (or the end of your turn if it is the fifth battle round and you are going second).',
      preamble: 'The player whose turn it is scores VP as follows:',
      conditions: [
        { condition: 'For each objective marker within their deployment zone that they control', vp: '2 VP' },
        { condition: 'For each objective marker within No Man\'s Land that they control', vp: '4 VP' },
        { condition: 'For each objective marker within their opponent\'s deployment zone that they control', vp: '6 VP' },
      ],
      connector: 'AND',
    }],
    maxVp: '15VP',
  },
]
