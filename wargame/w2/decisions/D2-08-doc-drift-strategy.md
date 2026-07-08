# D2-08 — Documentation drift strategy

> **Decision.** How the platform's docs stop lying: what CLAUDE.md/PLAN.md
> files are allowed to contain, what gets generated instead of hand-written,
> and what verifies the difference in CI.
>
> **Status:** drafted 2026-07-06 (W2 Phase B). Grounded in all 14
> `wargame/w2/apps/*.md` censuses and `packages/db/CLAUDE.md`.

## Forces

- **13 of 14 apps have CLAUDE.md/PLAN.md drift.** widget-lab is the sole
  clean one — its own census verdict: "the only fully drift-free CLAUDE.md
  in the W2 census... documents intent and structure, not counts." This is
  the modal condition of platform docs, not a few stragglers.
- **The worst offender is the platform's own shared package.**
  `packages/db/CLAUDE.md` states "22 tables" with a full ownership map;
  `schema.ts` defines ~49 real tables (auth-server census cites
  `schema.ts:1206-1433`, `1116-1198`, `797-1016`, well past 22). Every app
  census touching shared schema repeats the correction: game-tracker "2
  tables" vs ~19 actual, versus "1 table" vs 4, tournament "22 tables +
  elo ownership" vs 40+, list-builder's ownership map missing all 4 V2
  tables, new-meta undercounted by "~15+ tables." One wrong number, copied
  into six agents' mental models before anyone reads the real schema.
- **Test counts are wrong in ~6 apps:** versus claims 137, actual 251;
  list-builder claims 129, actual ~195; data-import claims 56+22, actual
  68+60; no-cheat claims "242 tests," actual 9 server + 30 client files;
  new-meta claims 122; game-tracker understates its own total. A number
  that changes every commit, hand-maintained in prose, is drift by
  construction.
- **tournament documents an ELO system that does not exist.**
  `CLAUDE.md:120-125` describes `player_elo`/`elo_history` tables and an
  `elo.*` router — zero matches in schema or routers; the platform runs
  Glicko-2 via new-meta instead. `packages/db/CLAUDE.md`'s own ownership
  table still lists an "ELO ratings" domain as if load-bearing.
- **5 apps claim `[x]`-done client deploy artifacts that don't exist:**
  game-tracker, list-builder, no-cheat, new-meta, versus all have
  PLAN.md/CLAUDE.md checkmarks for `client/wrangler.toml` +
  `client/functions/trpc/[[path]].ts` proxy files not on disk. The
  gateway census explains why: all client SPAs actually ship through
  **one** Pages project (`build.sh` loops 11 apps into one `dist/`) — the
  per-app-Pages story is a retired architecture nobody deleted from five
  separate docs. One abandoned design decision, echoing five times.
- **content-ingestor and bcp-scraper have no CLAUDE.md at all.** Both are
  large, live, cron-scheduled Workers. The closest fallback doc for each
  (`docs/etl-data-pipelines.md`) is *also* materially stale — it documents
  dead `ingest.ts` functions as content-ingestor's live pipeline, and a
  list-parsing stage for bcp-scraper that has never fired against
  production data. Missing docs plus a wrong fallback is worse than
  either alone: nothing signals the fallback is wrong.
- **gateway drift recurred 3 times, once per app addition.** Git history
  (brain `26dafac`, study `65ed776`, physics `137646e`) shows the same
  pattern each time: `build.sh`/`_redirects`/`wrangler.toml` updated
  correctly, CLAUDE.md/`verify-deployment.sh`/landing page did not. Today
  CLAUDE.md says "8 client SPAs," `deploy-gateway.sh`'s own comment says
  "7," reality is 11 built / 9 proxied. The fix has to survive the *next*
  app addition, not just clean up this one.
- **Root CLAUDE.md's own Memory Hygiene rule 4 already states the
  principle**, scoped to memory: *"Stale state goes in git, not memory.
  File counts, test counts, deployment state, phase status — derivable
  from code."* Nothing in that sentence is memory-specific — it's equally
  true of a CLAUDE.md, which suffers the identical failure mode.
- **The cost is already paid, not hypothetical:** census agents caught
  the packages/db table count independently in at least 4 app censuses
  (auth-server, game-tracker, versus, tournament) — 4 separate reads
  burned re-deriving a fact a stale doc actively asserted wrong. Root
  Rule 0 exists because "every regression you ship costs him his time to
  catch it" — stale docs are exactly that cost, paid repeatedly.

## Drift taxonomy

Four classes, each needing a different fix:

| Class | What it is | Examples | Why it recurs |
|---|---|---|---|
| **(a) Derivable-from-code** | Counts, rosters, table lists — anything a query already answers | packages/db table count, 6 apps' test counts, gateway roster (4+ duplicated locations) | Hand-maintained prose can't track a number that changes every commit |
| **(b) Aspirational/plan-state** | `[x]`-checked items for things never built, or renamed | tournament ELO, new-meta's `source.download`, unwired metric-stack claim | PLAN.md checkboxes flip on intent, not verified completion; nobody un-checks on descope |
| **(c) Retired-architecture residue** | Docs describing a design deliberately replaced, in 2+ places, never swept | 5 apps' per-app-Pages deploy claims, dead `update-data.yml`, no-cheat's "Exemplar Store" doc | Migration fixes the code and the primary doc, misses siblings (PLAN.md, ownership maps, other apps' docs) |
| **(d) Missing docs** | No CLAUDE.md; only a stale fallback | content-ingestor, bcp-scraper | Built fast under deadline pressure; nothing forces a first pass |

(a) is the majority by volume and cheapest to fix structurally. (b)/(c)
need judgment a script can't fully replace — detecting "stale" is
mechanical, detecting "aspirational vs. retired" isn't. (d) is simplest
in principle but has sat ignored regardless.

## Options

**A — Trim policy.** CLAUDE.md stops stating derivable facts: no counts,
no rosters, no numbered ownership tables. Replace with a pointer ("see
`schema.ts`", "run `pnpm test`"). Prose covers shape and intent only.
*Fit:* widget-lab is the existence proof — it has zero drift because it
never asserted a fact code could contradict. *Cost:* near-zero, an edit
pass plus a written convention. *Gap:* doesn't touch (b)/(c)/(d) — trimmed
numbers don't stop someone writing "the ELO router exists" in prose.

**B — Generated sections.** A script (`scripts/gen-doc-facts.ts`, Rule 4
— importable, wrapped for CLI/hook) queries `schema.ts` for table
ownership, test files for counts, `build.sh` for the app roster, and
writes a fenced `<!-- GENERATED:facts -->` block per doc; `pnpm docs:sync`
or pre-commit regenerates and fails on a stale staged block. *Fit:* solves
(a) durably — one generated source for the packages/db count, the 6 apps'
test counts, and the gateway roster, matching Rule 1 applied to docs
*about* the entity. *Cost:* moderate — script + markers + hook wiring.
*Gap:* same as (A) for (b)/(c)/(d); a generator that silently returns 0 on
a broken query is worse than a stale hand count (the exact failure mode
admin's own `pipeline` query already exhibits via `.catch(() => [{n: 0}])`
masking schema drift as "0").

**C — Drift-checker CI.** A script that doesn't rewrite docs, just checks
claims against ground truth: `[x]`-items with file paths (does the path
exist?), numeric claims (do they match a live count?). Runs in CI on PRs
touching any CLAUDE.md/PLAN.md, plus a scheduled full-repo sweep (drift
accretes without a doc-touching PR — see gateway's 3x history). *Fit:*
the only option catching (c) and part of (b) — "this path is `[x]`-
checked but doesn't exist" is exactly what killed 5 apps' deploy sections,
catchable same-week instead of same-quarter. *Cost:* highest — every new
claim style needs a new checker rule; starts narrow, grows over time.
*Gap:* can't detect "this prose describes a renamed system" (ELO →
Glicko) without a human-written claim taxonomy first.

**D — Combination.** Layer (A) as the standing convention, (B) for the
platform-wide recurring facts, (C) as the safety net for what survives
trimming. Treat writing the two missing CLAUDE.mds and deleting the
retired-Pages claims as an immediate hand sweep, not blocked on tooling.
*Fit:* each layer covers the others' gap — no class of the taxonomy is
left uncovered. *Cost:* the sum, but sequenced: (A) this week, (B) next,
(C) grown over several iterations starting with the two checks (file-
existence, count-match) that cover roughly 70% of found instances by
census count.

## Scores

Weights: **Effort** and **Risk** matter most (a docs-tooling investment,
not a live surface); **Fit** = stops the drift classes actually found;
**Quality** = coverage breadth across the taxonomy. Latency/Stack-fit are
not meaningful axes here.

| Option | Fit | Quality | Effort | Risk | Verdict |
|---|---|---|---|---|---|
| A — Trim policy | 3 | 2 | 5 | 5 | Cheap, real, incomplete alone |
| B — Generated sections | 4 | 3 | 3 | 3 | Solves (a) durably; adds a generator to maintain |
| C — Drift-checker CI | 4 | 4 | 2 | 3 | Broadest coverage; highest build-out cost |
| D — Combination | 5 | 5 | 2 | 4 | Full coverage; sum of the parts, sequenced |

## Recommendation

**Primary: D, sequenced A → immediate sweep → B → C.**

1. **This week — policy (A).** Add to root CLAUDE.md (Project Rules or as
   a Rule 6 corollary): *"CLAUDE.md/PLAN.md describe architecture, intent,
   and shape — not counts, rosters, or `[x]`-completion claims for
   anything a grep, a test run, or `ls` already answers. Link to the code
   instead."* Zero tooling cost; stops new drift while (B)/(C) are built.
2. **This week — immediate sweep** (below): fix the highest-blast-radius
   items this census already found, by hand, now.
3. **Next — build (B)** targeting, in order: gateway app roster (recurs
   fastest, 3x on record), packages/db table ownership (worst single
   offender), per-app test counts (highest instance count, lowest
   individual risk).
4. **Then — grow (C)**, starting with file-existence-for-`[x]`-claims and
   count-match-for-numeric-claims — the two checks that would have caught
   the 5-app deploy-residue cluster and the 6-app test-count drift.
   Expand rule types opportunistically as future censuses find new claim
   shapes.

**Fallback:** if CI budget doesn't support (C), (A) + (B) alone still
eliminates class (a) — including the packages/db exhibit — and the
immediate sweep kills the class-(c) residue visible today. Real
improvement even if verification never ships; it just means (b)/(c) can
silently reaccumulate between manual censuses, same as the status quo now.

## Flip triggers

- (B)'s generator breaks silently (same failure mode as admin's
  `.catch(() => [{n: 0}])`) and ships a wrong number with false
  confidence — worse than the hand-written number it replaced. Trigger:
  the generator gets its own fixture test before any doc trusts it.
- (C) produces enough false positives that its CI check earns a standing
  bypass habit — the same failure root CLAUDE.md already warns against
  ("never skip hooks... fix the underlying issue"). Trigger: narrow the
  checker's scope rather than let it get ignored.
- A 15th app lands and gateway's roster drifts a 4th time before (B)
  ships — signal that (B)'s gateway-roster piece should have jumped the
  queue ahead of packages/db.

## Implementation notes (non-LLM)

**Immediate sweep** (fix by hand this pass, ordered by blast radius):

1. **`packages/db/CLAUDE.md`** — replace the "22 tables" ownership table
   with a pointer to `schema.ts` plus qualitative per-domain description
   (no counts), or a corrected count as a stopgap. Remove the "ELO
   ratings" domain row or relabel it as Glicko-2 (`playerGlicko`/
   `glickoHistory`, already correct in new-meta's docs).
2. **`apps/tournament/CLAUDE.md:120-125`** — delete the ELO description
   outright; it documents a router and two tables that exist nowhere.
3. **The 5 phantom client-deploy claims** (game-tracker, list-builder,
   no-cheat, new-meta, versus) — replace each `[x]`-checked
   `client/wrangler.toml` + proxy claim with a one-line pointer to
   `apps/gateway/CLAUDE.md` as the actual deploy authority (single Pages
   project), killing the duplication at the source instead of copy-fixing
   five files.
4. **`apps/gateway/CLAUDE.md`** — fix "8 client SPAs" to the real roster;
   document the missing `BRAIN_API` binding and `functions/brain/`; align
   `deploy-gateway.sh`'s comment (says "7"). This is the doc that's
   drifted 3x already — fixing it by hand doesn't prevent app #15 from
   re-triggering it, which is why it's (B)'s first generation target.
5. **Write `apps/content-ingestor/CLAUDE.md` and
   `apps/bcp-scraper/CLAUDE.md` from scratch**, based on this census's
   own grounded Architecture/Data model/API sections, rather than the
   stale `docs/etl-data-pipelines.md`.
6. **new-meta/tournament** — correct `source.tournament({eventId})` vs
   documented `{importId}`; remove the nonexistent `source.download`
   claim (paired with PLAN.md's false "Download buttons wired" claim).
7. **Test-count corrections** (versus, list-builder, data-import,
   no-cheat, new-meta, game-tracker) — delete per policy (A) or correct
   as a stopgap; don't leave six known-wrong numbers in place.

**(B)'s generator:** `scripts/gen-doc-facts.ts`, callable standalone
(`pnpm docs:sync`) and from pre-commit — importable first, wrapped
second, per Rule 4.

**(C)'s checker:** `scripts/check-doc-drift.ts`, run in CI on PRs
touching CLAUDE.md/PLAN.md plus a scheduled full-repo sweep (gateway's
drift never touched gateway's own docs). Start with the two rule types
above; grow opportunistically.

**Out of scope:** LLM-based drift detection/rewriting (W1-scoped if ever
proposed; this decision is non-LLM per the W2 mandate); a general docs
site/generator platform beyond the 4-class taxonomy found here.
