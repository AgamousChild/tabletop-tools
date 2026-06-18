# apps/versus/client/src/components/SpecialRulesEditor.tsx

> Add/remove special rules (weapon abilities) that modify the simulation.

## Prompt

Write a React component for managing additional weapon abilities applied to a combat simulation. Users can add rules from a dropdown and remove them. Leader-sourced rules are shown read-only.

### Types

Export `LeaderRule = { rule: WeaponAbility; source: string }`.

### Props

`rules` (WeaponAbility[]), `weaponAbilities?` (string[]), `leaderRules?` (LeaderRule[]), `onAdd`, `onRemove`.

### Rule options

Define a `RULE_OPTIONS` array of `{ label: string; create: () => WeaponAbility }` with these entries:
- Sustained Hits 1, Sustained Hits 2
- Lethal Hits, Devastating Wounds
- Re-roll all hits, Re-roll hits of 1, Re-roll wounds
- Twin-linked
- +1 to hit, -1 to hit, +1 to wound, -1 to wound
- +1 strength, +2 strength
- +1 toughness, +2 toughness, -1 toughness
- +1 attacks, +2 attacks

### Rule label helper

`ruleLabel(rule: WeaponAbility): string` — switch on rule.type to produce display strings (same mapping as WeaponSelector's `formatAbilities`).

### Layout

1. **Active weapon abilities** (read-only): if `weaponAbilities` provided, show them as tags
2. **Leader rules** (read-only): if `leaderRules` provided, show each with source label
3. **User-added rules**: show each with a remove (×) button
4. **Add rule dropdown**: `<select>` with RULE_OPTIONS, calls `onAdd` with the created ability

## Dependencies

- `react` — `useState`
- `@tabletop-tools/game-content` — `WeaponAbility` (type)
