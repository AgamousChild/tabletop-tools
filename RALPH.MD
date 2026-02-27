# RALPH.MD — Recurring Task Directive + Progress

## Directive

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
Update this section every time you update or fix a section of the requirements. I moved all of your "Completed" items to "In Progress" - Re-review them and give them another pass before setting them to completed.


### In Progress

- [ ] Run full test suite and fix any remaining failures
- [ ] Add version number to landing page
- [ ] Add data reload notification to landing page
- [ ] Wahapedia export script (`scripts/export-wahapedia.ts`) — 19 JSON files covering datasheets, models, wargear, detachments, stratagems, enhancements, missions, abilities, junction tables
- [ ] game-data-store IndexedDB schema V7 — 22 object stores including junction tables (datasheet_stratagems: 84K, datasheet_enhancements: 10K, datasheet_detachment_abilities: 15K)
- [ ] data-import tabs — BSData + Wahapedia import pipelines (28 tests)
- [ ] Versus: attacker/defender detachment selectors, enhancement selectors, stratagems display
- [ ] List-builder: Battleline exemption from duplicate limits, role-based filtering
- [ ] Game-tracker: secondary missions and stratagems already data-driven (StratagemPicker, SecondaryPicker)
- [ ] Wahapedia-primary unit access functions in store.ts (`getDatasheetAsUnit`, `searchDatasheets`, `listDatasheetFactions`, `hasDatasheets`)
- [ ] Shared `parseStat`, `parseDiceOrNum`, `parseWeaponAbilities` exported from game-data-store (no duplication)
- [ ] Shared primary hooks in game-data-store: `usePrimaryFactions`, `usePrimaryUnitSearch`, `usePrimaryUnit` — Wahapedia-first with BSData fallback
- [ ] Shared `convertWargearToWeapons` and `useWargearAsWeapons` in game-data-store
- [ ] Versus useGameData.ts refactored to use shared hooks (removed ~120 lines of duplicated parsing code)
- [ ] List-builder useGameData.ts refactored to use shared hooks
- [ ] AppShell home icon — all auth-gated apps now have a back-to-landing link
- [ ] No-cheat ActiveSessionScreen cancel button during calibration phase
- [ ] Data-import already has home link on title

### Not Started

- [ ] Full build verification (`pnpm -r build`)
- [ ] Commit all changes
- [ ] Push and deploy

---

## Test Status (Last Verified)

| Package | Tests | Status |
|---------|-------|--------|
| packages/game-data-store | 93 | PASS |
| packages/ui | 25 | PASS |
| apps/versus/client | 129 | PASS |
| apps/list-builder/client | 52 | PASS |
| Others | — | Not yet verified this session |

---

## Key Architecture Decisions

1. **Wahapedia is primary, BSData is fallback** — `usePrimaryUnit` checks `hasDatasheets()` first. If Wahapedia data exists in IndexedDB, it's used. Otherwise BSData UnitProfile is returned.

2. **No code duplication** — All parsing functions (`parseStat`, `parseDiceOrNum`, `parseWeaponAbilities`) and conversion functions (`convertWargearToWeapons`) live in `packages/game-data-store`. Consumer apps import from there.

3. **Shared hooks pattern** — `usePrimaryFactions`, `usePrimaryUnitSearch`, `usePrimaryUnit` live in game-data-store hooks.ts. Both versus and list-builder delegate to them via thin wrappers.

4. **AppShell home icon** — All auth-gated apps get automatic back-to-landing navigation via the shared `<AppShell>` component. Public apps (data-import) have their own home links.
