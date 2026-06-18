# apps/versus/client/src/lib/leaderAbilities.ts

> Parse leader ability descriptions to extract simulation-relevant weapon rules.

## Prompt

Write a module that parses text descriptions of Warhammer 40K leader abilities and extracts `WeaponAbility` objects that the simulation pipeline can use.

### Pattern matching engine

Define an array of `AbilityPattern` objects, each with:
- `pattern: RegExp` — case-insensitive regex to match against ability description text
- `create: (match: RegExpMatchArray) => WeaponAbility | null` — factory function

The patterns to match (in this priority order — earlier patterns should match before later ones to avoid false positives):

1. **Re-roll hit rolls of 1** — must come BEFORE generic re-roll hits. Match "re-roll hit rolls of 1". Produces `{ type: 'REROLL_HITS_OF_1' }`.
2. **Re-roll all hit rolls** — match "re-roll (all)? (the)? hit rolls?". Produces `{ type: 'REROLL_HITS' }`.
3. **Re-roll wound rolls** — match "re-roll (all)? (the)? wound rolls?". Produces `{ type: 'REROLL_WOUNDS' }`.
4. **Lethal Hits** — match word boundary "lethal hits". Produces `{ type: 'LETHAL_HITS' }`.
5. **Sustained Hits N** — match "sustained hits N". Produces `{ type: 'SUSTAINED_HITS', value: N }`.
6. **Devastating Wounds** — match "devastating wounds". Produces `{ type: 'DEVASTATING_WOUNDS' }`.
7. **+1 to hit** — match "add 1" or "+1" followed by "to (the)? hit rolls?". Produces `{ type: 'HIT_MOD', value: 1 }`.
8. **+1 to wound** — same pattern for wound. Produces `{ type: 'WOUND_MOD', value: 1 }`.
9. **-1 to hit** — match "subtract 1" or "-1" followed by "to (the)? hit rolls?". Produces `{ type: 'HIT_MOD', value: -1 }`.

### Exported functions

**`parseAbilityDescription(description: string): WeaponAbility[]`**
Run all patterns against the description. Deduplicate by `type+value` key (using a `Set<string>`). Return all matched abilities. A single description can contain multiple rules.

**`extractLeaderRules(abilities: UnitAbilityRecord[]): { rule: WeaponAbility; source: string }[]`**
Takes an array of `{ name, description }` ability records. For each, call `parseAbilityDescription`. Deduplicate across all abilities (same Set). Return each rule paired with the ability name as `source` so the UI can label where the rule came from.

### Interface

```typescript
interface UnitAbilityRecord {
  name: string
  description: string
}
```

## Dependencies

- `@tabletop-tools/game-content` — `WeaponAbility` (type only)
