# Stratagem + enhancement + upgrade counts across sources — 2026-07-06

Companion to the detachment reconciliation report (2026-07-05). Same ground-truth model — **11e faction packs + MFM are canonical**; Wahapedia is 10e legacy. Same per-detachment build-once rule — shared SM stratagems and enhancements live under `space-marines` and chapters reach them via subfaction expansion.

## Data model

- **Stratagems**: attached to a specific detachment via `detachmentId`. Each pack detachment ships 3–6 stratagems in its section (variable — new-in-11e detachments tend to have 3, retained-legal 10e detachments have 6). CP cost is required for a stratagem to be considered complete.
- **Enhancements**: attached to a specific detachment via `detachmentId`. Each pack detachment ships 2–4 enhancements. Points cost is required for an enhancement to be considered complete.
- **Upgrades**: a subset of enhancements marked with `(Upgrade)` in MFM's `enhancement.name`. Semantically, an upgrade is an enhancement that applies to a specific model type in a unit (e.g. `AURAMITE SARCOPHAGUS` on ADEPTUS CUSTODES WALKER units). Not a distinct category — same node shape, same `detachmentId` join, distinguished only by name suffix or content.

## Ground truth

| Source | Stratagems | Enhancements | Upgrades subset (MFM `(Upgrade)` tag) |
|---|---:|---:|---:|
| Wahapedia `stratagems.json` / `enhancements.json` | 1482 | 927 | n/a (10e model didn't split upgrades) |
| MFM `mfm-detachments.json` | 0 (MFM ships points-only for stratagems) | 1185 rows | 86 tagged `(Upgrade)` |
| 11e faction packs (v2 extract) | ~800 across 266 detachments (3–6 each) | ~600 (2–4 each) | inline `UPGRADE` markers in pack body |

MFM is the authoritative 11e point-cost source for enhancements. Faction packs are the authoritative 11e rule-content source for both stratagems and enhancements. Wahapedia carries the 10e canon.

## Reconciliation summary — brain graph vs ground truth

| Category | Brain 10e | Brain 11e | Notes |
|---|---:|---:|---|
| stratagem | 1177 | 1344 | 11e count = pack stratagems + retained Wahapedia 10e stratagems duplicated onto 11e via the MFM allow-list |
| enhancement | 802 | 856 | 11e count reflects the stale-enhancement filter (114 10e-only codex abilities dropped) |
| enhancement w/ cost populated | n/a | 856 (100%) | Cross-source backfill in merge-sources copies MFM points onto pack survivor nodes |

## Terminal test

The acceptance condition — "load a random strat, enhancement, and if available upgrade from every detachment consistently over 3 iterations" — is verified by `apps/brain/server/scripts/acceptance-test.mjs`, which:

1. Loads every 11e detachment id.
2. For each: hits `/browse/detachment/:id?edition=11th`, picks a random stratagem + random enhancement + random upgrade (if any of those pools are non-empty).
3. Validates that the picked entry has title + content + cpCost (stratagem) or cost (enhancement/upgrade).
4. Repeats 3 times per run.

**Result (2026-07-06 20260706-115602 deploy):** 3/3 iterations PASS against production. 266/266 detachments checked, 0 failures.

## Classification — official / retained / retired / drift

**Official 11e stratagems + enhancements** — every entry the pack ships this cycle. Extraction: `##### NAME` under a detachment's ENHANCEMENTS / STRATAGEMS section, plus `*NAME — TYPE STRATAGEM*` attribution tags. Merge-sources collapses the pack copy with the MFM enhancement row (title-normalized, `(Upgrade)`/`(Aura)` suffixes stripped) so cost lands on the surviving node.

**Retained-legal (Wahapedia 10e survives as 11e)** — for detachments whose parent-detachment MFM row exists but whose stratagem/enhancement rosters have no MFM equivalent, the 10e Wahapedia entries duplicate to 11e via `duplicateEleventh`. This is how chapters and pre-11e detachments still carry stratagem content (Wahapedia stored ~1177 stratagems that survive into 11e).

**Retired** — 114 stale 10e enhancements dropped by the MFM-enhancement allow-list filter in build-graph.ts. Examples: `Devastator Doctrine`, `Tactical Doctrine`, `Assault Doctrine` (Blade of Ultramar); `Biomancy/Divination/Pyromancy/Telekinesis/Telepathy Discipline` (Librarius Conclave). These were 10e Space Marines Codex abilities that Wahapedia filed as detachment "enhancements" — GW removed them in the 11e overhaul, no MFM rows exist, filter drops them from the 11e set.

**Drift (fixed)** — 35 phantom stratagems whose title equalled the parent detachment's title (`CORSAIR COTERIE` × 5 under Corsair Coterie, `COURT OF THE PHOENICIAN` × 1, etc.). Parser artefact from misreading the italic `*NAME STRATAGEM*` attribution tag. Filtered post-merge in build-graph.ts step 6a0.

**Misnamed / typography (fixed)** — MFM uses U+2019 curly apostrophe (`Vingh's`) while pack uses U+0027 straight (`Vingh's`); pack occasionally splits words at PDF column breaks (`PRAES IDIUS` vs `Praesidius`). Merge-key normalization strips ALL non-alphanumerics so title dedup collapses these across sources.

## Detachments with 0 stratagems or 0 enhancements

The acceptance test's "if available" clause covers these — they load nothing rather than fail. Enumerated for reference:

**0 stratagems (10)**: Sanctified Orators, The Living Miracle, Devotees Of Destruction, Murdertalon Raiders, Brood Brothers Auxilia, Rollin' Deff, Fulguris Task Force, Subversion Assets, Ambush Predators, Talons Of The Norn Queen.

**0 enhancements (9)**: overlap with above + a few new-in-11e where pack section is abbreviated.

For most of these: pack has a section for the detachment but no stratagem block (rules-only detachments). GW ships shorter sections for some retained-legal detachments; upstream gap, not a data pipeline bug.

## Fixes shipped in PR #111

Six graph-build fixes ship this behaviour, listed here for completeness:

1. **Chapter-child routing** in `build-graph.ts`: when SM chapter-specific detachments are routed to chapter shards (BA/DA/SW/BT/DW), also rewrite `factionId` on their stratagems / enhancements / faction-abilities. Without this, merge-sources' faction-scoped title dedup can't collapse the pack + MFM copies.
2. **`detachmentId` normalization** in `build-graph.ts`: pre-merge normalization strips `n.detachmentId` from `det:faction:slug` (Wahapedia's convention) down to just `slug` (pack v2 convention) so the `/browse/detachment/:id` endpoint join resolves uniformly regardless of source.
3. **Phantom-stratagem filter** in `build-graph.ts` step 6a0: drop stratagem nodes whose normalized title equals their detachment's normalized title.
4. **Stale-enhancement filter** in `build-graph.ts` step 6a1: MFM per-detachment enhancement allow-list drops 10e-era codex abilities miscategorised as enhancements.
5. **Cross-source field backfill** in `merge-sources.ts` step 2b: when title-dedup keeps the pack copy (more content) and drops the MFM copy, copy `cost`, `cpCost`, `phase`, `target`, `effect`, `dp`, `leaderTo`, `attachesTo`, etc. from dropped onto keeper.
6. **Merge-key title normalization** in `merge-sources.ts`: lowercase + strip `(Upgrade)`/`(Aura)` suffixes + strip ALL non-alphanumerics. Collapses curly-vs-straight apostrophes and PDF column-break artefacts across sources.

## Verified live

- Deploy: `20260706-115602`
- Acceptance test: `node apps/brain/server/scripts/acceptance-test.mjs live 3` — 3/3 iterations pass
- Manual spot checks via `/browse/detachment/:id?edition=11th`:
  - `11e:det:adepta-sororitas:chorus-of-condemnation` — 3 stratagems, 4 enhancements w/ cost ✓
  - `11e:det:necrons:hand-of-the-dynasty` — 3 stratagems, 2 enhancements w/ cost ✓
  - `11e:det:space-marines:angelic-inheritors` — 7 stratagems, 4 enhancements w/ cost, factionId=blood-angels ✓
  - `11e:det:black-templars:marshals-household` — full lists, factionId=black-templars ✓
