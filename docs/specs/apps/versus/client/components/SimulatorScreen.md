# apps/versus/client/src/components/SimulatorScreen.tsx

> Main screen — orchestrates unit selection, weapon configuration, and simulation execution.

## Prompt

Write the main simulator screen component for a Warhammer 40K combat calculator. This is the largest component in the versus app (~500 lines) and orchestrates all the sub-components.

### Props

`onSignOut: () => void`

### State management

Manage with `useState`:
- `attackerFaction`, `defenderFaction` — selected faction strings
- `attackerQuery`, `defenderQuery` — unit search strings
- `attackerUnitId`, `defenderUnitId` — selected unit IDs (string | null)
- `attackerLeaderId` — optional leader attachment (string | null)
- `attackType` — 'ranged' | 'melee'
- `selectedWeapons` — `Set<number>` (indexes of selected weapon profiles)
- `extraRules` — `WeaponAbility[]` (user-added special rules)
- `modelOption` — selected `ModelOption | null` (model count/points)
- `defenderModelCount` — number
- `showDistribution` — boolean (toggle Monte Carlo view)
- `showLegends` — boolean (include Legends units)

### Data loading

Use the wrapper hooks from `./lib/useGameData`:
- `useGameFactions()` for faction list
- `useUnits({ faction, name }, showLegends)` for unit search
- `useGameUnit(id)` for full unit profile
- `useGameDatasheetWeapons(id)` for weapon profiles
- `useGameDatasheetModels(id)` for stat lines
- `useGameUnitAbilities(id)` for abilities
- `useGameUnitKeywords(id)` for keywords
- `useGameUnitCompositions(id)` for model counts
- `useGameUnitCosts(id)` for points costs
- `useGameLeadersForUnit(unitId)` for leader options
- `useGameDataAvailable()` to check if game data is imported

### Wahapedia stat resolution

When Wahapedia `DatasheetModel` stats are available, merge them into the `UnitProfile` using a `resolveUnitFromModel` helper. Wahapedia stats are authoritative over BSData when non-zero (BSData may have parse failures that result in 0).

Define `parseModelStat(val: string): number` to parse Wahapedia stat strings like "4+", "6\"" to numbers.

### Simulation execution

Use `useMemo` to compute results only when inputs change:
1. Filter weapons by `attackType` (ranged: `range !== 'melee'`, melee: `range === 'melee'`) and `selectedWeapons` Set
2. For each selected weapon, call `simulateWeapon()` from the pipeline
3. Aggregate: sum expectedWounds and expectedModelsRemoved across weapons
4. If `showDistribution`, call `runMonteCarlo()` with all selected weapons

### Leader attachment

When a leader is selected:
1. Load their abilities via `useGameUnitAbilities(leaderId)`
2. Call `extractLeaderRules(abilities)` to get simulation-relevant rules
3. These auto-apply as extra rules in the simulation

### Layout

Two-column layout on desktop (attacker left, defender right), stacked on mobile. Uses the shared dark theme (slate-950 background, amber-400 accents).

Sections from top to bottom:
1. Header with app title and sign-out button
2. Data import prompt (if `useGameDataAvailable()` returns false)
3. Attacker `<UnitSelector>` + `<UnitProfileCard>` (if unit data shows stats)
4. Leader attachment dropdown (if unit supports leaders)
5. `<WeaponSelector>` with ranged/melee toggle
6. `<SpecialRulesEditor>` with auto-applied leader rules
7. Defender `<UnitSelector>` + `<UnitProfileCard>`
8. Model count selector for defender
9. `<SimulationResult>` with per-weapon breakdown and distribution toggle
10. Save button (calls `trpc.simulate.save.useMutation()`)

### tRPC integration

Use `trpc.simulate.save.useMutation()` to persist results. On save, serialize the result and weapon config. Show the mutation's loading/success state.

## Dependencies

- `react` — `useState`, `useMemo`, `useCallback`, `useRef`, `useEffect`
- `@tabletop-tools/game-content` — `WeaponAbility`, `WeaponProfile`, `UnitProfile` (types)
- `@tabletop-tools/game-data-store` — `useGameDataAvailable`, `useUnitCompositions`, `DatasheetModel` (type)
- `@tabletop-tools/ui` — `HelpTip`, `CollapsibleSection`, `htmlToText`
- `./lib/auth` — `authClient`
- `./lib/trpc` — `trpc`
- `./lib/useGameData` — all hooks
- `./lib/leaderAbilities` — `extractLeaderRules`
- `./lib/modelCount` — `parseModelCount`, `parseModelOptions`, `ModelOption`
- `./lib/rules/pipeline` — `simulateWeapon`, `runMonteCarlo`, `SimResult`, `DistributionData`
- `./SimulationResult` — component + `WeaponBreakdown` type
- `./UnitSelector` — component
- `./WeaponSelector` — component
- `./SpecialRulesEditor` — component
