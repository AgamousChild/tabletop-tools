/**
 * Hand-transcribed challenger card data from Chapter Approved 2025 PDFs.
 * Each challenger card = mission + paired stratagem on one page.
 */

export interface ChallengerStratagem {
  name: string
  type: string // "Strategic Ploy", "Battle Tactic", "Wargear"
  cp: string
  when: string
  target: string
  effect: string
}

export interface ChallengerAction {
  name: string
  starts: string
  units: string
  completes: string
  ifCompleted: string
}

export interface ChallengerCardData {
  name: string
  page: number
  timing: string // "ANY BATTLE ROUND"
  when: string
  condition: string
  vp: string
  maxVp?: string
  action?: ChallengerAction
  stratagem: ChallengerStratagem
}

export const CHALLENGER_CARDS: ChallengerCardData[] = [
  {
    name: 'ATTRITION',
    page: 1,
    timing: 'ANY BATTLE ROUND',
    when: 'End of your turn.',
    condition: 'One or more enemy units were destroyed this turn.',
    vp: '3 VP',
    stratagem: {
      name: 'PIVOTAL MOMENT',
      type: 'Strategic Ploy',
      cp: '0',
      when: 'Your Movement phase.',
      target: 'One unit from your army.',
      effect:
        'Until the end of the turn, your unit is eligible to shoot and declare a charge in a turn in which it Advanced or Fell Back.',
    },
  },
  {
    name: 'DUG IN',
    page: 2,
    timing: 'ANY BATTLE ROUND',
    when: 'End of your turn.',
    condition: 'For each objective marker you control.',
    vp: '1 VP',
    maxVp: '3VP',
    stratagem: {
      name: 'HARBORED POWER',
      type: 'Wargear',
      cp: '0',
      when: 'Your Shooting phase or your Fight phase.',
      target: 'One unit from your army that has not been selected to shoot or fight this phase.',
      effect:
        'Until the end of the phase, weapons equipped by models in your unit have the [HAZARDOUS] ability and your choice of the [LETHAL HITS] or [SUSTAINED HITS 1] ability.',
    },
  },
  {
    name: 'ESTABLISH COMMS',
    page: 3,
    timing: 'ANY BATTLE ROUND',
    when: 'Action completes.',
    condition: 'You score 3VP when the action completes.',
    vp: '3 VP',
    action: {
      name: 'ESTABLISH COMMS',
      starts: 'Your Shooting phase.',
      units:
        'One unit from your army that is more than 15" away from all other units from your army.',
      completes: 'Immediately.',
      ifCompleted: 'You score 3VP.',
    },
    stratagem: {
      name: 'RENEWED FOCUS',
      type: 'Battle Tactic',
      cp: '0',
      when: 'Your Shooting phase or your Fight phase.',
      target: 'One unit from your army that has not been selected to shoot or fight this phase.',
      effect:
        'Until the end of the phase, each time a model in your unit makes an attack, re-roll a Hit roll of 1 and a re-roll a Wound roll of 1.',
    },
  },
  {
    name: 'FOCUSED EFFORT',
    page: 4,
    timing: 'ANY BATTLE ROUND',
    when: 'End of your turn.',
    condition:
      'Models in two or more units from your army made one or more attacks against the same enemy unit this turn, and models in that enemy unit lost one or more wounds as a result of any of those attacks.',
    vp: '3 VP',
    stratagem: {
      name: 'BURST OF SPEED',
      type: 'Strategic Ploy',
      cp: '0',
      when: 'End of your Shooting phase.',
      target: 'One unit from your army (excluding units that made a move this phase).',
      effect:
        'Your unit can make a Normal move of up to d6", and then cannot move again this phase.',
    },
  },
  {
    name: 'OVER THE LINE',
    page: 5,
    timing: 'ANY BATTLE ROUND',
    when: 'End of your turn.',
    condition:
      "One or more units from your army (excluding AIRCRAFT and Battle-shocked units) are within your opponent's deployment zone.",
    vp: '3 VP',
    stratagem: {
      name: 'GREAT HASTE',
      type: 'Strategic Ploy',
      cp: '0',
      when: 'Your Movement phase.',
      target: 'One unit from your army that has not been selected to move this phase.',
      effect:
        'Until the end of the phase, add d6" to the Move characteristic of models in your unit.',
    },
  },
  {
    name: 'SECURE EXTRACTION ZONE',
    page: 6,
    timing: 'ANY BATTLE ROUND',
    when: 'Action completes.',
    condition: 'You score 3VP when the action completes.',
    vp: '3 VP',
    action: {
      name: 'SECURE EXTRACTION ZONE',
      starts: 'Your Shooting phase.',
      units:
        'One unit from your army that is not within your deployment zone and is wholly within 9" of one or more battlefield edges.',
      completes: 'Immediately.',
      ifCompleted: 'You score 3VP.',
    },
    stratagem: {
      name: 'FORCE A BREACH',
      type: 'Strategic Ploy',
      cp: '0',
      when: 'Your Movement phase.',
      target: 'One unit from your army that has not been selected to move this phase.',
      effect:
        'Until the end of the phase, each time your unit makes a Normal or Advance move, it can move horizontally through models and terrain features.',
    },
  },
  {
    name: 'SELF PRESERVATION',
    page: 7,
    timing: 'ANY BATTLE ROUND',
    when: 'Action completes.',
    condition: 'You score 3VP when the action completes.',
    vp: '3 VP',
    action: {
      name: 'SELF PRESERVATION',
      starts: 'Your Shooting phase.',
      units: 'One unit from your army.',
      completes: 'End of your turn, if that unit is more than 18" away from all enemy units.',
      ifCompleted: 'You score 3VP.',
    },
    stratagem: {
      name: 'ALL IN',
      type: 'Strategic Ploy',
      cp: '0',
      when: 'Your Fight phase.',
      target: 'One unit from your army that has not been selected to fight this phase.',
      effect:
        'Until the end of the phase, each time a model in your unit makes a Pile-in or Consolidation move, it can move up to 6" instead of up to 3". In addition, it does not need to end that move closer to the closest enemy model, provided it ends it as close as possible to the closest enemy unit.',
    },
  },
  {
    name: 'SOW CHAOS',
    page: 8,
    timing: 'ANY BATTLE ROUND',
    when: 'End of your turn.',
    condition:
      'One or more enemy models from two or more different units were destroyed this turn.',
    vp: '3 VP',
    stratagem: {
      name: 'OPPORTUNISTIC STRIKE',
      type: 'Strategic Ploy',
      cp: '0',
      when: 'Your Shooting phase.',
      target:
        'One unit from your army that is not within Engagement Range of one or more enemy units.',
      effect:
        'Select one enemy unit that is not within Engagement Range of one or more units from your army and is within 6" of and visible to your unit. Roll six d6; for each 4+, that enemy unit suffers 1 mortal wound.',
    },
  },
  {
    name: 'ZONE DEFENCE',
    page: 9,
    timing: 'ANY BATTLE ROUND',
    when: 'End of your turn.',
    condition:
      "For each of the following areas, one or more units from your army (excluding AIRCRAFT and Battle-shocked units) are wholly within that area: your deployment zone, 6\" of the center of the battlefield, No Man's Land, your opponent's deployment zone. To a maximum of 1VP per unit.",
    vp: '1 VP per area',
    maxVp: '3VP',
    stratagem: {
      name: 'STRATEGIC RETREAT',
      type: 'Strategic Ploy',
      cp: '0',
      when: 'Your Shooting phase.',
      target:
        'One unit from your army (excluding MONSTERS and VEHICLES) that is not within Engagement Range of one or more enemy units.',
      effect: 'Remove your unit from the battlefield and place it into Strategic Reserves.',
    },
  },
]
