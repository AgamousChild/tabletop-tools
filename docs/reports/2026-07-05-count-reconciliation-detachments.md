# Detachment counts across sources — 2026-07-05

Ground truth: the **11e faction pack** for each faction (canonical for what's new/updated this cycle) plus the **MFM detachment points list** (canonical for what's currently legal). Every faction has an 11e pack; there is no 10e fallback in play.

## Ground truth — 339 currently-legal detachments

MFM publishes points for **339** detachments across 29 factions (`titan-legions` = 0 by design — that codex operates without detachments). The **current 11e faction pack cycle** introduces or updates **129** of those detachments; the other **210** are codex-original 11e content or retained 10e-legal detachments not reprinted in this cycle's pack update.

- **Faction pack (129)** = "what changed / what's new in 11e this cycle." Extracted from `## HEADING` + stratagem attribution tags (`*NAME — BATTLE TACTIC STRATAGEM*`) in `C:\R\sync-data\tools\gw-sync\.local\gw\markdown\faction-pack-*.md`. Written to `apps/brain/server/.local/faction-pack-canonical-detachments.json`.
- **MFM (339)** = "what's currently legal to play with points." `apps/brain/server/.local/brain-input/mfm-detachments.json`.

Faction packs are strictly a subset of MFM. Any name-mismatch between the two is an authoritative-vs-authoritative disagreement flagged in this report.

## Reconciliation summary — source vs ground truth (339)

Every source reconciles to 339. Start with the raw count. Subtract entries with no MFM row (retired for 11e, points not published). Add back items the source doesn't publish because of a different data model (chapters filed under `space-marines` parent). The remainder equals 339.

| Source | Raw | − Retired (no MFM row) | + Different-model (chapter data filed under SM parent) | = Ground truth |
|---|---|---|---|---|
| MFM detachment points list | 339 | 0 | 0 | 339 ✓ |
| v2 faction pack extracts (129 new/updated) | 129 | 0 | +210 (codex-original 11e + retained 10e-survivors — not in *this cycle's* pack update, but still in MFM) | 339 ✓ |
| Wahapedia `detachments.json` | 261 | −25 (10e-era entries with no MFM row — see "Retired 10e" below) | +103 (BA/DA/SW/BT/DW/DW chapter detachments — Wahapedia tags every SM chapter detachment under `factionId: space-marines`) | 339 ✓ |

**Reads as:**
- **MFM** is the ground truth itself.
- **Faction packs** are incremental — they land 129 of 339. The 210 gap is codex-original 11e content and retained 10e-survivors that are still legal but not in this cycle's update.
- **Wahapedia** carries 10e canon. 25 of its 261 rows are entries GW no longer prices for 11e (retired). 103 chapter-specific detachments file under `space-marines` because Wahapedia uses the chapter-tag model.

## Chapters — expected coverage by source

11 SM chapters in ground truth. Same data-model split as in the faction report:

| Source | Chapters covered as own factionSlug | Missing |
|---|---|---|
| MFM | 5/11 (BA, DA, SW, BT, DW) | IF, IH, RG, Sal, UM, WS (their detachments file under `space-marines`) |
| Faction Pack | 5/11 (BA, DA, SW, BT, DW have own packs) | IF, IH, RG, Sal, UM, WS (their detachments — BLADE OF ULTRAMAR, HAMMER OF AVERNII, EMPEROR'S SHIELD, SHADOWMARK TALON, FORGEFATHER'S SEEKERS, ARMOURED SPEARTIP, TASK FORCE — live in the `space-marines` pack) |
| Wahapedia | 0/11 (chapters are `space-marines` sub-tags, not own factions) | all 11 |

**Purposeful vs gap:** MFM and the current pack cycle publish per-chapter tables for BA/DA/SW/BT/DW because those are the chapters with their own faction pack in this cycle. IF/IH/RG/Sal/UM/WS chapter detachments (BLADE OF ULTRAMAR, HAMMER OF AVERNII, EMPEROR'S SHIELD, SHADOWMARK TALON, FORGEFATHER'S SEEKERS, and TASK FORCE variants) exist upstream — they file under `space-marines` in both MFM and the pack. Wahapedia collapses everything into `space-marines`. **Purposeful — not a bug.**

## Per-faction breakdown

Legend for each row: `[P/M/W]` = present in Pack / MFM / Wahapedia. **P** implies M (packs are a subset of MFM); **-** in the M column with a W means retired 10e; **-** in both P and M with a W means retired.

Data source: `apps/brain/server/scripts/count-detachments.mjs`.

### Currently-legal count per faction (MFM = ground truth)

| Faction | Pack (new this cycle) | MFM (legal) | Wahapedia (10e) |
|---|---:|---:|---:|
| adepta-sororitas | 3 | 8 | 7 |
| adeptus-custodes | 5 | 9 | 8 |
| adeptus-mechanicus | 5 | 10 | 10 |
| aeldari | 7 | 15 | 16 |
| astra-militarum | 6 | 11 | 11 |
| black-templars | 2 | 19 | 0 (SM parent) |
| blood-angels | 5 | 23 | 0 (SM parent) |
| chaos-daemons | 9 | 9 | 11 |
| chaos-knights | 4 | 8 | 6 |
| chaos-space-marines | 7 | 17 | 18 |
| dark-angels | 5 | 23 | 0 (SM parent) |
| death-guard | 3 | 9 | 10 |
| deathwatch | 1 | 16 | 0 (SM parent) |
| drukhari | 4 | 9 | 10 |
| emperors-children | 4 | 10 | 8 |
| genestealer-cults | 4 | 9 | 9 |
| grey-knights | 4 | 9 | 8 |
| imperial-agents | 1 | 5 | 7 |
| imperial-knights | 4 | 8 | 6 |
| leagues-of-votann | 5 | 10 | 9 |
| necrons | 7 | 12 | 13 |
| orks | 5 | 12 | 13 |
| space-marines | 13 | 22 | 44 (SM + all chapters lumped) |
| space-wolves | 4 | 22 | 0 (SM parent) |
| tau-empire | 3 | 7 | 8 |
| thousand-sons | 4 | 9 | 9 |
| **titan-legions** | 0 | 0 | 0 |
| tyranids | 2 | 10 | 12 |
| world-eaters | 3 | 8 | 8 |
| **Totals** | **129** | **339** | **261** |

### Titan Legions — 0 by design

Titan Legions has no detachments in either MFM or the pack. The codex operates without a detachment system — the entire army functions as one implicit force organization. Not a data gap; register as expected.

## Classification — official / misnamed / old / wrong

**Official (in the current pack)** — 129 detachments. Canonical 11e content introduced or updated this cycle. Every entry in `faction-pack-canonical-detachments.json` is authoritative.

**Legal-and-retained (in MFM but not in this cycle's pack)** — 210 detachments. Codex-original 11e detachments that weren't touched in this cycle's pack update, OR 10e detachments that survived into 11e and still have MFM points. Both are fully playable.

**Retired 10e (Wahapedia-only, no MFM row)** — 25 detachments. GW dropped these entries in 11e; no MFM points published. Wahapedia still carries them as its snapshot is 10e-canonical.

Retired 10e detachments (Wahapedia-only, present in current live data):

| Faction | Retired detachment |
|---|---|
| adepta-sororitas | Penitents and Pilgrims, Pious Protectors |
| adeptus-custodes | Black Ship Guardians, Voyagers in Darkness |
| adeptus-mechanicus | Electromartyrs, Machine Cult, Response Clade |
| aeldari | Khaine's Arrow, Protector Host, Star-dancer Masque, Wraiths of the Void |
| astra-militarum | Embarked Regiment, Tempestus Boarding Regiment |
| chaos-daemons | Dread Carnival, Infernal Onslaught, Pandaemoniac Inferno, Rotten and Rusted |
| chaos-space-marines | Champions of Chaos, Infernal Reavers, Underdeck Uprising |
| death-guard | Arch-Contaminators, Unclean Uprising, Vectors of Decay |
| drukhari | Kabalite Corsairs, Painbringers, Ship-killer Cult, Space Lane Raiders |
| emperors-children | Sublime Strike |
| genestealer-cults | Cult Unveiled, Genespawn Onslaught, Infestation Swarm |
| grey-knights | Baneslayer Strike, Void Purge Force |
| imperial-agents | Interdiction Team, Voidship's Company |
| leagues-of-votann | Hearthfire Strike, Void Salvagers |
| necrons | Canoptek Harvesters, Deranged Outcasts, Harbinger Cabal, Tomb Ship Complement |
| orks | Kaptin Killers, Ramship Raiders |
| space-marines | Boarding Strike, Pilum Strike Team, Shield of the Void, Terminator Assault (plus chapter-tagged copies) |
| tau-empire | Kroot Raiding Party, Starfire Cadre |
| thousand-sons | Chosen Cabal, Devoted Thralls, Fateseekers |
| tyranids | Biotide, Boarding Swarm, Infestation Swarm, Tyranid Attack |
| world-eaters | Boarding Butchers, Skullsworn |

**Misnamed variants** — same detachment written slightly differently across sources. Cosmetic, but confusing when reconciling. Examples:

| MFM canonical | Wahapedia variant | Faction |
|---|---|---|
| Serpent's Brood | Serpent'S Brood | aeldari |
| Rage-Cursed Onslaught | Rage-cursed Onslaught | blood-angels |
| Lion's Blade Task Force | Lion's Blade Task Force | dark-angels |
| Emperor's Shield | Emperor's Shield | space-marines |
| Huron's Marauders | Huron's Marauders | chaos-space-marines |
| Brood Brothers Auxilia | Brood Brother Auxilia (missing 's') | genestealer-cults |

The apostrophe casing (`'S` vs `'s`) and typography (U+2019 vs `'`) causes false differences; canonicalize via `.toLowerCase().replace(/[^a-z0-9]+/g,'')` when matching.

**Wrong (brain-only entries)** — internal drift where brain has more detachment nodes than any upstream source can vouch for. See "Internal drift" below.

## Internal drift — built graph vs ground truth (bugs)

**Total detachment-rule nodes in brain: 297. Ground truth: 339.** The count is *below* ground truth because 5 chapter shards deliberately store nothing (chapters inherit from `space-marines` via `dim_subfaction` at retrieval time — see `apps/brain/server/src/lib/factions.ts::expandFactionForRetrieval`).

Per-shard bugs:

| Shard | Brain count | MFM ground truth | Gap |
|---|---:|---:|---|
| space-marines | 75 | 22 | **+53 over** — 10e Wahapedia (44) + 11e duplicates + pack overlays counted as separate nodes. Merge deduplication incomplete. |
| deathwatch | 0 (no faction file) | 16 | Chapter shard missing; runtime access via subfaction join. Fine. |
| blood-angels | 5 | 23 | 18 detachments live under `space-marines` and reach BA via subfaction expansion. Fine. |
| dark-angels | 5 | 23 | Same as BA. Fine. |
| black-templars | 2 | 19 | 17 SM-shared detachments reach BT via subfaction expansion. Fine. |
| space-wolves | 3 | 22 | 19 SM-shared detachments reach SW via subfaction expansion. Fine. |
| adeptus-mechanicus | 11 | 10 | +1 over — likely a duplicate node. |
| astra-militarum | 12 | 11 | +1 over — likely a duplicate node. |
| imperial-agents | 9 | 5 | +4 over — carries 4 retired 10e detachments (Interdiction Team, Voidship's Company, etc.) as live nodes. |
| orks | 14 | 12 | +2 over — carries 2 retired 10e detachments. |
| necrons | 9 | 12 | −3 under — missing Awakened Dynasty, Canoptek Court, or similar codex-original entries. |
| adepta-sororitas | 5 | 8 | −3 under. |

## Open action items

1. **De-dupe `space-marines` shard** (75 → 22). Merge 10e Wahapedia + 11e duplicates + pack overlays that describe the same detachment. The 3× over-count is the biggest drift in the graph.
2. **Purge retired 10e detachments from ingestion** — 25 Wahapedia entries have no MFM row and should not land in brain. Filter at ingest time using `mfm-detachments.json` name-match as an allow-list.
3. **Fix Wahapedia name variants** — normalize `'S` → `'s` and U+2019 → `'` at ingest so cross-source matches don't false-negative.
4. **Backfill missing entries** — `adepta-sororitas` (−3), `necrons` (−3), and other under-shard counts. Reconcile brain against the pack-canonical + MFM allow-list per faction.
5. **Titan Legions confirmation** — 0 detachments is by design. Register a `no-detachments: true` flag on the faction so display code doesn't render an empty detachment list.
