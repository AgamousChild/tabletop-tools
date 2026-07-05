# Brain vs Canonical 10e — Wahapedia (2026-07-05)

Reconciliation of the deployed brain graph against the Wahapedia snapshot the
brain ingests as its 10e source-of-truth.

- Brain graph snapshot: `apps/brain/server/.local/brain/nodes/*.json`, built
  2026-07-05T04:25:33Z (36 node files, 32 `dim_faction` slugs plus core /
  errata / balance / community shards).
- Wahapedia snapshot: `apps/data-import/client/public/wahapedia/*.json`,
  retrieved 2026-06-28 (19 tables — `datasheets`, `stratagems`, `enhancements`,
  `detachments`, `detachment_abilities`, `abilities`, `unit_abilities`,
  `wargear_options`, etc.).
- Recent PRs reflected in the brain: #87 (v2 faction-pack extractor wired),
  #88 (v2 overlays onto 11e twin), #89 (stop embedding body content),
  #90–#95 (chapter membership rework: fuzzy → structured), #96 (title
  injection), #97 (edition-agnostic faction category), #98 (Imperial Armour:
  Titans → chaos-titan-legions variants).

## Overall counts

| Signal | Brain | Wahapedia snapshot |
|---|---:|---:|
| Total records | 24922 nodes | 12085 rows across 10e tables |
| 10e nodes | 11812 | — |
| 11e nodes | 13079 | — |
| Nodes without `factionId` | 550 (core / mission / balance / terrain) | n/a |
| Datasheets | 2621 across editions (11812 total 10e nodes) | 1712 |
| Stratagems | 2596 across editions | 1482 |
| Enhancements | 2305 across editions | 927 |
| Detachments | 636 across editions | 261 |
| Detachment abilities | 297 across editions | 284 |
| Abilities (unique headers) | — | 90 |
| Unit-ability joins | 7816 brain unit-ability nodes | 7158 rows |
| Faction ids | 32 `dim_faction` slugs (incl. `unknown`, `chaos-titan-legions`) | 26 |

Brain-side breakdown (top categories, all editions):

| Category | Count |
|---|---:|
| unit-ability | 7816 |
| weapon | 6874 |
| datasheet | 2621 |
| stratagem | 2596 |
| enhancement | 2305 |
| detachment | 636 |
| faction-ability | 512 |
| commentary | 412 |
| detachment-rule | 297 |
| faq | 135 |
| army-rule | 116 |
| core-mechanic | 113 |
| army-ability | 88 |
| phase-sequence | 82 |
| balance-change | 72 |

Brain id-prefix (top families — Wahapedia keyspace still dominates the 10e half):

| Prefix | Count |
|---|---:|
| `11e:*` | 11764 |
| `ability:*` | 3796 |
| `weapon:*` | 3406 |
| `det:*` | 2731 |
| `mfm:*` | 657 |
| `detachment:*` | 297 |
| `errata:*` | 271 |
| `core:*` | 213 |
| `datasheet:*` | 153 |
| `chaos-titan-legions:*` | 104 |
| `faction:*` | 92 |
| numeric Wahapedia ids (`000000nnn`, one row each) | ~200+ |

## Per-faction table — brain 10e vs Wahapedia

Datasheet / stratagem / enhancement / detachment-rule counts per faction.
Zero-column rows are legitimate — Space Wolves, Blood Angels, Dark Angels,
Black Templars, Deathwatch, Blood Angels, Adeptus Titanicus and
Chaos Titan Legions have no dedicated Wahapedia catalog (Wahapedia files
those units under Space Marines / Adeptus Titanicus / Imperium umbrellas).

| Faction | Brain 10e datasheet | Brain 10e strat | Brain 10e enh | Brain 10e det-rule | Wahapedia ds | Wahapedia strat | Wahapedia enh | Wahapedia det-rule |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| adepta-sororitas | 33 | 30 | 20 | 5 | 38 | 38 | 24 | 7 |
| adeptus-custodes | 44 | 45 | 32 | 9 | 31 | 44 | 28 | 8 |
| adeptus-mechanicus | 42 | 52 | 38 | 11 | 39 | 54 | 34 | 10 |
| adeptus-titanicus | 8 | 0 | 0 | 0 | 4 | 0 | 0 | 0 |
| aeldari | 58 | 70 | 48 | 12 | 97 | 94 | 56 | 18 |
| astra-militarum | 36 | 54 | 35 | 9 | 134 | 62 | 40 | 12 |
| black-templars | 18 | 6 | 5 | 2 | 0 | 0 | 0 | 0 |
| blood-angels | 24 | 14 | 14 | 5 | 0 | 0 | 0 | 0 |
| chaos-daemons | 74 | 36 | 24 | 6 | 106 | 56 | 34 | 14 |
| chaos-knights | 36 | 46 | 32 | 8 | 37 | 36 | 26 | 6 |
| chaos-space-marines | 58 | 89 | 59 | 15 | 112 | 102 | 66 | 21 |
| chaos-titan-legions | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| dark-angels | 19 | 15 | 14 | 5 | 0 | 0 | 0 | 0 |
| death-guard | 41 | 48 | 31 | 9 | 71 | 54 | 34 | 10 |
| deathwatch | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| drukhari | 44 | 45 | 28 | 9 | 47 | 52 | 32 | 10 |
| emperors-children | 23 | 42 | 28 | 7 | 23 | 46 | 30 | 9 |
| genestealer-cults | 89 | 46 | 30 | 9 | 139 | 48 | 30 | 10 |
| grey-knights | 32 | 46 | 30 | 9 | 31 | 44 | 28 | 8 |
| imperial-agents | 45 | 31 | 24 | 6 | 46 | 38 | 24 | 7 |
| imperial-knights | 38 | 43 | 29 | 8 | 28 | 36 | 24 | 7 |
| leagues-of-votann | 22 | 42 | 28 | 7 | 22 | 50 | 32 | 9 |
| necrons | 52 | 54 | 36 | 9 | 64 | 70 | 44 | 13 |
| orks | 54 | 66 | 44 | 11 | 87 | 74 | 48 | 14 |
| space-marines | 96 | 204 | 154 | 37 | 298 | 255 | 168 | 52 |
| space-wolves | 37 | 11 | 11 | 3 | 0 | 0 | 0 | 0 |
| tau-empire | 71 | 40 | 26 | 8 | 63 | 44 | 28 | 10 |
| thousand-sons | 35 | 46 | 30 | 9 | 60 | 48 | 30 | 9 |
| tyranids | 52 | 48 | 32 | 8 | 57 | 64 | 39 | 12 |
| unaligned-forces | 20 | 0 | 0 | 0 | 20 | 0 | 0 | 0 |
| world-eaters | 31 | 43 | 28 | 8 | 58 | 44 | 28 | 8 |

Column counts note: the Wahapedia rows above use "Wahapedia's own faction
label," so a chapter-specific unit like Chaplain Grimaldus counts under
Wahapedia's "Space Marines" (298) even though the brain routes it to
`black-templars`. Matching for the missing-item tables below is
chapter-aware: any brain SM-adjacent chapter satisfies the "Space Marines"
Wahapedia row.

## Missing from brain — Wahapedia present, brain 10e/11e absent

Chapter-aware match: the umbrella `space-marines` row also accepts a hit
under any of `black-templars / blood-angels / dark-angels / deathwatch /
space-wolves`. Matching key is `slugify(title)`.

| Faction | Count missing | Sample titles |
|---|---:|---|
| genestealer-cults | 50 | Astra Militarum-shared units (Rogal Dorn Battle Tank, Chimera, Ratlings, Aegis Defence Line, …) — GSC in Wahapedia inherits the Astra shared roster. |
| astra-militarum | 38 | Legends variants + Death Korps subrows (Attilan Rough Riders [Legends], Death Korps of Krieg detachments unindexed by brain) |
| chaos-space-marines | 32 | Legends + subfaction variants (Legionaries [Legends], Master of Possession [Legends], subfaction Havocs) |
| death-guard | 32 | Legends + Renegade Militia detachment members |
| world-eaters | 28 | Legends "Angron", cult-marine variants, Kharn's Bloodhost duplicates. |
| space-marines | 27 (chapter-aware) | Legends: Vindicare, Callidus, Culexus, Eversor Assassins (routed to imperial-agents in brain but present under Wahapedia SM). |
| thousand-sons | 26 | Legends units (Ahriman [Legends], Rubric Marines [Legends]) and subfaction variants |
| chaos-daemons | 22 | 4-god duplicates (Bloodletters variants) + Legends |
| aeldari | 13 | Ynnari shared + Corsair variants Wahapedia files under Aeldari |
| chaos-knights | 10 | War Dog Legends variants |
| orks | 8 | Legends variants (Ghazghkull Legends), duplicate Kommandos |
| imperial-agents | 5 | Legends assassin variants |
| drukhari | 3 | Legends (Court of the Archon) |
| adeptus-mechanicus | 1 | Legends unit |
| tau-empire | 1 | Legends "Longstrike" duplicate |

Interpretation: the biggest 10e ingestion holes are Wahapedia "Legends"
tags and duplicate rows Wahapedia keeps for cross-faction shared roster
membership. Genestealer Cults (50) is the largest genuine gap — the shared
Astra Militarum roster GSC can take is not being rolled into the GSC
faction node. This is a design choice, not a bug, but worth flagging.

## Missing from brain — stratagems / enhancements

Wahapedia stratagems the brain does not carry (top factions, `slugTitle`
match across all editions):

| Faction | Missing stratagems | Missing enhancements |
|---|---:|---:|
| aeldari | 22 | 8 |
| chaos-daemons | 20 | 10 |
| drukhari | 16 | 8 |
| necrons | 16 | 8 |
| space-marines | 16 | 8 |
| tyranids | 16 | 7 |
| adeptus-mechanicus | 13 | 6 |
| chaos-space-marines | 12 | 6 |
| death-guard | 12 | 6 |
| genestealer-cults | 12 | 6 |
| thousand-sons | 12 | 6 |
| adeptus-custodes | 8 | 4 |
| astra-militarum | 8 | 4 |
| adepta-sororitas | 8 | 4 |

Most of these are Boarding Actions / Balance Dataslate / Chapter Approved
stratagems Wahapedia carries as first-class rows. Brain currently keeps
these under the 10e Chapter Approved parser (`ca:*` id family) rather
than as per-faction stratagem nodes, which shows up as "missing" in a
per-faction match. Not necessarily a data hole — a categorisation
mismatch.

## Missing from source — brain 10e datasheets not in Wahapedia

Small — mostly the Chaos Titan Legions synthetic variants introduced by
PR #98:

| Faction | Count | Sample |
|---|---:|---|
| chaos-titan-legions | 8 | WARHOUND TITAN, REAVER TITAN, WARBRINGER NEMESIS TITAN, WARLORD TITAN (uppercase pack + titlecase v2 variants) |
| tau-empire | 2 | Faction-pack-only ("Ta'unar Supremacy Armour" legacy, "Manta") |
| death-guard | 1 | Faction-pack ("Chaos Rhino" alt title) |
| deathwatch | 1 | Faction-pack ("Watch Master") |
| imperial-agents | 1 | Faction-pack ("Deathwatch Kill Team") |
| space-wolves | 1 | Faction-pack ("Wolf Guard Battle Leader") |

The Chaos Titan Legions entries are a known design choice (PR #98) —
`dim_faction chaos-titan-legions` was added so a "chaos-aligned Warhound"
can be found without leaking into `adeptus-titanicus` results. See
"Known issues" below for the current state.

## Spot-sample content diffs

5 datasheets per faction where both a 10e brain node and a Wahapedia
datasheet exist (title-slug match). Bodies truncated to ≤80 chars.

### adepta-sororitas

| Title | Brain (10e) prefix | Wahapedia summary |
|---|---|---|
| Aestred Thurga | **Derived Type:** Epic Hero Aestred Thurga: M6" T3 Sv3+ W4 Ld6+ O… | M6" T3 SV3+ W4 |
| Arco-Flagellants | **Derived Type:** Infantry Arco-Flagellants: M6" T3 Sv7+ W1 Ld6+ … | M6" T3 SV7+ W1 |
| Battle Sisters Squad | **Derived Type:** Infantry Battle Sisters Squad: M6" T3 Sv3+ W1 L… | M6" T3 SV3+ W1 |
| Canoness | **Derived Type:** Epic Hero Canoness: M6" T3 Sv3+ W4 Ld6+ OC1 4++… | M6" T3 SV3+ W4 |
| Celestian Sacresants | **Derived Type:** Infantry Celestian Sacresants: M6" T3 Sv3+ W2 L… | M6" T3 SV3+ W2 |

Body-shape verdict: brain 10e nodes carry a `**Derived Type:**` header
plus a re-emitted stat block; Wahapedia rows carry M/T/SV/W as separate
columns. Stat values agree.

### chaos-space-marines

| Title | Brain (10e) prefix | Wahapedia summary |
|---|---|---|
| Abaddon the Despoiler | **Derived Type:** Epic Hero Abaddon the Despoiler: M6" T5 Sv2+ W7… | M6" T5 SV2+ W7 |
| Accursed Cultists | **Derived Type:** Infantry Accursed Cultists: M6" T4 Sv6+ W1 Ld7+… | M6" T4 SV6+ W1 |
| Chaos Land Raider | **Derived Type:** Vehicle Chaos Land Raider: M10" T12 Sv2+ W16 Ld… | M10" T12 SV2+ W16 |
| Chaos Lord | **Derived Type:** Character Chaos Lord: M6" T4 Sv3+ W5 Ld6+ OC1 4… | M6" T4 SV3+ W5 |
| Chaos Predator Annihilator | **Derived Type:** Vehicle Chaos Predator Annihilator: M10" T10 Sv… | M10" T10 SV3+ W11 |

### space-marines

| Title | Brain (10e) prefix | Wahapedia summary |
|---|---|---|
| Aggressor Squad | **Derived Type:** Infantry Aggressor Squad: M5" T6 Sv3+ W3 Ld6+ O… | M5" T6 SV3+ W3 |
| Ancient | **Derived Type:** Character Ancient: M6" T4 Sv3+ W4 Ld6+ OC1 -++ … | M6" T4 SV3+ W4 |
| Apothecary | **Derived Type:** Character Apothecary: M6" T4 Sv3+ W4 Ld6+ OC1 -… | M6" T4 SV3+ W4 |
| Apothecary Biologis | **Derived Type:** Character Apothecary Biologis: M6" T4 Sv3+ W4 L… | M6" T4 SV3+ W4 |
| Assault Intercessors | **Derived Type:** Infantry Assault Intercessors: M6" T6 Sv3+ W2 L… | M6" T6 SV3+ W2 |

### orks

| Title | Brain (10e) prefix | Wahapedia summary |
|---|---|---|
| Beast Snagga Boyz | **Derived Type:** Infantry Beast Snagga Boyz: M6" T5 Sv6+ W2 Ld7+… | M6" T5 SV6+ W2 |
| Beastboss | **Derived Type:** Character Beastboss: M6" T6 Sv4+ W6 Ld6+ OC1 4+… | M6" T6 SV4+ W6 |
| Beastboss on Squigosaur | **Derived Type:** Character Beastboss on Squigosaur: M10" T7 Sv4+… | M10" T7 SV4+ W8 |
| Big Mek | **Derived Type:** Character Big Mek: M6" T5 Sv4+ W5 Ld6+ OC1 4++ … | M6" T5 SV4+ W5 |
| Big Mek in Mega Armour | **Derived Type:** Character Big Mek in Mega Armour: M6" T5 Sv2+ W… | M6" T5 SV2+ W5 |

Result across 30 factions: brain 10e datasheet bodies match Wahapedia
stat values on M, T, SV, W in the spot-samples checked. No edition drift
detected in the 10e half. Full samples for all factions in the JSON
sidecar (regenerable — this report is snapshot-only).

## Known issues and follow-ups

1. **chaos-titan-legions has 12 datasheets (8× 10e + 4× 11e), all
   copies of `adeptus-titanicus` entries with a keyword swap.** PR #98
   added them intentionally for chaos-aligned Titan searches, but the
   `dim_faction` row for `chaos-titan-legions` doesn't have a native
   catalog upstream; every entry is derived. Decision pending — either
   keep as-is and document, or fold back into `adeptus-titanicus` and
   handle chaos-alignment as a keyword filter.
2. **Wahapedia stratagem gap (aeldari 22, chaos-daemons 20, etc.) is
   mostly a categorisation mismatch, not a data hole.** Brain files
   Boarding Actions and Balance Dataslate stratagems under different
   parsers (`ca:*`, `balance:*`) than per-faction stratagem parsers.
   The rows exist; they don't match on `(factionId, slugTitle)`.
3. **Genestealer Cults 10e datasheet gap is 50 (largest genuine gap).**
   Wahapedia files 139 datasheets for GSC because it treats the shared
   Astra Militarum roster (Chimera, Rogal Dorn, Ratlings, etc.) as
   GSC-taggable and duplicates them. Brain does not roll the AM shared
   roster into GSC — arguably correct, but worth flagging so a Brain
   answer about "what GSC lists play" doesn't miss the shared AM options.
4. **Space Marines shared-roster overlap is why the naïve Wahapedia SM
   count (298) is so much larger than any single chapter.** Wahapedia
   duplicates chapter-locked entries under both Wahapedia's `Space Marines`
   umbrella and (sometimes) subfaction pages. The chapter-aware match
   above collapses this correctly to 27 genuine gaps for `space-marines`.
5. **550 nodes without `factionId` are correct.** Core rules (113),
   phase sequences (82), no-faction weapons (58 — generic wargear),
   commentary (48), missions (46 secondary + 40 primary), terrain (26).
   None of these belong to a `dim_faction`.
6. **Wahapedia edition tag.** The Wahapedia snapshot itself has no
   explicit edition marker; it is "10th edition" only by publication
   date (`SOURCE_DATES['wahapedia']` = 2025-04-20 in `build-graph.ts`).
   If Wahapedia gains 11e coverage, the brain build will stamp new
   Wahapedia data as 11e by that same date convention — nothing in the
   ingestion pipeline distinguishes 10e vs 11e Wahapedia rows.
