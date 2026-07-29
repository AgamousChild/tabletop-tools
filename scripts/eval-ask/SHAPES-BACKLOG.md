# Question shapes backlog

Shapes to add to `apps/brain/server/src/lib/question-shapes/shapes/` as
they're prioritized. All should be **cube-answerable** — canonical form
maps to a deterministic filter on cube facts, no LLM for the numbers.

Update this file every time a new pattern emerges from the eval. Merge
into the registry when a shape moves from "backlog" to "shipping".

---

## transport-capacity

**Canonical:** "How much space does [Unit] take up in [Transport]? How much
space is left? What [Faction] units fit in that space?"

**Micah's phrasing:** *"how many slots does Grimaldus take up in a land
raider redeemer. This is a cube question, FOR ALL FACTIONS."*

**Slots to parse:** `{unit, transport, faction?}` — faction inferred from
subreddit or from the unit's faction.

**Cube query:**
- `unit.transportCapacity` — footprint (models × slot cost) per unit
- `transport.capacity` — total slots
- `remainingSlots = transport.capacity - unit.transportCapacity`
- For each other unit in the faction whose footprint ≤ remainingSlots →
  include in the "what else fits" list.

**Data gap check:** Do datasheet nodes carry a `transportCapacity` /
`transportModels` scalar? Needs to be verified before the shape ships. If
not, extract from datasheet content (rules text: "This TRANSPORT can carry
X models"). Both transports AND infantry have capacity notes.

**Priority:** Medium — common newbie question, deterministic answer, no
web-search needed. Ship after list-review + onboarding.

---

## faction-vs-faction-strategy

**Canonical:** "What can my [Faction] (with [list / units / detachment])
do against [Enemy Faction], using [strategy hint]?"

**Micah's phrasing:** *"What can my [Faction] Do [list, units, detachment]
[strategy] against [faction]."*

**Slots to parse:** `{myFaction, myDetachment?, myUnits[], enemyFaction,
strategyHint?}`.

**Cube query:**
- My faction's units that are strong into enemy-faction unit types (needs
  a per-unit "counters" heuristic — anti-vehicle for enemies with
  vehicles, anti-elite for elite armies, horde-clear for GSC/Nids, etc.)
- Detachment abilities that trigger against enemy keywords
  (e.g., Kauyon vs vehicles, Hallowed Martyrs vs high-model-count)
- Stratagems / enhancements relevant to the matchup

**Data gap check:** No matchup / WR data in the cube today. Can approximate
via unit-role tagging (anti-vehicle, anti-infantry, screen, buff-piece)
+ enemy-faction typical composition, but that's heuristic not empirical.
Real matchup data needs BCP or Hutber ingest.

**Priority:** High for user value, but blocked on meta-data ingest. Ship
after BCP-Jun-Jul lands OR after Hutber/TacticalTortoise meta pipeline
exists.

---

## unit-comparison

**Canonical:** "In my [Faction], which is better: [Unit A] or [Unit B]?"

**Micah's phrasing:** *"In my [faction] Which one, [unit] or [unit]
(comparison)."*

**Slots to parse:** `{faction, unitA, unitB, comparisonAxis?}` — axis
optional (points, damage, durability, meta usage).

**Cube query:**
- Both units' stats (points, wounds, save, weapons)
- Both units' meta inclusion rates (from meta-data helper)
- Side-by-side table: role, points, durability, damage output, meta usage
- If they compete for the same slot (both anti-tank, both battleline),
  say so. If they play different roles, say that.

**Data gap check:** Unit stats and points are in the cube. Meta inclusion
rates need meta-data helper (blocked on BCP or alt-source ingest).

**Priority:** High — very common question shape (unit-loadout + unit
selection questions merge here). Ship the stat-comparison first without
meta, add meta when data lands.

---

## Meta-data helper — shared dependency

Several shapes above blocked on:
- `getInclusionRate(unit, faction, edition)` — 0-1 float, % of tournament
  lists including this unit
- `getTopUnitsForDetachment(faction, detachment)` — sorted by inclusion
- `getFactionWinRate(faction, edition)`
- `getUnitRole(unit)` — anti-vehicle / anti-infantry / anti-elite / screen
  / character / vehicle / etc. (heuristic tagging from datasheet keywords
  + weapon profiles)

First three need meta-data ingest (BCP or Hutber or Tactical Tortoise).
Fourth is a build-graph derivation from datasheet content — can ship
independently.
