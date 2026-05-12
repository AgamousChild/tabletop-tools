# Brain Card Components — Interface Reference

All cards live in `apps/brain/client/src/components/cards/`. Types in `types.ts`.

Every card receives `{ data, context }` props. `context` provides: `highlightTerms`, `onContentClick`, `onDismiss`, `onViewSource?`, `onNodeNavigate?`.

## Shared Design Language

- **Outer wrapper**: `border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950`
- **Font**: `fontFamily: "'Source Sans 3', sans-serif"` on outer div
- **Headers**: Oswald font, `text-sm font-bold uppercase tracking-wider text-white`
- **Body text**: `text-[11px] text-slate-300 leading-snug`
- **Footer text**: `text-[8px] text-slate-500 uppercase tracking-widest`
- **Quality flag badges**: `text-[8px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded`
- **View Source button**: `text-[9px] text-slate-500 hover:text-amber-400 underline`
- **Highlight marks**: `bg-amber-400 text-slate-900 cursor-pointer rounded-sm px-0.5`

---

## 1. UnitCard (`UnitCard.tsx`)

**Accent**: Blue gradient (`linear-gradient(135deg, #1e3a5f, #1e40af, #1d4ed8)`)
**File**: `UnitCard.tsx` (~370 lines)
**Data**: `UnitCardData`

### Layout

```
+-----------------------------------------------+
| UNIT NAME                     POINTS  |  Blue gradient header
| FACTION NAME (clickable)     UnitType  |  Oswald font
+-----------------------------------------------+
| M | T⚡| SV | W | LD | OC | INV | FNP |  Stat bar (T⚡ = Tank Shock
|   |    |    |   |    |    |     |     |    tooltip on Vehicle units)
+-----------------------------------------------+
| RANGED WEAPONS (amber header)         |  ABILITIES (green header)
| Weapon | R | A | BS | S | AP | D      |  [Core Ability Badges]
| name    24  2  3+  4  -1  1  [SUS]   |
|                                        |  Custom Ability (bright green)
| MELEE WEAPONS (red header)            |  — always expanded, name+desc
| Weapon | R | A | WS | S | AP | D      |
|                                        |  USR Ability (muted green)
|                                        |  — collapsed, click to expand
+-----------------------------------------------+
| Keywords: Infantry⚡ Grenades⚡ ...   |  FACTION KW (blue badges)
|           ⚡ = hover for stratagem     |
+-----------------------------------------------+
| Errata (collapsible)                   |
+-----------------------------------------------+
| Composition: 5 Intercessors            |  Footer
| Loadout: Every model equipped with...  |
| Wargear Options: ...                   |
| Eligible Leaders: Captain, Chaplain    |  (clickable blue links)
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header, large white text | Oswald font |
| `factionId` / `subfaction` | Header subtitle | Clickable, shows `factionDisplayName()` ALL CAPS |
| `points` | Header right | Amber text |
| `derivedType` | Header right below points | Small blue text |
| `stats` | Stat bar | M/T/SV/W/LD/OC always shown; INV and FNP conditional. T shows Tank Shock tooltip on Vehicle-keyworded units. |
| `rangedWeapons` | Left column table | Amber header "RANGED WEAPONS" |
| `meleeWeapons` | Left column table | Red header "MELEE WEAPONS" |
| `coreAbilities` | Right column badges | Clickable, highlight on match (e.g., "Deadly Demise D3") |
| `abilities` (custom) | Right column, bright green boxes | Always expanded. Name (clickable bright green) + description. Brighter border/text than USR. |
| `abilities` (USR) | Right column, muted green boxes | Collapsed by default, click to expand rule text. Deep Strike, Feel No Pain, Lone Operative, etc. |
| `keywords` | Bottom bar | Filtered (no internal keywords), clickable. Keywords with linked stratagems show ⚡ and hover tooltip. |
| `factionKeywords` | Bottom bar right | Blue badges, clickable, `factionDisplayName()` |
| `composition` | Footer | Conditional |
| `loadout` | Footer | Conditional |
| `wargearOptions` | Footer | Conditional, `whitespace-pre-line` |
| `leaders` | Footer | Clickable blue links |
| `errata` | Collapsible section | Uses `ErrataSection` component |

### Ability Types

Abilities are split into two groups:

- **Custom abilities** (unit-specific): Always expanded with bright green styling (`border-green-800`, `text-green-200`). E.g., "Oath of Moment Target", "The Quickening".
- **USR abilities** (Universal Special Rules): Collapsed by default with standard green styling (`border-green-900`, `text-green-300`). Click to expand rule text. Click name to open core rule card. E.g., "Deep Strike", "Feel No Pain", "Fights First", "Lone Operative".

USR detection uses a hardcoded set: deep strike, deadly demise, feel no pain, fights first, firing deck, hover, infiltrators, scouts, stealth, lone operative, leader, assault, heavy, rapid fire.

### Keyword Stratagem Tooltips

Keywords with linked core stratagems show an ⚡ indicator and amber tint. Hover reveals a mini stratagem card:

| Keyword | Stratagem | CP | Effect |
|---|---|---|---|
| Grenades | GRENADE | 1 | Roll 6 dice, 4+ = 1 mortal wound |
| Smoke | SMOKESCREEN | 1 | Benefit of Cover + Stealth |
| Infantry | GO TO GROUND | 1 | 6+ invulnerable + Benefit of Cover |

### Tank Shock on Toughness

On units with the **Vehicle** keyword, the Toughness (T) stat shows an ⚡ indicator. Hover reveals the Tank Shock stratagem tooltip showing how many D6 to roll (= Toughness value).

### Interactions

- **Weapon names**: NOT clickable (data, not navigation)
- **Weapon ability tags** `[SUSTAINED HITS]`: Clickable amber badges, trigger `onContentClick`
- **Core ability badges**: Clickable, highlight when matching
- **Custom ability names**: Clickable bright green text, opens rule card
- **USR ability names**: Clickable green text, opens core rule card. Box click toggles expand/collapse.
- **Keywords**: Clickable, trigger `onContentClick`. Stratagem-linked keywords show hover tooltip.
- **Faction keywords**: Clickable blue badges
- **Leader names**: Clickable blue links
- **Weapon rows**: Highlight with amber background when abilities match `highlightTerms`

---

## 2. StratagemCard (`StratagemCard.tsx`)

**Accent**: Blue sidebar (`bg-blue-900`, `border-blue-800`)
**Data**: `StratagemCardData`

### Layout

```
+---+-------------------------------------------+
| C |  STRATAGEM NAME                            |  Blue sidebar with
| P |  Type — Phase                              |  CP diamond (amber)
|   |                                            |
| 1 |  WHEN: Your Shooting phase.                |  Labeled sections
|   |  TARGET: One unit from your army.           |  Highlight on match
|   |  EFFECT: Until end of phase, weapons...     |
|   |                                            |
|   |  SPACE MARINES — Gladius Task Force         |  Footer (faction — detachment
|   |  Detachment                                |   Detachment)
+---+-------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Body header | Oswald uppercase, blue bottom border |
| `cpCost` | Sidebar diamond | Amber rotated square, Oswald bold |
| `type` | Below name | Small blue text, includes phase: "Battle Tactic Stratagem — Shooting phase" |
| `phase` | Part of type line | Appended to type with " — " separator |
| `when` | Labeled section | "WHEN:" label in blue, text in slate |
| `target` | Labeled section | "TARGET:" label |
| `effect` | Labeled section | "EFFECT:" label, highlights on match |
| `factionId` | Footer | "FACTION NAME — Detachment Name Detachment" format, `factionDisplayName(subfaction \|\| factionId)` ALL CAPS |
| `detachmentName` | Footer | Combined with faction in footer, " Detachment" suffix |
| `errata` | Collapsible section | |

### Interactions

- `[KEYWORD]` tokens in WHEN/TARGET/EFFECT are clickable amber buttons
- Effect section highlights with amber background when matching `highlightTerms`

---

## 3. EnhancementCard (`EnhancementCard.tsx`)

**Accent**: Purple (`border-purple-500`)
**Data**: `EnhancementCardData`

### Layout

```
+-----------------------------------------------+
| ENHANCEMENT NAME              25 pts   |  Purple underline
| Chaplain model only                    |  Purple-400 restriction
|                                        |
| The bearer's melee weapons have the    |  Body text with highlights
| [DEVASTATING WOUNDS] ability.          |
|                                        |
| SPACE MARINES — Wrathful Procession    |  Footer (faction — detachment)
| Detachment                             |
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header left | Oswald uppercase |
| `cost` | Header right | Purple bold, Oswald, "X pts" format |
| `restriction` | Below header | `text-[9px] text-purple-400 uppercase` |
| `description` | Body | Highlight support via `highlightText` |
| `factionId` | Footer | "FACTION NAME — Detachment Name Detachment" format, `factionDisplayName()` ALL CAPS |
| `detachmentName` | Footer | Combined with faction, " Detachment" suffix |
| `errata` | Collapsible section | |

### Interactions

- Description terms matching `highlightTerms` shown as clickable amber marks

---

## 4. RuleCard (`RuleCard.tsx`)

**Accent**: Amber (`border-amber-400`) for army rules, Blue (`border-blue-400`) for detachment abilities
**Data**: `RuleCardData`

### Layout

```
+-----------------------------------------------+
| RULE NAME                              |  Accent color changes
| Faction Name — Army Rule               |  based on isArmyRule
| [Subfaction Badge]                     |
+-----------------------------------------------+
| Rule description text with [KEYWORDS]  |  Body
|                                        |
| +-----------------------------------+ |  Sub-rules (conditional)
| | MARTIAL EXCELLENCE                 | |  Bordered amber boxes
| | Melee weapons have [SUSTAINED 1]   | |
| +-----------------------------------+ |
| +-----------------------------------+ |
| | WARP BLADES                        | |
| | Melee weapons have [LETHAL HITS]   | |
| +-----------------------------------+ |
|                                        |
| Applies to 54 datasheets              |  Clickable button
| View source (p.6)                     |  PDF link
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header | Oswald uppercase |
| `factionId` | Subtitle | "{Faction} — Army Rule" or "Detachment Ability" |
| `isArmyRule` | Controls accent | true = amber, false = blue |
| `subfaction` | Badge | Amber pill if present |
| `description` | Body | `[KEYWORD]` tokens clickable |
| `subRules` | Bordered boxes | Name (bold amber) + description, highlight on match |
| `appliesTo` | Footer button | "Applies to X datasheets" — clickable |
| `sources` | Footer links | "View source (p.N)" for PDF sources |
| `errata` | Collapsible section | |

---

## 5. CoreRuleCard (`CoreRuleCard.tsx`)

**Accent**: Amber (`border-amber-500`)
**Data**: `CoreRuleCardData`

### Layout

```
+-----------------------------------------------+
| SUSTAINED HITS              shooting   |  Amber underline + phase badge
+-----------------------------------------------+
| Weapons with [SUSTAINED HITS X] in     |  Body text
| their profile score additional hits... |
|                                        |
| +-----------------------------------+ |  HTML table (conditional)
| | S vs T | Result Required           | |  Via dangerouslySetInnerHTML
| | S >= 2T | 2+                       | |
| | S > T   | 3+                       | |
| +-----------------------------------+ |
|                                        |
| [content-inferred]                     |  Quality flags (conditional)
| View Source PDF                        |  PDF link (conditional)
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header left | Oswald uppercase |
| `phase` | Header right badge | `text-[9px] bg-amber-400/10 text-amber-400 rounded` |
| `description` | Body | Highlight support |
| `tableHtml` | Below body | Raw HTML table, `overflow-x-auto text-[10px]` |
| `qualityFlags` | Below table | Amber pill badges |
| `sources` | Footer | "View Source PDF" button per PDF source |
| `errata` | Collapsible section | |

---

## 6. MissionCard (`MissionCard.tsx`)

**Accent**: Amber (`border-amber-400`) for primary, Blue (`border-blue-400`) for secondary
**Data**: `MissionCardData`

### Layout

```
+-----------------------------------------------+
| TAKE AND HOLD                          |  Accent varies by type
| [PRIMARY] [FIXED] [ATTACKER]          |  Badges row
+-----------------------------------------------+
| SECOND BATTLE ROUND ONWARDS           |  Section header (conditional)
|                                        |
| WHEN     End of Command phase...      |  Accent-colored label row
| ACTION   Recover Assets — units...    |  Purple label (conditional)
| CONDITION For each objective...       |  Green label row
| SCORING  condition → VP              |  Amber label + md-bullet list
|          condition → VP              |    with VP values right-aligned
|          Max VP: 15VP                |
+-----------------------------------------------+
| > Full Description                     |  Collapsible raw content
+-----------------------------------------------+
| Errata                                |
| View source (p.3)                     |
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header | Oswald uppercase |
| `missionType` | Badge | "PRIMARY" (amber) or "SECONDARY" (blue) |
| `isFixed` | Badge | Purple "FIXED" badge, conditional |
| `side` | Badge | Slate "ATTACKER"/"DEFENDER" badge, conditional |
| `when` | Labeled row | Accent-colored label (amber for primary, blue for secondary). When scoring happens — phase, turn, timing. |
| `action` | Labeled row | Purple label. Action required to score. Only shown if mission requires an action. |
| `condition` | Labeled row | Green label. Summary of how points are scored — the condition. |
| `scoring` | Labeled row + rich content | Amber label. Contains md-bullet rows (condition → VP, right-aligned), max VP, and WHEN DRAWN notes (italic box). |
| `content` | Collapsible "Full Description" | Raw text, collapsed by default. Shown as sole body content when no structured fields. |
| `sources` | Footer | View source buttons |
| `errata` | Collapsible section | |

### Scoring Content

The SCORING field renders rich content inside the field row:
- **VP bullets**: `condition → VP` pairs with left border, VP right-aligned in amber
- **Max VP**: Small slate text below bullets
- **WHEN DRAWN**: Italic box with discard/redraw instructions
- **Multi-WHEN**: Fixed secondaries may have multiple WHEN blocks within scoring, each with its own condition/VP pairs

---

## 7. TwistCard (`TwistCard.tsx`)

**Accent**: Green (`border-green-500`)
**Data**: `TwistCardData`

### Layout

```
+-----------------------------------------------+
| NIGHT FIGHTING                 TWIST   |  Green underline + badge
+-----------------------------------------------+
| Maximum range of all ranged weapons    |  Description
| is 18". Charge range is 18".           |
+-----------------------------------------------+
| View source                           |
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header left | Oswald uppercase |
| "TWIST" | Header right badge | Green badge |
| `description` | Body | Whitespace preserved |
| `sources` | Footer | View source buttons |
| `errata` | Collapsible section | |

---

## 8. ChallengerCard (`ChallengerCard.tsx`)

**Accent**: Orange (`border-orange-500`)
**Data**: `ChallengerCardData`

### Layout

```
+-----------------------------------------------+
| ATTRITION                  CHALLENGER  |  Orange underline + badge
+-----------------------------------------------+
| Mission narrative text...              |  Content section
|                                        |
| PAIRED STRATAGEM                       |  If structured content
| WHEN: End of your turn.               |  WHEN/TARGET/EFFECT rows
| TARGET: One enemy unit.               |
| EFFECT: 3VP per unit destroyed.       |
+-----------------------------------------------+
| View source                           |
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header left | Oswald uppercase |
| "CHALLENGER" | Header right badge | Orange badge |
| `content` | Body | Auto-parsed for `**WHEN:**`/`**TARGET:**`/`**EFFECT:**` structure |
| `sources` | Footer | View source buttons |
| `errata` | Collapsible section | |

---

## 9. DeploymentZoneCard (`DeploymentZoneCard.tsx`)

**Accent**: Green (`border-green-500`)
**Data**: `DeploymentZoneCardData`

### Layout

```
+-----------------------------------------------+
| CRUCIBLE OF BATTLE    Strike Force     |  Green underline + size badge
+-----------------------------------------------+
| [Strike Force diagram image]           |  PDF page image (primary)
|                                        |
| [Incursion diagram image]              |  Second image if 2 pages
|                                        |
| Diagonal split. Strike Force (2000pts):|  Description below images
| 10"/8" from corners, 20" depth.        |
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header left | Oswald uppercase |
| `battleSize` | Header right badge | `text-[9px] text-green-400 bg-green-400/10 rounded` |
| `pdfImages` | Body (primary) | Array of `{ pdfName, page }` — renders multiple `<img>` tags |
| `description` | Below images OR as fallback | Shows below images if present, as sole content if no images |
| `qualityFlags` | Bottom | Amber pill badges |

### Image Loading

Each `PageImage` sub-component has independent loading/error state:
- **Loading**: Shows "Loading..." placeholder
- **Error**: Image silently removed (other images still show)
- **Success**: `w-full h-auto rounded`

Images load from: `{API_BASE}/pages/{pdfName}/page-{page}.png`

**Strike Force (2000pts) page shows FIRST** — this is the competitive default.

---

## 10. TerrainLayoutCard (`TerrainLayoutCard.tsx`)

**Accent**: Green (`border-green-500`)
**Data**: `TerrainLayoutCardData`

### Layout

```
+-----------------------------------------------+
| TERRAIN LAYOUT 1                       |  Green underline
+-----------------------------------------------+
| [Terrain diagram image]               |  PDF page image OR text
|                                        |
| Terrain placement guide                |  Description (fallback)
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header | Oswald uppercase |
| `pdfImage` | Body (primary) | Single `{ pdfName, page }` |
| `description` | Fallback | Shows on image error or if no pdfImage |
| `qualityFlags` | Bottom | Amber pill badges |

---

## 11. ErrataCard (`ErrataCard.tsx`)

**Accent**: Orange (`border-orange-500`)
**Data**: `ErrataCardData`

### Layout

```
+-----------------------------------------------+
| FAQ: WOUND ROLL TIMING    [inferred]   |  Orange underline + flags
+-----------------------------------------------+
| Clarifies: Wound Roll                  |  Clickable orange link
|                                        |
| The wound roll is made after the hit   |  Correction text with highlights
| roll, not simultaneously.              |
+-----------------------------------------------+
| Rules Commentary | 2025-01-15          |  Footer: source + date
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header left | Oswald uppercase |
| `qualityFlags` | Header right | Amber badges |
| `targetRule` | "Clarifies:" line | Clickable orange-400, triggers `onContentClick` |
| `correctionText` | Body | Highlight support |
| `source` | Footer left | |
| `effectiveDate` | Footer right | |

---

## 12. BalanceCard (`BalanceCard.tsx`)

**Accent**: Red (`border-red-500`)
**Data**: `BalanceCardData`

### Layout

```
+-----------------------------------------------+
| POINTS ADJUSTMENT          [inferred]  |  Red underline + flags
+-----------------------------------------------+
| Intercessor Squad reduced from 80pts   |  Description with highlights
| to 75pts.                              |
+-----------------------------------------------+
| Effective: 2025-03-15                  |  Footer date
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header left | Oswald uppercase |
| `qualityFlags` | Header right | Amber badges |
| `description` | Body | Highlight support |
| `effectiveDate` | Footer | |

---

## 13. CommunityCard (`CommunityCard.tsx`)

**Accent**: Cyan (`border-cyan-500`)
**Data**: `CommunityCardData`

### Layout

```
+-----------------------------------------------+
| TOUGHNESS BREAKPOINTS      [inferred]  |  Cyan underline + flags
+-----------------------------------------------+
| Units cluster into toughness tiers.    |  Description with highlights
| Weapon strength must match...          |
+-----------------------------------------------+
| Community contribution                 |  Footer attribution
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header left | Oswald uppercase |
| `qualityFlags` | Header right | Amber badges |
| `description` | Body | Highlight support |
| `sourceAttribution` | Footer | |

---

## 14. DetachmentCard (`DetachmentCard.tsx`)

**Accent**: Blue (`border-blue-500`)
**Data**: `DetachmentCardData`

### Layout

```
+-----------------------------------------------+
| BERZERKER WARBAND          WORLD EATERS|  Blue underline
| WORLD EATERS — Detachment Ability      |  Subtitle
+-----------------------------------------------+
| Blood Surge: Units from your army are  |  Ability text
| eligible to declare a charge in a turn |
| in which they Advanced.                |
|                                        |
| [World Eaters]                         |  Chapter badge (amber pill)
+-----------------------------------------------+
| v Stratagems (6)                       |  Collapsible section
|   +---+------------------------------+|  Nested StratagemCards
|   |1CP| BLOOD TITHE                  ||  (full interactive cards)
|   +---+------------------------------+|
+-----------------------------------------------+
| v Enhancements (4)                     |  Collapsible section
|   +----------------------------------+|  Nested EnhancementCards
|   | BERZERKER GLAIVE        25 pts   ||
|   +----------------------------------+|
+-----------------------------------------------+
| [quality flags]                        |
| Errata                                |
+-----------------------------------------------+
```

### Key Fields

| Field | Display | Notes |
|---|---|---|
| `name` | Header left | Oswald uppercase |
| `factionName` | Header right | Blue text, uppercase |
| `factionId` | Subtitle | "{faction} — Detachment Ability" |
| `abilityText` | Body | Whitespace preserved |
| `chapterBadge` | Below ability | Amber pill with amber/10 background |
| `stratagems` | Collapsible section | Array of `StratagemCardData`, renders full `StratagemCard` |
| `enhancements` | Collapsible section | Array of `EnhancementCardData`, renders full `EnhancementCard` |
| `qualityFlags` | Bottom | Amber badges |
| `errata` | Collapsible section | Uses `ErrataSection` |

### Interactions

- Collapsible sections use `CollapsibleSection` component (expand/collapse toggle with count badge)
- Nested cards are fully interactive (clickable keywords, highlights, etc.)
- Sections hidden when count is 0

---

## Supporting Components

### ErrataSection (`ErrataSection.tsx`)

Used inside most cards. Renders a collapsible list of errata entries. Each entry shows title and content.

### PdfPageView (`PdfPageView.tsx`)

Full-screen PDF page viewer. Shows page image with semi-transparent highlight overlay. Opened by "View Source" buttons via `context.onViewSource`.

### CollapsibleSection (`CollapsibleSection.tsx`)

Expand/collapse toggle with title + count badge. Renders nothing when `count === 0`.

### ComboView (`ComboView.tsx`)

Two-card side-by-side layout with a connector. Used for displaying related rules pairs.

---

## Card Resolution Flow

`resolveCardView(node)` in `lib/card-display.ts` maps node categories to card types:

| Node Category | Card Type | Card Component |
|---|---|---|
| `datasheet` | `unit` | UnitCard |
| `stratagem` | `stratagem` | StratagemCard |
| `enhancement` | `enhancement` | EnhancementCard |
| `faction-ability` (no detachment) | `rule` (army) | RuleCard |
| `faction-ability` (with detachment) | `rule` (detachment) | RuleCard |
| `detachment-rule` | `detachment` | DetachmentCard |
| `phase-sequence`, `core-mechanic`, `terrain`, `army-construction`, `mission`, `keyword` | `core-rule` | CoreRuleCard |
| `primary-mission`, `secondary-mission` | `mission` | MissionCard |
| `twist` | `twist` | TwistCard |
| `challenger` | `challenger` | ChallengerCard |
| `deployment-zone` | `deployment-zone` | DeploymentZoneCard |
| `terrain-layout` | `terrain-layout` | TerrainLayoutCard |
| `faq`, `commentary` | `errata` | ErrataCard |
| `balance-change` | `balance` | BalanceCard |
| `ruling`, `tactic`, `worked-example` | `community` | CommunityCard |
| anything else | `rule` (fallback) | RuleCard |
