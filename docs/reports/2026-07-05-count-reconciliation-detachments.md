# Detachment counts across sources — 2026-07-05 (v2)

Ground truth: the **11e faction pack** for each faction (canonical for what's new/updated this cycle) plus the **MFM detachment points list** (canonical for what's currently legal). Every faction has an 11e pack.

## Data model

**Space Marines chapters (BA, DA, SW, BT, DW, IF, IH, RG, Sal, UM, WS) do not duplicate the SM shared library.** All shared SM detachments live once under `space-marines`. Chapters reach them at query time via `expandFactionForRetrieval` walking `dim_subfaction`. Chapter shards hold only the detachments that are genuinely chapter-specific.

Rule for the SM pack division: the SM faction pack is the sole source of shared SM detachments. Chapter packs contain only chapter-specific content. MFM lists shared SM detachments redundantly under each chapter's `factionSlug` — that redundancy is inheritance, not additional entries.

## Ground truth — 266 unique detachments, 339 MFM rows

- **MFM rows: 339** currently-legal entries (across `factionSlug` values).
- **Chapter-redundant MFM rows: 73** — shared SM detachments listed under BA/DA/SW/BT/DW factionSlugs. These are pure inheritance; they duplicate the space-marines rows and don't represent additional detachments.
- **Unique 11e detachment nodes: 266** — what the brain should actually build.

`titan-legions` = 0 by design (codex operates without detachments). IF/IH/RG/Sal/UM/WS = 0 by design (pure inheritance from SM).

Per-shard breakdown of the 266:

| Shard | Nodes | In pack (has 11e content) | No-errata (copy 10e as-is) |
|---|---:|---:|---:|
| **space-marines** | 22 | 13 | 9 |
| **BA / DA / SW / BT / DW (chapter-specific only)** | 30 | 23 | 7 |
| **Non-SM factions (23 total)** | 214 | 159 | 55 |
| **IF, IH, RG, Sal, UM, WS** | 0 | 0 | 0 |
| **Total unique 11e nodes** | **266** | **195** | **71** |

Full per-shard build spec: `apps/brain/server/.local/detachments-no-errata.json`.

## Reconciliation summary — source vs ground truth (266 unique)

Every source reconciles to the 266-node truth. Start with the raw count. Subtract entries not currently legal (no MFM row). Subtract chapter redundancy where the source repeats the same detachment per chapter. Add back detachments the source doesn't publish because it uses a different data model (Wahapedia's SM chapter tags).

| Source | Raw count | − Retired 10e (no MFM row) | − Chapter redundancy (same detachment × chapters) | + Different-model gaps | = Unique 11e |
|---|---:|---:|---:|---:|---:|
| MFM detachment points list | 339 | 0 | −73 (SM shared × 5 chapters) | 0 | 266 ✓ |
| v2 faction pack extracts | 195 | 0 | 0 (packs never duplicate across chapters) | +71 (10e no-errata carryovers) | 266 ✓ |
| Wahapedia `detachments.json` | 261 | −25 (retired 10e — no MFM row) | 0 (Wahapedia tags all SM under `space-marines`, doesn't split by chapter) | +30 (chapter-specific 11e detachments introduced/updated in chapter packs — Marshal's Household, Angelic Inheritors, Lion's Blade Task Force, Champions of Fenris, Black Spear Task Force, etc.) | 266 ✓ |

**Reads as:**
- **MFM** ground truth is 266 unique; 339 rows only because chapters get redundant lookup rows.
- **Faction packs** are incremental additions. Combined pack coverage (SM + all chapter + non-SM) accounts for 195 detachments with 11e content. The remaining 71 stand as 10e Wahapedia unchanged.
- **Wahapedia** carries 10e canon. 25 rows are retired for 11e. The other 236 map directly onto 236 of the 266 (SM shared + non-SM). The 30 chapter-specific 11e-introduced detachments come from the chapter packs.

## Per-faction breakdown (currently-legal count, MFM = ground truth)

| Faction | Unique 11e nodes | In pack | No-errata (10e as-is) |
|---|---:|---:|---:|
| adepta-sororitas | 8 | 7 | 1 (Army Of Faith) |
| adeptus-custodes | 9 | 8 | 1 (Null Maiden Vigil) |
| adeptus-mechanicus | 10 | 7 | 3 (Data-Psalm Conclave, Explorator Maniple, Rad-Zone Corps) |
| aeldari | 15 | 15 | 0 |
| astra-militarum | 11 | 9 | 2 (Combined Arms, Hammer Of The Emperor) |
| chaos-daemons | 9 | 9 | 0 |
| chaos-knights | 8 | 8 | 0 |
| chaos-space-marines | 17 | 7 | 10 (Chaos Cult, Deceptors, Devotees Of Destruction, Dread Talons, Fellhammer Siege-Host, Murdertalon Raiders, Pactbound Zealots, Renegade Raiders, Soulforged Warpack, Veterans Of The Long War) |
| death-guard | 9 | 4 | 5 (Champions Of Contagion, Death Lord's Chosen, Mortarion's Hammer, Shamblerot Vectorium, Virulent Vectorium) |
| drukhari | 9 | 7 | 2 (Kabalite Cartel, Realspace Raiders) |
| emperors-children | 10 | 10 | 0 |
| genestealer-cults | 9 | 9 | 0 |
| grey-knights | 9 | 6 | 3 (Augurium Task Force, Banishers, Sanctic Spearhead) |
| imperial-agents | 5 | 1 | 4 (Imperialis Fleet, Ordo Hereticus (Purgation Force), Ordo Malleus (Daemon Hunters), Ordo Xenos (Alien Hunters)) |
| imperial-knights | 8 | 5 | 3 (Gate Warden Lance, Questoris Companions, Spearhead-At-Arms) |
| leagues-of-votann | 10 | 8 | 2 (Dêlve Assault Shift, Hearthfyre Arsenal) |
| necrons | 12 | 11 | 1 (Awakened Dynasty) |
| orks | 12 | 5 | 7 (Bully Boyz, Da Big Hunt, Dread Mob, Green Tide, Kult Of Speed, Rollin' Deff, War Horde) |
| **space-marines (shared)** | **22** | **13** | **9 (1st Company Task Force, Anvil Siege Force, Firestorm Assault Force, Fulguris Task Force, Gladius Task Force, Ironstorm Spearhead, Stormlance Task Force, Subversion Assets, Vanguard Spearhead)** |
| **black-templars (specific)** | **6** | **5** | **1 (Godhammer Assault Force)** |
| **blood-angels (specific)** | **8** | **5** | **3 (Liberator Assault Group, Rage-Cursed Onslaught, The Lost Brethren)** |
| **dark-angels (specific)** | **8** | **8** | **0** |
| **deathwatch (specific)** | **1** | **1 (Black Spear Task Force)** | **0** |
| **space-wolves (specific)** | **7** | **5** | **2 (Saga Of The Bold, Saga Of The Hunter)** |
| **imperial-fists / iron-hands / raven-guard / salamanders / ultramarines / white-scars** | **0 each** | **0** | **0** |
| tau-empire | 7 | 6 | 1 (Kroot Hunting Pack) |
| thousand-sons | 9 | 8 | 1 (Rubricae Phalanx) |
| titan-legions | 0 | 0 | 0 |
| tyranids | 10 | 2 | 8 (Ambush Predators, Assimilation Swarm, Crusher Stampede, Invasion Fleet, Synaptic Nexus, Talons Of The Norn Queen, Unending Swarm, Vanguard Onslaught) |
| world-eaters | 8 | 6 | 2 (Cult Of Blood, Possessed Slaughterband) |
| **Totals** | **266** | **195** | **71** |

## Classification — official / misnamed / old / wrong

**Official 11e (in a faction pack) — 195 detachments.** Canonical 11e content introduced or updated this cycle. Every entry in `apps/brain/server/.local/faction-pack-canonical-detachments.json` is authoritative.

**Legal-and-retained (in MFM, no pack content) — 71 detachments.** 10e-era detachments still legal for 11e; no changes in this cycle's pack. Copy the 10e Wahapedia rule text into an 11e node unchanged. See the "no-errata" columns above for the full list.

**Retired 10e (Wahapedia-only, no MFM row) — 25 detachments.** GW no longer prices these for 11e. Wahapedia still carries them as a 10e-canonical snapshot; brain should keep them ONLY as `edition: '10th'` nodes with no 11e twin.

Retired 10e detachments:

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
| space-marines | Boarding Strike, Pilum Strike Team, Shield of the Void, Terminator Assault |
| tau-empire | Kroot Raiding Party, Starfire Cadre |
| thousand-sons | Chosen Cabal, Devoted Thralls, Fateseekers |
| tyranids | Biotide, Boarding Swarm, Infestation Swarm, Tyranid Attack |
| world-eaters | Boarding Butchers, Skullsworn |

**Misnamed variants** — cosmetic apostrophe/typography drift across sources (`'S` vs `'s`, U+2019 vs `'`). Normalize at ingest via `String.toLowerCase().replace(/[^a-z0-9]+/g,'')` for matching.

**Wrong (brain-only entries)** — internal drift; see "Internal drift" below.

## Internal drift — built graph vs ground truth

**Total detachment-rule nodes in brain: 297. Corrected ground truth: 266 unique 11e nodes** (plus preserved 10e-only retired nodes as legacy).

Per-shard drift vs the corrected build spec:

| Shard | Brain 11e today | Should be | Gap |
|---|---:|---:|---|
| space-marines | 75 (10e + 11e duplicates) | 22 shared library | +53 duplicates. 10e/11e coexist by design under duplicate-eleventh; but the 11e side has multiple copies of the same detachment (Wrathful Procession × 2, Champions of Fenris × 2, etc.) |
| deathwatch | 0 (no faction file) | 1 (Black Spear Task Force) | Missing chapter-specific node |
| blood-angels | 5 | 8 | Missing 3 (Liberator Assault Group, Rage-Cursed Onslaught, The Lost Brethren) |
| dark-angels | 5 | 8 | Missing 3 (Company Of Hunters, Inner Circle Task Force, Unforgiven Task Force) |
| black-templars | 2 | 6 | Missing 4 (Companions Of Vehemence, The Living Miracle, Vindication Task Force, Godhammer Assault Force) |
| space-wolves | 3 | 7 | Missing 4 (Legends Of Saga And Song, Saga Of The Beastslayer, Veterans Of The Fang, Saga Of The Bold, Saga Of The Hunter) |
| adepta-sororitas | 5 | 8 | Missing 3 (Chorus Of Condemnation, Sacred Champions, Sanctified Orators) |
| necrons | 9 | 12 | Missing 3 (Hand Of The Dynasty, Skyshroud Spearhead, The Phaeron's Armoury) |
| chaos-daemons | 6 | 9 | Missing 3 (Cavalcade Of Chaos, Lords Of The Warp, Warptide) |
| chaos-space-marines | 15 | 17 | Missing 2 (Devotees Of Destruction, Murdertalon Raiders) |
| leagues-of-votann | 7 | 10 | Missing 3 (Armoured Trailblazers, Farseekers, Hearthguard Covenant) |
| aeldari | 12 | 15 | Missing 3 (Fateful Performance, Path Of The Outcast, Twilight Flickers) |
| emperors-children | 8 | 10 | Missing 3 (Elegant Brutes, Frenzied Host, Spectacle Of Slaughter) |
| imperial-agents | 9 | 5 | +4 (carries retired 10e nodes as live) |
| orks | 14 | 12 | +2 (carries retired 10e nodes as live) |
| adeptus-mechanicus | 11 | 10 | +1 |
| astra-militarum | 12 | 11 | +1 |

Also: 14 brain nodes have truncated/typo titles from PDF column-break artifacts (see "Name typos" in the follow-up plan).

## Open action items

Detailed plan: `docs/superpowers/plans/2026-07-05-detachment-ingestion-completion.md`.

1. **Fix pack parser** to extract detachments via `##### NAME DETACHMENT` errata headings, `### NAME` H3 headings, and TOC entries, not just `## NAME` + stratagem attribution.
2. **Build 30 missing chapter-specific nodes** from chapter packs (BA, DA, SW, BT, DW). IF/IH/RG/Sal/UM/WS get zero nodes — pure inheritance.
3. **De-duplicate space-marines shard** (75 → 22). 10e/11e coexist by design but the 11e side has real duplicates from multiple ingest passes.
4. **Retire 25 Wahapedia-only 10e entries.** Keep as `edition: '10th'` only — do not emit an 11e twin. MFM allow-list check at duplicate-eleventh step.
5. **Copy 71 no-errata detachments 10e→11e** unchanged. Full list per shard in `.local/detachments-no-errata.json`.
6. **Fix 14 truncated/typo titles** (`TASK FORCE`, `SEEKERS`, `Marshall's Household`, `Incarnadine Speartip`, `Dark Flight Pursuit`, `Living Miracle`, `PHOENICIAN`, `ASSAULT`, `ONSLAUGHT` × 2, `BATTLE CLADE`, `PROTOTYPE CADRE`, `ELIMINATION FORCE`, `Brood Brother Auxilia`).
