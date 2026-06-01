# Data Layer — Worklist

> Living checklist for the unified data layer work. Update status inline as steps land. Reference this file instead of re-deriving the list each turn.
> Parent plan: `2026-05-28-unified-data-build-plan.md`. Spec: `2026-05-28-content-silo-bridge-design.md`.

**Crosswalk design (locked 2026-05-30, v3):** stable + incremental + validation-gated. `content_node_link` is one-row-per-brain_node_id (PK = brain_node_id). Re-keys go through a `content_node_link_candidate` queue and a validation process (admin UI or LLM evaluator). On approve, the link is UPDATED in place; every change is captured in the `content_node_link_history` append-only audit log. The v2 chain (link_id + prior_link_id + superseded_at) was redesigned because the chain required a fragile per-statement write order during approve. See spec §5.1.

---

## Worklist

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Update spec §5.1 to stable + incremental, validation-gated crosswalk | ✅ done | §8 Decision 3 wording tweak deferred to a follow-up (small, non-blocking) |
| 2 | Rewrite Phase 1.4 plan to match the corrected crosswalk model | ✅ done | Now 12 ordered steps with gates; supersedes the prior crosswalk-overwrite version |
| 3 | Schema migration on `content_node_link` — add `validation_method`, `validated_by`, `validated_at`; migrate existing rows | ✅ done (prod) | Final shape from `0005`: PK = `brain_node_id`, no chain columns. `0003`/`0004` (chain) + `0005` (UPDATE-in-place) all applied to prod. 61 link rows preserved + 61 backfill history rows |
| 4 | Add `wahapedia_id` / `bsdata_id` provenance columns to `content_entity` | ✅ done (prod) | Folded into migration `0003`; applied with the rest |
| 5 | Wire `validateContentIds` counts into `runSync` (live import logs match / unmatched / ambiguous every run) | ✅ done | Commit `fb0c531` — `runSync` now calls `validateContentIds` and surfaces counts via `SyncResult.contentIdValidation` |
| 6 | Fix `scripts/11th-ingest/build-brain-nodes.mjs` — stop `ON CONFLICT DO UPDATE` overwrite; queue candidates on divergence | ✅ done (prod re-ran) | Append-only logic + candidate queue + deploy-order safety check. Re-ran against prod: 143 brain nodes, 61 links idempotent (skipped-same), 0 queued (no divergences) |
| 7 | Canonical content-doc producer | ✅ done (prod) | Per-record R2 docs collapsed into one bulk `content/{type}.json` per producer to stay under Cloudflare Workers' 1000-subrequest cap. Live in prod via the data-import worker |
| 8 | Producer + `content_entity` for **weapons** (`parent_id` → datasheet) | ✅ done (prod) | 8685 weapons in `content_entity`; FK-filtered through `canonicalDatasheetIds` to avoid mid-batch violations |
| 9 | Producer + `content_entity` for **factions / subfactions / detachments / detachment_abilities** and **ability / stratagem / enhancement** | ✅ done (prod) | All populated in prod: 26 factions, 8 subfactions, 202 detachments (BA filtered), 218 detachment_abilities, 90 abilities, 1481 stratagems, 927 enhancements. Slug rule aligned with brain (drop apostrophes). `content_can_lead` (1811 rows) also live for Phase 2 attachment enforcement |
| 10 | Build the **validation process** — admin UI + LLM evaluator path | ✅ done (deployed) | v3 design (UPDATE-in-place + audit log). **10a** schema/migration/tests. **10b/10c** 11th-ingest queues candidates. **10d** admin `crosswalk` router (`listPending`, `candidate.{byId, approve, reject, override, approveBulk, rejectBulk}`, `runLlmEvaluator`, `stats`). **10e** admin `CrosswalkPage` UI wired into nav. **10f** Workers-AI LLM evaluator (`@cf/meta/llama-3-8b-instruct` default). **10g** prod migrations applied, admin worker + client deployed, endpoints auth-gated and reachable, 11th-ingest idempotent against prod. Real candidate evaluation will happen organically the next time content sources produce a divergence |

---

## Already done (this thread, committed)

- Phase 1.1 — canonical content ids anchored to given source ids (`apps/data-import/server/src/lib/id-mapping.ts` + tests + live validation tool). 99.99% reference resolution against the real Wahapedia import (122,727 / 10 unmatched). Three commits: docs(claude) rules, feat(data-import) canonical ids, test(data-import) live validation tool.
- Phase 1.4 scope (original) — `2026-05-29-phase-1.4-unified-etl.md`. **Note:** built on the original crosswalk-as-overwrite model; step 2 of this worklist rewrites it.
- **Phase 2 client complete (2026-06-01)** — list-builder client wired to `listV2` tRPC router. Server is source of truth for army lists. `useListsV2.ts` + `migrateIndexedDbLists.ts` + updated screens (`ListBuilderScreen`, `MyListsScreen`, `UnitSelectionScreen`). One-time IndexedDB→server migration on first load. 76 client tests + 55 server tests + Playwright UI e2e. Commits: `cb0ba49` (client wiring) + `49f0c3f` (e2e) + `2d4bf35` (polish: description column, canonical factionId slug, resolved export names). Migrations 0006 (list tables) + 0007 (content_can_lead) + 0008 (list.description) live in prod.

---

## Status legend

- ⬜ todo
- 🟡 in progress
- ✅ done
- ⛔ blocked

Update markers in place as we move; commit the worklist with each meaningful step transition so the history is in git.
