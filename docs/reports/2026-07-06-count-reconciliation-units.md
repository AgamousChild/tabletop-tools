# Unit (datasheet) counts across sources — 2026-07-06

Fourth in the count-reconciliation series — factions (2026-07-05, PR #108), detachments (2026-07-05, PR #109), stratagems/enhancements/upgrades (2026-07-06, PR #112). Same ground-truth model: **11e faction packs + MFM are canonical**, Wahapedia is the 10e source-of-truth, and per the Legends rule a unit is available for 11th edition unless GW has officially placed it into Legends. The 11e set is built by replicating the 10e Wahapedia entries and applying the faction-pack changes; the pack parser reads datasheets directly from the pack PDFs.

## Data model

- **Units** are `category: 'datasheet'` nodes. 10e originals carry the Wahapedia numeric surface id (`000001464`); 11e twins carry the `11e:` prefix; pack-only new units live at `11e:datasheet:<faction>:<slug>`.
- **Legends**: Wahapedia flags 10e Legends via `isLegends`; those rows are dropped at ingestion. The 11e packs each carry a `WARHAMMER LEGENDS` section — those datasheets are the official 11e Legends designation and are not part of the playable 11e set. A name in the pack's REGULAR datasheet section overrides its Legends listing (MUTILATORS returns from Legends in the 11e CSM pack).
- **Chapters**: all 11 First Founding SM chapters are their own factions; chapter-specific units route to the chapter's `factionId`, shared units stay `space-marines` and reach chapter queries via `dim_subfaction` expansion.

## Ground truth — per source

| Source | Snapshot | Unit rows |
|---|---|---:|
| Wahapedia `datasheets.json` | retrieved 2026-06-28 | 1712 (548 Legends → 1164 legal) |
| 11e faction packs (v2 extract, parser reads the PDFs) | packs dated 2026-04-22 | 196 new/updated datasheets + 361 Legends-section datasheets |
| BSData 11e staged (`bsdata-units.json`, Mithraw fork) | retrieved 2026-06-28 | 5775 rows → 2147 after catalog/library/chapter-home resolution |
| BSData 11e repo (`C:/R/wh40k-11e`, .cat parse) | 2026-06-25 | 1943 units (catalogs embed allied rosters, hence > brain) |
| BSData 10e repo (`C:/R/wh40k-10e`, .cat parse) | current clone | 1935 units |
| SQL `content_entity WHERE type='datasheet'` | live Turso | 1680 (see SQL staleness below) |
| **Brain graph 11e** | build 2026-07-06 | **1153** |
| Brain graph 10e | build 2026-07-06 | 1147 |

Oracle: `apps/brain/server/scripts/count-units.ts` — counts every source per faction, name-diffs the brain 11e set against expected, and writes `.local/unit-counts.json` + `.local/unit-names-11e.json`.

## Official count — 1153 units, per faction

Expected 11e set = Wahapedia non-Legends (retained-legal, replicated) ∪ pack regular datasheets (official 11e), minus pack-declared Legends. The brain matches this set **name-for-name in every faction** (SM family pooled: chapters + space-marines diffed as one pool because Wahapedia files chapters under "Space Marines").

| Faction | Brain 11e | | Faction | Brain 11e |
|---|---:|---|---|---:|
| adepta-sororitas | 33 | | imperial-knights | 28 |
| adeptus-custodes | 31 | | iron-hands | 2 |
| adeptus-mechanicus | 34 | | leagues-of-votann | 22 |
| aeldari | 72 | | necrons | 52 |
| astra-militarum | 72 | | orks | 54 |
| black-templars | 18 | | raven-guard | 2 |
| blood-angels | 15 | | salamanders | 2 |
| chaos-daemons | 74 | | space-marines | 88 |
| chaos-knights | 27 | | space-wolves | 20 |
| chaos-space-marines | 58 | | tau-empire | 43 |
| chaos-titan-legions | 4 | | thousand-sons | 34 |
| dark-angels | 16 | | titan-legions | 4 |
| death-guard | 38 | | tyranids | 52 |
| deathwatch | 11 | | ultramarines | 9 |
| drukhari | 37 | | unaligned-forces | 0 |
| emperors-children | 23 | | white-scars | 2 |
| genestealer-cults | 88 | | world-eaters | 30 |
| grey-knights | 26 | | imperial-fists | 3 |
| imperial-agents | 29 | | **TOTAL** | **1153** |

Two intentional diffs, both directives, not drift:

- **chaos-titan-legions +4** (Warhound/Reaver/Warlord/Warbringer Nemesis) — variant emission of the Imperial Armour Titans under the chaos shard (PR #98); no Wahapedia/pack source by design.
- **unaligned-forces −20** — Wahapedia files 20 fortification sheets (Bastion, Fortress of Redemption, …) under "Unaligned Forces"; the faction is deliberately dropped from the brain (PR #106 directive).

## Drift found and fixed (PR: fix/unit-count-reconciliation)

The reconciliation surfaced six pipeline defects. All fixed at parsing/ingestion — no UI-layer patches.

1. **Cross-faction shared-id collapse (worst).** data-import's name-based re-keying gives cross-faction same-name datasheets the SAME BSData id — 69 groups (AM/GSC Brood Brothers tanks, Aeldari/Drukhari Harlequins, shared Imperial Agents, CSM/DG cultists). `game-data.ts` keyed every map on that shared id, so last-write-wins silently deleted one faction's copy: **Astra Militarum was missing all 36 of its shared sheets (Chimera, every Leman Russ, Baneblade, Cadian Shock Troops…) in both editions.** Fixed: per-row surface ids + child (weapon/ability/ref) fan-out to every faction copy; MFM points re-keyed to all copies.
2. **Wahapedia duplicate chapter-variant rows.** Wahapedia lists chapter-flavoured SM vehicles (Impulsor, Gladiators, Repulsors…) as second rows under the same faction + shared id; after the fan-out both routed to black-templars. Fixed: one representative row per (BSData id, resolved faction).
3. **Pack Legends emitted as playable 11e units.** The pack parser emitted every Legends-section datasheet as an untagged regular 11e datasheet — 300+ retired units (GAUSS PYLON, the entire Macharius/Malcador families, Elysians…) sat in the playable set. Fixed: 11e mode skips Legends datasheets (parity with the Wahapedia `isLegends` drop).
4. **Legends heading truncation.** PDF headings break mid-name; the tail lands glued to the KEYWORDS line. "PAINBOY ON WARBIKE" parsed as "PAINBOY" and collided with the live Painboy (same for WARBOSS/NOBZ/BIG MEK×2/DEFFKOPTAS/NOB variants). Fixed in the pack parser: continuation join (`ON|WITH|IN|OF …` prefix before `KEYWORDS:`).
5. **Duplicate-summary massage pass ate real nodes.** The pass deduped on `category+faction+edition+summary`; structurally identical weapons on different datasheets collide (only 3 of 12 Ork Choppa nodes survived — 9 unit cards rendered without their weapon), as do real units with identical loadouts (Fluxmaster vs Changecaster — Fluxmaster's 11e twin was deleted). Fixed: key now includes `datasheetId`.
6. **Pack-declared Legends retire pass + stale stub.** Venerable Dreadnought is 10e-legal in Wahapedia but Legends in the 11e SM pack — its 11e twin now retires at build (family-pooled, regular-section precedence). The hand-scraped leak-era "Red Terror" stub in `src/data/11th-edition-detachments.ts` duplicated the pack's THE RED TERROR and was removed.

## Residual notes (documented, not fixed here)

- **SQL `content_entity` is stale**: 1680 datasheets across 25 faction groups; still carries `unaligned-forces` (20) and `adeptus-titanicus` (4), chapters not split out, none of this reconciliation's copies. The registry re-sync belongs to the unified-data/content-silo work, not this working set.
- **BSData catalogs over-count by design**: each faction catalog embeds allied rosters (agents, daemons) and Legends entries; SM chapter catalogs each carry the full shared roster. The `chapterSpecificHome` convention (≤2 catalogs = chapter home, ≥3 = shared) is applied before comparing.
- **Ynnari** (90 BSData units) is a Craftworlds+Drukhari composite, not one of the 36 factions — excluded.
- **AM pack extract artifact**: "PROVISIONALLY PREPARED" appears in the AM Legends extract list — a rules phrase, not a unit; inert since pack Legends no longer emit.

## Terminal acceptance test — 432 checks

Per the goal doc §5: from the **live website**, through all four brain interfaces (**ask, search, browse, graph**), load a random 11e unit from each of the 36 factions, verify the correct unit datasheet renders, screenshot every load, 3 iterations. A **different random unit is drawn for every check** (per-interface seed). Harness: `apps/brain/server/scripts/acceptance-units.mjs` (Playwright, drives the real UI: tab clicks, browse pagination, semantic search, graph visualization, ask RAG).

- Deploy under test: R2 upload 2026-07-06 + Vectorize re-index (40/40 files, 0 errors) + CDN purge. Live Units layer count: 1153.
- Screenshot archive + `results.json`: `apps/brain/server/.local/acceptance-units/<runId>/`.

**Result:** _PENDING — run in progress, to be filled on completion._
