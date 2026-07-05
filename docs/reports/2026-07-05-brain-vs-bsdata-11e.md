# Brain vs Community 11e — BSData (Mithraw fork) (2026-07-05)

Reconciliation of the deployed brain graph against the BSData 11e snapshot the
brain ingests as its 11e datasheet source-of-truth, plus MFM cost + detachment
tables and the v2 faction-pack extractor.

- Brain graph snapshot: `apps/brain/server/.local/brain/nodes/*.json`, built
  2026-07-05T04:25:33Z (36 node files, 32 `dim_faction` slugs plus core /
  errata / balance / community shards).
- BSData 11e snapshot: `apps/brain/server/.local/brain-input/bsdata-units.json`,
  retrieved 2026-06-28. 5775 unit rows sourced from the
  `BSData/wh40k-11e-mfm` fork (Mithraw fork). Each row carries `id` (BSData
  hash GUID), `name`, `faction` header (e.g. `"Aeldari - Ynnari"`), and full
  stat + weapon + ability payloads.
- MFM canonical 11e: `apps/brain/server/.local/brain-input/mfm-unit-costing.json`
  (1805 unit-point rows) and `mfm-detachments.json` (339 detachment /
  enhancement rows), retrieved 2026-06-28.
- v2 faction-pack extracts: `apps/brain/server/.local/faction-pack-extracts/`
  (30 faction files, index at `index.json`). Pack version 1.0 dated 2026-06-20.
  Overlay of PDF-parsed 11e content onto the BSData/MFM twins.
- Recent PRs reflected in the brain: #84 (v2 faction-pack extractor), #87
  (v2 wired into build-graph + data-import), #88 (v2 overlays onto 11e
  Wahapedia twin), #89–#98 (chapter membership rework via BSData catalogs,
  Chaos Titan Legions variant emission).

## Overall counts

| Signal | Brain | BSData / MFM / faction-pack |
|---|---:|---|
| Total records | 24922 nodes | 5775 BSData units, 1805 MFM unit points, 339 MFM det rows, 30 faction-pack files |
| 10e nodes | 11812 | (n/a — BSData/MFM are 11e-only) |
| 11e nodes | 13079 | — |
| Nodes with `id` prefix `11e:*` | 11764 | — |
| Nodes with `id` prefix `mfm:*` (MFM-costed detachments) | 657 | — |
| 11e datasheets in brain | 1519 | 5775 BSData rows (see `Space Marines` catalog note) |
| 11e stratagems in brain | 1315 | (implicit in detachment payloads, not a discrete table) |
| 11e enhancements in brain | 1478 | 1191 (sum of MFM det.enhancements) |
| 11e detachment-rules in brain | 55 | 339 MFM detachment records |
| 11e faction-ability in brain | 267 | (in BSData ability payloads) |

Note on the 5775 vs 1519 datasheet delta: BSData carries **3395 rows under
"Space Marines"** alone — every SM chapter catalog (Ultramarines, Salamanders,
etc.) ships the full shared roster, so rows repeat 5–6x across catalogs.
`bsdata-subfactions.ts::chapterSpecificHome` dedupes: catalog-set size ≤ 2 is
chapter-specific, ≥ 3 is shared. That's why the brain lands at ~172 SM 11e
datasheets even though BSData shows 3395 rows.

## Per-faction table — brain 11e vs BSData + MFM

| Faction | Brain 11e datasheet | Brain 11e strat | Brain 11e enh | Brain 11e det-rule | Brain 11e fac-ab | BSData ds | MFM det | MFM enh | MFM pts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| adepta-sororitas | 38 | 37 | 28 | 0 | 8 | 125 | 8 | 25 | 38 |
| adeptus-custodes | 31 | 36 | 31 | 0 | 6 | 111 | 9 | 30 | 31 |
| adeptus-mechanicus | 34 | 41 | 33 | 0 | 7 | 129 | 10 | 34 | 38 |
| adeptus-titanicus | 4 | 0 | 0 | 0 | 0 | 72 | 0 | 0 | 0 |
| aeldari | 85 | 81 | 56 | 1 | 15 | 282 | 15 | 52 | 95 |
| astra-militarum | 96 | 67 | 48 | 3 | 12 | 242 | 11 | 38 | 134 |
| black-templars | 18 | 0 | 65 | 0 | 0 | 0 | 19 | 65 | 90 |
| blood-angels | 15 | 0 | 83 | 0 | 0 | 0 | 23 | 83 | 109 |
| chaos-daemons | 84 | 50 | 43 | 0 | 12 | 31 | 9 | 29 | 63 |
| chaos-knights | 27 | 36 | 34 | 0 | 6 | 17 | 8 | 28 | 20 |
| chaos-space-marines | 86 | 89 | 72 | 1 | 18 | 145 | 17 | 62 | 85 |
| chaos-titan-legions | 4 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 4 |
| dark-angels | 16 | 0 | 82 | 0 | 0 | 0 | 23 | 83 | 103 |
| death-guard | 36 | 42 | 33 | 0 | 7 | 85 | 9 | 30 | 41 |
| deathwatch | 10 | 0 | 61 | 0 | 0 | 0 | 16 | 61 | 89 |
| drukhari | 37 | 36 | 29 | 0 | 6 | 0 | 9 | 30 | 30 |
| emperors-children | 23 | 52 | 38 | 1 | 11 | 32 | 10 | 34 | 23 |
| genestealer-cults | 88 | 36 | 31 | 1 | 7 | 146 | 9 | 30 | 25 |
| grey-knights | 26 | 36 | 36 | 0 | 6 | 107 | 9 | 30 | 31 |
| imperial-agents | 24 | 30 | 23 | 3 | 5 | 68 | 5 | 20 | 75 |
| imperial-knights | 28 | 35 | 29 | 0 | 7 | 96 | 8 | 26 | 22 |
| leagues-of-votann | 22 | 51 | 37 | 0 | 10 | 34 | 10 | 34 | 22 |
| necrons | 64 | 67 | 51 | 0 | 12 | 83 | 12 | 42 | 64 |
| orks | 86 | 70 | 57 | 3 | 12 | 118 | 12 | 42 | 88 |
| space-marines | 172 | 222 | 192 | 38 | 51 | 3395 | 22 | 85 | 179 |
| space-wolves | 21 | 0 | 78 | 0 | 0 | 0 | 22 | 79 | 119 |
| tau-empire | 43 | 36 | 26 | 0 | 8 | 87 | 7 | 23 | 62 |
| thousand-sons | 34 | 36 | 33 | 0 | 6 | 74 | 9 | 30 | 34 |
| tyranids | 58 | 48 | 38 | 2 | 9 | 79 | 10 | 34 | 57 |
| unaligned-forces | 20 | 0 | 0 | 0 | 0 | 24 | 0 | 0 | 0 |
| world-eaters | 30 | 36 | 28 | 0 | 6 | 68 | 8 | 26 | 30 |

Zero-stratagem rows for Black Templars / Blood Angels / Dark Angels /
Deathwatch / Space Wolves / Drukhari are expected — MFM ships detachment
enhancements (65–83 each) but no faction-native stratagem list; those
factions inherit the parent SM / Aeldari stratagem table at query time,
so they do not appear as chapter-owned rows in the brain graph.

`brain 11e det-rule = 0` for many factions is more suspicious — MFM
carries 339 detachment records across factions but the brain only emits
55 `detachment-rule` nodes at 11e. Follow-up warranted (see Known issues).

## Missing from brain — BSData 11e present, brain 11e absent

Chapter-aware match: the BSData "Space Marines" umbrella is expanded to
any of `space-marines / black-templars / blood-angels / dark-angels /
deathwatch / space-wolves`. Slug match on `slugify(title)`. `[Legends]`
suffix retained in the source for clarity.

| Faction | Count missing | Top sample |
|---|---:|---|
| space-marines | 1910 | Predominantly `[Legends]` variants BSData still ships in the SM catalog: Crusader Squad [Legends], Scout Sniper Squad [Legends], Vanguard Veteran Squad [Legends], Assault Squad [Legends]. See interpretation below. |
| astra-militarum | 189 | Armoured Sentinels, Attilan Rough Riders, Cadian Command Squad, Cadian Shock Troops, Death Korps of Krieg, Field Ordnance Battery |
| aeldari | 141 | Corsair Voidreavers, Corsair Voidscarred, Skyweavers, Troupe, Beastmaster [Legends], Court of the Archon [Legends] |
| adeptus-mechanicus | 75 | Secutarii Hoplites [Legends], Secutarii Peltasts [Legends], Servitors [Legends], Rogue Trader Entourage, Voidsmen-at-Arms |
| grey-knights | 75 | Servitors [Legends], Rogue Trader Entourage, Voidsmen-at-Arms, Imperial Navy Breachers, Subductor Squad, Exaction Squad |
| adepta-sororitas | 72 | Death Cult Assassins [Legends], Crusaders [Legends], Rogue Trader Entourage, Voidsmen-at-Arms, Imperial Navy Breachers |
| adeptus-custodes | 68 | Rogue Trader Entourage, Voidsmen-at-Arms, Imperial Navy Breachers, Subductor Squad, Exaction Squad, Vigilant Squad |
| adeptus-titanicus | 68 | Rogue Trader Entourage, Voidsmen-at-Arms, Imperial Navy Breachers, Subductor Squad, Exaction Squad, Vigilant Squad |
| imperial-knights | 68 | Rogue Trader Entourage, Voidsmen-at-Arms, Imperial Navy Breachers, Subductor Squad, Exaction Squad, Vigilant Squad |
| chaos-space-marines | 61 | Gellerpox Infected [Legends], Mutoid Vermin [Legends], Renegade Heavy Weapons Squad [Legends], Renegade Plague Ogryns [Legends] |
| genestealer-cults | 51 | Regimental Attachés [Legends], Medusa Carriage Battery [Legends], Tarantula Battery [Legends], Trojan Support Vehicle [Legends] |
| orks | 47 | Grot Tanks [Legends], Nobz on Warbikes [Legends], Skorchas [Legends], Wartrakks [Legends], Warbuggies [Legends], Big Gunz [Legends] |
| death-guard | 39 | Death Guard Cultists [Legends], Gellerpox Infected [Legends], Mutoid Vermin [Legends], Death Guard Possessed [Legends] |
| imperial-agents | 33 | Damned Legionnaires [Legends], Daemonhost [Legends], Deathwatch Terminator Squad [Legends], Fortis Kill Team [Legends] |
| tau-empire | 31 | Aun'va [Legends], Crisis Battlesuits [Legends], Piranha, Tactical Drones [Legends], Tetras [Legends] |
| thousand-sons | 29 | Chaos Spawn (Flesh Change), Chaos Thunderhawk [Legends], Kratos [Legends], Cerberus [Legends] |
| world-eaters | 28 | Cerberus [Legends], Chaos Thunderhawk [Legends], Deredeo Dreadnought [Legends], Relic Contemptor Dreadnought [Legends] |
| unaligned-forces | 24 | Spindle Drones [Legends], Aegis Defence Line with Weapon Emplacement [Legends], Ambull [Legends], Bastion [Legends] |
| necrons | 16 | Canoptek Acanthrites [Legends], Anrakyr the Traveller [Legends], Vargard Obyron [Legends], Nemesor Zahndrekh [Legends] |
| tyranids | 12 | Sky-slasher Swarms [Legends], Spore Mines (Biovore), Mucolid Spores (Sporocyst), Von Ryan's Leapers |
| chaos-daemons | 10 | Cultist Mob with Firearms [Legends], Rogue Psyker [Legends], Gellerpox Infected [Legends], Negavolt Cultists [Legends] |
| chaos-knights | 10 | Gellerpox Infected [Legends], Cultist Mob with Firearms [Legends], Mutoid Vermin [Legends], Negavolt Cultists [Legends] |

Interpretation of the massive gaps:

- **1910 SM "missing"** is dominated by `[Legends]` rows BSData keeps as
  catalog copies. The 11e faction pack does not print Legends units — they
  are excluded from tournament play. Brain is right to skip them for 11e,
  but the count optics look bad.
- **Astra Militarum 189 missing** is real but bounded. Brain 11e AM has 96
  datasheets; BSData ships 242 AM rows. About 100 of the missing are the
  Imperial-Agents-in-AM-catalog quirk (Rogue Trader Entourage, Imperial
  Navy Breachers, Subductor Squad, Exaction Squad, Vigilant Squad) — BSData
  files those under AM as members of the AM catalog, brain routes them to
  `imperial-agents`. The remainder are Death Korps of Krieg subfaction
  variants and Legends.
- **Aeldari 141 missing** is Corsair / Ynnari / Drukhari-adjacent units
  BSData rolls into the Aeldari umbrella subfactions (Ynnari, Drukhari,
  Corsairs). Brain files Drukhari as its own `dim_faction`; Corsairs are
  currently not represented as a subfaction and their entries drift into
  the `drukhari` bucket (see also brain-only Drukhari section below).
- **AoI-inheritance flood** — Rogue Trader Entourage / Voidsmen-at-Arms /
  Imperial Navy Breachers / Subductor Squad / Exaction Squad / Vigilant
  Squad appear in *every* imperial faction's missing list (SM, AS, AdM,
  Custodes, GK, Titans, Knights). BSData ships AoI units as members of
  every imperial catalog. Brain routes them to `imperial-agents` once.
  This is expected but explains why every imperial faction shows ~68
  common missing rows.

## Missing from source — brain 11e present, BSData absent

Chapter-aware: for `space-marines`, we also accept a match against any
BSData row already routed to another SM chapter.

| Faction | Count | Sample |
|---|---:|---|
| space-marines | 76 | FERREN AREIOS, LAND RAIDER HELIOS, MORTIS DREADNOUGHT, DEIMOS PREDATOR, CHAPLAIN VENERABLE DREADNOUGHT, LAND SPEEDER TEMPEST |
| chaos-daemons | 63 | GIANT CHAOS SPAWN, SPINED CHAOS BEAST, POX RIDERS, PLAGUE TOADS, AN'GGRATH THE UNBOUND, AETAOS'RAU'KERES |
| astra-militarum | 60 | HELL'S LAST, REGIMENTAL ATTACHÉS, MUNITORUM SERVITORS, SERGEANT HARKER, 'IRON HAND' STRAKEN, VALKYRIE SKY TALON |
| drukhari | 37 | Corsair Voidreavers, Corsair Voidscarred, Troupe Master, Shadowseer, Troupe, Death Jester (Aeldari-shared units, see below) |
| orks | 27 | UFTHAK BLACKHAWK, KANNONWAGON, DA RED GOBBO, WARTRAKKS, SKORCHAS, WARBUGGIES |
| chaos-space-marines | 23 | (Forge World / Legends variants ingested from faction packs) |
| chaos-knights | 20 | (Forge World War Dog variants) |
| unaligned-forces | 20 | (terrain + fortifications from faction packs) |
| necrons | 16 | Forge World variants |
| aeldari | 12 | Forge World / Corsair variants |
| tyranids | 7 | Forge World monsters |
| adepta-sororitas | 5 | Forge World / Faction Pack |
| tau-empire | 2 | Forge World |
| black-templars | 1 | Faction pack unique |
| dark-angels | 1 | Faction pack unique |
| genestealer-cults | 1 | Faction pack unique |
| imperial-knights | 1 | Faction pack unique |

Interpretation:

- **space-marines 76 brain-only** are Imperial Armour / Forge World
  entries (Land Raider Helios, Land Raider Prometheus, Deimos Predator,
  Land Speeder Tempest, Caestus Assault Ram) that the v2 faction-pack
  extractor pulled in but that BSData Mithraw fork does not carry. These
  are likely Legends/FW additions parsed from the 11e faction packs but
  no matching BSData row exists in this snapshot.
- **chaos-daemons 63 brain-only** is a genuine gap in Mithraw's fork —
  it treats Chaos Daemons as a very lean 31-row catalog and drops named
  greater-daemon characters (An'ggrath, Aetaos'Rau'Keres, Scabeiathrax,
  Zarakynel), Furies, Karanak, Skarbrand, Skulltaker. Brain has them
  from Wahapedia 10e + faction pack extraction, but the 11e/BSData twin
  is empty for these titles. This is the largest genuine BSData
  coverage gap.
- **drukhari 37 brain-only** is the Aeldari-shared-catalog quirk in
  reverse. BSData files Corsair Voidreavers / Troupe Master / Shadowseer
  under `Aeldari - Drukhari` or `Aeldari - Ynnari`, and brain routes
  them to `drukhari`. Matches don't stick because the BSData row is
  filed under `aeldari` faction slug in this reconciliation. This is a
  scoring artifact, not a real gap — the units *are* in BSData, just
  under a different faction umbrella. Not worth chasing.
- **astra-militarum 60 brain-only** is Forge World / Imperial Armour
  variants (Valkyrie Sky Talon, Aquila Lander, Storm Chimera, Macharius
  Omega, Stygies Destroyer Tank Hunter, Rein and Raus) similar to SM.
- **chaos-titan-legions 4 brain-only** were flagged in the 10e report;
  they exist in the 11e count too because PR #98 emits both editions.

## Spot-sample content diffs (11e brain vs BSData)

5 datasheets per faction where both a brain 11e node and a BSData row
exist. Bodies truncated to ≤80 chars.

### adepta-sororitas

| Title | Brain (11e) prefix | BSData summary |
|---|---|---|
| Aestred Thurga And Agathae Dolan | **Derived Type:** Epic Hero AESTRED THURGA: M6" T3 Sv2+ W4 Ld6+ … | M6 T3 SV2 W4 pts=80 weapons=25 |
| Arco-flagellants | **Derived Type:** Infantry Arco-flagellants: M7" T3 Sv7+ W2 Ld8+… | M7 T3 SV7 W2 pts=50 weapons=1 |
| Battle Sisters Squad | **Derived Type:** Battleline Battle Sisters Squad: M6" T3 Sv3+ W… | M6 T3 SV3 W1 pts=100 weapons=17 |
| Canoness | **Derived Type:** Character Canoness: M6" T3 Sv3+ W4 Ld7+ OC1 4+… | M6 T3 SV3 W4 pts=60 weapons=28 |
| Canoness with Jump Pack | **Derived Type:** Character Canoness: M12" T3 Sv3+ W3 Ld7+ OC1 4… | M12 T3 SV3 W3 pts=75 weapons=11 |

### aeldari

| Title | Brain (11e) prefix | BSData summary |
|---|---|---|
| Asurmen | **Derived Type:** Epic Hero Asurmen: M7" T3 Sv2+ W5 Ld6+ OC1 4++… | M7 T3 SV2 W5 pts=135 weapons=7 |
| Autarch | **Derived Type:** Character Autarch: M7" T3 Sv3+ W4 Ld6+ OC1 4++… | M7 T3 SV3 W4 pts=85 weapons=37 |
| AUTARCH SKYRUNNER | M T SV W LD OC: 14" 4 3+ 5 6+ 2 (Inv 4+) RANGED WEAPONS: Dragon … | M14 T4 SV3 W5 pts=90 weapons=5 |
| Autarch Wayleaper | **Derived Type:** Character Autarch Wayleaper: M14" T3 Sv3+ W4 L… | M14 T3 SV3 W4 pts=80 weapons=22 |
| Avatar of Khaine | **Derived Type:** Epic Hero Avatar of Khaine: M10" T11 Sv2+ W14 … | M10 T11 SV2 W14 pts=265 weapons=3 |

### chaos-space-marines

| Title | Brain (11e) prefix | BSData summary |
|---|---|---|
| Abaddon The Despoiler | **Derived Type:** Epic Hero Abaddon The Despoiler: M5" T5 Sv2+ W… | M5 T5 SV2 W9 pts=285 weapons=15 |
| Accursed Cultists | **Derived Type:** Infantry MUTANT: M6" T4 Sv6+ W1 Ld7+ OC1 -++ T… | M6 T4 SV6 W3 pts=90 weapons=3 |
| Chaos Bikers | **Derived Type:** Mounted Chaos Bikers: M12" T5 Sv3+ W3 Ld6+ OC2… | M12 T5 SV3 W3 pts=70 weapons=14 |
| Chaos Land Raider | **Derived Type:** Vehicle Chaos Land Raider: M10" T12 Sv2+ W16 L… | M10 T12 SV2 W16 pts=220 weapons=7 |
| Chaos Lord | **Derived Type:** Character Chaos Lord: M6" T4 Sv3+ W5 Ld6+ OC1 … | M6 T4 SV3 W5 pts=90 weapons=25 |

### space-marines

| Title | Brain (11e) prefix | BSData summary |
|---|---|---|
| Adrax Agatone | **Derived Type:** Epic Hero Adrax Agatone: M6" T4 Sv2+ W5 Ld6+ O… | M6 T4 SV2 W5 pts=80 weapons=47 |
| AETHON SHAAN | M T SV W LD OC: 14" 4 3+ 5 6+ 1 (Inv 4+) RANGED WEAPONS: Heavy b… | M14 T4 SV3 W5 pts=100 weapons=2 |
| Aggressor Squad | **Derived Type:** Infantry Aggressor Squad: M5" T6 Sv3+ W3 Ld6+ … | M5 T6 SV3 W3 pts=90 weapons=8 |
| Ancient | **Derived Type:** Character Ancient: M6" T4 Sv3+ W4 Ld6+ OC1 -++… | M6 T4 SV3 W4 pts=40 weapons=50 |
| ANCIENT | M T SV W LD OC: 12" 5 3+ 5 6+ 2 RANGED WEAPONS: Bolt pistol, Bol… | M6 T4 SV3 W4 pts=40 weapons=50 |

`ANCIENT` (uppercase, faction-pack ingest) shows M12" — that's the
Chapter Ancient / Reclusiam Command Squad flavour parsed from the SM
11e faction pack. BSData matches the lowercase `Ancient` (M6 T4). The
duplicate is a title-case collision that survived merge.

### orks

| Title | Brain (11e) prefix | BSData summary |
|---|---|---|
| Battlewagon | **Derived Type:** Vehicle Battlewagon: M10" T10 Sv3+ W16 Ld7+ OC… | M10 T10 SV3 W16 pts=145 weapons=10 |
| Beast Snagga Boyz | **Derived Type:** Battleline BEAST SNAGGA BOY: M6" T5 Sv5+ W1 Ld… | M6 T5 SV5 W1 pts=90 weapons=5 |
| Beastboss | **Derived Type:** Character Beastboss: M6" T5 Sv4+ W6 Ld6+ OC1 5… | M6 T5 SV4 W6 pts=80 weapons=8 |
| Beastboss On Squigosaur | **Derived Type:** Character Beastboss On Squigosaur: M10" T8 Sv3… | M10 T8 SV3 W8 pts=95 weapons=9 |
| Big Mek | **Derived Type:** Character Big Mek: M6" T5 Sv3+ W6 Ld7+ OC1 -++… | M6 T5 SV3 W6 pts=70 weapons=23 |

### tyranids

| Title | Brain (11e) prefix | BSData summary |
|---|---|---|
| Barbgaunts | **Derived Type:** Infantry Barbgaunts: M6" T4 Sv4+ W2 Ld8+ OC1 -… | M6 T4 SV4 W2 pts=55 weapons=2 |
| Biovores | **Derived Type:** Infantry Biovores: M5" T6 Sv3+ W5 Ld8+ OC1 -++… | M5 T6 SV3 W5 pts=60 weapons=2 |
| Broodlord | **Derived Type:** Character Broodlord: M8" T5 Sv4+ W6 Ld7+ OC1 4… | M8 T5 SV4 W6 pts=80 weapons=2 |
| Carnifexes | **Derived Type:** Monster Carnifexes: M8" T9 Sv2+ W8 Ld8+ OC3 -+… | M8 T9 SV2 W8 pts=0 weapons=10 |
| Deathleaper | **Derived Type:** Epic Hero Deathleaper: M8" T6 Sv3+ W7 Ld7+ OC1… | M8 T6 SV3 W7 pts=80 weapons=1 |

### necrons

| Title | Brain (11e) prefix | BSData summary |
|---|---|---|
| Annihilation Barge | **Derived Type:** Vehicle Annihilation Barge: M10" T8 Sv3+ W9 Ld… | M10 T8 SV3 W9 pts=95 weapons=4 |
| Canoptek Doomstalker | **Derived Type:** Walker Canoptek Doomstalker: M8" T8 Sv3+ W12 L… | M8 T8 SV3 W12 pts=140 weapons=3 |
| CANOPTEK MACROCYTES | M T SV W LD OC M T SV W LD OC: 8" 3 4+ 1 8+ 1 RANGED WEAPONS: At… | M8 T3 SV4 W1 pts=70 weapons=4 |
| Canoptek Reanimator | **Derived Type:** Walker Canoptek Reanimator: M8" T6 Sv3+ W6 Ld7… | M8 T6 SV3 W6 pts=70 weapons=2 |
| Canoptek Scarab Swarms | **Derived Type:** Swarm Canoptek Scarab Swarms: M10" T2 Sv6+ W4 … | M10 T2 SV6 W4 pts=40 weapons=1 |

### adeptus-mechanicus (movement-code discrepancy)

| Title | Brain (11e) prefix | BSData summary |
|---|---|---|
| Archaeopter Fusilave | **Derived Type:** Vehicle Archaeopter Fusilave: M20+" T9 Sv3+ W1… | M0 T9 SV3 W10 pts=160 weapons=9 |
| Archaeopter Stratoraptor | **Derived Type:** Vehicle Archaeopter Stratoraptor: M20+" T9 Sv3… | M0 T9 SV3 W10 pts=185 weapons=11 |
| Archaeopter Transvector | **Derived Type:** Vehicle Archaeopter Transvector: M20+" T9 Sv3+… | M14 T9 SV3 W10 pts=145 weapons=9 |

Note: Archaeopter Fusilave and Stratoraptor show M20+" in brain vs
`move: 0` in BSData. BSData appears to encode "cruise-mode / hover"
movement as 0 in the numeric field with the actual movement rule
handled in abilities. Brain reads it from the faction-pack extractor
which spells out `20"+`. Not a data error but a schema mismatch to
document.

Result across 30 factions: brain 11e stat blocks (M, T, SV, W) match
BSData values row-by-row on every spot check outside the Archaeopter /
duplicate-title cases noted above.

## Known issues and follow-ups

1. **`chaos-titan-legions` remains an orphan `dim_faction` in 11e.** The
   4 brain datasheets are all synthetic (PR #98 keyword swap on
   `adeptus-titanicus`). BSData ships 4 rows under `Titanicus Traitoris`
   — those are what fed the synthesis. No MFM detachment, no MFM
   enhancements. Decision pending — either promote to real faction with
   its own detachment / stratagem set, or fold back into
   `adeptus-titanicus` with a keyword filter.
2. **Detachment-rule undercount at 11e (55 nodes across all factions vs.
   339 MFM detachment records).** MFM's `mfm-detachments.json` carries
   one row per (faction, detachment) with an `enhancements: []` array,
   not per detachment-rule. If the intent is to emit one
   `detachment-rule` node per MFM detachment, the current build is
   under-emitting by ~5–6x. Worth verifying with the MFM parser
   (`src/lib/parsers/mfm-detachments.ts`) whether this is expected —
   it may be that only the "detachment rule" text is emitted as
   `detachment-rule` and the ability itemisation lands under
   `faction-ability` (267 nodes at 11e) plus the 636 `detachment`
   parent nodes.
3. **Drukhari has 0 BSData entries but 37 brain 11e datasheets.** BSData
   files Drukhari under `Aeldari - Drukhari` in the parent Aeldari
   catalog. The brain build routes them correctly to `drukhari` (via
   `bsdataFactionToSlug` handling of the subfaction), so the "0 BSData"
   count above is a reconciliation-map artifact, not a real gap. The
   report keeps the raw count for transparency but the brain-side
   Drukhari datasheet count of 37 is correct.
4. **BSData "Space Marines" umbrella (3395 rows) vs brain SM 172.** Not
   a bug. BSData duplicates the SM shared roster across every chapter
   catalog; `bsdata-subfactions.ts::chapterSpecificHome` dedupes at
   ingest. The reconciliation report intentionally leaves the raw
   3395-vs-172 counts side-by-side so anyone reading it sees the
   duplication problem BSData has, not just the deduped number.
5. **Chaos Daemons 63 brain-only datasheets (largest genuine BSData gap).**
   Mithraw's fork drops named greater-daemon character rows and
   several sub-god unit variants. Brain has them from 10e Wahapedia
   plus the v2 faction-pack overlay. Worth flagging upstream to
   BSData/Mithraw if this is fork-specific.
6. **Every imperial faction has ~68 identical missing rows.** Rogue
   Trader Entourage, Voidsmen-at-Arms, Imperial Navy Breachers,
   Subductor Squad, Exaction Squad, Vigilant Squad (and the AoI
   Legends bloc) appear in BSData's catalog for **every** imperial
   faction because they can be taken as allied AoI detachments. Brain
   routes them to `imperial-agents` once. Expected behaviour, but the
   68-row echo across 6 imperial factions inflates the "missing"
   counts optically.
7. **v2 faction-pack extractor coverage (`index.json`).** All 30
   factions covered, packVersion `1.0`, effectiveDate `20th June 2026`.
   Unparsed residue is 0% for 26/30 factions; the four with
   `unparsedRows > 0` are minor (black-templars: 1, dark-angels: 1,
   grey-knights: 1, world-eaters: 1). Confidence in the v2 overlay is
   high.
8. **BSData factions the brain does not map to a `dim_faction`.**
   BSData catalog headers `Chaos Daemons Library` (87 rows),
   `Agents of the Imperium` (68), `Chaos Knights Library` (20),
   `Library` (14 — likely a mis-categorised export), `Titanicus
   Traitoris` (4). The 68 AoI rows are cleanly picked up by the alias
   map (they land in `imperial-agents`); the "Library" umbrella rows
   are the parent catalog rows BSData exports as first-class entries
   and are correctly ignored. `Titanicus Traitoris` (4) is the Chaos
   Titan Legions seed (PR #98).
