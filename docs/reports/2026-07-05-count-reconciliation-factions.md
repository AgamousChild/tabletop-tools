# Faction counts across sources — 2026-07-05 (reframed)

Ground truth: the GW official 40K app (screenshots reviewed 2026-07-05). That's the reference every other source is measured against.

## Ground truth — GW official app

**25 top-level factions:**

Adepta Sororitas, Adeptus Custodes, Adeptus Mechanicus, Aeldari, Astra Militarum, Chaos Daemons, Chaos Knights, Chaos Space Marines, Chaos Titan Legions, Death Guard, Drukhari, Emperor's Children, Genestealer Cults, Grey Knights, Imperial Agents, Imperial Knights, Leagues of Votann, Necrons, Orks, Space Marines, T'au Empire, Thousand Sons, Titan Legions, Tyranids, World Eaters.

**11 SM chapters** (accordion sub-items under Space Marines, each has own chapter-specific characters and full access to the SM shared pool):

Black Templars, Blood Angels, Dark Angels, Deathwatch, Imperial Fists, Iron Hands, Raven Guard, Salamanders, Space Wolves, Ultramarines, White Scars.

**Canonical total: 36.**

## Reconciliation summary — source vs ground truth (36)

Every source starts from 36. Add non-canonical entries the source carries; subtract items missing due to a different data model (purposeful — not a bug); subtract items missing that GW simply hasn't published (real upstream gap). End result must equal the source's count.

Every source reconciles to 36. Start with the raw count. Subtract non-canonical entries GW doesn't recognize. Add back items the source has under a different data model (chapter-specific data filed under a parent factionSlug or parent pack). Add back items GW recognizes that the source doesn't publish separately.

| Source | Raw count | − Non-canonical | + Different-model (data present under parent) | + Not published separately by this source | = Ground truth |
|---|---|---|---|---|---|
| Brain `dim_faction` (registry) | 36 | 0 | 0 | 0 | 36 ✓ |
| MFM (unit-costing + detachments) | 30 | 0 | +6 (IF/IH/RG/Sal/UM/WS chapter characters file under `space-marines` factionSlug — Calgar, Adrax, Feirros, Shrike, Kor'Sarro Khan, Lysander, etc.) | 0 | 36 ✓ |
| v2 faction-pack extracts | 29 | 0 | +6 (IF/IH/RG/Sal/UM/WS chapter detachments file under the `space-marines` pack — BLADE OF ULTRAMAR, HAMMER OF AVERNII, TASK FORCE, EMPEROR'S SHIELD, SHADOWMARK TALON, ARMOURED SPEARTIP) | +1 (Chaos Titan Legions — synthetic in brain; no upstream pack) | 36 ✓ |
| Wahapedia `factions.json` | 26 | −2 (unaligned-forces, unbound-adversaries) | +11 (all chapters — Wahapedia tags SM datasheets with chapter keyword, not own factions) | +1 (Chaos Titan Legions — Wahapedia doesn't model) | 36 ✓ |
| BSData `bsdata-units.json` | 26 | −1 (unaligned-forces) | +11 (all chapters — BSData sub-catalogs under Space Marines) | 0 (BSData has Chaos Titan Legions as "Titanicus Traitoris") | 36 ✓ |

**Reads as:**
- **`dim_faction`** matches ground truth directly.
- **MFM** has every chapter-specific character's points; it just files 6 chapters under `factionSlug: 'space-marines'` instead of tagging them with a chapter slug.
- **v2 faction-pack extracts** have every chapter's detachments; they file 6 chapters' worth inside the parent Space Marines pack rather than as dedicated per-chapter packs. Chaos Titan Legions has no upstream pack — brain synthesizes via keyword-swap.
- **Wahapedia** and **BSData** use a chapter-tag model (chapters are SM sub-tags, not own factions). Chapter data still lands in brain via ingestion routing.

## Internal drift — built graph vs registry (bug)

**Registry (`dim_faction`) says 36. Built graph says 39.** Three shards exist in the graph that don't belong: `adeptus-titanicus` (105 nodes), `unaligned-forces` (327 nodes), `unknown` (60 orphan weapons/abilities). Ingestion is still emitting nodes with retired factionIds. Registry and data are out of sync — see "Open action items" for the fix.

## Alignment

**24 top-level factions are present in every source AND the ground truth:**

Adepta Sororitas, Adeptus Custodes, Adeptus Mechanicus, Aeldari, Astra Militarum, Chaos Daemons, Chaos Knights, Chaos Space Marines, Death Guard, Drukhari, Emperor's Children, Genestealer Cults, Grey Knights, Imperial Agents, Imperial Knights, Leagues of Votann, Necrons, Orks, Space Marines, T'au Empire, Thousand Sons, Titan Legions, Tyranids, World Eaters.

**1 top-level in ground truth not consistently present across sources:** Chaos Titan Legions. In BSData (as "Titanicus Traitoris"), MFM (points-only), brain, and dim_faction. Missing from Wahapedia and v2 faction-pack extracts — GW doesn't publish it as a separate item; brain synthesizes via keyword-swap of Titan Legions.

## Chapters — expected coverage by source

11 chapters in ground truth. Each source's chapter coverage:

| Source | Chapters covered | Missing |
|---|---|---|
| Brain graph + dim_faction | 11/11 | none |
| MFM | 5/11 (BA, DA, SW, BT, DW) | IF, IH, RG, Sal, UM, WS |
| v2 faction-pack extracts | 5/11 (BA, DA, SW, BT, DW) | IF, IH, RG, Sal, UM, WS |
| Wahapedia | 0/11 (files chapters as SM keyword tags, not own factions) | all 11 |
| BSData | 0/11 (files chapters as SM sub-catalogs, not own faction values) | all 11 |

**Purposeful vs gap:**
- Wahapedia/BSData use a different data model (chapter tags, not top-level factions). Brain reconciles at ingestion via chapter-keyword routing. **Purposeful — not a gap.**
- MFM and v2 faction-pack extracts have only 5 of 11 chapters because GW publishes MFM points and dedicated faction packs for BA/DA/SW/BT/DW only. IF/IH/RG/Sal/UM/WS chapters exist in the GW app but don't have dedicated MFM rows or faction packs today. **Real gap upstream — GW hasn't published this data.** Brain fills the gap by routing chapter-specific characters via BSData catalog membership.

## Non-canonical entries in sources

Entries some sources have that the ground truth does NOT recognize:

| Slug | Where it appears | What it is |
|---|---|---|
| unaligned-forces | Wahapedia (327 nodes downstream in brain), BSData | Wahapedia bucket for content not tied to any faction (Fell Beasts, generic scenery-adjacent units, some Legends). Not a playable faction in the GW app. |
| unbound-adversaries | Wahapedia only | Wahapedia's umbrella for generic adversaries. Not ingested to brain. |
| unknown | Brain built graph only (60 orphan weapons/abilities) | Fallback bucket for children whose parent datasheet was removed upstream. Cleanup artifact, not a real faction. |
| adeptus-titanicus (still in graph) | Brain graph (105 nodes) | Retired from dim_faction (merged into titan-legions per PR #106). Ingestion still emits nodes with the old factionId — real drift. |

## Open action items

1. **Ingestion rewrite `adeptus-titanicus` → `titan-legions`** — `game-data.ts` (Wahapedia ingestion) still emits 105 nodes under the retired slug. Registry and data are out of sync.
2. **Ingest chapter data for IF/IH/RG/Sal/UM/WS** — brain has the factions registered (6/11 chapters covered). Content per-chapter comes from BSData catalog membership; verify each chapter has its expected chapter-specific characters landed under its factionId.
3. **Policy for `unaligned-forces`** — 327 real Wahapedia nodes routed here in brain, but GW doesn't recognize it as a faction. Decide: hide the shard, reclassify per-node, or accept the drift.
4. **Purge `unknown` from ingestion** — 60 orphan weapons/abilities. Safe to filter at ingest time; no downstream references.
