# tournament — W2 Phase C design verdict

> Grounded in `wargame/w2/apps/tournament.md` (Phase A census, 2026-07-06,
> 100 server + 58 client tests run), `decisions/D2-01`, `D2-04`, `D2-05`,
> `D2-08` (Phase B), and a direct re-read of
> `apps/tournament/server/src/routers/{tournament,round,player,bcpRegistration}.ts`,
> `lib/standings/{compute,metric-compute}.ts`, `packages/db/src/schema.ts:600-615`,
> and `apps/tournament/CLAUDE.md:100-140` the same day this doc was drafted.

---

## 1. Verdict

**Keep — refactor in place, no redesign.** This is the platform's healthiest
app by every measure the census took (100% test pass, zero TODOs, correct
canonical-registry FKs for faction/detachment, no cross-app logic
duplication beyond the named Rule 6 items). It needs four bounded fixes,
the largest of which is wiring (or explicitly declaring unwired) a feature
that already exists on both ends of the request path but never got
connected — a correctness gap that misleads tournament organizers today,
not a structural problem with the app.

---

## 2. App-local decision points wargamed

### (a) Metric-stack pairing integration

**The gap, precisely.** `metric.setStack`/`getStack` (`routers/metric.ts:59,90`)
and `tournament.standings` (`tournament.ts:222-276`, calls
`computeMetricStandings` at `:276,310`) are real and tested. But
`round.generatePairings` (`round.ts:118`, verified this session) still
builds its player list from `computeStandings` (legacy fixed-metric
engine), not `computeMetricStandings`. A configured pairing stack affects
the **standings display** but not **who gets paired against whom**.
Re-verified past the census: there is **no client UI caller of
`metric.setStack`/`getStack` at all** (grep across
`apps/tournament/client/src` for `trpc.metric`, and for "Stack" in
`ManageTournament.tsx` — zero matches). So today's actual failure mode is
narrower than "misleads TOs who configured a stack": there's no way to
configure one from the UI, and if there were, it wouldn't affect pairings.
This is the app's one correctness-shaped gap, and D2-01 explicitly gates
full tournament/meta unification on it clearing (`D2-01.md:163-165`).

**Options:**
1. **Wire `computeMetricStandings` into `generatePairings`.** Swap the
   `computeStandings` call at `round.ts:118` for `computeMetricStandings`,
   sourced from the tournament's `pairing`-type stack. Requires: (i) a
   client UI to set a stack — doesn't exist today, bigger than a one-line
   swap; (ii) a fallback stack for tournaments with zero configured rows;
   (iii) new integration tests — census confirms zero tests cover
   pairing×metric-stack interaction today. Real fix, real cost: touches
   the highest-trust code path in the app.
2. **Declare stacks display-only; label the UI.** Keep `generatePairings`
   on `computeStandings` permanently; label the `placing`-only nature
   explicitly, and drop or rename the `pairing` stack type so it stops
   implying an effect it doesn't have. Zero pairing-algorithm risk.
3. **Remove the pairing-stack type entirely.** Cheapest, but throws away a
   built, tested, genuinely wanted feature (TOs do want pairing
   tiebreaker control) rather than fixing its wiring or its labeling.

| Option | Fit | Effort | Risk | Stack fit | Weighted |
|---|---|---|---|---|---|
| 1. Wire into pairings | 5 | 2 | 2 | 4 | **3.1** |
| 2. Display-only + label | 4 | 5 | 5 | 5 | **4.7** |
| 3. Remove pairing-stack type | 2 | 4 | 5 | 3 | 3.4 |

(Risk and Effort weighted highest — this touches the app's best-tested
subsystem, Swiss pairing, per the census 10 good tests; regressing it is
the one way to break the platform's healthiest app.)

**Recommendation: Primary — Option 2, now. Fallback — Option 1, once a
client stack-configuration UI is built anyway** (building that UI and
leaving it non-functional for pairings just relocates the same
misleading-UI problem). Option 2 removes the correctness gap this week at
near-zero risk; Option 1's true cost includes a UI that doesn't exist,
bigger than the census's one-line framing suggested. Never ship Option 1
without a default stack for empty configs — a tournament must not fail
pairing generation because no stack was set.

**Flip trigger:** move to Option 1 when a TO-facing stack-configuration UI
is scoped for other reasons — build pairing wiring into that same work.

**D2-01 gate note:** if Option 2 is taken, D2-01's Option B trigger does
**not** clear — the stack still doesn't affect pairings. Only Option 1
clears D2-01's gate; record this so a future reader doesn't conflate
"misleading UI fixed" with "metric-stack precondition met."

### (b) `seedTestPlayers`

Confirmed: `player.ts:216-266`'s `seedTestPlayers` is a
`protectedProcedure` gated only on `tournament.toUserId === ctx.user.id` —
no environment check. Any authenticated TO can inject up to 16 fake
players into a live bracket. D2-04 item #3: "Rule 6 costume, Rule 7
problem underneath."

**Options:** (1) env-gate in place (`ctx.env.ENVIRONMENT === 'production'`
→ throw); (2) move the 16-player fixture to a test-only module
(`__fixtures__` or a `scripts/` seed helper per Rule 4), delete the
protected mutation entirely; (3) delete outright, no seeding path even in
dev/staging.

| Option | Fit | Effort | Risk | Stack fit | Weighted |
|---|---|---|---|---|---|
| 1. Env-gate in place | 4 | 5 | 4 | 3 | **4.0** |
| 2. Move to seed script | 5 | 3 | 4 | 5 | **4.3** |
| 3. Delete outright | 5 | 5 | 2 | 3 | 3.6 |

**Recommendation: Primary — Option 2**, matching D2-04's own prescription
and Rule 4 (callable function, not a prod-reachable endpoint whose only
real use is local testing). **Fallback — Option 1** if removing the router
mutation breaks an existing staging/QA workflow that calls it over tRPC —
verify this (check for any E2E test or QA runbook dependency) before
committing to full removal.

### (c) `bcpRegistration.status` enum mismatch

Confirmed: `schema.ts:610` defines `status: enum: ['submitted', 'failed']`
— two values. `CLAUDE.md:139` documents three: `submitted|failed|pending`.
No code path writes or reads `'pending'` (grep across router and client:
zero matches) — pure doc drift, not a half-built state machine.

**Options:** (1) doc fix — delete `pending` from CLAUDE.md, matching
D2-08's class-(a) policy (point at the schema, don't restate it); (2)
schema fix — add `'pending'`, implement whatever lifecycle it implies,
wire a state transition.

| Option | Fit | Effort | Risk | Quality | Weighted |
|---|---|---|---|---|---|
| 1. Doc fix | 5 | 5 | 5 | 3 | **4.5** |
| 2. Schema fix (build the state) | 3 | 1 | 3 | 5 | 2.8 |

**Recommendation: Primary — Option 1, immediately.** `method:
server|agent` registration is synchronous (submit → submitted/failed);
nothing suggests an intermediate state was ever built. **Fallback —
Option 2** only if Micah confirms BCP registration needs an actual pending
state (e.g., queued but not yet confirmed by BCP) — then this is a scoped
feature gap, not a doc-drift item.

### (d) Per-tournament ratings (ELO)

Confirmed: `CLAUDE.md:118-120` documents `player_elo`/`elo_history` tables
plus (per census) an `elo.*` router — zero matches in `schema.ts` or
`routers/`. The platform's actual rating system is Glicko-2, computed by
`exportToMeta`'s `computeGlicko2ForEvent` (`tournament.ts:521-665`), written
into new-meta's `playerGlicko`/`glickoHistory` — a cross-tournament,
platform-wide rating. D2-08 already names this exact documented-but-absent
system as one of its four drift exhibits and prescribes deleting the
CLAUDE.md section outright.

**The product question:** does a per-tournament, in-event rating add value
given platform-wide Glicko-2 already exists? Two readings: (i) a rating
computed fresh per event and discarded — e.g., a same-event seeding rating
for cutting to elimination brackets, genuinely distinct from Glicko-2's
persistent cross-event score; or (ii) a duplicate in-app copy of the same
cross-event concept — which recreates D2-01's Rule 1 problem one layer
down, for ratings instead of events.

**Options:** (1) delete the docs, build nothing — matches D2-08 verbatim;
(2) implement real per-event ELO scoped to reading (i) only; (3) implement
ELO as a second cross-event system parallel to Glicko-2 — rejected outright,
this is the Rule 1 violation restated.

| Option | Fit | Effort | Risk | Quality | Weighted |
|---|---|---|---|---|---|
| 1. Delete docs, build nothing | 4 | 5 | 5 | 5 | **4.7** |
| 2. Real per-event seeding rating | 3 | 2 | 4 | 3 | 3.0 |
| 3. Parallel cross-event ELO | 1 | 2 | 1 | 1 | 1.2 |

**Recommendation: Primary — Option 1, immediately, as D2-08 already
directs.** No code, migration, or router references ELO today — nothing
half-built to finish, and Glicko-2 already answers the more valuable,
platform-wide version of the question. **Fallback — Option 2**, but only
as a separately-scoped product feature (same-event seeding rating for
cut-to-elimination formats), not a rehabilitation of the deleted docs.
Absent a stated TO need for in-event-only seeding, per-tournament rating
does **not** add value once platform Glicko-2 exists — Option 1 stands
unless Micah names a concrete use case for (i).

---

## 3. Cross-cutting obligations

- **D2-01 (shared `upsertMetaEvent`).** Tournament is one of D2-01's three
  writers into `metaEvents` (`exportToMeta`, `tournament.ts:330-515`).
  Obligation: replace its hand-rolled delete-then-reinsert body with a
  call to `packages/server-core`'s new `upsertMetaEvent()`. **This app's
  metric-stack decision (2a) is itself D2-01's flip trigger to Option B**
  — full unification stays deferred until (2a)'s Option 1 (real pairing
  wiring) ships, not Option 2 (display-only). D2-01's shared-writer swap
  does not require (2a) to resolve first; only D2-01's further move to
  Option B (deleting the operational tables) is gated on it.
- **D2-04 (data-in-code cleanup).** `MISSIONS` array (`round.ts:10-17`) →
  backfill into `scoringMission`, explicitly sequenced by D2-04 to happen
  alongside the tournament data-model work (both touch `round.ts`) rather
  than before it. `seedTestPlayers` (2b) is D2-04 item #3, disposed of
  independent of D2-01 timing — it's a Rule 7 fix, not a data-model one.
- **D2-05 (chunking — `exportToMeta`).** Named as D2-05's Class-1 hotspot
  #3: verify the real player/pairing ceiling before assuming it's small;
  adopt explicit accept-with-cap if comfortably inside budget, or split
  into cursor-driven `exportPlayers`/`exportPairings`/`runGlicko` steps if
  not. D2-05 explicitly sequences this **after** D2-01's unification
  decision — if native events become meta-table rows directly,
  `exportToMeta`'s copy step may be deleted outright rather than chunked.
- **D2-08 (doc drift).** Two directed fixes land here: delete the ELO
  section (`CLAUDE.md:118-125`, item 2d) and fix `bcpRegistration.status`'s
  documented three-value enum down to the real two (item 2c). Both are
  D2-08's immediate sweep, not blocked on tooling.

---

## 4. Ordered work plan

1. **Now, independent, cheap, zero-risk:**
   - Delete the ELO section from `apps/tournament/CLAUDE.md:118-125`.
   - Fix `bcpRegistration.status` doc line to `submitted|failed`.
   - Label the metric-stack UI/API as display-only for pairing purposes,
     or simplify the `pairing`/`placing` split (2a, Option 2).
   - Move `seedTestPlayers`'s fixture data to a test-only module; verify
     no staging/QA workflow calls it over tRPC before deleting the
     mutation (2b).

2. **Next, sequenced together** (both touch the same write paths — do
   once, not twice): D2-01's shared-writer swap (`exportToMeta` →
   `upsertMetaEvent()`); D2-04's `MISSIONS` → `scoringMission` backfill;
   D2-05's `exportToMeta` sizing check, done in the same pass since it
   touches the same function.

3. **Gated — do not start until (2a)'s Option 1 ships, if ever:** D2-01's
   Option B (full operational/meta unification). Its flip trigger is
   metric-stack pairing wiring landing, which this doc recommends **not**
   doing yet. Until Micah scopes a TO stack-configuration UI and chooses
   (2a)'s fallback, D2-01 stays at its own primary (Option D: shared
   writer now, unification deferred) — no further action needed here to
   keep that gate correctly closed.

4. **Deferred, product decision needed, not urgent:** per-tournament ELO
   — default is "nothing beyond the step-1 doc deletion" unless Micah
   names a concrete use case for a same-event-only seeding rating.
