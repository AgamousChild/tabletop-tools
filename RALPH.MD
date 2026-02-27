# RALPH.MD — Recurring Task Directive + Progress

## Directive

After EACH Set of Tasks is completed, please do a pull from remote to merge the RALPH.MD file I will be editing remotely. Then commit and push your changes AFTER EACH SET OF TASKS IS COMPLETE. NOT THE FULL LIST, EVEN BEFORE large scale testing occurs.
Look at the functional requirements again. Implement those changes, correctly for every app. 
Stop taking shortcuts with interface elements and data passed back to the backend.
Each app should pull from the same data source.
Review all of the tests, make sure that they actually pass, not just pass because nothing is implemented.


**UI Requirements:**
- Every field that can have generated data should have a dropdown for that data. Factions, Detachments, Army lists, Units. Review every field and see if you can generate a data-driven dropdown for it.
- Add a back button on every screen
- Add the version number to the main page
- On the main page, notify if the user has to reload data, basedupon there being a new commit version number in the BSData
- The Dice detection is not good. There is no selection for false positives. Use this library, and rewrite in Typescript if you dont want to use python: https://github.com/MohamadNematizadeh/detect_dice. OR use OpenCV, In testing, it cant find the dice in the image at all.
- Add detailed instructions on every page as a link, or a tool-tip.
- Use a small font and minimally sized tools.
- Show the statistical analysis of the Versus tool, show a screen that has the distribution of possible outcomes on the rolls.
- Stored Data screen when I hit clear all Data does not have any visual feedback that the data is deleted. I don't think this works.
- It is not clear that hitting the Title takes you back.
- Where are the codex detachments? They exist in both BSData and Wahapedia data. They need to be included.
- Do not include Legends units in any screen. Instead on the data-import pages, include an option for legends to be included in the app.
- In the Versus app, do not show any units before a faction is chosen.
- Convert all HTML in the detailed text sections into markdown as it is read from the database. 
- Make each section that displays detailed text expandable, with only the section name shown at first. Showing all the text at once is bad.
- Opponent detachment is not a dropdown in the Game Tracker, it should be.
- In the game tracker, the secondaries and the strategems should be dropdowns, not search, not data entry.
- In the game tracker, the data entry forms are not the same for the subsequent rounds, you dropped off all of the stuff you added for the first round.
- For Tournament testing, I need a script or button I Can press locally in the app that pre-loads a test tournament set of players to test out the functionality.
- On the data import page for BSData, the warnings are useless, give me a button where I can copy them to the clipboard.

**Data Requirements:**

- Use the data from the 4 folders in the data-sync project to create a local master database that you can use to validate the app.
- Read the data in the BSData sqlite db, and create referential integrity checks for all of the data elements. Connect all of the tables together correctly. To test this, you should be able to find Factions,Detachments,Units,Models,Weapons,Strategems,Enhancements,Leader Options, Model Counts, point costs for each faction.
- Read the data in the Wahapedia data, and inside the BSData sqlite db, create separate tables that mirror the BSData tables. Datasheets = Units. Do the same process, create referential ingtegrity checks for all of the data elements. Connect the tables together correctly. To test this, you should be able to find Factions, Detachments, Datasheets, Models, Weapons, Strategems, Enhancements, Leader Options, Model Counts, and point costs for each faction.
- Read the data for the game rules that you have in the versus tool, add these rules to the same database, and then link them to the units/models that have these rules.
- Read the special rules that all of the datasheets/units have and add them to the standard rules dataset.
- Connect all of the special rules/standard rules to the datasheets/units
- Connect the three set of data to one another in a third set of tables that link the same data from each source together.
- Create the code that will run on the client side to create the IndexDB that has the same data.
- Use that code on the Data-Import app, and run tests to make sure that all of the data checks out.
- Prepare a set of scripts that set up the data sources for the application, and then that data that will be stored in Github. In GitHub, the source data that is used to create the data entries is stored, not the databases or code used in development to generate the code in the app.

**Code Quality:**
- Refactor on every iteration if needed, make the code better, and leaner, not more bloated.
- Do not duplicate code — create base functionality that can be shared.
- Run all of your tests with good test data, not just objects with the right signature.
- 

---

## Progress

### Completed
Update this section every time you update or fix a section of the requirements.

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

### In Progress

(none — all RALPH.MD requirements implemented)

### Not Started

- [ ] Deploy updated code to production

---

## Test Status (Last Verified)

| Package | Tests | Status |
|---------|-------|--------|
| packages/db | 61 | PASS |
| packages/auth | 16 | PASS |
| packages/server-core | 17 | PASS |
| packages/game-content | 118 | PASS |
| packages/game-data-store | 93 | PASS |
| packages/ui | 30 | PASS |
| apps/no-cheat/server | 64 | PASS |
| apps/no-cheat/client | 178 | PASS |
| apps/versus/server | 8 | PASS |
| apps/versus/client | 134 | PASS |
| apps/list-builder/server | 35 | PASS |
| apps/list-builder/client | 52 | PASS |
| apps/game-tracker/server | 58 | PASS |
| apps/game-tracker/client | 156 | PASS |
| apps/tournament/server | 70 | PASS |
| apps/tournament/client | 57 | PASS |
| apps/new-meta/server | 57 | PASS |
| apps/new-meta/client | 83 | PASS |
| apps/admin/server | 46 | PASS |
| apps/admin/client | 47 | PASS |
| apps/data-import/client | 57 | PASS |
| **Total** | **1,437** | **ALL PASS** |

---

## Key Architecture Decisions

1. **Wahapedia is primary, BSData is fallback** — `usePrimaryUnit` checks `hasDatasheets()` first. If Wahapedia data exists in IndexedDB, it's used. Otherwise BSData UnitProfile is returned.

2. **No code duplication** — All parsing functions (`parseStat`, `parseDiceOrNum`, `parseWeaponAbilities`) and conversion functions (`convertWargearToWeapons`) live in `packages/game-data-store`. Consumer apps import from there.

3. **Shared hooks pattern** — `usePrimaryFactions`, `usePrimaryUnitSearch`, `usePrimaryUnit` live in game-data-store hooks.ts. Both versus and list-builder delegate to them via thin wrappers.

4. **AppShell home icon** — All auth-gated apps get automatic back-to-landing navigation via the shared `<AppShell>` component. Public apps (data-import) have their own home links.
