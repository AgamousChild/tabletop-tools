# Step 10 — Crosswalk Validation Process (UI + backend + LLM)

> **Revision 2 (2026-05-30)** — addresses every issue raised by the antagonistic review of revision 1. Specific fixes are called out inline as `[v2]` notes. Revision log at the bottom.
>
> Spec: `2026-05-28-content-silo-bridge-design.md` §5.1 (append-only, validation-gated crosswalk). Worklist: `2026-05-29-data-layer-worklist.md` step 10.

---

## Goal

Provide the **gated** path by which a candidate `(brain_node_id → canonical_id)` link becomes active in `content_node_link`. Two paths, both required:

1. **Admin path** — a human reviewer sees pending candidates with reasoning + context, approves or rejects each.
2. **LLM-evaluator path** — an automated reviewer that runs the same decision criteria on batched candidates (so bulk imports don't require N manual clicks).

**First-time links** (no existing active link for that `brain_node_id`) are auto-inserted by the producer with `validation_method='auto-initial'` — they don't go through the queue.
**Re-keys** (a candidate that would supersede an existing active link) MUST pass through the validation process.

---

## Current state (verified)

- `content_node_link` exists with the new chain shape (migration 0003 — local-done, awaiting prod apply): `link_id` PK / `brain_node_id` / `canonical_id` / `match_method` / `confidence` / `prior_link_id` / `validation_method` / `validated_by` / `validated_at` / `superseded_at`.
- Producers (steps 7–9) currently auto-insert with `validation_method='auto-initial'`. **Re-keys are not yet handled** — that's what step 10 wires up.
- `scripts/11th-ingest/build-brain-nodes.mjs` is append-only after step 6; divergent candidates currently log + skip.
- Admin app exists with `adminProcedure` middleware and table+detail UI patterns.
- **`[ai]` binding added to `apps/admin/server/wrangler.toml`** as of this revision so Workers AI is available to the admin Worker (was missing in v1).

---

## Target architecture

```
                ┌─────────────────────────┐
   sync.ts ────►│  Candidate proposer     │──► content_node_link
   (producer)   │  (first-time vs re-key  │     direct insert
                │   decision)             │     (validation_method='auto-initial')
                └─────────┬───────────────┘
                          │ re-keys only
                          ▼
                ┌─────────────────────────┐
                │  content_node_link_     │       ◄─ status: pending
                │  candidate (queue)      │
                └─────────┬───────────────┘
                          │
                ┌─────────┴───────────┐
                ▼                     ▼
        ┌──────────────┐      ┌──────────────┐
        │ Admin UI     │      │ LLM evaluator │
        │ (human)      │      │ (automated)   │
        └──────┬───────┘      └──────┬────────┘
               │ approve              │ approve / reject / llm_unsure
               ▼                      ▼
         ┌────────────────────────────────┐
         │ content_node_link              │   ◄─ new row inserted
         │ (active chain)                 │      prior link's superseded_at set
         └────────────────────────────────┘
```

Status transitions: `pending → approved | rejected | llm_unsure | overridden`. Terminal states: `approved`, `rejected`. `llm_unsure` is a non-pending parking lot that admin can act on. `overridden` is an explicit admin re-open of a previously-rejected pair.

---

## Data shape — the candidate queue

A new table `content_node_link_candidate`. Schema (TS definition lands in `packages/db/src/schema.ts`):

```
content_node_link_candidate
  candidate_id PK                -- synthetic UUID
  brain_node_id                  -- the brain node being linked (indexed)
  proposed_canonical_id          -- FK to content_entity.id ON DELETE CASCADE     [v2: was unspecified]
  match_method                   -- 'datasheet_id' | 'name_faction' | 'manual' | 'llm'
  confidence                     -- 0–1
  prior_link_id                  -- FK to content_node_link.link_id (the active link this would supersede)
  source                         -- pipeline source, stable across runs           [v2: split from proposer]
                                 --   e.g. 'sync:wahapedia', '11th-ingest:abilities', 'manual'
  run_id                         -- per-run identifier (timestamp or sync id)     [v2: split from proposer]
                                 --   e.g. '2026-05-30T03:00:00Z'
  proposed_at                    -- timestamp
  status                         -- 'pending' | 'approved' | 'rejected' | 'llm_unsure' | 'overridden'  [v2: added llm_unsure, overridden]
  decision_method                -- 'admin' | 'llm' | null
  decided_by                     -- user id, 'llm:<model>', or null
  decided_at                     -- timestamp, or null
  decision_reason                -- LLM's reasoning OR admin's optional note
  resulting_link_id              -- FK content_node_link.link_id when approved (the row that got inserted)
  llm_attempt_count              -- integer, default 0                            [v2: prevents UNSURE re-eval loops]
  llm_last_attempted_at          -- timestamp, or null                            [v2: same]

indexes:
  brain_node_id, status, proposed_at, prior_link_id, source

unique:
  PARTIAL: (brain_node_id, proposed_canonical_id) WHERE status = 'pending'        [v2: was over the whole table]
```

**[v2 — DEF-005 fix]** The unique constraint is a **partial unique index** that only applies to `status='pending'` rows. This means:

- A given `(brain_node_id, proposed_canonical_id)` can have at most one pending candidate at a time — re-runs of the same pipeline will not duplicate-queue.
- Rejected / approved / llm_unsure rows do NOT participate in the constraint — history grows naturally.
- `source` and `run_id` are stored separately so the unique constraint isn't broken by a per-run timestamp in a concatenated proposer string.

**[v2 — DEF-006 fix]** `proposed_canonical_id` and `prior_link_id` FKs both use `ON DELETE CASCADE`. A candidate whose proposed or prior entity gets deleted is worthless; cascading removes it cleanly.

**[v2 — DEF-009 fix]** `llm_unsure` is a separate status that removes a candidate from the LLM batch's pending pool while keeping it visible in the admin queue. `llm_attempt_count` tracks how many times the LLM gave up on it — admin can sort by this to triage.

**[v2 — DEF-010 resolved]** Rejection is **permanent** (no TTL). If a pair genuinely needs to be re-queued (e.g., the canonical entity changed and the previous rejection no longer applies), the admin uses an explicit "override and re-queue" action that flips the rejected row's status to `overridden` and inserts a new pending row.

---

## Producer behavior (the candidate vs auto-insert decision)

Update the shared producer (`content-producer.ts`):

```
For each candidate (brain_node_id, canonical_id, source, run_id):
  1. Look up the active link for brain_node_id in content_node_link
     (superseded_at IS NULL).
  2. No active link exists:
        → first-time link. Insert directly into content_node_link with:
            link_id = 'auto:' || brain_node_id            [v2: deterministic]
            validation_method = 'auto-initial'
            validated_by = source
          using ON CONFLICT(link_id) DO NOTHING.
          A partial unique index on content_node_link UNIQUE(brain_node_id)
          WHERE superseded_at IS NULL is added as part of this step       [v2: DEF-004 fix]
          so concurrent inserts can't produce two active rows.
  3. Active link exists, canonical_id matches:
        → already-correct. Skip (idempotent).
  4. Active link exists, canonical_id differs:
        → RE-KEY. Insert into content_node_link_candidate as pending with
          source/run_id from the caller, prior_link_id = active link's id.
          Catch the partial unique constraint violation silently (means a
          pending candidate already exists for this pair — idempotent).
          Do NOT touch content_node_link.
```

**[v2 — DEF-004 fix]** The partial unique index on `content_node_link` (`WHERE superseded_at IS NULL`) is a structural guarantee that no two active rows can exist for the same brain_node_id, regardless of concurrent producer races. It is added in migration 10a alongside the candidate table.

**[v2 — DEF-012 fix]** Deploy ordering for `build-brain-nodes.mjs`: the 10c script change MUST land after 10a's migration is applied to prod, OR the script must check for the candidate table's existence and skip the queue path with a warning if it's missing. The latter is preferred (script is forwards-and-backwards compatible).

---

## Approve atomicity (how the multi-step write stays safe)

**[v2 — DEF-001 fix]** Approving a candidate is three writes: insert new active row, set prior row's `superseded_at`, update candidate's `status` + `resulting_link_id`. Atomicity strategy:

1. **Primary mechanism — Drizzle transaction.** Use `db.transaction(async (tx) => { ... })` to wrap the three writes. Drizzle's libSQL driver exposes `transaction()` and Turso supports interactive transactions over HTTP. The codebase has no existing example of multi-statement transactions, so 10d's gate explicitly includes a test that **injects a failure between writes 2 and 3 and asserts rollback** (the prior row's `superseded_at` should NOT be set if the transaction aborts).
2. **Defensive mechanism — partial unique index.** Even if the transaction primitive misbehaves, the `UNIQUE(brain_node_id) WHERE superseded_at IS NULL` index physically prevents a state with two active rows. If write 1 succeeds and writes 2 fail, the next read sees two active rows — which is impossible under the index — meaning write 1 would have failed instead, surfacing the problem at the write boundary.
3. **Recovery test** (in 10d): with a simulated mid-transaction failure, the system must remain in one of: (a) all three writes applied (success), or (b) zero writes applied (clean rollback). Any other state is a bug that gates the step.

If the Drizzle transaction test fails (i.e., the primitive doesn't give us what we need), the fallback is to redesign the approve path to be safe under sequential writes — e.g., set `superseded_at` LAST, after inserting the new row; treat the brief window where the new row exists but prior's `superseded_at` is still null as an acceptable state under the partial unique index (which actually prevents this, so the window is zero-length). This fallback is explicit, not implicit.

---

## Backend — endpoints (in `apps/admin/server`)

All endpoints use `adminProcedure`. Each is followed by its **test spec** (DEF-007 fix).

| Method | Path | Purpose | Test spec |
|---|---|---|---|
| `query` | `crosswalk.listPending` | Paginated list of pending candidates with current + proposed entity snapshots, joined dataslate name (DEF-013) | empty list, filter by source/type/confidence/search, pagination boundaries |
| `query` | `crosswalk.candidate.byId` | Full context: candidate, existing link, both entities (with their dataslate names), brain node payload | unknown id, expired ids, fully-populated normal case |
| `mutation` | `crosswalk.candidate.approve` | Transactional approve. Inserts new content_node_link row + sets prior `superseded_at` + updates candidate. Returns `{ ok, newLinkId }` | happy path; rejection of an already-decided candidate; **mid-transaction failure → rollback** (DEF-001) |
| `mutation` | `crosswalk.candidate.reject` | Sets `status='rejected'`, decision_method='admin', decision_reason | happy path; rejection of an already-rejected candidate (idempotent no-op) |
| `mutation` | `crosswalk.candidate.override` | Admin action: flips a rejected row to `overridden` AND inserts a fresh pending candidate for the same `(brain_node, proposed_canonical)` | rejection-only precondition; cannot override non-rejected statuses |
| `mutation` | `crosswalk.candidate.approveBulk` / `rejectBulk` | Batch by candidate_ids. **Bulk operations require a `confirm: true` flag** (DEF-011) | confirm-flag enforcement; partial-failure reporting |
| `mutation` | `crosswalk.runLlmEvaluator` | Runs LLM evaluator on N pending candidates. Returns `{ approvedByLlm, rejectedByLlm, llmUnsureCount, errors }` | empty pending queue; mixed APPROVE/REJECT/UNSURE handling; never touches already-decided rows |
| `query` | `crosswalk.stats` | Counts: pending, approved-last-7d, rejected-last-7d, llm_unsure, by-source. Plus 20 most recent LLM decisions for spot-checking (DEF-011). | zero state; mixed-state DB |

All mutations write the audit fields (`decision_method`, `decided_by`, `decided_at`, `decision_reason`) in the same transaction as the state change.

---

## LLM evaluator

**[v2 — DEF-008 fix]** Prompt structure (sketch):

```
You are validating a proposed change to a content crosswalk.

Brain note id: {brain_node_id}
Brain note title: {brain_node.title}
Brain note type/category: {brain_node.category}
Brain note content excerpt: {first ~800 chars}

CURRENT link (active):
  canonical id: {existing.id}
  type:         {existing.type}            ← include type
  name:         {existing.name}
  faction:      {existing.factionId}
  validated by: {existing.validated_by}

PROPOSED new link:
  canonical id: {proposed.id}
  type:         {proposed.type}            ← include type
  name:         {proposed.name}
  faction:      {proposed.factionId}

Match signal:
  method:     {match_method}               ← primary signal
  confidence: {confidence}                 ← primary signal
  proposer:   {source} (run {run_id})

Guidance:
- If match_method is 'datasheet_id' AND types match AND confidence ≥ 0.95,
  APPROVE unless there is an obvious mismatch.
- If the proposed type differs from the current type, REJECT — content
  entities of different types should not be re-keyed across each other.
- If names are identical AND factions are identical AND types match, APPROVE.
- If unsure, say UNSURE — that's better than guessing.

Answer with EXACTLY ONE of:
APPROVE - <one-line reason>
REJECT  - <one-line reason>
UNSURE  - <one-line reason>
```

Response handling:
- `APPROVE` → execute the same transactional approve path as the admin button: write to content_node_link, mark candidate approved (method='llm', by='llm:<model>', reason=LLM's reason).
- `REJECT` → mark rejected (method='llm', by='llm:<model>', reason).
- `UNSURE` → **set status = `'llm_unsure'`** (NOT pending), increment `llm_attempt_count`, set `llm_last_attempted_at`. Removes from the pending pool so the LLM never re-evaluates an UNSURE.
- Errors / malformed responses → leave as pending, increment `llm_attempt_count`. After 3 attempts, force `'llm_unsure'`.

**Model**: Workers AI (binding `AI`) by default — fast, cheap, no per-call cost. Pluggable Claude API path for high-stakes batches via a separate explicit endpoint variant.

**Idempotency**: only `status='pending'` rows enter the evaluator. Already-decided rows (`approved`, `rejected`, `llm_unsure`, `overridden`) are filtered out by the SQL query.

---

## UI — admin app screens

Lives at `apps/admin/client/src/pages/CrosswalkScreen.tsx`. Three views; one is a sub-section of stats.

### View 1 — Pending Candidates (list)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Crosswalk · Pending re-keys                          [Run LLM evaluator]   │
├────────────────────────────────────────────────────────────────────────────┤
│ Filters:  Type [▼ all]  Source [▼ all]  Confidence [▼ any]   Search [_]   │
│           [v2: filter by SOURCE, not proposer-with-timestamp — DEF-014]    │
├────────────────────────────────────────────────────────────────────────────┤
│ ☐ │ Brain note                  │ Current link    │ Proposed link  │ Conf │
│ ──┼─────────────────────────────┼─────────────────┼────────────────┼──────┤
│ ☐ │ Oath of Moment (ability)    │ ability:A0123   │ ability:A0987  │ 0.82 │
│   │   (Space Marines)            │ Oath of Moment  │ Oath of Iron   │      │
│ ☐ │ Devastating Strike (strat)  │ stratagem:S012  │ stratagem:S458 │ 0.95 │
│   │   (Necrons)                  │ Strike Down     │ Devastating    │      │
│ ...                                                                         │
├────────────────────────────────────────────────────────────────────────────┤
│ [Select all on page] [✓ Approve selected] [✗ Reject selected]   Page 1/4  │
│  Bulk actions open a confirm modal — DEF-011                              │
└────────────────────────────────────────────────────────────────────────────┘
```

Source filter aggregates on the `source` column (e.g., `sync:wahapedia`, `11th-ingest:abilities`) — NOT on the per-run `run_id`. Bulk approve/reject buttons trigger a confirmation modal showing the count and a sample of affected candidates before submitting `{ confirm: true }`.

### View 2 — Candidate Detail

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ← Back to pending          Candidate cnd_abc123    proposed 2h ago         │
├────────────────────────────────────────────────────────────────────────────┤
│ Source: sync:wahapedia · run 2026-05-30T03:00:00Z                          │
│ ──────────────────────────────────────────────────                         │
│ Brain note: Oath of Moment                                                 │
│ id: 11th-ability-oath-of-moment                                            │
│ category: keyword                                                          │
│ content excerpt: "...declare oath at start of game..."                     │
│                                                                            │
│ ┌────────────── Current link ───────┐  ┌─── Proposed link ─────────────┐  │
│ │ canonical: ability:A0123          │  │ canonical: ability:A0987      │  │
│ │ type: ability                     │  │ type: ability                 │  │
│ │ name: Oath of Moment              │  │ name: Oath of Iron            │  │
│ │ faction: Space Marines             │  │ faction: Iron Hands           │  │
│ │ dataslate: 10th Ed Q4 Balance      │  │ dataslate: 10th Ed Q4 Balance │  │  [v2: DEF-013]
│ │ validated_by: 11th-ingest          │  │ proposer: sync:wahapedia      │  │
│ │ validated_at: 2026-04-12           │  │ proposed_at: 2026-05-30       │  │
│ └───────────────────────────────────┘  └───────────────────────────────┘  │
│                                                                            │
│ Match: name_faction · confidence 0.82                                      │
│                                                                            │
│ [✓ Approve]    [✗ Reject]    Note (optional): [______________________]    │
└────────────────────────────────────────────────────────────────────────────┘
```

`dataslate` field surfaces the joined name from `dim_dataslate` (DEF-013). If null on either side, displays as "—".

### View 3 — Stats + Recent LLM Decisions

Pending / approved-last-7d / rejected-last-7d / llm_unsure counts, broken down by `source`. "Run LLM evaluator" button (with batch-size input). Below: a table of the 20 most recent LLM decisions (APPROVE/REJECT/UNSURE + reason) for admin spot-check (DEF-011). Each row links to its candidate detail; admin can reverse an LLM decision via the same approve/reject mutations (sets `decision_method='admin'`, overwriting the LLM's record while preserving `decision_reason` in an `audit_trail` column if/when added).

---

## Integration points

- **`sync.ts` (data-import worker)** — producers call the "candidate vs auto-insert decision" path. First-time links auto-insert; re-keys queue. Logs counts per type in the existing `producer` result. `source` is `sync:wahapedia` (no timestamp); `run_id` is the sync's start ISO timestamp.
- **`scripts/11th-ingest/build-brain-nodes.mjs`** — divergent candidates queue instead of warning-and-skipping. Uses raw SQL `INSERT INTO content_node_link_candidate ... ON CONFLICT DO NOTHING` (partial unique handles the race). `source` is `'11th-ingest:abilities'` or `'11th-ingest:cards'` (stable across runs); `run_id` is the script's start timestamp. **Script first checks the candidate table exists** (queries `sqlite_master`); if missing, falls back to logging + skipping with a clear "10a migration not applied yet" message (DEF-012).
- **`apps/admin/server`** — adds the `crosswalk` router with the endpoints listed above. Uses the existing `adminProcedure` middleware. Uses `env.AI.run(...)` for the LLM evaluator (now that the `[ai]` binding is in `wrangler.toml`).
- **`apps/admin/client`** — adds `CrosswalkScreen.tsx` and routes it in the admin nav. Uses existing UI patterns from `UsersPage` / `SessionsPage` (table + detail screens).
- **LLM evaluator** — small module callable from `crosswalk.runLlmEvaluator`. Default model: `@cf/meta/llama-3-8b-instruct` via Workers AI (or whatever's current on the AI binding). Configurable to Claude API via a separate endpoint variant.

---

## Gates / validation criteria

Each gate is a count from real data PLUS the test specs above. The required-tests (DEF-007 fix):

- **Producer behavior (10b)**: unit tests cover all 4 paths (no active link / matching / different / pending candidate already exists). Re-runs against fresh real data produce zero unauthorized writes to `content_node_link` for re-keys; all re-keys land in the candidate queue. Auto-initial first-time links continue to land directly.
- **Approve transaction (10d)**: router test using in-memory SQLite via `createCallerFactory`. Includes the **mid-transaction failure injection test** proving atomicity (DEF-001).
- **Rejection (10d)**: idempotent — rejecting an already-rejected candidate is a no-op.
- **Override (10d)**: rejection-only precondition enforced; new pending row created with fresh candidate_id.
- **LLM evaluator (10f)**: mocked AI binding test cases for APPROVE / REJECT / UNSURE / malformed-response / already-decided-skip. Real-AI smoke test with one synthetic candidate.
- **No silent change**: every state change is on a queued candidate row with `decided_by` set. Nothing writes to `content_node_link` outside the auto-initial path and the validated paths.
- **Idempotency**: re-running the producer never re-queues a pending pair (partial unique index catches it) and never re-evaluates a decided candidate (status filter).

---

## Open questions (remaining after v2 fixes)

1. **Auto-approve at very high confidence?** — A configurable threshold (≥ 0.98 + same type + same name + same faction) could let the producer skip the queue entirely. Reduces admin load, but reintroduces auto-decisions. Default: NO, until we have data on how the queue feels.
2. **LLM model choice for the bulk evaluator** — Workers AI Llama-3-8b is the default; consider Claude Haiku for higher-fidelity batches via the secondary endpoint. Decide after running 10g's real-data validation and reviewing the LLM_UNSURE rate.
3. **Audit trail beyond `decision_reason`** — should we store the full LLM prompt + response for compliance/debugging? Adds storage cost; helps with prompt iteration. Defer until we see how the LLM evaluator behaves in practice.

(Removed from v1: TTL/expiry is RESOLVED — permanent rejection with explicit `'overridden'` re-queue action. Producer "ingest run grouping" is RESOLVED — `source` + `run_id` separate columns.)

---

## Suggested decomposition for task-master

| Task | Deliverable | Test spec | Gate |
|---|---|---|---|
| **10a** | `content_node_link_candidate` table + partial unique index on `content_node_link` (`WHERE superseded_at IS NULL`) | schema.test.ts: candidate insert, partial unique enforcement, cascade-delete on canonical_id | tests pass; `drizzle-kit generate` produces a clean migration |
| **10b** | Producer "candidate vs auto-insert" decision in `content-producer.ts` | producer tests for all 4 code paths; idempotency under re-runs | re-runs queue re-keys; never overwrite; first-time links auto-insert |
| **10c** | 11th-ingest divergent path → queue | script-level test (raw SQL fixture) for divergent insert + ON CONFLICT no-op; deploy-order safety (table-existence check + fallback) | divergent canonical produces a candidate row; missing table degrades gracefully |
| **10d** | Admin server `crosswalk` router + endpoints | router tests via `createCallerFactory`: all endpoints + **mid-transaction failure rollback test** (DEF-001) | tests pass; transactional invariant verified |
| **10e** | Admin UI `CrosswalkScreen` — list / detail / stats | component tests: loading / empty / error / table / detail / bulk-confirm modal | end-to-end approve/reject on a queued candidate |
| **10f** | LLM evaluator module + endpoint, Workers AI binding wired | unit tests with mocked AI binding for APPROVE/REJECT/UNSURE/malformed; one real-AI smoke test | batch runs against pending; counts match; UNSURE rows don't re-enter the pool |
| **10g** | Real-data validation: queue produced from a real sync, evaluator runs, counts match | one-off run, results captured in commit message | queue populated; LLM evaluator processes a sample; admin can approve/reject |

---

## Revision log

**v2 (2026-05-30) — addresses antagonistic review of v1:**

- DEF-001 (transactional approve): added explicit Approve Atomicity section. Uses Drizzle `db.transaction()` as primary mechanism with a required mid-transaction failure test in 10d. Partial unique index on `content_node_link` (`WHERE superseded_at IS NULL`) as defensive backstop.
- DEF-002 (Workers AI binding): `[ai]` binding added to `apps/admin/server/wrangler.toml` as of this commit.
- DEF-003 + DEF-005 (proposer / unique constraint contradiction): `source` and `run_id` split into separate columns. Unique constraint is now a partial index `WHERE status='pending'` on `(brain_node_id, proposed_canonical_id)`.
- DEF-004 (first-time race condition): deterministic `link_id = 'auto:{brain_node_id}'` + ON CONFLICT DO NOTHING; partial unique on content_node_link enforces single active per brain_node.
- DEF-006 (FK cascade behavior): `proposed_canonical_id` and `prior_link_id` both `ON DELETE CASCADE`.
- DEF-007 (no test specs): every subtask in the decomposition now has a test spec column.
- DEF-008 (LLM prompt naive): prompt includes `type`, leans on `match_method + confidence` as primary signal, has explicit type-mismatch reject rule.
- DEF-009 (UNSURE accumulation): new `'llm_unsure'` status removes from pending pool; `llm_attempt_count` prevents loops.
- DEF-010 (TTL unresolved): resolved as permanent rejection + explicit `'overridden'` re-queue action.
- DEF-011 (bulk confirmation, LLM audit): bulk endpoints require `confirm: true`; stats view shows recent LLM decisions.
- DEF-012 (deploy order): 11th-ingest script checks for table existence and falls back gracefully.
- DEF-013 (dataslate context): joined dataslate name surfaced in candidate detail view.
- DEF-014 (proposer filter granularity): UI filters on `source`, not on a timestamped proposer string.
