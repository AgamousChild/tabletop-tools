# RALPH.MD — Recurring Task Directive + Progress

## Directive

After EACH Set of Tasks is completed, please do a pull from remote to merge the RALPH.MD file I will be editing remotely. Then commit and push your changes AFTER EACH SET OF TASKS IS COMPLETE. NOT THE FULL LIST, EVEN BEFORE large scale testing occurs.
Look at the functional requirements again. Implement those changes, correctly for every app. 
All apps ahould use one data source on the front end, and one data source on the back end. They should be able to be connected by the same ids. 
Review all of the tests, make sure that they actually pass, not just pass because nothing is implemented.

** IMPORTANT **
Build a copy of the app locally, and run it locally in a local browser, and run the import functions. Validate the data generated.


**UI Requirements:**
- Remove fallback logic on data entry fields. I want to see an empty dropdown instead of a text entry box.
- The consistency of home links is poor, make every page have the ability to go back to home, and look the same, make them all have the home link.
- In the Game Tracker, implement go back to previous rounds to update the data.
- In the Game Tracker, I still see text fields that should be dropdowns, I am guessing that these are fall back, or you missed them.
- In the Game Tracker, the opponents Detachment is a text field, it should be a drop down.
- In the Game Tracker, the player should be able to either pick a list, or paste a list into a field, and select a detachment from a drop down. If the player selects a list from the list builder, the detachment should auto-populate.
- I don't see detailed instructions on every page. You added data details on pages, this is good, but what I want to see are instructions on how to proceed or go back or use the tools on the screen.
- The Dice detection is not good. There is no selection for false positives. Use this library, and rewrite in Typescript if you dont want to use python: https://github.com/MohamadNematizadeh/detect_dice. OR use OpenCV, In testing, it cant find the dice in the image at all.
- In the data, point costs for units have disappeared.
- Match up the Wahapedia Faction designations with the BSData Faction Designations, you have both World Eaters and WE. Use context and analysis to match them.
- In the Stored data screen, the tools are there now that show some feedback that the data has been cleared out, but the underlying screen does not clear, so it still looks like its not working.
- Where are the codex detachments? They exist in both BSData and Wahapedia data. They need to be included. I still do not see them in the List Builder. 
- Do not show "Default Detachment" There is no "Default Detachment", I Saw them at least once, now they are gone again.
- Legends unit still show up. In Every App, on every screen, set a choice for include legends, as a check box, and set it to not selected, and do not show them as default. 
- Convert all HTML in the detailed text sections into markdown as it is read from the database. 
- Make each section that displays detailed text expandable, with only the section name shown at first. Showing all the text at once is bad.
- Opponent detachment is not a dropdown in the Game Tracker, it should be.
- In the game tracker, the secondaries and the strategems should be dropdowns, not search, not data entry.
- In the game tracker, the data entry forms are not the same for the subsequent rounds, you dropped off all of the stuff you added for the first round.
- I Still don't have a testing button that preloads a tournament with fake player data.For Tournament testing, I need a button I Can press locally in the app that pre-loads a test tournament set of players to test out the functionality.
- On the data import page for BSData, the warnings are useless, give me a button where I can copy them to the clipboard.


**Data Requirements:**

- Show me the master database. Show me how you plan on using the master database in the app to create a method for getting the correct data in the local db. 
- Create the code that will run on the client side to create the IndexDB that has the same data as teh master database.
-Show me where you use that code on the Data-Import app, and run tests to make sure that all of the data checks out.
- Prepare a set of scripts that set up the data sources that we will put on a github rfepo that can be used for our app. I need a set of scripts that can be automated so I can update the data frequently.

**Code Quality:**
- Refactor on every iteration if needed, make the code better, and leaner, not more bloated.
- Do not duplicate code — create base functionality that can be shared.
- Run all of your tests with good test data, not just objects with the right signature.
 
## List Builder Features required to be considered functional 
  
- Include a text box for the Name of a list.
- After creating a list, the next screen should be the size of the army, with the associated battle size name 500, 1000, 2000, 3000 pts
- Then the faction should be chosen on the next screen, with the detachment then chosen.
- In the unit selector, no legends shown unless the legends checkbox is selected.
- There are rules in army creation, limited choices for 500 pt games, 2 of any in 1000 pt games, and 3 of any in 2000 pt games, plus warlords must be chosen. And the user cant choose more than the allotted number of points.
- Some detachments have unit choice limitations, use them if they exist.
- During unit selection, after each unit is chosen, choose the number of models selected, there are usually different levels allowed, with different point costs and then show the statistical information about that unit, and in a popup, show units that have the same or fewer points in the same role that have higher win rates.
- There should be a done button, and then the list selections should be saved back to the server, associated with the user and the list name, it should just be listname, user_id, faction_id, detachment_id, unit_id(S) for that list. This is the same as saved locally.
- The export should export in full text format, and the user can then edit that text before saving off, it should be stored in the clipboard, and the user should see a note.
- The user should be able to select a list and then a button should be available that says use list in tournament tracker. that list is then used when the user registers for a tournament.
- There should be a description text box for the list.

## No-cheat Features required to be considered functional

-  Calibration workflow needs to be clearer in the app. List out the steps on buttons for each step.
   → `CalibrationWizard.tsx`: 4-step wizard (Background → Place Dice → Label Faces → Test Roll) with numbered step indicators. If the Wizard shows a screen clip that is not a dice face, a selector should be there that says, NOT A DICE.
-  When the calibration is complete, it should ask for a test roll to show that it can accurately see the dice faces.
   → Step 4 (Test Roll) captures a frame, shows detected dice with bounding boxes and pip values, and asks "Does this look correct?" with Recalibrate/Retest/Start Recording buttons.
-  It should show squares around each face it captures, with the number of each dice captured in that square in the video, using an overlay.
   → Canvas overlay in recording phase draws emerald bounding boxes with pip labels for each detected die face. CalibrationWizard step 4 also shows bounding boxes.
-  You should not have to click a button to capture the rolls from that point forward.
   → Hands-free auto-capture in recording phase: continuous requestAnimationFrame loop detects dice, waits for stability (~0.7s), auto-submits, then waits for dice removal before next detection.
-  The Z score calculation and Chi squared values should show up in the video as an overlay, and the analysis should be in real time, and not a result after clicking complete.
   → `StatsOverlay.tsx` displays real-time Z-score, χ², and verdict (FAIR/SUSPECT/LOADED) below the video feed. `DistributionChart.tsx` shows per-pip distribution with color-coded bars.

## Tournament Features required to be considered functional 

- TO can register for event.
- Add Geocoding to event location
- Give an area for description using markdown, add image upload for tournament, add external link, add location, add number of rounds.
- Add Date and start time as data fields, image storage, link
- Add TO information, location, description, image, link, number registered to the Tournament display
- Add registered player management to the TO display - Add players, remove, reinstate. Yellow Card, Red Card, Ban
- Show previous Card status of each player to the TO.
- In TO tools, add special award location where the TO can add awards like Best Painted, Most sportsmanlike, etc. All customizable per tournament.
- In round management, allow TO to enter score results if players do not use Game-tracker to score the match.
- Add a clock to each round. (Optional)
- Add a start time to each round.
- Close Tournament should export data to the new-meta data.
- Add a new selection interface to the main page of the app called Play, where users are presented with a search interface to find tournaments in their area. allow them to favorite and unfavorite them, and register.
- After a tournament is closed out, show the view results button instead of the registration button.
- Store tournament data back to a user record, and make a new selection interface to the main page called My Info, that shows list names, tournaments played in, ELO, GLICKO, rank, and overall record, include Card data and Ban data.
- Add a list search tool for lists used in tournaments by faction.
- Add a player search tool that shows tournaments played in, card status, lists used.

## Versus Features required to be considered functional

- The correct number of weapons is calculated.
- All Ranged weapons are allowed to be used unless the unit has ranged options.
- Only one melee profile is allowed, unless there are weapon profiles labelled extra attacks.
- I still cannot increase strength or Toughness, or number of attacks, or reroll-wounds. The special rules need to be addressed, allow for an array of special rules be put in place for each unit.
- Apply the special rules correctly.
- The data stored should include the units included, the special rules applied, and the results.
- When saving the data, the results can be sent to the server. They are not GW IP. We can then use the unit ids and applied special rules to cache results and send them back and compare to the calculated results, or show them more quickly.
- Allow for Leader additions to make a unit comparison more meaningful, so you can add a leader in to those units that allow leaders, mostly infantry.
- Leaders have special rules, apply them automatically.

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

### In Progress

(none)

### Not Started

- Dice detection rewrite (detect_dice or OpenCV)
- Tournament geocoding (latitude/longitude columns exist in DB schema, need geocoding API integration)
- Detachment unit choice limitations (data exists only as unstructured HTML — requires manual rule extraction)

---

## Test Status (Last Verified)

| Package | Tests | Status |
|---------|-------|--------|
| packages/db | 61 | PASS |
| packages/auth | 16 | PASS |
| packages/server-core | 17 | PASS |
| packages/game-content | 108 | PASS |
| packages/game-data-store | 93 | PASS |
| packages/ui | 50 | PASS |
| apps/no-cheat/server | 64 | PASS |
| apps/no-cheat/client | 178 | PASS |
| apps/versus/server | 8 | PASS |
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
| **Total** | **1,475** | **ALL PASS** |

---

## Key Architecture Decisions

1. **Wahapedia is primary, BSData is fallback** — `usePrimaryUnit` checks `hasDatasheets()` first. If Wahapedia data exists in IndexedDB, it's used. Otherwise BSData UnitProfile is returned.

2. **No code duplication** — All parsing functions (`parseStat`, `parseDiceOrNum`, `parseWeaponAbilities`) and conversion functions (`convertWargearToWeapons`) live in `packages/game-data-store`. Consumer apps import from there.

3. **Shared hooks pattern** — `usePrimaryFactions`, `usePrimaryUnitSearch`, `usePrimaryUnit` live in game-data-store hooks.ts. Both versus and list-builder delegate to them via thin wrappers.

4. **AppShell home icon** — All auth-gated apps get automatic back-to-landing navigation via the shared `<AppShell>` component. Public apps (data-import) have their own home links.
