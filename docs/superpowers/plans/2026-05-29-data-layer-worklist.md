# Data Layer — Worklist

> Living checklist for the unified data layer work. Update status inline as steps land. Reference this file instead of re-deriving the list each turn.
> Parent plan: `2026-05-28-unified-data-build-plan.md`. Spec: `2026-05-28-content-silo-bridge-design.md`.

**Crosswalk design (locked 2026-05-29):** stable + incremental + validation-gated. Existing `(brain_node_id → canonical_id)` links are never overwritten. Re-keys are new rows that reference the prior link (`prior_link_id`) and go through a validation process (admin in a UI, or LLM evaluator) before becoming active. Old rows preserved (audit trail + lineage). See spec §5.1.

---

## Worklist

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Update spec §5.1 to stable + incremental, validation-gated crosswalk | ✅ done | §8 Decision 3 wording tweak deferred to a follow-up (small, non-blocking) |
| 2 | Rewrite Phase 1.4 plan to match the corrected crosswalk model | ✅ done | Now 12 ordered steps with gates; supersedes the prior crosswalk-overwrite version |
| 3 | Schema migration on `content_node_link` — add `link_id` PK, `prior_link_id`, `validation_method`, `validated_by`, `validated_at`, `superseded_at`; migrate existing rows to chain heads | 🟡 local done | `schema.ts` + migration `0003_unique_franklin_richards.sql` + tests (68 pass). **Prod apply is the gate** — irreversible, awaiting go |
| 4 | Add `wahapedia_id` / `bsdata_id` provenance columns to `content_entity` | 🟡 local done | Folded into the step-3 migration (`0003`); same prod-apply gate |
| 5 | Wire `validateContentIds` counts into `runSync` (live import logs match / unmatched / ambiguous every run) | ⬜ todo | Small change in `apps/data-import/server/src/lib/sync.ts` |
| 6 | Fix `scripts/11th-ingest/build-brain-nodes.mjs` — stop `ON CONFLICT DO UPDATE` overwrite; insert append-only under the new chain semantics | 🟡 local done | Now: insert only if no active link exists; divergent canonical logs a warning and skips (re-key needs step 10 validation). Depends on migration 0003 being applied to prod before the script can run |
| 7 | Canonical content-doc producer for **datasheets** first (`content/datasheet/{id}.json` to R2, alongside existing output) | ⬜ todo | Gate: doc count == datasheet count |
| 8 | Producer + `content_entity` for **weapons** (`parent_id` → datasheet) | 🟡 local done | canonical id `weapon:{datasheetId}:{slug(name)}`; produced via shared generic. Same prod-apply gate as step 3 |
| 9 | Producer + `content_entity` for **factions / subfactions / detachments / detachment_abilities** and **ability / stratagem / enhancement** | 🟡 local done | Factions (slug-of-name canonical id), subfactions (extracted from BSData catalogs via new parser logic — Chapter/Dynasty/Craftworld/Sept/Legion/etc. groups; canonical id = slug(name); parent → faction), detachments (canonical `detachment:{factionSlug}:{slug(name)}`, parent → faction), detachment_abilities (`content_entity.type` enum extended; canonical id = Phase 1.1 `detachment_ability:{id}`, parent → detachment via `detachmentIdMap`), abilities/stratagems/enhancements (Phase 1.1 canonical ids, factionId slugified for FK). Backfill-only COALESCE so existing FKs are never silently overwritten. **Brain subfaction system is NOT superseded** — `buildFactionNodes` and `n.subfaction` strings stay as-is; this only adds the relational FK target. Same prod-apply gate as step 3 |
| 10 | Build the **validation process** — admin UI + LLM evaluator path — that gates re-keys before they become active | ⬜ todo | The thing that makes the design real |

---

## Already done (this thread, committed)

- Phase 1.1 — canonical content ids anchored to given source ids (`apps/data-import/server/src/lib/id-mapping.ts` + tests + live validation tool). 99.99% reference resolution against the real Wahapedia import (122,727 / 10 unmatched). Three commits: docs(claude) rules, feat(data-import) canonical ids, test(data-import) live validation tool.
- Phase 1.4 scope (original) — `2026-05-29-phase-1.4-unified-etl.md`. **Note:** built on the original crosswalk-as-overwrite model; step 2 of this worklist rewrites it.

---

## Status legend

- ⬜ todo
- 🟡 in progress
- ✅ done
- ⛔ blocked

Update markers in place as we move; commit the worklist with each meaningful step transition so the history is in git.
