# RALPH.MD — Recurring Task Directive + Progress

## Directive

After EACH Set of Tasks is completed, please do a pull from remote to merge the RALPH.MD file I will be editing remotely. Then commit and push your changes AFTER EACH SET OF TASKS IS COMPLETE. NOT THE FULL LIST, EVEN BEFORE large scale testing occurs.
Look at the functional requirements again. Implement those changes, correctly for every app. 
All apps ahould use one data source on the front end, and one data source on the back end. They should be able to be connected by the same ids. 
Review all of the tests, make sure that they actually pass, not just pass because nothing is implemented.

** IMPORTANT **
Build a copy of the app locally, and run it locally in a local browser, and run the import functions. Validate the data generated.


**UI Requirements:**
- [DONE 2026-02-27] Remove fallback logic on data entry fields. I want to see an empty dropdown instead of a text entry box. → Converted game-tracker fields to empty dropdowns.
- [DONE 2026-02-27] The consistency of home links is poor, make every page have the ability to go back to home, and look the same, make them all have the home link. → AppShell home icon added to all auth-gated apps.
- [DONE 2026-02-27] In the Game Tracker, implement go back to previous rounds to update the data. → RoundEditor component for inline editing of recorded rounds.
- [DONE 2026-02-28] In the Game Tracker, I still see text fields that should be dropdowns, I am guessing that these are fall back, or you missed them. → Full dropdown audit verified all fields use `<select>`.
- [DONE 2026-02-27] In the Game Tracker, the opponents Detachment is a text field, it should be a drop down. → Opponent detachment is a dropdown when data available.
- [DONE 2026-02-27] In the Game Tracker, the player should be able to either pick a list, or paste a list into a field, and select a detachment from a drop down. If the player selects a list from the list builder, the detachment should auto-populate. → Select List / Paste List toggle, auto-populates faction and detachment.
- [DONE 2026-02-27] I don't see detailed instructions on every page. → Added instructional text to every screen in all 8 apps.
- [DONE 2026-02-28] The Dice detection is not good. → Complete CV pipeline rewrite: grayscale + Gaussian blur + morphological close + direct pip counting via blob detection.
- [DONE 2026-02-27] In the data, point costs for units have disappeared. → Added `useUnitCostMap` hook to load costs from IndexedDB.
- [DONE 2026-02-27] Match up the Wahapedia Faction designations with the BSData Faction Designations. → BSData catalog prefixes stripped, `normalizeFactionName()` utility added.
- [DONE 2026-02-27] In the Stored data screen, the tools are there now that show some feedback that the data has been cleared out, but the underlying screen does not clear. → `clearGameRules()` now also removes `rulesImportMeta`, UI updates immediately.
- [DONE 2026-02-28] Where are the codex detachments? → Codex detachments fully implemented: export → import → IndexedDB → hooks → all consumer apps.
- [DONE 2026-02-27] Do not show "Default Detachment". → Removed "Default Detachment" fallback, shows message + "Continue without detachment" button.
- [DONE 2026-02-27] Legends unit still show up. → Legends filter checkbox added to all apps, defaults to unchecked. `useLegendsUnitIds()` shared hook.
- [DONE 2026-02-27] Convert all HTML in the detailed text sections into markdown. → `htmlToMarkdown()` converts at export time; `htmlToText()` utility in packages/ui.
- [DONE 2026-02-27] Make each section that displays detailed text expandable. → `CollapsibleSection` component in packages/ui, applied to versus and list-builder.
- [DONE 2026-02-27] Opponent detachment is not a dropdown in the Game Tracker. → (Duplicate of item above, confirmed dropdown.)
- [DONE 2026-02-27] In the game tracker, the secondaries and the strategems should be dropdowns. → StratagemPicker and SecondaryPicker rewritten as proper dropdowns.
- [DONE 2026-02-27] In the game tracker, the data entry forms are not the same for the subsequent rounds. → Round form consistency verified; added key={nextRound} for state reset.
- [DONE 2026-02-27] I Still don't have a testing button that preloads a tournament with fake player data. → "Load Test Players" button via `player.seedTestPlayers` mutation.
- [DONE 2026-02-27] On the data import page for BSData, the warnings are useless, give me a button where I can copy them to the clipboard. → Copy-to-clipboard button with "Copied!" feedback.


**Data Requirements:**

- [DONE 2026-02-28] Show me the master database. → `scripts/create-master-db.ts` creates 27-table DB combining Wahapedia (19 tables, 160K+ rows) + BSData (4 tables, 1351 units) with FK constraints.
- [DONE 2026-02-28] Create the code that will run on the client side to create the IndexDB that has the same data as the master database. → 22 IndexedDB stores match master DB (18 Wahapedia + BSData units + lists/meta).
- [DONE 2026-02-28] Show me where you use that code on the Data-Import app, and run tests. → 29 validation tests covering full 20-step pipeline, ID re-keying, data integrity (57 total data-import tests).
- [DONE 2026-02-28] Prepare a set of scripts that set up the data sources for a GitHub repo. → `scripts/publish-data.sh` + `.github/workflows/update-data.yml` for weekly automated data updates.

**Code Quality:**
- [ONGOING] Refactor on every iteration if needed, make the code better, and leaner, not more bloated.
- [DONE] Do not duplicate code — create base functionality that can be shared. → All parsing/conversion functions in game-data-store, shared hooks pattern, packages/server-core eliminates 7x boilerplate.
- [DONE 2026-02-28] Run all of your tests with good test data, not just objects with the right signature. → Data-Import validation tests use real Wahapedia data structures.
 
## List Builder Features required to be considered functional

- [DONE] Include a text box for the Name of a list. → List creation form has name field.
- [DONE] After creating a list, the next screen should be the size of the army, with the associated battle size name 500, 1000, 2000, 3000 pts → Multi-screen wizard: army size selection with battle size names.
- [DONE] Then the faction should be chosen on the next screen, with the detachment then chosen. → Faction → Detachment flow in wizard.
- [DONE 2026-02-27] In the unit selector, no legends shown unless the legends checkbox is selected. → Legends filter with shared `useLegendsUnitIds()` hook.
- [DONE] There are rules in army creation, limited choices for 500 pt games, 2 of any in 1000 pt games, and 3 of any in 2000 pt games, plus warlords must be chosen. → Army creation rules enforced per battle size, point cap enforced.
- [NOT STARTED] Some detachments have unit choice limitations, use them if they exist. → (Item 15: data exists only as unstructured HTML — requires manual rule extraction.)
- [DONE] During unit selection, after each unit is chosen, choose the number of models selected, there are usually different levels allowed, with different point costs and then show the statistical information about that unit, and in a popup, show units that have the same or fewer points in the same role that have higher win rates. → Model count selection, point costs, and suggestion popup implemented.
- [DONE] There should be a done button, and then the list selections should be saved back to the server, associated with the user and the list name. → Lists saved to IndexedDB (client-side) and server.
- [DONE 2026-02-27] The export should export in full text format, stored in clipboard with a note. → Export button with "Copied!" notification.
- [DONE 2026-02-28] The user should be able to select a list and use it in tournament tracker. → "Use in Tournament" button sets localStorage, tournament registration reads it.
- [DONE] There should be a description text box for the list. → Description field in list creation form.

## No-cheat Features required to be considered functional

- [DONE 2026-02-28] Calibration workflow needs to be clearer in the app. List out the steps on buttons for each step. If the Wizard shows a screen clip that is not a dice face, a selector should be there that says, NOT A DICE. → CalibrationWizard simplified to 2-step (Background → Test Roll) after CV rewrite. "Not a Dice" button added.
- [DONE 2026-02-28] When the calibration is complete, it should ask for a test roll to show that it can accurately see the dice faces. → Step 2 (Test Roll) captures a frame, shows detected dice with bounding boxes and pip values, asks "Does this look correct?"
- [DONE] It should show squares around each face it captures, with the number of each dice captured in that square in the video, using an overlay. → Canvas overlay draws emerald bounding boxes with pip labels for each detected die.
- [DONE] You should not have to click a button to capture the rolls from that point forward. → Hands-free auto-capture: requestAnimationFrame loop detects dice, waits for stability (~0.7s), auto-submits, waits for dice removal.
- [DONE] The Z score calculation and Chi squared values should show up in the video as an overlay, and the analysis should be in real time. → `StatsOverlay.tsx` displays real-time Z-score, χ², and verdict (FAIR/SUSPECT/LOADED). `DistributionChart.tsx` shows per-pip distribution.

## Tournament Features required to be considered functional

- [DONE] TO can register for event. → Tournament creation flow for TOs.
- [DONE 2026-02-28] Add Geocoding to event location → Nominatim (OpenStreetMap) geocoding. "Near Me" button with Haversine distance sorting.
- [DONE 2026-02-27] Give an area for description using markdown, add image upload for tournament, add external link, add location, add number of rounds. → Markdown descriptions with `SimpleMarkdown` component, image URL field, external link, location, rounds count.
- [DONE 2026-02-27] Add Date and start time as data fields, image storage, link → Date, start time, image URL, external link in tournament creation.
- [DONE 2026-02-28] Add TO information, location, description, image, link, number registered to the Tournament display → TO name (joined from auth), all fields shown in detail view.
- [DONE] Add registered player management to the TO display - Add players, remove, reinstate. Yellow Card, Red Card, Ban → Player management with cards, reinstate, search in ManageTournament.
- [DONE] Show previous Card status of each player to the TO. → Card history displayed per player.
- [DONE] In TO tools, add special award location where the TO can add awards like Best Painted, Most sportsmanlike, etc. → Custom awards feature in tournament management.
- [DONE 2026-02-28] In round management, allow TO to enter score results if players do not use Game-tracker to score the match. → TO Override button for VP score entry on pairings view.
- [DONE 2026-02-28] Add a clock to each round. (Optional) → Elapsed time timer on active rounds, updating every second.
- [DONE 2026-02-27] Add a start time to each round. → `startTime` column on rounds table, input in round creation UI.
- [DONE] Close Tournament should export data to the new-meta data. → Tournament → new-meta export pipeline.
- [DONE] Add a new selection interface called Play, with search, favorites, and registration. → Play search interface with tournament finder.
- [DONE] After a tournament is closed out, show the view results button instead of the registration button. → Results view replaces registration for closed tournaments.
- [DONE] Store tournament data back to a user record, and make My Info that shows lists, tournaments, ELO, GLICKO, rank, record, Card data, Ban data. → My Info section with full player profile.
- [DONE] Add a list search tool for lists used in tournaments by faction. → List search feature.
- [DONE] Add a player search tool that shows tournaments played in, card status, lists used. → Player search feature.

## Versus Features required to be considered functional

- [DONE 2026-03-04] The correct number of weapons is calculated. → Weapon attacks multiplied by number of models carrying each weapon. Model count selectable from unit data.
- [DONE] All Ranged weapons are allowed to be used unless the unit has ranged options. → Weapon selection UI allows all ranged weapons per unit profile.
- [DONE] Only one melee profile is allowed, unless there are weapon profiles labelled extra attacks. → Melee limit logic in simulation pipeline.
- [DONE 2026-02-27] I still cannot increase strength or Toughness, or number of attacks, or reroll-wounds. → TOUGHNESS_MOD (+1, +2, -1) added. REROLL_WOUNDS in pipeline. SpecialRulesEditor for all modifiers.
- [DONE 2026-03-04] Apply the special rules correctly. → FNP, Dev Wounds, Mortal Wounds, and Precision fully implemented and tested.
- [DONE] The data stored should include the units included, the special rules applied, and the results. → Save includes unit IDs, applied special rules, and simulation results.
- [DONE 2026-02-28] When saving the data, results can be sent to server for caching and comparison. → `simulate.lookup` endpoint queries by configHash.
- [DONE 2026-02-27] Allow for Leader additions to make a unit comparison more meaningful. → Leader attachment with auto-applied abilities.
- [DONE 2026-02-27] Leaders have special rules, apply them automatically. → Leader abilities parsed for simulation-relevant rules (re-roll hits, lethal hits, sustained hits, etc.), auto-applied as read-only chips.

---

## Progress

### Completed
Update this section every time you update or fix a section of the requirements.

- **BSData parser fix (2026-02-27)**: Fixed upstream XML schema changes (typeName="Unit", SV/LD uppercase). PARSER_VERSION 4→5. 113 game-content tests pass.
- **Remove fallback text inputs (2026-02-27)**: Game tracker — opponent faction, opponent detachment, your detachment, secondaries, stratagems all converted from text fallbacks to empty dropdowns.
- **Auto-populate detachment from list (2026-02-27)**: Game tracker — selecting a list auto-fills faction and detachment.
- **Round editing (2026-02-27)**: Game tracker — tap any recorded round to edit it inline (RoundEditor component).
- **Remove Default Detachment (2026-02-27)**: List builder — removed "Default Detachment" fallback. Shows message + "Continue without detachment" button when no data imported.
- **Legends filter (2026-02-27)**: Versus — added "Include Legends units" checkbox (was hardcoded exclusion). List builder already had checkbox.
- **HTML to text conversion (2026-02-27)**: Created shared `htmlToText()` utility in packages/ui. Applied to versus (abilities, wargear, detachment abilities, enhancements, stratagems) and list-builder (detachment abilities) descriptions.
- **Fix missing point costs (2026-02-27)**: `usePrimaryUnitSearch` was hardcoding `points: 0` for Wahapedia datasheets. Added `useUnitCostMap` hook that loads costs from IndexedDB. Points now show in list-builder and versus.
- **Stored data screen clearing fix (2026-02-27)**: `clearGameRules()` now also removes `rulesImportMeta` from meta store so UI reflects cleared state. All clear handlers optimistically update UI immediately.
- **Wahapedia/BSData faction matching (2026-02-27)**: BSData catalog prefixes ("Imperium - ", "Chaos - ") now stripped during import so faction names match Wahapedia conventions. Added `normalizeFactionName()` utility. Game-tracker switched to `usePrimaryFactions` for consistent faction names. `searchUnits` and `clearFaction` handle both old and new naming for backward compatibility.
- **Instructions on every page (2026-02-27)**: Added concise instructional text to every screen in all 8 apps: game-tracker (5 screens), list-builder (4 screens), versus (1 screen), tournament (6 sections), new-meta (7 pages), no-cheat (3 screens), admin (5 pages), data-import (already had them).
- **Expandable/collapsible text sections (2026-02-27)**: `CollapsibleSection` component in packages/ui. Applied to versus (stratagems, simulation history), list-builder (detachment rules). Sections show title only by default, expand on click.
- **BSData import clipboard button (2026-02-27)**: Enhanced copy-to-clipboard button on BSData import warnings with "Copied!" feedback and amber accent styling.
- **Paste list feature in game tracker (2026-02-27)**: MatchSetupScreen now has Select List / Paste List toggle. Paste mode provides a textarea for army list text. Select mode auto-populates faction and detachment from the chosen list.
- **Tournament test data preload button (2026-02-27)**: "Load Test Players" button in ManageTournament (Players tab). Inserts 8 fake players with diverse factions/detachments via `player.seedTestPlayers` mutation. TO-only.
- **Round form consistency verified (2026-02-27)**: Confirmed all rounds render identically in game-tracker — same fields (CP, VP, secondaries, stratagems, units, photos) for every round.
- **List-builder export clipboard notification (2026-02-27)**: Export button now shows "Copied!" in emerald green for 2 seconds after successful clipboard copy.
- **Versus toughness/reroll-wounds special rules (2026-02-27)**: Added TOUGHNESS_MOD (+1, +2, -1) to SpecialRulesEditor and simulation pipeline. REROLL_WOUNDS was already in pipeline. Both deterministic and Monte Carlo paths handle toughness modification.
- **Versus leader auto-apply (2026-02-27)**: When a leader is attached, their abilities are parsed for simulation-relevant rules (re-roll hits, lethal hits, sustained hits, etc.) and auto-applied as read-only "From leader" chips in SpecialRulesEditor. 22 new unit tests for ability parsing.
- **Tournament round start time (2026-02-27)**: Added `startTime` column to rounds DB table. Round creation accepts optional start time. UI shows start time in round detail and provides input when creating rounds. 4 new tests.
- **Tournament markdown descriptions (2026-02-27)**: Created `SimpleMarkdown` component in packages/ui (handles bold, italic, links, headers, lists, code). Tournament detail view renders descriptions with markdown formatting. 10 new tests.
- **No-cheat "Not a Dice" button (2026-02-27)**: Added "Not a Dice" button to ClusterLabelingScreen in calibration wizard. When the detected image is a false positive (not a die face), the user can skip it instead of being forced to label it.
- **Tournament image URL (2026-02-27)**: Added `imageUrl` to tournament.create mutation (Zod `.url()` validated). Create form has image URL field. Tournament detail view shows image above description with `max-h-64 object-cover`. DB column already existed from V3 schema.
- **Data pipeline documentation (2026-02-28)**: Created `docs/DATA-PIPELINE.md` documenting the full three-tier data system: source DBs → JSON export → IndexedDB. Covers master database schema (`create-master-db.ts`), export pipeline (`export-wahapedia.ts`), ID mapping strategy, IndexedDB stores (22 stores, 7 indexes), and automation.
- **Data automation scripts (2026-02-28)**: Created `scripts/publish-data.sh` for exporting + pushing JSON to a GitHub data repo. Created `.github/workflows/update-data.yml` GitHub Actions template for weekly automated data updates (sync → export → publish). Validated export: 246 detachments, 1686 datasheets, 2104 unit costs, 9219 weapons, 1397 stratagems, 63 missions.
- **Build validation (2026-02-28)**: `pnpm -r build` succeeds for all 16 packages. Data-import app serves all 19 JSON files correctly via local preview. Fixed TS build error in ImportScreen.tsx (readonly ref type).
- **Tournament TO info display (2026-02-28)**: tournament.get query now joins authUsers table to fetch TO name. Tournament detail view shows "TO: {name}" in header. 73 server + 58 client tests pass.
- **"Use in Tournament" button verified (2026-02-28)**: Already implemented in MyListsScreen.tsx — sets localStorage `tournament-list` which tournament registration reads. Button shows "Active for Tournament" with amber highlight when active.
- **Game Tracker dropdown audit (2026-02-28)**: Verified all faction/detachment fields use `<select>` dropdowns (not text inputs). Secondaries use SecondaryPicker dropdown. Stratagems use StratagemPicker dropdown. Text inputs are only for user-entered data (date, location, opponent name, notes).
- **TO score override UI (2026-02-28)**: Added "TO Override" button on round pairings view — TOs can enter/change VP scores directly for any pairing. Uses `result.override` mutation (auto-confirms, sets `toOverride` flag). Override form pre-fills existing scores. Overridden results show "TO Override" label instead of "Confirmed". 73 server + 58 client tests pass.
- **Feature audit verified (2026-02-28)**: Comprehensive audit of all app feature requirements. Confirmed: list-builder (army size, faction/detachment flow, creation rules, model count, suggestions, save — all implemented). Versus (weapon count, melee limits, save with units/rules/results — all implemented). Tournament (Play search, My Info, list search, player search — all implemented).
- **Versus cache lookup (2026-02-28)**: Added `simulate.lookup` endpoint — queries by configHash to find previously saved results. Client computes configHash on-the-fly and shows "Previously Saved Result" comparison alongside live simulation. 11 server + 160 client tests pass.
- **Tournament round clock (2026-02-28)**: Added elapsed time timer on active rounds. Shows `Elapsed: H:MM:SS` in amber monospace font, updating every second. Uses round `createdAt` timestamp. 73 server + 58 client tests pass.
- **Tournament geocoding (2026-02-28)**: Integrated Nominatim (OpenStreetMap) geocoding — no API key needed. On tournament creation, location string is geocoded to lat/lng and stored. Tournament detail shows "View Map" link to OpenStreetMap. Play search has "Near Me" button using browser geolocation — sorts results by distance (Haversine formula) and shows distance in miles on each card. DB columns already existed from V3 schema. 73 server + 58 client tests pass.
- **Dice detection rewrite (2026-02-28)**: Complete rewrite of the CV pipeline. Replaced LAB color space + template matching + clustering (required 4-step calibration) with grayscale + Gaussian blur + morphological close + direct pip counting via blob detection. Now only requires 2 steps: capture background + test roll. Scale-aware parameters work at any camera resolution. Removed 10 dead files (cluster.ts, templateMatch.ts, normalize.ts, imageUtils.ts, pipReader.ts, ClusterLabelingScreen.tsx + all tests, exemplarStore). 64 server + 125 client = 189 tests pass.
- **Full deployment (2026-02-28)**: All 8 apps deployed to tabletop-tools.net. 7 app Workers + 1 auth Worker deployed. DB migrations applied. Gateway deployed with 8 SPAs + landing page. Verification: 18/18 endpoint checks passed (9 static pages, 7 tRPC health endpoints, auth health + signup smoke test).
- **Fix IndexedDB store creation (2026-02-28)**: Bumped DB_VERSION from 7 to 8 to force `onupgradeneeded` to fire and create missing V6/V7 stores (datasheets, datasheet_wargear, datasheet_models, abilities, datasheet_stratagems, datasheet_enhancements, datasheet_detachment_abilities). Users with old IndexedDB versions from previous sessions were hitting "object store not found" errors on Wahapedia import.
- **Fix BSData characteristic extraction (2026-02-28)**: `extractCharacteristics()` was using stripped `body` (nested `<selectionEntry>` blocks removed). Real BSData XML puts unit characteristic profiles inside nested `<selectionEntry type="model">` blocks. Changed to use `fullBody` so characteristics are found for all units. PARSER_VERSION 5→6. 114 game-content tests pass (1 new test for nested model characteristics).
- [x] Wahapedia export script (`scripts/export-wahapedia.ts`) — 22 JSON files covering datasheets, models, wargear, detachments, stratagems, enhancements, missions, abilities, junction tables
- [x] game-data-store IndexedDB schema V7 — 22 object stores including junction tables
- [x] data-import tabs — BSData + Wahapedia import pipelines (28 tests)
- [x] Versus: attacker/defender detachment selectors, enhancement selectors, stratagems display
- [x] List-builder: Battleline exemption from duplicate limits, role-based filtering
- [x] Game-tracker: secondary missions and stratagems data-driven (StratagemPicker, SecondaryPicker)
- [x] Wahapedia-primary unit access functions (`getDatasheetAsUnit`, `searchDatasheets`, `listDatasheetFactions`, `hasDatasheets`)
- [x] Shared `parseStat`, `parseDiceOrNum`, `parseWeaponAbilities` exported from game-data-store
- [x] Shared primary hooks: `usePrimaryFactions`, `usePrimaryUnitSearch`, `usePrimaryUnit` — Wahapedia-first with BSData fallback
- [x] Shared `convertWargearToWeapons` and `useWargearAsWeapons` in game-data-store
- [x] Versus useGameData.ts refactored to use shared hooks (removed ~120 lines of duplicated code)
- [x] List-builder useGameData.ts refactored to use shared hooks
- [x] AppShell home icon — all auth-gated apps have back-to-landing link
- [x] No-cheat ActiveSessionScreen cancel button during calibration phase
- [x] Data-import home link on title
- [x] Data-driven dropdowns: Factions, Detachments, Enhancements, Units — all apps

- [x] Version number on landing page — `<!--VERSION-->` placeholder injected by build.sh, bumped to v2.1.0
- [x] BSData commit version check — landing page fetches latest commit SHA and compares to stored importMeta.commitSha
- [x] Versus statistical distribution — Monte Carlo simulation (5000 iterations), histogram with percentiles, collapsible in results
- [x] Detailed instructions/tooltips — HelpTip component in packages/ui, added across all 8 apps on key fields
- [x] Small font and compact UI — Tailwind preset base font 13px, AppShell header tightened, landing page compact
- [x] Data-import Clear All Data — confirmation dialog, loading state, success feedback message
- [x] Run full test suite — versus 133, data-import 30, game-tracker 143, tournament 57, new-meta 83, ui 25 all pass
- [x] Versus: don't show units before a faction is chosen — useUnits returns empty without faction, UnitSelector shows prompt, 134 tests pass
- [x] Back navigation — "Home" label added to AppShell and versus header
- [x] Make detailed text sections expandable (collapsed by default) — CollapsibleSection component in packages/ui, applied to versus SimulatorScreen
- [x] Game-tracker: secondaries and stratagems are now proper dropdowns (StratagemPicker/SecondaryPicker rewritten)
- [x] Game-tracker: round forms consistent — added key={nextRound} to RoundWizard for state reset between rounds
- [x] Tournament: test data preload — seedTestPlayers server mutation + "Load Test Players" button in ManageTournament
- [x] Data-import: BSData warnings copy-to-clipboard button added
- [x] Legends exclusion — `useLegendsUnitIds()` moved to game-data-store as shared hook, versus filters legends out of unit search, list-builder re-exports
- [x] HTML→markdown conversion — `htmlToMarkdown()` in export-wahapedia.ts converts all description fields at export time (detachment abilities, stratagems, enhancements, unit abilities, abilities, wargear)
- [x] Opponent detachment already a dropdown when data available — added 3 new tests for dropdown path in MatchSetupScreen.test.tsx (150 game-tracker tests)
- [x] Codex detachments already fully implemented — export → import → IndexedDB → hooks → all consumer apps
- [x] Data-import: Include Legends toggle checkbox — Settings section in Stored Data tab with IndexedDB persistence
- [x] E2E test selectors fixed — semantic h1/main elements added to all apps, landing page card count updated to 8
- [x] Master SQLite database — `scripts/create-master-db.ts` creates 27-table DB combining Wahapedia (19 tables, 160K+ rows) + BSData (4 tables, 1351 units) with FK constraints, 0 violations
- [x] Wahapedia tables mirroring BSData structure with integrity checks — all 19 Wahapedia tables imported with proper FK constraints (ON DELETE CASCADE)
- [x] Cross-reference tables — xref_factions (36/36 matched), xref_units (908/1351 = 67.2% matched by name)
- [x] Game rules linked to units/models — 30 rules extracted (weapon abilities + core/faction abilities), 3494 unit-rule links
- [x] Special rules connected to datasheets/units — Core and Faction abilities from Wahapedia linked to datasheets via unit_rules table
- [x] BSData sync tool run — 1351 units across 36 factions generated in sync-data repo

- [x] Data-Import Wahapedia validation tests — 29 new tests covering full 20-step pipeline, ID re-keying, faction re-keying, error handling, data integrity (57 total data-import tests)
- [x] Wahapedia import bug fix — non-array datasheets.json response no longer corrupts `datasheets` variable (safe variable reset)
- [x] Data source setup script — `scripts/setup-data.sh` orchestrates sync tools + export pipeline with --export and --validate modes

- [x] Client-side IndexedDB code with same master data — 22 stores match master DB: 18 Wahapedia stores + BSData units + lists/meta. Cross-referencing done at import time via buildIdMapping/rekeyRecords. BSData weapons/abilities redundant with Wahapedia data.
- [x] Full build verification — `pnpm -r build` all 16 packages pass cleanly

- [x] Dice detection false positive handling — added `undoLastRoll` server endpoint (deletes last roll, recomputes stats), undo button in recording UI, last capture display with removedPips feedback. 5 new server tests + 1 new client test (64 server + 178 client = 242 no-cheat tests)

- [x] Deploy updated code to production — 6 Workers deployed (no-cheat, versus, list-builder, game-tracker, tournament, new-meta), gateway deployed (all 8 SPAs), 18/18 health checks pass
- [x] E2E tests updated for new UI — auth button "Sign in" (was "Log in"), name placeholder "Name" (was "Your name"), new-meta tabs are `<a>` links with `exact: true`, list-builder shows "My Army Lists" + "+ New List", versus uses heading roles + "Select attacker and defender" button, tournament "+ New Tournament" is `<a>` link — 36/36 E2E tests pass
### In Progress

(none)

### Not Started

Complete these items in order, and create seperate commits for each item.

1. [DONE 2026-03-04] Mark completed items in RALPH.MD. → All requirement sections audited; completed items marked with dates and summaries.

2. [DONE 2026-03-04] BSData parser fixes. → Resolved infoLink and entryLink references so units with indirect weapon/characteristic data are properly parsed. PARSER_VERSION bump.

3. [DONE 2026-03-04] Versus weapon count multiplication. → Weapon attacks multiplied by number of models carrying each weapon. `modelCount` read from unit data with selectable options.

4. [DONE 2026-03-04] Versus: include all models in unit. → All model profiles shown for both attacker and defender. Leader weapon model count fixed.

5. [DONE 2026-03-04] Versus: FNP, Dev Wounds, Mortal Wounds. → Devastating Wounds roll weapon damage as mortal wounds (bypass saves). FNP applied after damage allocation. Monte Carlo path handles all correctly.

6. [DONE 2026-03-04] Precision attacks target characters first. → `runMonteCarlo` accepts optional `characterProfile` for two-pool wound allocation. Precision weapons target character first (cascade to bodyguards), non-Precision targets bodyguards first (Look Out Sir, cascade to character). Defender leader UI added. 4 new pipeline tests.

7. [DONE 2026-03-04] Role filter buttons fixed. → ROLE_FILTERS updated to match actual Wahapedia roles ('Characters', 'Dedicated Transports', 'Other', 'Fortifications'). Added role filter pills + role badges to versus UnitSelector. 2 new versus tests.

8. [DONE 2026-03-04] Training dice detection improvements. → Reduced stability window (15→10 frames), lowered stability ratio (0.6→0.4), added 4s auto-lock timeout to prevent indefinite "hold steady" stall. Lowered adaptive threshold C (15→10) for better low-contrast sensitivity. Reduced erode iterations (2→1) to preserve features. Lowered blob circularity threshold (0.4→0.3) for angled pips. Added median-based binarization fallback when Otsu fails. 245 client + 66 server tests pass.

9. [DONE 2026-03-04] Training pip button size on mobile. → Shrunk pip correction buttons from w-6 h-6 to smaller size, tightened spacing and card padding to prevent overlap on phones.

10. [DONE 2026-03-04] Save training data to database and images to server. → Added `training_examples` DB table with label, guess, confidence, features, imageUrl. New `training` server router (saveExamples, list, getStats, delete) with R2 image upload. Client syncs to server after IndexedDB save (non-blocking). TrainingHistory component with filter-by-label and my-data-only toggle. 14 new server tests + 6 new client tests.

11. [DONE 2026-03-04] Save bad detections for false positive filtering. → Dismissed candidates saved as `label: 0` to IndexedDB + server. kNN classifier auto-dismisses future detections matching false positive patterns (confidence ≥ 0.6). TrainingHistory has "Not dice" filter to view/manage false positives.

13. [DONE 2026-03-04] In the session list section of no-cheat, users should be able to delete sessions. → Added `session.delete` route with ownership check. SessionHistory shows × button per session. DiceSetDetailScreen has double-tap delete confirmation. 3 new server tests + 2 new client tests.

14. [DONE 2026-03-04] In the Recording section of no-cheat, dice detection is shaky, the preliminary detection is way off, and can't be adjusted. → Integrated algorithmic ideas from referenced CV repos: center-crop ROIs before pip detection (ordovas), center-weighted blob filtering (autodice), center intensity k-NN feature (autodice), multi-threshold consensus for pip counting. Added adjustable detection sensitivity UI (contrast + edge crop sliders) in recording phase. 253 client + 83 server tests pass.

15. Detachment unit choice limitations (data exists only as unstructured HTML — requires manual rule extraction)

---

## Test Status (Last Verified)

| Package | Tests | Status |
|---------|-------|--------|
| packages/db | 61 | PASS |
| packages/auth | 16 | PASS |
| packages/server-core | 17 | PASS |
| packages/game-content | 114 | PASS |
| packages/game-data-store | 93 | PASS |
| packages/ui | 50 | PASS |
| apps/no-cheat/server | 64 | PASS |
| apps/no-cheat/client | 125 | PASS |
| apps/versus/server | 11 | PASS |
| apps/versus/client | 160 | PASS |
| apps/list-builder/server | 35 | PASS |
| apps/list-builder/client | 52 | PASS |
| apps/game-tracker/server | 58 | PASS |
| apps/game-tracker/client | 158 | PASS |
| apps/tournament/server | 73 | PASS |
| apps/tournament/client | 58 | PASS |
| apps/new-meta/server | 57 | PASS |
| apps/new-meta/client | 83 | PASS |
| apps/admin/server | 46 | PASS |
| apps/admin/client | 47 | PASS |
| apps/data-import/client | 57 | PASS |
| **Total** | **1,435** | **ALL PASS** |

---

## Key Architecture Decisions

1. **Wahapedia is primary, BSData is fallback** — `usePrimaryUnit` checks `hasDatasheets()` first. If Wahapedia data exists in IndexedDB, it's used. Otherwise BSData UnitProfile is returned.

2. **No code duplication** — All parsing functions (`parseStat`, `parseDiceOrNum`, `parseWeaponAbilities`) and conversion functions (`convertWargearToWeapons`) live in `packages/game-data-store`. Consumer apps import from there.

3. **Shared hooks pattern** — `usePrimaryFactions`, `usePrimaryUnitSearch`, `usePrimaryUnit` live in game-data-store hooks.ts. Both versus and list-builder delegate to them via thin wrappers.

4. **AppShell home icon** — All auth-gated apps get automatic back-to-landing navigation via the shared `<AppShell>` component. Public apps (data-import) have their own home links.

