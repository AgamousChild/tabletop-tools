# Card → Parser Field Audit (2026-06-29)

This audit cross-references each brain card component's data shape (see
`apps/brain/client/src/components/cards/types.ts`) against the parsers that
emit the underlying Node (`apps/brain/server/src/lib/parsers/*.ts`) and the
client-side router that converts a Node into card data
(`apps/brain/client/src/lib/card-display.ts::buildCardForCategory`).

For each card field we record:

- **a. Display source** — which component reads it, and how.
- **b. Owning parser** — which parser is supposed to populate the source Node.
- **c. Status** — `STRUCTURED` (Node carries the field directly), `REGEX`
  (`card-display.ts` regex-extracts it from `node.content`), `EMPTY` (never
  populated), or `OK` (already structured and wired correctly).

The intent of this report is to enumerate the gaps that a follow-up display PR
needs to close, and to drive the data-layer companion PR that promotes the
regex-extractions onto structured Node fields.

> Scope: cards that materially read user-visible fields. Generic flag fields
> (`qualityFlags`, `sources`, `errata`) are listed once at the top rather than
> per-card to keep the doc focused on per-type gaps.

## Shared fields (every card)

| Field | Card display | Status |
|---|---|---|
| `sources[]` | SourceRef list rendered via "View source" affordance | OK |
| `errata` | Rendered via `ErrataSection` | EMPTY — `errata-linker.ts` produces them at retrieval time, never on the Node itself. Display PR scope: wire `errata-linker` results into `card-display.ts`. |
| `qualityFlags` | Amber pills | OK — set by the massage layer. |

---

## UnitCard — `UnitCardData`

Component: `apps/brain/client/src/components/cards/UnitCard.tsx`
Builder: `buildCardForCategory` → `case 'datasheet'` (stub; expects
`BrainScreen.fetchFullUnitData` to enhance later via `/browse/unit/:id`).
Parser: `apps/brain/server/src/lib/parsers/game-data.ts` (Wahapedia + BSData)

| Field | a. Display | b. Parser | c. Status |
|---|---|---|---|
| `name` | header | game-data datasheet | OK (`Node.title`) |
| `factionId` | banner | game-data | OK |
| `subfaction` | banner | game-data (Wahapedia keywords + BSData chapter rollup) | OK |
| `role` | role pill | game-data | OK (in content; `/browse/unit/:id` lifts it) |
| `derivedType` | derived-type pill | shared `derive-unit-type.ts` | OK (lifted server-side) |
| `points` | points pill | game-data (`Node.points`) | OK |
| `stats.*` | stat bar | game-data (`Node.stats`) | OK |
| `rangedWeapons[]`, `meleeWeapons[]` | weapon tables | game-data weapon nodes (`Node.weaponStats`) | OK (joined via `/browse/unit/:id`) |
| `abilities[]` | ability boxes | game-data unit-ability nodes | OK |
| `coreAbilities[]` | USR badges | derived from keywords | OK |
| `keywords[]` | keyword chips | game-data | OK |
| `factionKeywords[]` | faction-keyword chips | game-data | OK |
| `composition` | composition line | game-data (`unitCompositions`) | OK |
| `loadout` | loadout line | game-data (`datasheet.loadout`) | OK |
| **`wargearOptions`** | "Wargear Options:" block (UnitCard.tsx:604-611) | game-data: Wahapedia `wargearOptions` table is read into the datasheet `content` markdown (`**Wargear Options:**` block, game-data.ts:445-457) but is NOT promoted to a structured `Node.wargearOptions` field | **REGEX/EMPTY** — currently `UnitCardData.wargearOptions: string` is set by a higher layer that re-parses the content block. Closes by adding `Node.wargearOptions: Array<{ name: string; description?: string }>`. |
| `leaders[]` | "Eligible Leaders:" list | game-data leader-attachment refs | OK (via refs) |
| `transport` | transport line | game-data | OK |
| **`damaged`** | "Damaged: X-Y wounds" block | game-data: Wahapedia `damagedW` + `damagedDescription` go into `content` as `**Damaged (Nw):**`, but no structured `Node.damaged` field exists | **EMPTY** — closes by adding `Node.damaged?: { threshold: string; effect: string }`. |
| `errata` | errata section | errata-linker (retrieval-time) | See shared section. |

**Summary**: 2 structural gaps to close on the data layer
(`wargearOptions`, `damaged`); rest is already structured.

---

## StratagemCard — `StratagemCardData`

Component: `apps/brain/client/src/components/cards/StratagemCard.tsx`
Builder: `card-display.ts` `case 'stratagem'` — currently regex-extracts
WHEN/TARGET/EFFECT from `node.content`.

| Field | a. Display | b. Parser | c. Status |
|---|---|---|---|
| `name` | header | faction-pack / game-data | OK (`Node.title`) |
| `type` | type line | faction-pack derives from `*— TYPE STRATAGEM*` label; game-data has `strat.type` column | EMPTY — neither lifts it onto the Node. Currently hardcoded `'Stratagem'` in `card-display.ts`. (Out of scope per task — display layer will route around.) |
| **`cpCost`** | CP diamond | faction-pack (extractable from label/body); game-data has `strat.cpCost` column | **REGEX** — card-display.ts uses `extractField(content, 'CP')`. Node has `cpCost: number` already (model.ts:157) but neither parser populates it on stratagem nodes. game-data writes "**CP:** ${strat.cpCost}" into content instead. Closes by populating `Node.cpCost`. |
| **`turn`** | turn badge (if shown) | game-data has `strat.turn` column | **EMPTY** — never extracted. Closes by adding `Node.turn?: string`. |
| `phase` | phase line | faction-pack `detectPhaseFromWhen`, game-data `mapPhase` | OK (`Node.phase`) |
| **`when`** | WHEN section | faction-pack: explicit `**WHEN:**` regex at line ~180; game-data: not in dedicated column | **REGEX** — card-display.ts does the extraction. Both parsers can promote this trivially: faction-pack already matches it, game-data has structured columns. Closes by adding `Node.when?: string`. |
| **`target`** | TARGET section | faction-pack `**TARGET:**`; game-data: not a dedicated column but appears in description | **REGEX** — same fix. Closes by adding `Node.target?: string`. |
| **`effect`** | EFFECT section | faction-pack `**EFFECT:**`; game-data: description body | **REGEX** — same fix. Closes by adding `Node.effect?: string`. |
| `detachmentName` | footer | derived from `detachmentId` | OK |
| `factionId`, `subfaction` | footer | game-data / faction-pack | OK |

**Summary**: 4 structural gaps (`cpCost`, `when`, `target`, `effect`, `turn`).
`cpCost` already exists on the model — just needs to be populated. `when`,
`target`, `effect`, `turn` are net-new fields.

---

## EnhancementCard — `EnhancementCardData`

Component: `apps/brain/client/src/components/cards/EnhancementCard.tsx`
Builder: `card-display.ts` `case 'enhancement'`

| Field | a. Display | b. Parser | c. Status |
|---|---|---|---|
| `name` | header | OK |
| **`cost`** | points pill | faction-pack: regex `(NN pts)`; game-data: `enh.cost` column → written into content as `**Cost:** ${enh.cost}` | **REGEX** — `card-display.ts::extractInlineField(content, 'Cost')`. Closes by adding `Node.cost?: number` (points). |
| `description` | body markdown | OK (content sans `Cost:` line) |
| `restriction` | restriction pill | regex `model only` in card-display.ts | REGEX — but `Node.modelRestriction` already exists on the model. The faction-pack parser populates it via its own helpers; game-data does not. Out of scope here (deferred). |
| `detachmentName`, `factionId`, `subfaction` | footer | OK |

**Summary**: 1 gap (`cost`).

---

## DetachmentCard — `DetachmentCardData`

Component: `apps/brain/client/src/components/cards/DetachmentCard.tsx`
Builder: `card-display.ts` `case 'detachment-rule'`

| Field | a. Display | b. Parser | c. Status |
|---|---|---|---|
| `name` | header | OK |
| `factionId`, `factionName` | banner | OK |
| `abilityText` | markdown body | OK (`Node.content`) |
| `stratagems[]` | collapsible | requires separate fetch via `/browse/detachment/:id` | OK (architectural — separate concern) |
| `enhancements[]` | collapsible | same | OK |
| `chapterBadge` | amber pill | faction-pack `detectChapterFromText` populates `subfaction`; game-data uses chapter-lock map | **EMPTY** — `Node.subfaction` carries the chapter slug, but the card data shape calls for a separate `chapterBadge` display string. Out of scope here — display layer can derive from `subfaction` via the existing detection. |
| `errata` | errata section | errata-linker | shared section |

**Summary**: 0 structural data-layer gaps for this PR. (The chapterBadge gap
is purely display-layer plumbing — `Node.subfaction` already carries the
data.)

---

## MissionCard — `MissionCardData`

Component: `apps/brain/client/src/components/cards/MissionCard.tsx`
Builders: `card-display.ts` `case 'primary-mission' | 'secondary-mission'`
Parsers: `mission-cards.ts` (11e OCR), `chapter-approved.ts` (10e PDF),
`tournament-companion.ts` (errata).

| Field | a. Display | b. Parser | c. Status |
|---|---|---|---|
| `name` | header | OK |
| `missionType` | badge | derived from category | OK |
| **`side`** | side badge | chapter-approved encodes in id (`:atk:`/`:def:`); mission-cards uses `usableBy` instead | **REGEX** — `card-display.ts` does `node.id.includes(':atk:')`. Closes by adding `Node.missionSide?: 'attacker' \| 'defender'`. |
| **`isFixed`** | fixed badge | chapter-approved adds `'fixed'` to keywords | **REGEX** — `card-display.ts` checks `node.keywords.includes('fixed')`. Closes by adding `Node.isFixed?: boolean` populated by parsers. |
| `content` | body markdown | OK (`Node.content`) |
| `action`, `condition`, `when`, `scoring` | structured display | chapter-approved parses these into the markdown content but not onto Node | Out of scope — content-rendering UI parses markdown back into sections. |
| `sources`, `errata` | shared | shared section |

**Summary**: 2 gaps (`isFixed`, `missionSide`).

---

## Cards with NO structural gaps in this PR

These were spot-checked: every visible field is either already on the Node or
sourced from refs/sources that don't need a model schema change.

- `RuleCard` (army-rule / army-ability / faction-ability sub-rule parsing
  happens in card-display.ts but is OK for this PR; the regex parsing of
  `**NAME:** description` lines on army rules is acceptable since those
  sub-rules don't have a structured upstream).
- `CoreRuleCard`
- `TwistCard`
- `ChallengerCard`
- `DeploymentZoneCard`, `ForceDispositionCard`, `TerrainLayoutCard` (PDF
  source attribution is structured)
- `ErrataCard`
- `BalanceCard`
- `CommunityCard`

---

## Field additions summary (driven by this audit)

The companion PR adds these optional fields to `NodeSchema`:

| Field | Type | Populated by |
|---|---|---|
| `when` | `string` | `faction-pack` (already-matched), `game-data` (column) |
| `target` | `string` | `faction-pack`, `game-data` (description sniff) |
| `effect` | `string` | `faction-pack`, `game-data` (description body) |
| `turn` | `string` | `game-data` (column) |
| `cost` | `number` | `faction-pack` `(NN pts)`, `game-data` `enh.cost` |
| `wargearOptions` | `Array<{ name; description? }>` | `game-data` `wargearOptions` table |
| `damaged` | `{ threshold; effect }` | `game-data` `damagedW` + `damagedDescription` |
| `isFixed` | `boolean` | `chapter-approved` (was keyword-only) |
| `missionSide` | `'attacker' \| 'defender'` | `chapter-approved` (was encoded in id) |

The existing `cpCost` field gets populated where it wasn't before
(stratagems from both parsers).

## Out of scope notes (for the display PR)

- The audit also identified items the display layer needs to revisit (chapter
  badge derivation, errata linking, stratagem-type lift, restriction
  promotion to game-data). These are listed only as breadcrumbs — they belong
  to the follow-up agent, not this PR.
