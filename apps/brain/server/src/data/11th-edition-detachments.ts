/**
 * 11th Edition detachment data scraped from Warhammer Community faction focus articles.
 * Source: warhammer-community.com, May 2026
 */
import type { Node, NodeRef } from '../lib/model'

const RETRIEVED_AT = '2026-05-05T00:00:00Z'
const PUBLISHED_AT = '2026-05-05'
const SOURCE_BASE = 'https://www.warhammer-community.com/en-gb/articles'

interface DetachmentData {
  factionId: string
  factionName: string
  subfaction?: string
  detachmentName: string
  detachmentRule: { name: string; text: string }
  stratagems: Array<{ name: string; cp: number; when: string; target?: string; effect: string }>
  enhancements: Array<{ name: string; restriction: string; effect: string }>
  sourceUrl: string
}

const DETACHMENTS: DetachmentData[] = [
  // ── SPACE MARINES ──────────────────────────────────────────────────────────
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    detachmentName: 'Fulguris Task Force',
    detachmentRule: {
      name: 'Skystrike',
      text: 'Friendly LAND SPEEDER/STORM SPEEDER HAILSTRIKE/STORM SPEEDER HAMMERSTRIKE/STORM SPEEDER THUNDERSTRIKE units have SPEEDER. In your first Movement phase, friendly SPEEDER units can make an ingress move.',
    },
    stratagems: [
      {
        name: 'Reactive Evasion',
        cp: 1,
        when: 'Your opponent\'s Movement phase, when an enemy unit ends a move within 8" of a friendly unengaged SPEEDER unit.',
        target: 'That SPEEDER unit.',
        effect: 'Your unit can make a normal move of up to D3+3".',
      },
    ],
    enhancements: [
      {
        name: 'Bellicose Weapon Spirits',
        restriction: 'SPEEDER unit only',
        effect: 'This unit can re-roll: Damage rolls. Rolls to determine the A of a weapon.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    detachmentName: 'Librarius Conclave',
    detachmentRule: {
      name: 'Psychic Disciplines',
      text: `At the start of the battle round, select one of the following Psychic Disciplines abilities. Friendly ADEPTUS ASTARTES PSYKER units have that ability until the end of the battle round. Biomancy Discipline: This unit has +2" M. Divination Discipline: This unit's attacks can: Re-roll hit rolls of 1. Re-roll wound rolls of 1. Pyromancy Discipline: This unit's ranged attacks that target an enemy unit within 12" of this unit have +1 AP. Telekinesis Discipline: Ranged attacks that target this unit have -1 S. Telepathy Discipline: This unit's attacks can ignore modifiers to BS, WS and hit rolls.`,
    },
    stratagems: [],
    enhancements: [
      {
        name: 'Temporal Corridor',
        restriction: 'ADEPTUS ASTARTES PSYKER model only',
        effect:
          "At the end of your opponent's Fight phase, you can place this unit into strategic reserves. If this unit has the Telekinesis Discipline ability, this unit has Deep Strike.",
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    detachmentName: 'Subversion Assets',
    detachmentRule: {
      name: 'Nowhere to Hide',
      text: 'Friendly PHOBOS/SCOUT SQUAD units have the following ability: Transhuman Perception: In your Shooting phase, this unit can select one visible enemy unit within 12". That enemy unit is detected: While a unit is detected, that unit has +3" detection range.',
    },
    stratagems: [
      {
        name: 'Strike From the Shadows',
        cp: 1,
        when: 'Your Shooting phase, when a friendly PHOBOS/SCOUT SQUAD unit has shot.',
        target: 'That PHOBOS/SCOUT SQUAD unit.',
        effect: 'Those ranged attacks do not prevent your unit from being hidden.',
      },
    ],
    enhancements: [
      {
        name: 'Shroud Field',
        restriction: 'PHOBOS model only',
        effect: 'This model has: Lone Operative. Stealth.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },

  // ── BLACK TEMPLARS ─────────────────────────────────────────────────────────
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'black templars',
    detachmentName: 'Living Miracle',
    detachmentRule: {
      name: 'Anointed Champion',
      text: "When a friendly EMPEROR'S CHAMPION unit is selected to fight, that model's melee attacks can: Re-roll one hit roll. Re-roll one wound roll. Enhancements selected from this detachment do not count towards the total number of enhancements in your army. Restrictions: Your army can include BLACK TEMPLARS units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.",
    },
    stratagems: [],
    enhancements: [
      {
        name: 'Guiding Omens',
        restriction: "EMPEROR'S CHAMPION model only",
        effect: `At the start of the first battle round, you can select up to three of the following abilities. This model has those abilities until the end of the battle: Instrument of the God-Emperor (Once per battle, per army): In the Fight phase, when this unit is selected to fight, if this unit is engaged with an enemy CHARACTER unit, you can use this ability. If you do, this model's melee attacks have [DEVASTATING WOUNDS]. Foreseen Paths of the Unholy: This unit has -3" detection range. Vision of Momentous Brutality: This model's melee attacks have +2 A. Augury of Retribution: Melee attacks that target this unit have [HAZARDOUS]. Omen of Sacred Intervention: When you target this unit with the Heroic Intervention stratagem, that use is -1 CP. Harbinger of Judgement: When an enemy unit (excluding MONSTER/VEHICLE units) engaged with this model is selected to make a fall-back move, roll one D6: On a 2+, that enemy unit suffers D6 mortal wounds.`,
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'black templars',
    detachmentName: "Marshall's Household",
    detachmentRule: {
      name: 'Sword Brethren Vanguard',
      text: 'Friendly SWORD BRETHREN units have +1 OC. Restrictions: Your army can include BLACK TEMPLARS units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: 'Slayer of Abominations',
        cp: 1,
        when: 'Your Fight phase, when a friendly SWORD BRETHREN unit is selected to fight.',
        target: 'That SWORD BRETHREN unit.',
        effect: "This unit's melee attacks that target a MONSTER or VEHICLE unit have +2 S.",
      },
      {
        name: 'Blade of Devastation',
        cp: 1,
        when: 'Your Charge phase, when a friendly SWORD BRETHREN unit ends a charge move.',
        target: 'That SWORD BRETHREN unit.',
        effect:
          'Roll one D6 for each model in the target unit engaged with your unit: on a 4+, that enemy unit suffers 1 mortal wound (up to 6 mortal wounds).',
      },
    ],
    enhancements: [
      {
        name: 'Inheritors of Sigismund',
        restriction: 'SWORD BRETHREN unit only',
        effect: 'This unit has Fights First.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'black templars',
    detachmentName: 'Wrathful Procession',
    detachmentRule: {
      name: 'Chaplain Shield of Faith',
      text: 'Friendly ADEPTUS ASTARTES CHAPLAIN units have a 5+ invulnerable save against ranged attacks. Restrictions: Your army can include BLACK TEMPLARS units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: 'Perverted Wrath',
        cp: 1,
        when: 'Your Fight phase, when a friendly ADEPTUS ASTARTES CHAPLAIN unit is selected to fight.',
        target: 'That CHAPLAIN unit.',
        effect: "This unit's melee attacks have +1 S.",
      },
    ],
    enhancements: [
      {
        name: 'Adaptable Executioner',
        restriction: 'JUDICIAR model only',
        effect: "This model's melee attacks have Cleave 1 OR Precision.",
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },

  // ── BLOOD ANGELS ───────────────────────────────────────────────────────────
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'blood angels',
    detachmentName: 'Wrath of the Doomed',
    detachmentRule: {
      name: 'Fanatical Celerity',
      text: 'When a friendly DEATH COMPANY unit is selected to make an advance move, you can use this ability. If you do: That unit suffers D3+1 mortal wounds. That move does not prevent that unit from being eligible to declare a charge. This detachment has the DOOMED tag and cannot be taken with another DOOMED detachment. Restrictions: Your army can include BLOOD ANGELS units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: 'Heroic Intervention',
        cp: 1,
        when: "End of your opponent's Charge phase.",
        target:
          'One friendly unengaged unit within 12" of one or more enemy units. You can only select a VEHICLE unit if it is a CHARACTER/WALKER unit.',
        effect:
          'Resolve a charge with your unit. While doing so, before making the charge roll, you must select one of the following modes: Leap to Defend: When selecting charge targets, you can only select enemy units that made a charge move this phase and are within the maximum distance. Into the Fray (+1CP): When making the charge roll, if the result is greater than 6 (after modifiers), change it to 6. When selecting charge targets, you can select any enemy units that are within 6" of your unit and within the maximum distance.',
      },
      {
        name: 'Rage-Fuelled Response',
        cp: 1,
        when: "Your opponent's Shooting phase, when an enemy unit that targeted a friendly unengaged DEATH COMPANY unit has shot.",
        target: 'That DEATH COMPANY unit.',
        effect: 'Your unit can make a surge move of up to D6"',
      },
    ],
    enhancements: [
      {
        name: 'Instinctive Interception',
        restriction: 'DEATH COMPANY model only',
        effect:
          'When you target this unit with the Heroic Intervention stratagem, that use is -1 CP.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'blood angels',
    detachmentName: 'Legacy of Grace',
    detachmentRule: {
      name: 'Angelic Fury',
      text: 'Friendly ADEPTUS ASTARTES INFANTRY CHARACTER units have +1 to Advance and Charge rolls. Restrictions: Your army can include BLOOD ANGELS units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: "Aura of the Angel's Grace",
        cp: 1,
        when: "Your opponent's Shooting phase, when a friendly ADEPTUS ASTARTES INFANTRY CHARACTER unit is targeted.",
        target: 'That INFANTRY CHARACTER unit.',
        effect: 'That unit has a 5+ invulnerable save against ranged attacks.',
      },
    ],
    enhancements: [],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'blood angels',
    detachmentName: 'Incarnadine Speartip',
    detachmentRule: {
      name: 'Golden Host',
      text: 'Friendly SANGUINARY GUARD units can Fall Back and still Shoot and Charge. Restrictions: Your army can include BLOOD ANGELS units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: 'Blinding Blurs of Vengeance',
        cp: 1,
        when: "Your opponent's Shooting phase, when a friendly SANGUINARY GUARD unit is targeted.",
        target: 'That SANGUINARY GUARD unit.',
        effect: 'That unit has Stealth.',
      },
    ],
    enhancements: [],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },

  // ── DARK ANGELS ────────────────────────────────────────────────────────────
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'dark angels',
    detachmentName: 'Dark Age Arsenal',
    detachmentRule: {
      name: 'Invocations of Ancient Fury',
      text: "Friendly ADEPTUS ASTARTES units' weapon profiles with 'Plasma' in their names are plasma weapon profiles. Plasma weapon profiles have +1 S. Restrictions: Your army can include DARK ANGELS units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.",
    },
    stratagems: [
      {
        name: 'No Sacrifice Too Great',
        cp: 1,
        when: 'Your Shooting phase, when a friendly ADEPTUS ASTARTES unit is selected to shoot.',
        target: 'That ADEPTUS ASTARTES unit.',
        effect: "Your unit's [HAZARDOUS] plasma ranged attacks have +1 S.",
      },
    ],
    enhancements: [
      {
        name: 'Petition of Stability',
        restriction: 'ADEPTUS ASTARTES unit only',
        effect: 'This unit\'s plasma attacks have +6" R.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'dark angels',
    detachmentName: 'Dark Flight Pursuit',
    detachmentRule: {
      name: 'Ravenwing Vengeance',
      text: 'Friendly RAVENWING FLY units have Ignores Cover on ranged attacks. Restrictions: Your army can include DARK ANGELS units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: 'We Are Vengeance',
        cp: 1,
        when: "Your opponent's Shooting phase, when a friendly RAVENWING FLY unit is targeted.",
        target: 'That RAVENWING FLY unit.',
        effect: 'Your unit can make a normal move of up to D3+3".',
      },
    ],
    enhancements: [],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'dark angels',
    detachmentName: 'Interrogation Conclave',
    detachmentRule: {
      name: 'Inquisitorial Dread',
      text: 'When a friendly ADEPTUS ASTARTES CHAPLAIN unit destroys an enemy unit in the Fight phase, all enemy units within 6" must take a Battleshock test. Friendly CHAPLAIN units give -1 Leadership to enemy units within 6". Restrictions: Your army can include DARK ANGELS units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: 'Exacting Punishment',
        cp: 1,
        when: 'Your Shooting phase or Fight phase, when a friendly ADEPTUS ASTARTES CHAPLAIN unit is selected to shoot or fight.',
        target: 'That CHAPLAIN unit.',
        effect: "This unit's attacks have Precision.",
      },
    ],
    enhancements: [
      {
        name: 'Inescapable Interrogation',
        restriction: 'CHAPLAIN model only',
        effect: "This unit's ranged attacks have Ignores Cover.",
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },

  // ── SPACE WOLVES ───────────────────────────────────────────────────────────
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'space wolves',
    detachmentName: 'Champions of Fenris',
    detachmentRule: {
      name: 'The Great Wolf Watches',
      text: 'Friendly ADEPTUS ASTARTES INFANTRY CHARACTER units have the following ability: Countercharge: (Once per battle round, per unit) You can target this unit with the Heroic Intervention stratagem, regardless of any other uses of that stratagem this phase. If you do: That use does not prevent any uses of that stratagem on other units this phase. Restrictions: Your army can include SPACE WOLVES units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: 'Stalk Between Worlds',
        cp: 1,
        when: "Your opponent's Shooting phase, when an enemy unit targets a friendly ADEPTUS ASTARTES INFANTRY CHARACTER unit.",
        target: 'That ADEPTUS ASTARTES INFANTRY CHARACTER unit.',
        effect: 'Your unit has Stealth.',
      },
    ],
    enhancements: [
      {
        name: 'A Giant Amongst Giants',
        restriction: 'ADEPTUS ASTARTES INFANTRY model only',
        effect: "This model has +2 W. This model's melee attacks have +1 S.",
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'space wolves',
    detachmentName: 'Legends of Saga and Song',
    detachmentRule: {
      name: 'Terminator Assault',
      text: 'All friendly TERMINATOR units have +1 to Charge rolls. Restrictions: Your army can include SPACE WOLVES units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: 'Wings of the Blizzard',
        cp: 1,
        when: 'Your Fight phase, after a friendly TERMINATOR unit has fought and destroyed an enemy unit.',
        target: 'That TERMINATOR unit.',
        effect: 'Place your unit into strategic reserves.',
      },
    ],
    enhancements: [
      {
        name: 'Fierce Example',
        restriction: 'WOLF GUARD TERMINATORS unit only',
        effect: 'This unit has +1 Toughness.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },
  {
    factionId: 'space-marines',
    factionName: 'SPACE MARINES',
    subfaction: 'space wolves',
    detachmentName: 'Veterans of the Fang',
    detachmentRule: {
      name: 'Grey Hunter Tactics',
      text: 'Friendly GREY HUNTERS units can start an action and still shoot. In Declare Battle Formations, you can split a friendly GREY HUNTER unit into two units of starting strength 5. Restrictions: Your army can include SPACE WOLVES units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter.',
    },
    stratagems: [
      {
        name: 'Grizzled Killers',
        cp: 1,
        when: 'Your Fight phase, when a friendly GREY HUNTERS unit is selected to fight.',
        target: 'That GREY HUNTERS unit.',
        effect: "This unit's melee attacks have [SUSTAINED HITS 1] OR [LETHAL HITS].",
      },
    ],
    enhancements: [
      {
        name: 'Eye of the Hunter',
        restriction: 'WOLF GUARD BATTLE LEADER model only',
        effect: "This unit's ranged attacks have [ASSAULT], Ignores Cover, and +1 AP.",
      },
      {
        name: 'Weaver of Sagas',
        restriction: 'WOLF PRIEST model only',
        effect:
          'Remove Battleshock from friendly ADEPTUS ASTARTES units within 6" (range 18" for GREY HUNTERS units).',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/xiczsalv/warhammer-40000-faction-focus-space-marines/`,
  },

  // ── ORKS ───────────────────────────────────────────────────────────────────
  {
    factionId: 'orks',
    factionName: 'ORKS',
    detachmentName: "Rollin' Deff",
    detachmentRule: {
      name: 'Thundering Wagons',
      text: 'Friendly BATTLEWAGON/HUNTA RIG/KILL RIG units have WAGON. Friendly WAGON units can re-roll charge rolls. When a friendly WAGON unit is selected to make an advance move, that unit can change advance rolls to a 6. This detachment has the WAGONS tag and cannot be taken with another WAGONS detachment.',
    },
    stratagems: [
      {
        name: 'Brutal Broadside',
        cp: 1,
        when: 'Your Shooting phase, when a friendly BATTLEWAGON unit is selected to shoot.',
        target: 'That BATTLEWAGON unit.',
        effect:
          "Your unit's ranged attacks (excluding attacks made by weapons selected with Firing Deck) have [RAPID FIRE X], where X is that attack's A.",
      },
    ],
    enhancements: [
      {
        name: 'Boarding Ramps',
        restriction: 'WAGON unit only',
        effect:
          'When a unit embarked within this unit is selected to make a disembark move, that unit has +1 to charge rolls until the end of the turn.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/ahlcjhn0/warhammer-40000-faction-focus-orks/`,
  },
  {
    factionId: 'orks',
    factionName: 'ORKS',
    detachmentName: 'Taktikal Brigade',
    detachmentRule: {
      name: "Lissen 'Ere",
      text: 'Friendly STORMBOYZ units have BATTLELINE. When a friendly BOYZ/KOMMANDOS/STORMBOYZ unit is selected to make an advance/fall-back move, that move does not prevent that unit from being eligible to start an action.',
    },
    stratagems: [
      {
        name: 'Ded Sneaky',
        cp: 1,
        when: "End of your opponent's Fight phase.",
        target: 'One friendly unengaged KOMMANDOS/STORMBOYZ unit.',
        effect: 'Place your unit in strategic reserves.',
      },
    ],
    enhancements: [
      {
        name: 'Slippery Git',
        restriction: 'INFANTRY WARBOSS model only (excluding MEGA ARMOUR models)',
        effect: 'This model has Infiltrators and Stealth.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/ahlcjhn0/warhammer-40000-faction-focus-orks/`,
  },
  {
    factionId: 'orks',
    factionName: 'ORKS',
    detachmentName: 'More Dakka!',
    detachmentRule: {
      name: 'Dakka! Dakka! Dakka!',
      text: "Friendly ORKS INFANTRY units' ranged attacks have [ASSAULT]. In your Shooting phase, if the Waaagh! is active for your army, friendly ORKS INFANTRY units' ranged attacks have [SUSTAINED HITS 1].",
    },
    stratagems: [
      {
        name: 'Call Dat Dakka?',
        cp: 1,
        when: "Your opponent's Shooting phase, when an enemy unit that targeted a friendly ORKS INFANTRY unit has shot.",
        target: 'That ORKS INFANTRY unit.',
        effect:
          'Your unit shoots using snap shooting, but while doing so your unit can only target that enemy unit.',
      },
    ],
    enhancements: [
      {
        name: 'Dead Shiny Shootas',
        restriction: 'ORKS INFANTRY unit only',
        effect:
          "This unit's ranged attacks have: [RAPID FIRE 1]. Or: If that attack already has [RAPID FIRE], +1 to the value of that [RAPID FIRE] (e.g. [RAPID FIRE 1] becomes [RAPID FIRE 2]).",
      },
    ],
    sourceUrl: `${SOURCE_BASE}/ahlcjhn0/warhammer-40000-faction-focus-orks/`,
  },

  // ── ASTRA MILITARUM ────────────────────────────────────────────────────────
  {
    factionId: 'astra-militarum',
    factionName: 'ASTRA MILITARUM',
    detachmentName: 'Abhuman Auxiliaries',
    detachmentRule: {
      name: 'Absolutist Principles',
      text: 'Friendly BULLGRYN SQUAD/OGRYN SQUAD/RATLINGS units have ABHUMAN. Friendly COMMISSAR models can: Issue the Take Aim! Order. Issue 1 Order to a friendly ABHUMAN unit. This detachment has the ABHUMAN tag and cannot be taken with another ABHUMAN detachment.',
    },
    stratagems: [
      {
        name: 'Low Profile',
        cp: 1,
        when: 'Your Shooting phase, when a friendly RATLINGS unit has shot.',
        target: 'That RATLINGS unit.',
        effect: 'Those ranged attacks do not prevent your unit from being hidden.',
      },
      {
        name: 'Stirred to Action',
        cp: 1,
        when: "Your opponent's Shooting phase, when a friendly BULLGRYN/OGRYN unit is targeted.",
        target: 'That unit.',
        effect: 'That unit can make a surge move of D6".',
      },
    ],
    enhancements: [
      {
        name: 'Exemplar of Duty',
        restriction: 'COMMISSAR model only',
        effect: 'This model has Feel No Pain 4+.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/astra-militarum-faction-focus/`,
  },
  {
    factionId: 'astra-militarum',
    factionName: 'ASTRA MILITARUM',
    detachmentName: 'Bridgehead Strike',
    detachmentRule: {
      name: 'Fire Zone Purge',
      text: "If a friendly MILITARUM TEMPESTUS OFFICER model is your WARLORD, friendly TEMPESTUS SCIONS units have: BATTLELINE. +1 OC. When a friendly MILITARUM TEMPESTUS unit is selected to shoot, if that unit was set up this turn, that unit's ranged attacks have +1 to hit rolls.",
    },
    stratagems: [
      {
        name: 'Firing Hot',
        cp: 2,
        when: 'Your Shooting phase, when a friendly MILITARUM TEMPESTUS/KASRKIN unit is selected to shoot.',
        target: 'That MILITARUM TEMPESTUS/KASRKIN unit.',
        effect:
          'Your unit\'s Hot-shot Lascarbines, Hot-shot Lasguns, Hot-shot Laspistols, Hot-shot Marksman Rifles, Hot-shot Volley Guns and Sentry Hot-shot Volley Guns weapons that targeted an enemy unit within 12" have +1 S and AP.',
      },
    ],
    enhancements: [
      {
        name: 'Priority Drop Beacon',
        restriction: 'MILITARUM TEMPESTUS OFFICER model only',
        effect: 'In your first Movement phase, this unit can make an ingress move.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/astra-militarum-faction-focus/`,
  },
  {
    factionId: 'astra-militarum',
    factionName: 'ASTRA MILITARUM',
    detachmentName: 'Designation Force',
    detachmentRule: {
      name: 'Designated Targets',
      text: 'Friendly SCOUT SENTINEL/ASTRA MILITARUM INFANTRY SMOKE units have the following ability: Signal Flares: In your Shooting phase, this unit can select one visible enemy unit within 12". That enemy unit is designated: While a unit is designated, that unit has +3" detection range. This detachment has the RECON tag and cannot be taken with another RECON detachment.',
    },
    stratagems: [
      {
        name: 'Sump-Smog Screen',
        cp: 1,
        when: "Start of your opponent's Shooting phase.",
        target: 'One friendly ASTRA MILITARUM INFANTRY unit.',
        effect:
          'When an attack targets either your unit, or a unit that is not fully visible to the attacking model because of one or more models in your unit, the target has the benefit of cover against that attack.',
      },
    ],
    enhancements: [
      {
        name: 'Long-Range Scout',
        restriction: 'SCOUT SENTINEL unit only',
        effect: 'This unit has Infiltrators.',
      },
    ],
    sourceUrl: `${SOURCE_BASE}/astra-militarum-faction-focus/`,
  },
]

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function build11thEditionNodes(): { nodes: Node[]; refs: NodeRef[] } {
  const nodes: Node[] = []
  const refs: NodeRef[] = []

  for (const det of DETACHMENTS) {
    const detSlug = slugify(det.detachmentName)
    const detId = `11e:det:${det.factionId}:${detSlug}`

    const source = {
      type: 'manual' as const,
      title: 'Warhammer Community Faction Focus',
      url: det.sourceUrl,
      publishedAt: PUBLISHED_AT,
      retrievedAt: RETRIEVED_AT,
    }

    // Detachment rule node
    const ruleContent = `**${det.detachmentRule.name}**\n\n${det.detachmentRule.text}`
    nodes.push({
      id: detId,
      layer: 'faction',
      category: 'detachment-rule',
      title: det.detachmentName,
      content: ruleContent,
      summary: `${det.detachmentName} — 11th Edition ${det.factionName} detachment. ${det.detachmentRule.name}: ${det.detachmentRule.text.substring(0, 150)}...`,
      phase: 'any',
      factionId: det.factionId,
      factionName: det.factionName,
      subfaction: det.subfaction,
      edition: '11th',
      sources: [source],
      refs: [],
      version: 1,
      keywords: [
        det.detachmentName.toLowerCase(),
        det.detachmentRule.name.toLowerCase(),
        '11th edition',
        'detachment',
        det.factionName.toLowerCase(),
        ...(det.subfaction ? [det.subfaction] : []),
      ],
    })

    // Stratagem nodes
    for (const strat of det.stratagems) {
      const stratSlug = slugify(strat.name)
      const stratId = `11e:strat:${det.factionId}:${detSlug}:${stratSlug}`

      const parts = [`**${strat.name}** (${strat.cp}CP)`]
      parts.push(`**When:** ${strat.when}`)
      if (strat.target) parts.push(`**Target:** ${strat.target}`)
      parts.push(`**Effect:** ${strat.effect}`)

      nodes.push({
        id: stratId,
        layer: 'faction',
        category: 'stratagem',
        title: strat.name,
        content: parts.join('\n'),
        summary: `${strat.name} (${strat.cp}CP) — ${det.detachmentName} stratagem. ${strat.effect.substring(0, 120)}`,
        factionId: det.factionId,
        factionName: det.factionName,
        subfaction: det.subfaction,
        detachmentId: detId,
        edition: '11th',
        sources: [source],
        refs: [],
        version: 1,
        keywords: [
          strat.name.toLowerCase(),
          'stratagem',
          '11th edition',
          det.detachmentName.toLowerCase(),
          det.factionName.toLowerCase(),
        ],
      })

      refs.push({
        sourceId: stratId,
        targetId: detId,
        rel: 'part_of',
        context: `${strat.name} is a stratagem in the ${det.detachmentName} detachment`,
      })
    }

    // Enhancement nodes
    for (const enh of det.enhancements) {
      const enhSlug = slugify(enh.name)
      const enhId = `11e:enh:${det.factionId}:${detSlug}:${enhSlug}`

      const parts = [`**${enh.name}**`]
      parts.push(`*${enh.restriction}*`)
      parts.push(enh.effect)

      nodes.push({
        id: enhId,
        layer: 'faction',
        category: 'enhancement',
        title: enh.name,
        content: parts.join('\n'),
        summary: `${enh.name} — ${det.detachmentName} enhancement. ${enh.restriction}. ${enh.effect.substring(0, 120)}`,
        factionId: det.factionId,
        factionName: det.factionName,
        subfaction: det.subfaction,
        detachmentId: detId,
        edition: '11th',
        sources: [source],
        refs: [],
        version: 1,
        keywords: [
          enh.name.toLowerCase(),
          'enhancement',
          '11th edition',
          det.detachmentName.toLowerCase(),
          det.factionName.toLowerCase(),
        ],
      })

      refs.push({
        sourceId: enhId,
        targetId: detId,
        rel: 'part_of',
        context: `${enh.name} is an enhancement in the ${det.detachmentName} detachment`,
      })
    }
  }

  // ── RED TERROR (Tyranids unit) ───────────────────────────────────────────
  const redTerrorSource = {
    type: 'manual' as const,
    title: 'Warhammer Community Faction Focus',
    url: `${SOURCE_BASE}/tyranids-faction-focus/`,
    publishedAt: PUBLISHED_AT,
    retrievedAt: RETRIEVED_AT,
  }

  const redTerrorId = '11e:unit:tyranids:red-terror'
  nodes.push({
    id: redTerrorId,
    layer: 'unit',
    category: 'datasheet',
    title: 'Red Terror',
    content: `**Red Terror** (130 pts)

**Keywords:** BURROWER, VANGUARD INVADER

**Weapons:**
- Scything Talons: S7, anti-infantry
- Swallow Whole: Single attack, automatically has [DEVASTATING WOUNDS] on a successful wound roll, Precision

**Abilities:**
- Deep Strike
- Can burrow back underground (return to strategic reserves)
- Heals wounds on a successful Swallow Whole attack

**Synergies:**
- Subterranean Assault Detachment: BURROWER units can re-roll hit rolls of 1
- Vanguard Onslaught Detachment: benefits from VANGUARD INVADER keyword`,
    summary:
      'Red Terror — 11th Edition Tyranids unit. 130 pts. BURROWER, VANGUARD INVADER. Deep Strike, Swallow Whole (auto Devastating Wounds + Precision), burrows back underground, heals on successful Swallow Whole.',
    phase: 'fight',
    factionId: 'tyranids',
    factionName: 'TYRANIDS',
    edition: '11th',
    sources: [redTerrorSource],
    refs: [],
    version: 1,
    keywords: [
      'red terror',
      'tyranids',
      'burrower',
      'vanguard invader',
      '11th edition',
      'datasheet',
      'deep strike',
      'swallow whole',
    ],
  })

  // ── 11th Edition Army Construction Rules ──────────────────────────────────
  nodes.push({
    id: '11e:core:army-construction',
    layer: 'core',
    category: 'army-construction',
    title: '11th Edition Army Construction — Detachment Points',
    content: `**Multiple Detachments**

In 11th Edition, armies can include multiple detachments. Each unit is assigned to one detachment and benefits from that detachment's rules, stratagems, and enhancements.

**Detachment Points**

Each detachment has a cost of 1-3 Detachment Points:
- **1 point:** Narrow, unit-focused detachments (e.g., affects only one unit type)
- **2 points:** Moderate scope
- **3 points:** Army-wide buffs that affect your entire force

**Detachment Points by Game Size:**
- **Incursion (1,000 pts):** 2 Detachment Points
- **Strike Force (2,000 pts):** 3 Detachment Points

**Build Options at Strike Force (competitive standard):**
- One 3-point detachment (all-in on one army-wide buff)
- One 2-point + one 1-point detachment (primary + support)
- Three 1-point detachments (breadth across different unit synergies)

**70+ detachments available at launch.**

Units in different detachments benefit from different rules. A melee-focused unit could be in an aggressive detachment while a shooting unit sits in a firepower detachment — within the same army.`,
    summary:
      '11th Edition army construction: multiple detachments per army, 1-3 Detachment Points each. Strike Force gets 3 pts. 70+ detachments at launch.',
    edition: '11th',
    sources: [
      {
        type: 'manual' as const,
        title: 'Warhammer Community — Building an Army in the New Edition',
        url: 'https://www.warhammer-community.com/en-gb/articles/95fucn12/building-an-army-in-the-new-edition-of-warhammer-40000/',
        publishedAt: '2026-04-01',
        retrievedAt: RETRIEVED_AT,
      },
    ],
    refs: [],
    version: 1,
    keywords: [
      'army construction',
      'detachment points',
      '11th edition',
      'multiple detachments',
      'strike force',
      'incursion',
      'list building',
    ],
  })

  return { nodes, refs }
}
