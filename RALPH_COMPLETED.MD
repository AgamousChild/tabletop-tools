Here are the items that Claude says he completed:
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