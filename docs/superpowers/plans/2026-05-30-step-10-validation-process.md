# Step 10 — Crosswalk Validation Process (UI + backend + LLM)

> Spec: `2026-05-28-content-silo-bridge-design.md` §5.1 (append-only, validation-gated crosswalk). Worklist: `2026-05-29-data-layer-worklist.md` step 10.
> The gate that makes the new crosswalk design enforceable. Both halves required: the admin UI (human-in-the-loop) and the LLM evaluator (scale). Without this step, candidate re-keys have nowhere to go — they either silently auto-apply (the bug we just fixed) or never happen.

---

## Goal

Provide the **gated** path by which a candidate `(brain_node_id → canonical_id)` link becomes active in `content_node_link`. Two paths, both required:

1. **Admin path** — a human reviewer sees pending candidates with reasoning + context, approves or rejects each.
2. **LLM-evaluator path** — an automated reviewer that runs the same decision criteria on batched candidates (so bulk imports don't require N manual clicks).

First-time links (no prior, no existing active link for that `brain_node_id`) are auto-inserted by the producer with `validation_method='auto-initial'` — they don't go through the queue. **Re-keys** (a candidate that would supersede an existing active link) MUST pass through the validation process.

---

## Current state (verified)

- `content_node_link` exists with the new chain shape (migration 0003 — local, awaiting prod apply): `link_id` PK / `brain_node_id` / `canonical_id` / `match_method` / `confidence` / `prior_link_id` / `validation_method` / `validated_by` / `validated_at` / `superseded_at`. Rows here are **already-validated** active links (plus their supersede chain).
- Producers (steps 7–9) emit candidates for content_entities. For first-time links they write directly to `content_node_link` with `validation_method='auto-initial'`. **Re-keys are not yet handled** — that's what step 10 wires up.
- 11th-ingest's `build-brain-nodes.mjs` is now append-only; divergent candidates log a warning and skip (step 6). Step 10 gives those candidates a queue + a decision flow.
- Admin app exists (`apps/admin`, 46 server + 47 client tests) with `adminProcedure` middleware and management actions (revoke/delete). The validation screen fits as a new section.

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
               │ approve              │ approve
               ▼                      ▼
         ┌────────────────────────────────┐
         │ content_node_link              │   ◄─ new row inserted
         │ (active chain)                 │      prior link's superseded_at set
         └────────────────────────────────┘
```

---

## Data shape — the candidate queue

A new table `content_node_link_candidate`. Schema (TS definition in `packages/db/src/schema.ts`):

```
content_node_link_candidate
  candidate_id PK                -- synthetic
  brain_node_id                  -- the brain node being linked (indexed)
  proposed_canonical_id          -- FK to content_entity.id (the proposed mapping)
  match_method                   -- 'datasheet_id' | 'name_faction' | 'manual' | 'llm'
  confidence                     -- 0–1
  prior_link_id                  -- FK to content_node_link.link_id (the active link this would supersede)
  proposer                       -- string: who/what proposed it
                                 --   e.g. 'sync:wahapedia:2026-05-30T03:00:00Z'
                                 --        '11th-ingest:abilities:run-abc123'
                                 --        'manual:<user_id>'
  proposed_at                    -- timestamp
  status                         -- 'pending' | 'approved' | 'rejected' | 'expired' (default 'pending')
  decision_method                -- 'admin' | 'llm' | null (null while pending)
  decided_by                     -- user id, 'llm:<model>', or null
  decided_at                     -- timestamp, or null
  decision_reason                -- LLM's reasoning OR admin's optional note
  resulting_link_id              -- FK content_node_link.link_id when approved (the row that got inserted)

indexes:
  brain_node_id, status, proposed_at, prior_link_id
unique:
  (brain_node_id, proposed_canonical_id, proposer) — same proposer can't queue the same pair twice
```

This is the only new table step 10 needs. Migration is small (one table, one set of indexes); ships with the step-10 PR.

---

## Producer behavior (the candidate vs auto-insert decision)

Update the shared producer (`content-producer.ts`):

```
For each candidate (brain_node_id, canonical_id) the producer wants to assert:
  1. Look up the active link for brain_node_id in content_node_link
     (superseded_at IS NULL).
  2. No active link exists:
        → first-time link. Insert directly into content_node_link
          with validation_method='auto-initial', validated_by=<proposer>.
  3. Active link exists, canonical_id matches:
        → already-correct. Skip (idempotent).
  4. Active link exists, canonical_id differs:
        → RE-KEY. Insert into content_node_link_candidate as 'pending'
          with prior_link_id = active link's link_id, proposer = caller's id.
          Do NOT touch content_node_link.
```

So the producer never silently overwrites — and never blocks on validation. The queue absorbs re-keys; the admin / LLM resolves them later.

Update the 11th-ingest script (`build-brain-nodes.mjs`) similarly: divergent candidates that currently log + skip become divergent candidates that queue + skip.

---

## Backend — endpoints (in `apps/admin/server`)

All endpoints use `adminProcedure`:

| Method | Path | Purpose | Returns |
|---|---|---|---|
| `query` | `crosswalk.listPending` | Paginated list of pending candidates, with the matcher's reasoning and snapshots of both content entities (existing + proposed) | `{ items, total, page, pageSize }` |
| `query` | `crosswalk.candidate.byId` | Single candidate with full context (existing link, proposed link, both entity payloads, brain node payload) | `{ candidate, existingLink, existingEntity, proposedEntity, brainNode }` |
| `mutation` | `crosswalk.candidate.approve` | Approve a candidate. Inserts the new row into content_node_link (with prior_link_id), sets prior's superseded_at = now, updates candidate to 'approved' with decision_method='admin', decided_by=<user>, resulting_link_id=<new>. Transactional. | `{ ok, newLinkId }` |
| `mutation` | `crosswalk.candidate.reject` | Reject a candidate. Sets status='rejected', decision_method='admin', decision_reason=<optional note>. Nothing written to content_node_link. | `{ ok }` |
| `mutation` | `crosswalk.candidate.approveBulk` / `rejectBulk` | Batch approve/reject by candidate_ids | `{ approved, rejected, errors }` |
| `mutation` | `crosswalk.runLlmEvaluator` | Trigger the LLM evaluator on N pending candidates (default 50). Returns counts after completion. | `{ approvedByLlm, rejectedByLlm, errors }` |
| `query` | `crosswalk.stats` | Counts: pending, approved-last-7d, rejected-last-7d, by proposer | `{ pending, approvedRecent, rejectedRecent, byProposer }` |

All mutations write the audit fields (decided_by, decided_at, decision_reason) atomically with the state change.

---

## LLM evaluator

The automated reviewer. Single function, callable from `crosswalk.runLlmEvaluator` (batch) or inline from the producer (real-time, optional).

**Input** per candidate:
- The proposed canonical content entity (name, type, key fields from its content/{type}/{id}.json)
- The existing active link's canonical entity (same shape)
- The brain node payload (title, content excerpt, refs)
- Match method + confidence + proposer

**Prompt structure** (sketch):
```
You are validating a proposed change to a content crosswalk.

Brain note id: {brain_node_id}
Brain note title: {brain_node.title}
Brain note content excerpt: {first ~500 chars}

Currently linked to canonical entity:
  id: {existing.id}
  type: {existing.type}
  name: {existing.name}
  faction: {existing.factionId}

Proposed new link:
  id: {proposed.id}
  type: {proposed.type}
  name: {proposed.name}
  faction: {proposed.factionId}

Match method: {match_method} (confidence {confidence})
Proposer: {proposer}

Question: Is the proposed link a genuinely better match for this brain note
than the current link? Answer with exactly one of:
APPROVE - <one-line reason>
REJECT  - <one-line reason>
UNSURE  - <one-line reason>
```

**Output handling**:
- `APPROVE` → write to `content_node_link`, mark candidate approved (method='llm', by='llm:<model>', reason=LLM's reason).
- `REJECT` → mark rejected (same shape).
- `UNSURE` → leave pending for admin review. Increments a `llm_uncertain_count` in stats so admin sees what needs human attention.

**Model**: Workers AI (cheap, fast) for the bulk evaluator; admin can also configure Claude API for higher-stakes batches via a separate endpoint variant.

**Idempotency**: never re-evaluate an approved/rejected candidate. Only `status='pending'` rows go through the evaluator.

---

## UI — admin app screens

Lives at `apps/admin/client/src/pages/CrosswalkScreen.tsx`. Two main views, one settings sub-view.

### View 1 — Pending Candidates (list)

The default view. Sortable, filterable table of pending candidates.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Crosswalk · Pending re-keys                          [Run LLM evaluator]   │
├────────────────────────────────────────────────────────────────────────────┤
│ Filters:  Type [▼ all]  Proposer [▼ all]  Confidence [▼ any]   Search [_] │
├────────────────────────────────────────────────────────────────────────────┤
│ ☐ │ Brain note                  │ Current link    │ Proposed link  │ Conf │
│ ──┼─────────────────────────────┼─────────────────┼────────────────┼──────┤
│ ☐ │ Oath of Moment (ability)    │ ability:A0123   │ ability:A0987  │ 0.82 │
│   │   (Space Marines)            │ Oath of Moment  │ Oath of Iron   │      │
│   │                              │   [match: name_faction]                 │
│ ☐ │ Devastating Strike (strat)  │ stratagem:S012  │ stratagem:S458 │ 0.95 │
│   │   (Necrons)                  │ Strike Down     │ Devastating    │      │
│   │                              │   [match: manual, proposer 11th-ingest] │
│ ...                                                                         │
├────────────────────────────────────────────────────────────────────────────┤
│ [Select all on page]  [✓ Approve selected]  [✗ Reject selected]   Page 1/4│
└────────────────────────────────────────────────────────────────────────────┘
```

Clicking a row opens View 2 (detail). Bulk approve/reject acts on checked rows.

### View 2 — Candidate Detail

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ← Back to pending          Candidate cnd_abc123    proposed 2h ago         │
├────────────────────────────────────────────────────────────────────────────┤
│ Brain note: Oath of Moment                                                 │
│ ─────────────────────────────────────────────────                          │
│ id: 11th-ability-oath-of-moment                                            │
│ title: Oath of Moment                                                      │
│ category: keyword                                                          │
│ content excerpt: "...declare oath at start of game..."                     │
│                                                                            │
│ ┌────────────── Current link ───────┐  ┌─── Proposed link ─────────────┐  │
│ │ canonical: ability:A0123          │  │ canonical: ability:A0987      │  │
│ │ name: Oath of Moment              │  │ name: Oath of Iron            │  │
│ │ faction: Space Marines             │  │ faction: Iron Hands           │  │
│ │ validated_by: 11th-ingest          │  │ proposed_by: sync:wahapedia   │  │
│ │ validated_at: 2026-04-12           │  │ proposed_at: 2026-05-30       │  │
│ └───────────────────────────────────┘  └───────────────────────────────┘  │
│                                                                            │
│ Match: name_faction · confidence 0.82                                      │
│                                                                            │
│ [✓ Approve]    [✗ Reject]    Note (optional): [______________________]    │
└────────────────────────────────────────────────────────────────────────────┘
```

Approve / reject are explicit clicks. Optional note for the admin to record reasoning.

### View 3 — Settings / Stats

A small section at the top: counts of pending / approved-last-7d / rejected-last-7d, broken down by proposer. A "Run LLM evaluator" button with batch-size input. A list of recent LLM decisions for spot-checking.

---

## Integration points

- **`sync.ts` (data-import worker)** — producers call into the new "candidate vs auto-insert decision" path. First-time links auto-insert; re-keys queue. Logs counts per type in the existing `producer` result.
- **`scripts/11th-ingest/build-brain-nodes.mjs`** — divergent candidates queue instead of logging + skipping.
- **`apps/admin/server`** — adds the `crosswalk` router with the endpoints listed above. Uses the existing `adminProcedure` middleware.
- **`apps/admin/client`** — adds `CrosswalkScreen.tsx` and routes it in the admin nav. Uses existing UI patterns (table + detail screens from the other admin sections).
- **LLM evaluator** — small module callable from the admin endpoint and (optionally) from the producer real-time path for high-confidence quick-wins. Default model: Workers AI; pluggable to Claude API.

---

## Gates / validation criteria

Each gate is a count from real data:

- **Producer behavior**: re-runs against fresh real data produce zero unauthorized writes to `content_node_link` for re-keys; all re-keys land in the candidate queue. Auto-initial first-time links continue to land directly.
- **Admin UI**: approving a candidate inserts exactly one row into `content_node_link` with the right `prior_link_id`, sets `superseded_at` on the prior, and updates the candidate row's `resulting_link_id` — all in one transaction. Rejection writes nothing to `content_node_link`.
- **LLM evaluator**: batch runs report approved / rejected / unsure counts; UNSURE rows stay pending; approved rows pass the same transactional invariant as admin approvals.
- **Idempotency**: re-running the producer never re-queues an already-rejected (brain_node_id, proposed_canonical_id, proposer) tuple — the unique constraint catches it.
- **No silent change**: every state change is on a queued candidate row with `decided_by` set. Nothing writes to `content_node_link` outside the auto-initial path and the validated paths.

---

## Open questions to settle before coding

1. **Auto-approve at very high confidence?** — A configurable threshold (say ≥ 0.98 + same name + same faction) could let the producer skip the queue. Reduces admin load, but reintroduces auto-decisions. Default: no, until we have data on how the queue feels.
2. **Rejected candidates: do they EXPIRE?** — Without expiry the queue grows forever as the same proposer re-runs. Suggest: 30 days TTL on rejected rows; the unique constraint prevents re-queue inside that window.
3. **LLM evaluator model default** — Workers AI (free tier on Cloudflare, fast) vs Claude API (better reasoning, costs per call). Start with Workers AI; gate Claude behind a separate explicit endpoint for selective use.
4. **What about candidates the LLM marks UNSURE that sit too long?** — Auto-promote to admin queue? Surface in stats? Suggest: surface in stats, no auto-promotion.

---

## Suggested decomposition for task-master

- 10a `content_node_link_candidate` schema + migration (gate: tests; producer can insert)
- 10b producer "candidate vs auto-insert" decision (gate: re-runs queue re-keys, never overwrite)
- 10c 11th-ingest divergent path → queue (gate: divergent canonical produces a candidate row)
- 10d admin server `crosswalk` router + endpoints (gate: list / approve / reject + transactional invariants)
- 10e admin UI `CrosswalkScreen` — list view, detail view, stats (gate: end-to-end approve/reject on a queued candidate)
- 10f LLM evaluator module + endpoint (gate: batch runs against pending; APPROVE / REJECT / UNSURE counts; idempotent)
- 10g real-data validation: queue produced from a real sync, evaluator runs, counts match
