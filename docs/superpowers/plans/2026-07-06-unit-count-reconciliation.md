# Goal: Unit count reconciliation across sources — 2026-07-06

**Status:** proposed
**Author:** Micah + Claude
**Pattern:** third in the count-reconciliation series — factions (2026-07-05, PR #108), detachments (2026-07-05, PR #109), stratagems/enhancements/upgrades (2026-07-06, PRs #111/#112). Same ground-truth model, same terminal-test discipline, applied to **units**.

---

## 1. The goal

Reconcile the **units** in the brain graph against the V2 faction-pack extracts and the SQL data source. Produce an **official count of units — overall and per faction** — that reconciles across every data source:

- **11e faction packs** (V2 extract; the parser has been updated to read datasheets directly from the PDFs)
- **BSData** — both 10th and 11th edition catalogs
- **Wahapedia** (10e canon)
- **SQL data source** (the relational store — dim/fact tables)
- **Brain graph** (what the website actually serves)

No actual code work may be required. The deliverable is a report that proves we do not have poor data. If the reconciliation surfaces defects, fixes go in — but under the rules in §4.

## 2. Ground-truth model

Same model as the detachment and stratagem/enhancement reports:

1. **11e is the target.** The units we are concerned about are the **11th edition units**, not 10th edition units. 10e entries are legacy inputs, not the thing being verified.
2. **The Legends rule.** Unless a unit has officially been placed into Legends, it is available in 11th edition. The 11e unit set is built by **replicating the 10th edition unit entries and applying the changes from the faction packs** — a unit missing from a pack is not a retired unit; it is a retained-legal 10e unit.
3. **Per-faction counts key off the 36 official factions** (reconciled to the GW app in the 2026-07-05 faction report). SM chapters resolve shared units via `dim_subfaction` expansion, per the build-once model.

## 3. Classification — every unit lands in exactly one bucket

For overall and per-faction counts, classify every unit as:

- **Official 11e** — appears in a faction pack datasheet (parser reads it from the PDF).
- **Retained-legal** — 10e entry (Wahapedia / BSData 10th) with no pack replacement and no Legends designation; replicated to 11e with pack-level changes applied.
- **Legends / retired** — officially designated Legends; excluded from the 11e set, with the designation source documented.
- **Drift** — count or content disagreement between sources (parser artefact, phantom node, duplicate, misnamed unit, missing datasheet fields). Each drift case gets a root cause and a fix or a documented upstream-gap ruling.

## 4. Fix rules — no shortcuts

- Changes are made to the **parsing and ingestion of data**, or as **direct data updates if they are documented**.
- What we do not want is shortcuts and tricks in UI layers. No client-side patching, no display-layer fallbacks, no "hide the bad row" filters in components. If a unit renders wrong, the data or the pipeline is wrong — fix it there.

## 5. Terminal acceptance test — 432 checks

The goal is satisfied when we can load, **from the live website, using all of the brain interfaces**, a random 11e unit from each faction, and the unit datasheet loads correctly.

**Matrix:**

| Dimension | Count | Detail |
|---|---:|---|
| Interfaces | 4 | **ask**, **search**, **browse**, **graph** |
| Factions | 36 | every official faction |
| Iterations | 3 | minimum; fresh random unit each iteration |
| **Total** | **432** | 4 × 36 × 3 |

Per check:

1. Pick a random 11e unit from the faction.
2. Load it through the interface under test.
3. Verify the **correct unit and data** show up — the datasheet renders with its real profile (stats, weapons, abilities, keywords, points), not a stub, not a wrong-unit collision, not empty fields.
4. **Screenshot every loaded unit.** The screenshots are the evidence trail.

All 3 iterations must pass consistently. The reason for the full 4 × 36 × 3 matrix is coverage of all the possibilities — an interface-specific retrieval bug, a faction-specific ingestion gap, and a flaky/nondeterministic load are each only caught by their own axis.

## 6. Progress log (resume state)

**2026-07-06 session 1 (cut short by usage limits):**

- Sources located and verified fresh:
  - Brain graph: `apps/brain/server/.local/brain/nodes/` built 2026-07-06 11:56 (matches live deploy `20260706-115602`). 1437 11e + 1092 10e datasheet nodes; 36 faction nodes.
  - Pack extracts: `.local/faction-pack-extracts/*.json` — `datasheets[]` + `legendsDatasheets[]` with `isLegends` flags.
  - Wahapedia: `apps/data-import/client/public/wahapedia/datasheets.json` — 1712 rows, 548 `isLegends`, camelCase fields (`legend` field is lore text, NOT the Legends flag).
  - BSData staged 11e: `.local/brain-input/bsdata-units.json` — 5775 rows (Mithraw fork, retrieved 2026-06-28).
  - BSData repos: `C:/R/wh40k-11e` (fmoraldo-mithraw fork, last commit 2026-06-25) and `C:/R/wh40k-10e` (BSData official). 46 identical catalog names.
  - SQL: `content_entity WHERE type='datasheet'` in Turso; creds in root `.env` (TURSO_DB_URL/TURSO_AUTH_TOKEN).
- Oracle script written: `apps/brain/server/scripts/count-units.ts` (tsx). Counts all six sources per faction, chapter-home convention mirrors `bsdata-subfactions.ts::chapterSpecificHome` (≤2 chapter catalogs = chapter home, ≥3 or in SM base = space-marines). Writes `.local/unit-counts.json`.
- Script status: runs up to the SQL step; last run died with `fetch failed / ECONNABORTED` talking to Turso (transient network or large query — NOT yet diagnosed). Faction-code priming from Turso worked on the same run, so creds are good.
- Next steps: re-run script → build reconciliation table → classify (official/retained/Legends/drift) → fixes if needed → 432-check acceptance run (script + Playwright screenshots) → report.

**2026-07-06 session 2:**

- Turso ECONNABORTED root cause: broken IPv6 route post-outage — Node tried IPv6 first and timed out. `NODE_OPTIONS=--dns-result-order=ipv4first` fixes it. `dim_faction`/`dim_faction_alias`/`dim_subfaction` snapshotted into `.local/dev.db` so build-graph runs offline.
- Reconciliation + classification complete; six pipeline fixes shipped on branch `fix/unit-count-reconciliation` (commit 740933a): shared-BSData-id fan-out, per-(id,faction) representative rows, pack-Legends 11e emission stop, Legends heading-continuation join, duplicate-summary pass scoped by datasheetId, pack-Legends retire pass + Red Terror stub removal.
- Result: brain 11e = 1153 units, name-level clean vs (waha non-Legends ∪ pack regular − pack Legends) for all 36 factions; 0 duplicate titles. Only intentional diffs: chaos-titan-legions +4 (variant emission, PR #98), unaligned-forces −20 (dropped faction, PR #106).
- Deployed: R2 upload (40 node + 41 ref files + manifest), Vectorize re-index 40/40 (0 errors), CDN purged. Live layer shows Units | 1153.
- Acceptance harness: `apps/brain/server/scripts/acceptance-units.mjs` (Playwright, real UI, per-interface random unit per Micah's directive). Full 432-check run in progress.

## 7. Deliverables

1. `docs/reports/2026-07-06-count-reconciliation-units.md` — counts per source, overall + per faction; classification table; drift cases with root causes; fixes shipped (if any); terminal test result with deploy ID.
2. Screenshot archive from the 432-check run.
3. Acceptance script (companion to `apps/brain/server/scripts/acceptance-test.mjs`) that drives the 4-interface × 36-faction × 3-iteration matrix against production.
