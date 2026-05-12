# Brain Matchup Retrieval + Prompt Fix

## Problem

"How do World Eaters beat Orks?" returns identical WE data dumps regardless of opponent. No tactical advice, no opponent data, no community knowledge. The retrieval sends every WE stratagem/weapon to the LLM. The LLM can't synthesize matchup advice from a wall of rules text.

## Root Cause

1. `retrieve.ts` detects both factions but only fetches nodes for the player's faction
2. Community nodes (7,694) don't surface because Vectorize ranks rules/datasheets higher
3. `assembleContext` dumps everything — no relevance filtering
4. The prompt doesn't tell the LLM what kind of answer to produce

## Plan

> Pre-implementation: profile current /ask wall time on deployed Worker. Collapse dual-faction retrieval into ONE Vectorize query with post-filter, not two round-trips.

### Task 0: Write tests first

**Files:** `apps/brain/server/src/lib/retrieve.test.ts`, new test files as needed

Write tests before any implementation:
- Matchup regex patterns: true positives (all four patterns) + false negatives (should not match)
- `retrieve.test.ts` case mocking dual-faction Vectorize results — verifies both factions' nodes are returned
- `assembleMatchupContext` unit test verifying output structure (all three sections present, char count within 3k–5k)

### Task 1: Detect matchup queries in retrieve.ts

**Files:** `apps/brain/server/src/lib/retrieve.ts`

Detect "how do X beat Y" pattern **before** the existing faction-browse check. Matchup detection runs BEFORE `isFactionBrowse`. Add `&& !isMatchup` to the `isFactionBrowse` guard.

Extract both factions. Set a `isMatchup` flag.

```typescript
const MATCHUP_PATTERNS = [
  /how (?:do|does|can|should) (.+?) (?:beat|counter|fight|play against|deal with|handle) (.+)/i,
  /(.+?) vs\.? (.+)/i,
  /(.+?) against (.+)/i,
  /(.+?) matchup (?:with|against|vs) (.+)/i,
]
```

After regex match: validate both captured groups contain a detectable faction via `detectFactions()`. If either group doesn't resolve to a known faction, fall through to normal search.

When matched, both factions go into `detected.factions`. Add `detected.isMatchup = true`.

### Task 2: Dual-faction retrieval for matchup queries

**Files:** `apps/brain/server/src/lib/retrieve.ts`

When `isMatchup`, run ONE Vectorize query with post-filter (not two round-trips) to retrieve nodes for both factions.

Embedding text is explicit — do NOT use the stripped query:
- For the player's faction query, embed: `'key abilities stratagems army rule [faction]'`
- For the opponent, embed: `'dangerous units key threats army rule [opponent faction]'`

Post-filter each to top 5 most relevant nodes per faction (not 50). Prefer: army rules > detachment rules > stratagems > datasheets. Skip weapons, unit-abilities, generic core rules.

### Task 3: Community node boost

**Files:** `apps/brain/server/src/lib/retrieve.ts`

For matchup queries, run a dedicated community Vectorize query with `filter: { layer: 'community' }`. This targets tactical advice nodes specifically. Take top 10 community results.

If `<3` community nodes are already present in the primary results, skip the extra query — those nodes are already surfaced.

### Task 4: Build matchup context (replace assembleContext for matchups)

**Files:** `apps/brain/server/src/lib/format.ts`

New function: `assembleMatchupContext(playerNodes, opponentNodes, communityNodes, playerFaction, opponentFaction)`

Output structure:
```
=== YOUR ARMY: WORLD EATERS ===
Army Rule: Blessings of Khorne — [2 sentence summary]
Key Stratagems: [top 3, one line each]
Key Units: [top 3 relevant datasheets, one line each]

=== OPPONENT: ORKS ===
Army Rule: Waaagh! — [2 sentence summary]  
Key Threats: [top 3 dangerous units/abilities]
What They Want To Do: [detachment rule summary]

=== COMPETITIVE ADVICE ===
[community nodes, full content — these are the actual tactical knowledge]
```

Total context: ~3,000-5,000 chars, not 40,000.

### Task 5: Matchup prompt template

**Files:** `apps/brain/server/src/worker.ts`

When `isMatchup`, use a different system prompt. The matchup system prompt REPLACES the generic system prompt entirely — no faction scope injection needed, it is implicit from the context structure:

```
You are a competitive Warhammer 40K coach. The player wants to know how to beat a specific opponent.

Using the army data and competitive advice provided, write a game plan covering:
1. **Priority Actions** — what to do first and why
2. **Key Tactics** — specific plays that exploit the matchup
3. **Unit Roles** — which of your units handle which threats
4. **Turn Order** — does going first/second matter and why
5. **Counter-Play** — what the opponent wants to do and how to prevent it

Be specific. Name units, stratagems, and abilities. Don't just list rules — explain how to USE them in this matchup.
```

### Task 6: Wire it up in /ask endpoint

**Files:** `apps/brain/server/src/worker.ts`

In the `/ask` handler, after retrieve:
- Check `detected.isMatchup`
- If true, use `assembleMatchupContext` instead of `assembleContext`
- Use the matchup system prompt instead of the generic one
- Skip the "unit list" injection (not relevant for matchup queries)

For matchup queries: Gemini result is included as supplementary web context in the user message (same as now). The deterministic fallback (>40k chars) should use `assembleMatchupContext` which produces ~4k chars — it will never hit the 40k limit.

Bump Gemini cache version: change cache key prefix from `cache/gemini/` to `cache/gemini/v2/` to invalidate stale cached answers.

### Task 7: Test on the three known queries

Verify manually:
- "How do World Eaters beat Orks?" — should mention charging first, surrounding transports, Forgefiends shooting infantry, screening nobs, Waaagh timing
- "How do World Eaters beat Tau?" — should mention closing distance, dealing with overwatch, transport delivery
- "How do World Eaters beat Death Guard?" — should mention damage output vs T5/T6, dealing with Disgustingly Resilient, trading efficiently

### Not in scope

- Detachment-specific matchup advice (future — needs detachment in query)
- Meta win rate integration (future — connect to meta_top data)
- First turn win rate by matchup (future — needs first turn data)

## Estimated effort

Tasks 0-6: ~4-5 hours implementation
Task 7: 30 min manual verification

All changes in the brain server Worker. No client changes needed. Deploy = `wrangler deploy` on brain server.
