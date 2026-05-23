# apps/tournament/server/src/lib/swiss/pairings.ts

> Swiss pairing algorithm — the core tournament matching engine.

## Prompt

Write a Swiss-system pairing algorithm for tournament play. Pure function — no DB dependency.

### Types

**`SwissPlayer`**: id, displayName, wins, losses, draws, margin (VP margin), strengthOfSchedule, registeredAt.

**`PreviousPairing`**: player1Id, player2Id (nullable for byes).

**`GeneratedPairing`**: player1Id, player2Id, tableNumber.

**`PairingResult`**: `{ pairings: GeneratedPairing[], bye: string | null }`.

### Algorithm

**`generatePairings(players, prev): PairingResult`**

1. **Sort** players by standing: wins DESC → margin DESC → SOS DESC → registeredAt ASC
2. **Bye**: If odd number, remove the lowest-ranked player as bye
3. **Group by record**: Group players by W-L-D string (e.g., "3-0-0"). Sort groups by wins descending.
4. **Pair within groups** via `pairGroup()`:
   - Split group into top half and bottom half
   - For each top-half player, try to pair with their natural Swiss opponent (same index in bottom half)
   - If that's a rematch (`havePlayed`), search remaining bottom-half for a non-rematch
   - If no non-rematch available, allow rematch as last resort
   - Any unpaired players overflow to the next group
5. **Force-pair overflow**: If any players remain unpaired after all groups, pair them sequentially
6. Table numbers are assigned sequentially starting from 1

### Helper functions

**`sortPlayers(players)`** — Sort by wins → margin → SOS → registeredAt.

**`havePlayed(a, b, prev)`** — Check if two players have already been paired (either direction).

**`groupByRecord(players)`** — Group by "W-L-D" key, return groups sorted by wins desc.

**`pairGroup(group, prev, tableStart)`** — Returns `{ paired, unpaired, nextTable }`. The top-half/bottom-half pairing with rematch avoidance and fallback.

## Dependencies

None — pure functions only.
