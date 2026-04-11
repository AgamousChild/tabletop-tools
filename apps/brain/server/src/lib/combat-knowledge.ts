/**
 * Competitive 40K combat knowledge — community-layer insights.
 *
 * These are gameplay concepts that aren't in any rulebook but are
 * fundamental to how competitive players evaluate units and make
 * tactical decisions.
 */

import type { Node, NodeRef } from './model'
import { communityId } from './slugify'

const RETRIEVED_AT = new Date().toISOString()
const source = {
  type: 'manual' as const,
  title: 'Competitive Play Knowledge',
  retrievedAt: RETRIEVED_AT,
}

export function buildCommunityNodes(): { nodes: Node[]; refs: NodeRef[] } {
  const nodes: Node[] = []
  const refs: NodeRef[] = []

  // ── 1. Fishing for Crits ─────────────────────────────────────────────────

  nodes.push({
    id: communityId('fishing-for-crits'),
    layer: 'community',
    category: 'tactic',
    title: 'Fishing for Crits',
    content: `Fishing is the competitive practice of rerolling successful hits or wounds that aren't 6s, hoping to turn them into 6s that trigger weapon abilities like Sustained Hits, Lethal Hits, or Devastating Wounds.

**At the hit gate:** Reroll hits that already hit (but aren't 6s) to fish for Sustained Hits (extra hits) or Lethal Hits (auto-wounds). This is a net positive because you keep most rerolled dice as hits anyway (4/6 chance on BS 3+), and the 6s generate massive extra value.

**At the wound gate:** Reroll successful wounds with Twin-linked to fish for Devastating Wounds (mortal wounds that skip all saves — armour and invulnerable).

**Key principle:** One reroll per die. Can't reroll a reroll. The decision is binary — keep the result or reroll once.

**Why it works:** Rerolls are offensive tools, not defensive ones. The value isn't fixing misses — it's fishing for crits. With enough dice volume, you reliably convert rerolls into crit triggers.`,
    summary: 'Reroll successful hits/wounds to fish for 6s that trigger sustained hits, lethal hits, or devastating wounds. Rerolls are offensive, not defensive.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['fishing', 'reroll', 'sustained hits', 'lethal hits', 'devastating wounds', 'crit', 'twin-linked'],
  })

  refs.push(
    { sourceId: communityId('fishing-for-crits'), targetId: 'core:sustained-hits', rel: 'interacts_with', context: 'Fishing for 6s triggers sustained hits — extra hits per crit.' },
    { sourceId: communityId('fishing-for-crits'), targetId: 'core:lethal-hits', rel: 'interacts_with', context: 'Fishing for 6s triggers lethal hits — auto-wounds that skip the wound roll.' },
    { sourceId: communityId('fishing-for-crits'), targetId: 'core:devastating-wounds', rel: 'interacts_with', context: 'Fishing for 6s on wound rolls triggers devastating wounds — mortal wounds that skip all saves.' },
  )

  // ── 2. Attack Volume ─────────────────────────────────────────────────────

  nodes.push({
    id: communityId('attack-volume'),
    layer: 'community',
    category: 'tactic',
    title: 'Attack Volume — Total Unit Output',
    content: `The real measure of a unit's offensive power isn't the weapon's attacks characteristic — it's the total dice pool:

**Models × Weapons per model × Attacks per weapon = Total attacks**

A 10-man Intercessor squad with bolt rifles: 10 × 1 × 2 = 20 attacks.
A 3-man Eradicator squad with melta rifles: 3 × 1 × 1 = 3 attacks.

Volume is the multiplier for everything:
- Sustained Hits on 20 attacks generates ~3 extra hits. On 3 attacks, maybe 0.
- Lethal Hits on 20 attacks auto-wounds ~3 times. On 3 attacks, maybe 0.
- Fishing for crits with rerolls is only profitable at volume.

This is why horde units with weapon abilities are disproportionately strong — the abilities scale with dice count, not per-model quality.`,
    summary: 'Total unit output = models × weapons × attacks. Volume multiplies weapon abilities — sustained hits, lethal hits, and rerolls all scale with dice count.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['volume', 'attacks', 'models', 'dice pool', 'sustained hits', 'lethal hits'],
  })

  refs.push(
    { sourceId: communityId('attack-volume'), targetId: communityId('fishing-for-crits'), rel: 'requires', context: 'Volume is what makes fishing for crits profitable — more dice = more 6s.' },
  )

  // ── 3. Toughness Breakpoints ─────────────────────────────────────────────

  nodes.push({
    id: communityId('toughness-breakpoints'),
    layer: 'community',
    category: 'tactic',
    title: 'Toughness Breakpoints and Weapon Strength',
    content: `Units cluster into toughness tiers. Weapon strength determines which tier you wound efficiently:

**S >= 2×T → 2+ to wound (very efficient)**
**S > T → 3+ (efficient)**
**S = T → 4+ (coin flip)**
**S < T → 5+ (inefficient)**
**S <= T/2 → 6+ (near-impossible)**

Tiers: T3 (guard/eldar), T4 (marines), T5 (gravis), T6 (custodes), T7-8 (vehicles), T9-10 (heavy vehicles), T11-12 (knights), T13+ (titans).

A S8 weapon wounds T4 marines on 2+ but T8 vehicles on 4+. A S4 bolter wounds T4 on 4+ but T6 custodes on 5+. Choosing the right weapon for the target toughness tier is fundamental.`,
    summary: 'Units cluster into toughness tiers. Weapon strength must match the target tier — S >= 2×T wounds on 2+, S = T wounds on 4+.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['toughness', 'strength', 'wound roll', 'breakpoint', 'tier'],
  })

  refs.push(
    { sourceId: communityId('toughness-breakpoints'), targetId: 'core:2-wound-roll', rel: 'clarifies', context: 'Explains the practical toughness tiers that determine which wound roll bracket applies.' },
  )

  // ── 4. Save and Invuln Breakpoints ───────────────────────────────────────

  nodes.push({
    id: communityId('save-invuln-breakpoints'),
    layer: 'community',
    category: 'tactic',
    title: 'Armour Saves, Invulnerable Saves, and AP Breakpoints',
    content: `AP modifies armour saves but NEVER modifies invulnerable saves. The model uses whichever is better.

Example: 3+ save with 4++ invuln:
- AP 0: uses 3+ armour (better than 4++ invuln)
- AP-1: uses 4+ armour (equal to invuln)
- AP-2: uses 4++ invuln (armour would be 5+, invuln is better)
- AP-3 or worse: still 4++ invuln. ALL AP BEYOND -1 IS WASTED.

**The AP Cap:** For any model with an invuln, AP beyond (base save - invuln) is wasted. A 2+ save / 4++ model has an AP cap of 2. A 3+ save / 4++ model has an AP cap of 1.

This means: high-AP weapons (lascannon AP-3) are wasted on invuln-heavy targets. Use volume + moderate AP instead. Against targets WITHOUT invulns, stack AP to remove their save entirely.`,
    summary: 'AP modifies armour but not invulns. AP beyond the invuln is wasted. Calculate AP cap: base save minus invuln value.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['save', 'invulnerable', 'ap', 'armour penetration', 'breakpoint', 'wasted'],
  })

  // ── 5. Damage Efficiency ─────────────────────────────────────────────────

  nodes.push({
    id: communityId('damage-efficiency'),
    layer: 'community',
    category: 'tactic',
    title: 'Damage Efficiency — Overkill is Waste',
    content: `Damage per attack vs target wounds determines efficiency. Overkill damage is wasted.

- D6 weapon vs W1 model: wastes ~4.5 damage on average per kill
- D1 weapon vs W1 model: wastes 0 damage per kill — maximum efficiency
- D3 weapon vs W6 model: needs 2 failed saves to kill — efficient
- D1 weapon vs W6 model: needs 6 failed saves — inefficient, target may survive

**Match damage to wounds:**
- D1 weapons against W1 infantry (guard, eldar, gretchin)
- D2 weapons against W2-3 models (marines, heavy infantry)
- D3+ weapons against W4+ models (characters, elite infantry)
- Dd6/D6+1 weapons against W8+ models (vehicles, monsters)

Multi-damage weapons are wasted on single-wound models. Single-damage weapons are inefficient against multi-wound models.`,
    summary: 'Match weapon damage to target wounds. Overkill is wasted — D6 on W1 models wastes 4.5 damage per kill. D1 on W6 models needs too many saves.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['damage', 'wounds', 'overkill', 'efficiency'],
  })

  // ── 6. Mortal Wound Sources ──────────────────────────────────────────────

  nodes.push({
    id: communityId('mortal-wound-sources'),
    layer: 'community',
    category: 'tactic',
    title: 'Mortal Wounds — Bypassing the Combat Chain',
    content: `Mortal wounds skip the entire hit → wound → save chain. They go straight to damage. No armour save, no invulnerable save.

**Sources of mortal wounds:**
- **Devastating Wounds** — fish for 6s on wound rolls (especially with twin-linked rerolls)
- **Grenades stratagem** — models in a unit with the Grenades keyword, roll per model, 4+ = mortal wound. Volume matters — 10 models = ~5 mortals
- **Tank Shock stratagem** — vehicles/monsters charging, mortals before melee
- **Charge abilities** — unit-specific abilities that deal mortals on charge
- **Psychic abilities** — some psykers deal mortals
- **Hazardous** — self-inflicted mortals as a cost (be aware of this risk)

All mortal wound sources benefit from volume — more dice = more mortals. Grenades on a 20-model unit is devastating. Grenades on a 3-model unit is weak.`,
    summary: 'Mortal wounds bypass hit/wound/save entirely. Sources: devastating wounds, grenades (model count), tank shock, charge abilities, psychic. Volume multiplies them all.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['mortal wound', 'grenades', 'tank shock', 'devastating wounds', 'bypass', 'saves'],
  })

  refs.push(
    { sourceId: communityId('mortal-wound-sources'), targetId: 'core:mortal-wounds', rel: 'clarifies', context: 'Lists all practical sources of mortal wounds and their volume scaling.' },
    { sourceId: communityId('mortal-wound-sources'), targetId: 'core:devastating-wounds', rel: 'interacts_with', context: 'Devastating wounds are a key source of mortal wounds, especially when fishing with twin-linked.' },
    { sourceId: communityId('mortal-wound-sources'), targetId: communityId('fishing-for-crits'), rel: 'requires', context: 'Fishing for devastating wounds is the main way to generate mortal wounds at volume.' },
  )

  // ── 7. Reactive Capabilities ─────────────────────────────────────────────

  nodes.push({
    id: communityId('reactive-capabilities'),
    layer: 'community',
    category: 'tactic',
    title: 'Reactive Capabilities — Acting Outside Your Turn',
    content: `Units that can act in the opponent's turn are disproportionately valuable. They change the opponent's decision-making:

- **Overwatch** — can shoot when charged. Charging this unit is risky.
- **Fight on death** — fights when destroyed in melee. Killing it costs you.
- **Heroic Intervention** — can pile in during opponent's charge phase. Can't be ignored.
- **Reactive move stratagems** — move after being shot. Targeting is less effective.
- **Fall back and shoot/charge** — locking in combat doesn't work. Must be killed.
- **Advance and charge** — threat range is bigger than movement stat suggests.
- **Grenades** — keyword that enables the Grenades stratagem for mortal wounds.

These are threat modifiers, not just stats. They change WHAT THE OPPONENT DOES, not just what the unit outputs.`,
    summary: 'Units that act outside their turn (overwatch, fight on death, heroic intervention, fall back + shoot) change the opponent\'s decisions. Threat modifiers, not just stats.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['reactive', 'overwatch', 'fight on death', 'heroic intervention', 'fall back', 'advance and charge', 'grenades'],
  })

  refs.push(
    { sourceId: communityId('reactive-capabilities'), targetId: 'core:fire-overwatch', rel: 'interacts_with', context: 'Overwatch is a key reactive capability — shooting in the opponent\'s charge phase.' },
  )

  // ── 8. Unit Type Movement Rules ──────────────────────────────────────────

  nodes.push({
    id: communityId('unit-type-movement'),
    layer: 'community',
    category: 'tactic',
    title: 'Unit Type Keywords — Movement and Terrain',
    content: `Unit type keywords determine terrain interaction, stratagem eligibility, and ability targeting:

**Infantry and Beasts** can move through all terrain as if it isn't there — through walls, over ruins, up floors. This is fundamental to deployment, positioning, and charge paths.

**Vehicles and Monsters** must go around terrain features. They can't move through ruins. This limits their positioning options.

**Fly** keyword lets a model move over other models and terrain. Combined with Infantry, this is extremely mobile.

**Mounted/Cavalry** have high movement but can't go through ruins like Infantry.

These aren't just labels — they're rules triggers that determine:
- Where you can deploy
- What charge paths are available
- Whether terrain blocks line of sight
- Which stratagems can target the unit
- What abilities affect them`,
    summary: 'Infantry and Beasts move through terrain freely. Vehicles/Monsters go around. Fly moves over everything. Unit type determines positioning, charges, and stratagem eligibility.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['infantry', 'beast', 'vehicle', 'monster', 'fly', 'mounted', 'terrain', 'movement', 'keyword'],
  })

  return { nodes, refs }
}
