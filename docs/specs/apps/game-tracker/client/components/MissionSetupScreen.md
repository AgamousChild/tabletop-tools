# apps/game-tracker/client/src/components/MissionSetupScreen.tsx

> Screen 2 — mission, deployment zone, terrain, twist/challenger cards, photo requirement.

## Prompt

Write a form screen that collects mission setup data. Export the component and `MissionSetupData` type.

### MissionSetupData type

```typescript
{
  mission: string
  deploymentZone: string
  terrainLayout: string
  includeTwists: boolean
  twistCards: string[]
  includeChallenger: boolean
  challengerCards: string[]
  requirePhotos: boolean
}
```

### Data sources

Try to load missions from IndexedDB via `useMissions()` from game-data-store. If IndexedDB has data, use it for the mission dropdown. Otherwise fall back to hardcoded arrays:

**FALLBACK_MISSIONS**: Take and Hold, Supply Drop, Scorched Earth, The Ritual, Priority Targets, Linchpin, Purge the Foe

**FALLBACK_DEPLOYMENT_ZONES**: Tipping Point, Hammer and Anvil, Search and Destroy, Crucible of Battle, Sweeping Engagement, Dawn of War

**FALLBACK_TERRAIN_LAYOUTS**: Layout 1-8

### Fields

- **Mission** — dropdown (data-driven or fallback)
- **Deployment Zone** — dropdown
- **Terrain Layout** — dropdown
- **Include Twist Cards** — checkbox toggle. When on, show a text input + list to add/remove twist card names.
- **Include Challenger Cards** — same pattern
- **Require Photos** — checkbox

### Validation

Mission is required for "Next" button.

## Dependencies

- `react` — `useState`
- `@tabletop-tools/game-data-store` — `useMissions`
