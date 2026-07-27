/**
 * shapes/onboarding.ts — New-player onboarding question shape.
 *
 * Matches questions like:
 *   "where do I start with Space Marines?"
 *   "new player here, thinking about Tyranids"
 *   "what's a good first army for Necrons?"
 *   "is there a combat patrol recommendation for Orks?"
 *
 * Canonicalize: { faction: string | null, hasExistingArmy: boolean }
 * Handle:
 *   - faction identified → delegated: true with canned faction-specific advice.
 *   - no faction → delegated: false with generic starter augmentContext.
 */

import { register } from '../registry'
import type { HandlerResult, QuestionShape, ShapeContext } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OnboardingParsed {
  faction: string | null
  hasExistingArmy: boolean
}

// ── Detection ─────────────────────────────────────────────────────────────────

const ONBOARDING_PHRASES_RE =
  /\b(?:where\s+(?:do|should)\s+i\s+start|new\s+player|getting\s+into\s+40[kK]|first\s+army|beginner|starting\s+(?:out|40[kK]|an?\s+army)|combat\s+patrol\s+rec(?:ommendation)?|just\s+start(?:ed|ing)|brand\s+new|pick\s+(?:up\s+)?(?:my\s+)?first|start\s+collecting|what(?:'s|\s+is)\s+(?:a\s+)?good\s+(?:starter|first|beginner)|how\s+do\s+i\s+(?:get\s+)?started)\b/i

const HAS_EXISTING_ARMY_RE =
  /\b(?:already\s+(?:have|own|got)|i\s+have\s+some|i\s+(?:own|bought|picked\s+up)|existing\s+(?:army|collection))\b/i

// ── Canned advice by faction slug ─────────────────────────────────────────────

/** Display name for each faction slug. */
const FACTION_DISPLAY: Record<string, string> = {
  'space-marines': 'Space Marines',
  'chaos-space-marines': 'Chaos Space Marines',
  'grey-knights': 'Grey Knights',
  'death-guard': 'Death Guard',
  'thousand-sons': 'Thousand Sons',
  'world-eaters': 'World Eaters',
  necrons: 'Necrons',
  orks: 'Orks',
  tyranids: 'Tyranids',
  aeldari: 'Aeldari',
  drukhari: 'Drukhari',
  't-au-empire': "T'au Empire",
  'adeptus-custodes': 'Adeptus Custodes',
  'adepta-sororitas': 'Adepta Sororitas',
  'adeptus-mechanicus': 'Adeptus Mechanicus',
  'astra-militarum': 'Astra Militarum',
  'imperial-agents': 'Imperial Agents',
  'imperial-knights': 'Imperial Knights',
  'chaos-knights': 'Chaos Knights',
  'chaos-daemons': 'Chaos Daemons',
  'genestealer-cults': 'Genestealer Cults',
  'leagues-of-votann': 'Leagues of Votann',
}

/**
 * Per-faction starter advice. Covers Combat Patrol box and 2–3 follow-up
 * recommendations. Intentionally generic and rules-agnostic — no GW content.
 */
function factionAdvice(factionSlug: string, hasExisting: boolean): string {
  const name = FACTION_DISPLAY[factionSlug] ?? factionSlug
  const prefix = hasExisting
    ? `Since you already have some ${name} models, here's how to expand:`
    : `To get started with ${name}:`

  const steps = factionStarterSteps(factionSlug, name)

  return [
    `## Getting Started with ${name}`,
    '',
    prefix,
    '',
    steps,
    '',
    '### General new-player tips',
    '- Build and paint a small Combat Patrol-sized force (500–1000 pts) before expanding.',
    '- Learn the core rules (Movement, Shooting, Fight phases) in your first few games.',
    "- 11th Edition uses Detachments — your army's secondary rule set. Pick one that fits your playstyle.",
    '- The community on r/Warhammer40K and r/WarhammerCompetitive is very helpful.',
  ].join('\n')
}

function factionStarterSteps(slug: string, name: string): string {
  // Provide tailored advice for the most common factions.
  // For factions not listed, fall back to a generic template.
  const templates: Record<string, string[]> = {
    'space-marines': [
      '1. **Combat Patrol: Space Marines** — great value box with a Lieutenant, Infernus Squad, Ballistus Dreadnought, and Scouts.',
      '2. Follow up with a **Tactical Squad or Intercessors** to fill your Battleline slot.',
      '3. Add a **Captain or Chapter Master** to unlock leader attachment combos.',
      '4. For a first Detachment, **Gladius Task Force** (Oath of Moment) is straightforward and competitive.',
    ],
    necrons: [
      '1. **Combat Patrol: Necrons** — includes Overlord, Immortals, Canoptek Scarabs, and a Doomsday Ark.',
      '2. Expand with a **Necron Warriors box** (the backbone of most lists).',
      '3. Add a **Technomancer** or **Chronomancer** to support your Warriors.',
      '4. **Awakened Dynasty** Detachment is a solid starting point for new Necron players.',
    ],
    orks: [
      '1. **Combat Patrol: Orks** — Warboss on Warbike, Boyz, Deffkoptas, and Gretchin.',
      '2. Expand with more **Boyz** — Orks love numbers.',
      '3. Add **Nobz** or a **Painboy** to give your Boyz staying power.',
      '4. **Waaagh! Tribe** Detachment rewards aggressive play that suits Orks.',
    ],
    tyranids: [
      '1. **Combat Patrol: Tyranids** — Winged Hive Tyrant, Termagants, Ripper Swarms, and Barbgaunts.',
      '2. Expand with more **Termagants** (Endless Multitude rule rewards large broods).',
      '3. Add **Hormagaunts** for fast melee pressure.',
      '4. **Invasion Fleet** Detachment is beginner-friendly with straightforward Synaptic rules.',
    ],
    aeldari: [
      '1. **Combat Patrol: Aeldari** — Farseer, Guardians, Windriders, and War Walkers.',
      '2. Expand with **Dire Avengers** or **Rangers** for flexible Battleline options.',
      '3. **Wraith units** (Wraithguard, Wraithblades) are resilient mid-game anchors.',
      '4. **Warhost** Detachment is a classic Aeldari starting point.',
    ],
    't-au-empire': [
      "1. **Combat Patrol: T'au Empire** — Cadre Fireblade, Fire Warriors, Pathfinders, and a Hammerhead.",
      '2. Expand with more **Fire Warriors** to fill out your Battleline.',
      '3. Add a **Crisis Suit team** for mobile firepower.',
      '4. **Kroot Hunting Pack** or **Retaliation Cadre** are beginner-friendly Detachments.',
    ],
    'chaos-space-marines': [
      '1. **Combat Patrol: Chaos Space Marines** — Dark Apostle, Chaos Space Marines, Cultist Mob.',
      '2. Add a **Chaos Lord** and **Chosen** for elite offensive pressure.',
      '3. **Legionaries** are versatile Battleline units worth multiple boxes.',
      '4. **Slaves to Darkness** Detachment rewards aggressive lists.',
    ],
    'death-guard': [
      '1. **Combat Patrol: Death Guard** — Typhus, Poxwalkers, Plague Marines.',
      '2. Add more **Plague Marines** — resilient and easy to learn.',
      '3. A **Bloat-Drone** adds mobile threat projection.',
      '4. **Plague Company** Detachment is the flagship Death Guard experience.',
    ],
  }

  const steps = templates[slug]
  if (steps) return steps.join('\n')

  // Generic template
  return [
    `1. Look for the **Combat Patrol: ${name}** box — it's the best entry point for most factions.`,
    '2. Build and paint the box before buying more (avoids "pile of shame").',
    `3. Add a **second Battleline unit** to expand your ${name} force to ~750 pts.`,
    '4. Pick the Detachment that matches your preferred playstyle (aggressive, defensive, or mixed).',
  ].join('\n')
}

const genericAdvice = [
  'SHAPE[onboarding]: No faction identified. Providing generic starter advice.',
  '',
  'General new-player starting points for Warhammer 40,000 11th Edition:',
  '- Pick a faction whose aesthetics you love — you will be painting a lot of them.',
  '- Most factions have a Combat Patrol box (~500 pts) that is the cheapest entry point.',
  '- Start small: build and paint before you buy more.',
  '- Learn the 3 core phases first (Movement, Shooting, Fight) before mastering Stratagems.',
  '- Ask on r/Warhammer40K for faction-specific advice once you have narrowed your choice.',
].join('\n')

// ── Shape implementation ──────────────────────────────────────────────────────

const onboardingShape: QuestionShape<OnboardingParsed> = {
  id: 'onboarding',
  description: 'New-player onboarding — where to start, first army, combat patrol recs',
  priority: 70,

  matches(ctx: ShapeContext): boolean {
    return ONBOARDING_PHRASES_RE.test(ctx.question)
  },

  canonicalize(ctx: ShapeContext): OnboardingParsed {
    const faction = ctx.detectedFactions.length > 0 ? ctx.detectedFactions[0]! : null
    const hasExistingArmy = HAS_EXISTING_ARMY_RE.test(ctx.question)
    return { faction, hasExistingArmy }
  },

  async handle(parsed: OnboardingParsed, _ctx: ShapeContext): Promise<HandlerResult> {
    if (!parsed.faction) {
      return {
        delegated: false,
        shapeId: 'onboarding',
        parsedNotes: 'no faction detected — generic advice',
        augmentContext: genericAdvice,
      }
    }

    const answer = factionAdvice(parsed.faction, parsed.hasExistingArmy)

    return {
      delegated: true,
      answer,
      shapeId: 'onboarding',
      parsedNotes: `faction=${parsed.faction}, hasExistingArmy=${parsed.hasExistingArmy}`,
    }
  },
}

register(onboardingShape)

export { onboardingShape }
