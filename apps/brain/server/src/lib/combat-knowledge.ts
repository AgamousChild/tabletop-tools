/**
 * Competitive 40K combat knowledge — community-layer insights.
 *
 * These are gameplay concepts that aren't in any rulebook but are
 * fundamental to how competitive players evaluate units and make
 * tactical decisions.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
    summary:
      'Reroll successful hits/wounds to fish for 6s that trigger sustained hits, lethal hits, or devastating wounds. Rerolls are offensive, not defensive.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: [
      'fishing',
      'reroll',
      'sustained hits',
      'lethal hits',
      'devastating wounds',
      'crit',
      'twin-linked',
    ],
  })

  refs.push(
    {
      sourceId: communityId('fishing-for-crits'),
      targetId: 'core:sustained-hits',
      rel: 'interacts_with',
      context: 'Fishing for 6s triggers sustained hits — extra hits per crit.',
    },
    {
      sourceId: communityId('fishing-for-crits'),
      targetId: 'core:lethal-hits',
      rel: 'interacts_with',
      context: 'Fishing for 6s triggers lethal hits — auto-wounds that skip the wound roll.',
    },
    {
      sourceId: communityId('fishing-for-crits'),
      targetId: 'core:devastating-wounds',
      rel: 'interacts_with',
      context:
        'Fishing for 6s on wound rolls triggers devastating wounds — mortal wounds that skip all saves.',
    },
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
    summary:
      'Total unit output = models × weapons × attacks. Volume multiplies weapon abilities — sustained hits, lethal hits, and rerolls all scale with dice count.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['volume', 'attacks', 'models', 'dice pool', 'sustained hits', 'lethal hits'],
  })

  refs.push({
    sourceId: communityId('attack-volume'),
    targetId: communityId('fishing-for-crits'),
    rel: 'requires',
    context: 'Volume is what makes fishing for crits profitable — more dice = more 6s.',
  })

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
    summary:
      'Units cluster into toughness tiers. Weapon strength must match the target tier — S >= 2×T wounds on 2+, S = T wounds on 4+.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['toughness', 'strength', 'wound roll', 'breakpoint', 'tier'],
  })

  refs.push({
    sourceId: communityId('toughness-breakpoints'),
    targetId: 'core:2-wound-roll',
    rel: 'clarifies',
    context:
      'Explains the practical toughness tiers that determine which wound roll bracket applies.',
  })

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
    summary:
      'AP modifies armour but not invulns. AP beyond the invuln is wasted. Calculate AP cap: base save minus invuln value.',
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
    summary:
      'Match weapon damage to target wounds. Overkill is wasted — D6 on W1 models wastes 4.5 damage per kill. D1 on W6 models needs too many saves.',
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
    summary:
      'Mortal wounds bypass hit/wound/save entirely. Sources: devastating wounds, grenades (model count), tank shock, charge abilities, psychic. Volume multiplies them all.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['mortal wound', 'grenades', 'tank shock', 'devastating wounds', 'bypass', 'saves'],
  })

  refs.push(
    {
      sourceId: communityId('mortal-wound-sources'),
      targetId: 'core:mortal-wounds',
      rel: 'clarifies',
      context: 'Lists all practical sources of mortal wounds and their volume scaling.',
    },
    {
      sourceId: communityId('mortal-wound-sources'),
      targetId: 'core:devastating-wounds',
      rel: 'interacts_with',
      context:
        'Devastating wounds are a key source of mortal wounds, especially when fishing with twin-linked.',
    },
    {
      sourceId: communityId('mortal-wound-sources'),
      targetId: communityId('fishing-for-crits'),
      rel: 'requires',
      context:
        'Fishing for devastating wounds is the main way to generate mortal wounds at volume.',
    },
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
    summary:
      "Units that act outside their turn (overwatch, fight on death, heroic intervention, fall back + shoot) change the opponent's decisions. Threat modifiers, not just stats.",
    sources: [source],
    refs: [],
    version: 1,
    keywords: [
      'reactive',
      'overwatch',
      'fight on death',
      'heroic intervention',
      'fall back',
      'advance and charge',
      'grenades',
    ],
  })

  refs.push({
    sourceId: communityId('reactive-capabilities'),
    targetId: 'core:fire-overwatch',
    rel: 'interacts_with',
    context: "Overwatch is a key reactive capability — shooting in the opponent's charge phase.",
  })

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
    summary:
      'Infantry and Beasts move through terrain freely. Vehicles/Monsters go around. Fly moves over everything. Unit type determines positioning, charges, and stratagem eligibility.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: [
      'infantry',
      'beast',
      'vehicle',
      'monster',
      'fly',
      'mounted',
      'terrain',
      'movement',
      'keyword',
    ],
  })

  // ── 9. Commonly Missed Rules ─────────────────────────────────────────────

  nodes.push({
    id: communityId('commonly-missed-rules'),
    layer: 'community',
    category: 'ruling',
    title: 'Commonly Missed Rules and Interactions',
    content: `Rules that players frequently get wrong or don't know:

**Tactical Missions CP:** If playing tactical missions, you can discard one or more cards at the end of your turn. You draw back to two for free in your next command phase AND gain one command point immediately. You cannot gain more than one bonus CP per battle round.

**Towering and Ruins:** The Towering keyword allows the model to see (and be seen) through any gap in a ruin. Ruins do not automatically block its line of sight — they must physically block it with solid walls.

**Reanimation Coherency:** When adding models back to a squad (e.g., Necron reanimation), new models must be placed in coherency with models that STARTED the phase on the battlefield. You cannot daisy-chain new models off of other new models.

**Move Through Friendly Models:** Models can move through friendly models at any time — move phase, charges, pile-in, consolidation. Exception: Monsters and Vehicles cannot move through other friendly Monsters or Vehicles (unless they have Fly).

**Attached Characters = Separate Unit for VP:** If a rule awards VP when an enemy unit is destroyed, a Leader and its Bodyguard unit count as SEPARATE units. Destroying both in one round scores 2 VP, not 1.

**Firing Deck vs Overwatch:** Firing Deck only works in YOUR shooting phase. You cannot use embarked models' weapons when firing Overwatch — only the transport's own weapons.

**Reserve Limits:** You cannot place more than 50% of your points AND 50% of your units in reserve (whichever is smaller).

**Battleshock After Leader Dies:** If a character's bodyguard unit is wiped out, the character becomes a new unit with starting strength 1. It takes battleshock tests if below half wounds.

**Assault Weapons and Actions:** Units with Assault weapons CAN perform Actions even if they Advanced, because Assault makes them eligible to shoot after Advancing. Same for Pistols in engagement range.

**Stratagem Vecting:** Abilities that increase stratagem cost override abilities that make stratagems free. If a 2CP stratagem is vected (+1CP), using a "free stratagem" ability still costs 1CP.

**One Stratagem Per Unit Per Phase:** In 11th edition, each unit can only be affected by one stratagem per phase.`,
    summary:
      'Frequently missed rules: tactical mission CP, towering LOS, reanimation coherency, move through friendlies, attached characters VP, firing deck vs overwatch, reserve limits.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: [
      'rules',
      'faq',
      'errata',
      'commonly missed',
      'towering',
      'reanimation',
      'coherency',
      'firing deck',
      'overwatch',
      'reserve',
      'battleshock',
      'stratagem',
      'vecting',
    ],
  })

  // ── 10. Competitive Combos ──────────────────────────────────────────────

  nodes.push({
    id: communityId('competitive-combos'),
    layer: 'community',
    category: 'tactic',
    title: 'Competitive Combo Patterns',
    content: `Key combo patterns that competitive players use:

**Re-roll + Weapon Ability Fishing:**
The strongest combos pair a source of re-rolls with a weapon ability trigger:
- Wound re-rolls + Devastating Wounds = fish for mortal wounds (e.g., Vulkan He'stan's Forgefather + Immolation Protocols on Torrent weapons)
- Hit re-rolls + Sustained Hits = fish for extra hits (e.g., Bladeguard ability + sustained hits weapons)
- Hit re-rolls + Lethal Hits = fish for auto-wounds (e.g., hit re-roll source + lethal hits weapon)

**Leader + Unit + Stratagem Stacking:**
The best combos use all three slots:
1. A Leader that buffs a specific weapon type (re-rolls, +1 to hit, etc.)
2. A unit with the right weapons (Torrent, Melta, melee, etc.)
3. A stratagem or enhancement that grants a weapon ability

Example: Vulkan He'stan (wound re-rolls on Torrent/Melta) + Infernus Squad (Torrent weapons) + Immolation Protocols (grants Devastating Wounds to Torrent). Result: auto-hitting Torrent weapons with devastating wounds and wound re-rolls = massive mortal wound output.

**Debuff Stacking:**
Some units apply debuffs to enemies (+1 to be hit, -1 save, etc.). Stack multiple debuffs on one target, then concentrate fire. Storm Speeders in Space Marines do this.

**Aura + Attached Leader:**
Leader abilities affect only the attached unit. Aura abilities affect all nearby units. These are different mechanics. A leader grants its ability to ONE unit. An aura grants its ability to MULTIPLE units within range.`,
    summary:
      'Competitive combo patterns: re-roll + weapon ability fishing, leader + unit + stratagem stacking, debuff stacking, aura vs leader distinction.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: [
      'combo',
      'competitive',
      'fishing',
      'stacking',
      'reroll',
      'sustained hits',
      'lethal hits',
      'devastating wounds',
      'leader',
      'aura',
      'debuff',
    ],
  })

  refs.push(
    {
      sourceId: communityId('competitive-combos'),
      targetId: communityId('fishing-for-crits'),
      rel: 'interacts_with',
      context: 'Competitive combos build on the fishing for crits concept.',
    },
    {
      sourceId: communityId('competitive-combos'),
      targetId: communityId('attack-volume'),
      rel: 'requires',
      context: 'Combos require attack volume to be effective — more dice = more crit triggers.',
    },
  )

  // ── Deployment Tactics ───────────────────────────────────────────────────

  nodes.push({
    id: communityId('deploy-hidden'),
    layer: 'community',
    category: 'tactic',
    title: 'Deploy Hidden — The #1 Deployment Rule',
    content: `If the enemy has any shooting at all, deploy everything behind LOS-blocking terrain. Being visible at deployment means taking damage before you act. Hide everything, push out on your own turn when you control the timing.\n\nThe only units that deploy in the open are cheap expendable screens you're OK losing (Jakhals, chaff infantry). Everything else — transports, gunline, hammers, anchors, characters — hides behind terrain.\n\n**Exception:** If the enemy has zero shooting (pure melee army like some World Eaters builds), deploy for board position instead — spread wide, take space, control objectives.`,
    summary:
      'Default deployment: hide everything behind terrain. Only cheap sacrificial screens go in the open. Push out on your own turn.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['deployment', 'hidden', 'los', 'terrain', 'cover', 'turn 1', 'survival'],
  })

  nodes.push({
    id: communityId('deploy-transports'),
    layer: 'community',
    category: 'tactic',
    title: 'Transport Deployment — Hide Your Cargo',
    content: `Transports (Rhinos, Impulsors, Wave Serpents, etc.) are high-priority targets because they carry your valuable cargo. If the enemy can see a transport at deployment, they shoot it turn 1 before it moves — killing both the transport and stranding the cargo.\n\n**Always deploy transports behind LOS-blocking terrain.** Forward position is irrelevant if the transport is dead. On your turn 1, the transport pushes forward safely because you choose when and where to expose it.\n\n**Common mistake:** Deploying transports at the front of the deployment zone for a faster delivery. This gets them killed before they move.`,
    summary:
      'Always hide transports behind terrain. A dead transport delivers nothing. Push forward on your own turn.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['deployment', 'transport', 'rhino', 'hidden', 'cargo', 'turn 1'],
  })

  nodes.push({
    id: communityId('deploy-gunline'),
    layer: 'community',
    category: 'tactic',
    title: 'Gunline Deployment — Survive First, Shoot Later',
    content: `Shooting units don't need to deploy with a firing lane. They deploy hidden behind terrain and move to a firing position on your turn 1 or 2.\n\n**Without Indirect Fire:** Deploy hidden, then move to a position where you can see targets through a terrain gap. Ideal position: behind terrain with a narrow firing lane through a corridor — you can see the enemy but they have limited angles on you.\n\n**With Indirect Fire:** Deploy completely hidden. Firing lanes are irrelevant since you shoot without LOS. Pure cover score.\n\n**Convoy tactic:** Deploy a gunline unit behind advancing transports. The transports push forward as mobile LOS blockers, and the gunline follows behind them. The enemy must deal with the transports before they can shoot the gunline.`,
    summary:
      'Deploy gunline hidden. Move to a firing lane on your turn. With Indirect, hide completely. Without Indirect, move to a terrain gap.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: [
      'deployment',
      'gunline',
      'shooting',
      'indirect',
      'firing lane',
      'terrain gap',
      'convoy',
    ],
  })

  nodes.push({
    id: communityId('deploy-screens-vs-melee'),
    layer: 'community',
    category: 'tactic',
    title: 'Forward Screens Against Melee Armies',
    content: `Against melee-heavy armies with Advance and Charge (World Eaters, some Chaos), forward screens only work with cheap expendable units you don't care about losing.\n\n**Do:** Put cheap chaff (Jakhals, Cultists, Kroot) forward to absorb the first charge wave. They die, but they delay the enemy one turn and let your valuable units act.\n\n**Don't:** Put expensive melee units (Sacresants, Terminators) forward in the open. Against Advance+Charge armies with 24" threat range, they die turn 1 without fighting. Deploy them hidden in terrain and counter-charge on YOUR turn.\n\n**Key math:** Standard charge threat = Move + 12" (max). Advance+Charge threat = Move + 6" + 12" = Move + 18" (max). A 6" move unit with Advance+Charge threatens 24" — that reaches almost anywhere from the deployment zone edge.`,
    summary:
      'Against advance+charge armies, only cheap expendable units screen forward. Valuable melee units hide in terrain and counter-charge.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: [
      'deployment',
      'screen',
      'melee',
      'advance and charge',
      'world eaters',
      'counter-charge',
      'chaff',
    ],
  })

  nodes.push({
    id: communityId('deploy-slow-units'),
    layer: 'community',
    category: 'tactic',
    title: 'Slow Units Must Deploy Forward',
    content: `Units with 6" or less movement and primarily melee or short-range weapons (18" or less) must deploy at the front edge of the deployment zone. A slow unit in the backfield takes 3+ turns to reach combat — by then the game is decided.\n\n**Examples:** Helbrute (6" move, melee + multi-melta 18"), Terminators without Deep Strike, heavy melee infantry.\n\n**Exception:** Slow units with long-range weapons (36"+) can deploy in the backfield — their guns reach the fight even if their legs don't.`,
    summary:
      "Slow melee/short-range units deploy at the zone edge. They can't waste turns walking to the fight.",
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['deployment', 'slow', 'movement', 'melee', 'forward', 'zone edge'],
  })

  nodes.push({
    id: communityId('deploy-characters'),
    layer: 'community',
    category: 'tactic',
    title: 'Character Deployment — Proximity Protection',
    content: `Characters with conditional protection abilities (Lone Operative, -1 to wound auras, Look Out Sir) must deploy within range of the units that trigger those abilities.\n\n**Example:** A Daemon Prince of Khorne has "Lord of Murder" — gains Lone Operative when within 3" of friendly World Eaters Infantry. Deploy him within 3" of an Infantry unit, not isolated in a corner.\n\n**Attached characters** (10th ed Leader ability) deploy as part of their unit — one drop, one formation. They don't need separate positioning.\n\n**Solo characters** without protection abilities should deploy hidden behind terrain like everything else.\n\n**Common mistake:** Deploying characters alone, exposed, away from protective units. An isolated character is a priority target.`,
    summary:
      'Characters with proximity-based protection deploy next to their escort unit. Attached characters deploy as part of their unit.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: [
      'deployment',
      'character',
      'lone operative',
      'look out sir',
      'leader',
      'attachment',
      'protection',
    ],
  })

  nodes.push({
    id: communityId('deploy-objectives'),
    layer: 'community',
    category: 'tactic',
    title: 'Objective-Based Deployment Roles',
    content: `Each objective on the table requires a different deployment approach:\n\n**Home objective:** Cheap unit deployed directly on it. Jakhals, Cultists, basic Infantry. Their only job is to stand there and score.\n\n**Safe objective** (no man's land, closer to you): Chaff/screen holds it, backed by shooting from your deployment zone or mid-range shooters. It's safe because you CONTROL the space with firepower, not because of what's standing on it.\n\n**Center objective(s):** The fight zone. Deploy your combat units toward these with screens in front.\n\n**Expansion objective** (no man's land, further out): Commit strong durable units. You're fighting to take and hold this under pressure. Fast forward-deploying units (Chaos Spawn, Bikes) can grab it early.\n\n**Enemy home:** Ignore at deployment. Deep strike or late-game push.`,
    summary:
      'Home: cheap holder. Safe: chaff + gunline cover. Center: fighting units. Expansion: strong push. Enemy home: late game.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['deployment', 'objective', 'home', 'safe', 'expansion', 'center', 'scoring'],
  })

  nodes.push({
    id: communityId('deploy-army-identity'),
    layer: 'community',
    category: 'tactic',
    title: 'Deployment Posture — Match Your Army Identity',
    content: `Your army's identity determines the entire deployment strategy:\n\n**Aggressive melee army** (World Eaters, Daemons): Don't screen. Every unit is a killer, objective holder, or forward objective grabber. Push fast, take space, force the enemy to react.\n\n**Defensive shooting army** (Tau, Astra Militarum): Castle behind terrain, layer screens, create overlapping fire lanes. Make the enemy come to you through a kill zone.\n\n**Mixed army** (Space Marines, Sisters): Hide valuable units, screen with chaff, deploy transport hammers hidden for turn 1 delivery.\n\n**Three deployment plans:** For any army against an unknown opponent, prepare three mental deployments — anti-shooting (hide everything), anti-mixed (hide valuable, screen forward), anti-melee (spread wide, take space). Choose based on the enemy list.`,
    summary:
      'Aggressive armies push, defensive armies castle, mixed armies hide and screen. Prepare three deployment plans for different matchups.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: [
      'deployment',
      'army identity',
      'aggressive',
      'defensive',
      'mixed',
      'posture',
      'matchup',
    ],
  })

  nodes.push({
    id: communityId('deploy-multi-turn'),
    layer: 'community',
    category: 'tactic',
    title: 'Deploy for the Plan, Not the Position',
    content: `The best deployment position isn't where a unit is most effective at the start of the game — it's where the unit needs to START so that its turn 1-2 movement puts it in the ideal position.\n\n**Example:** An Exorcist (36" range, no Indirect) deploys completely hidden with zero firing lanes. Why? Because its turn 1 plan is to move behind advancing Rhinos into the midboard, where it has firing lanes AND mobile cover. The deployment position serves the plan.\n\n**Think backwards:** Where does this unit need to be at the end of turn 2? What's its turn 1 move? That tells you where to deploy.\n\n**Unit convoys:** Some units deploy together because they move together. Transport + gunline behind it. Screen in front of an anchor. The deployment positions only make sense as a group.`,
    summary:
      'Deploy for where the unit needs to BE after moving, not where it starts. Think backwards from the turn 2 position.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['deployment', 'movement', 'multi-turn', 'plan', 'convoy', 'position'],
  })

  nodes.push({
    id: communityId('deploy-deep-strike-denial'),
    layer: 'community',
    category: 'tactic',
    title: 'Backfield Deep Strike Denial',
    content: `Cheap infantry units in the backfield aren't just holding objectives — they're creating 9" denial bubbles that prevent enemy deep strikers from landing behind your lines.\n\n**The threat:** If you leave your backfield empty, the enemy drops Seraphim, Terminators, or other deep strike units behind your army turn 2. They grab uncontested objectives or shoot your gunline in the back.\n\n**The fix:** Spread 10 cheap bodies across your backfield corners. Each model creates a 9" no-deep-strike bubble. 10 models spread out cover a huge area. Cost: ~65-105pts for complete backfield denial.\n\n**Key insight:** The unit doesn't need to fight or shoot effectively. It just needs to exist in the right places. Boltgun damage is a bonus, not the reason they're there.`,
    summary:
      'Spread cheap infantry in the backfield to create 9" deep strike denial zones. They exist to deny space, not to fight.',
    sources: [source],
    refs: [],
    version: 1,
    keywords: ['deployment', 'deep strike', 'denial', 'screen', 'backfield', '9 inch', 'reserves'],
  })

  // ── Load community.json (ingested nodes from content-ingestor) ───────────
  const communityJsonPath = join(process.cwd(), '.local/brain/nodes/community.json')
  if (existsSync(communityJsonPath)) {
    try {
      const ingested = JSON.parse(readFileSync(communityJsonPath, 'utf-8')) as Node[]
      const existingIds = new Set(nodes.map((n) => n.id))
      let added = 0
      for (const node of ingested) {
        if (!existingIds.has(node.id)) {
          nodes.push(node)
          existingIds.add(node.id)
          added++
        }
      }
      if (added > 0) console.log(`   + ${added} ingested community nodes from community.json`)
    } catch (err) {
      console.error(`   ⚠ Failed to load community.json: ${err}`)
    }
  }

  return { nodes, refs }
}
