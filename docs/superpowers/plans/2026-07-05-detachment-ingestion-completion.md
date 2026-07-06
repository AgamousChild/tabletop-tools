# Get every 11e detachment into the brain

Follow-up to `docs/reports/2026-07-05-count-reconciliation-detachments.md`.

## The data model

For each currently-legal detachment (per MFM), we build an 11e node one of three ways:

- **Pack has new content for it** → build the 11e node directly from the pack.
- **Pack has errata for it** → copy the 10e node into an 11e node, layer the pack errata on top.
- **Pack has nothing about it** → copy the 10e node into an 11e node unchanged.

Anything Wahapedia carries that isn't in MFM (Penitents and Pilgrims, Pious Protectors, etc. — 25 total) is retired for 11e: keep as 10e node, don't copy into 11e.

MFM is the ground-truth roster (339 currently-legal detachments).

Example — Adepta Sororitas (MFM: 8):

| Detachment | Source | Status |
|---|---|---|
| Army of Faith | 10e codex (Wahapedia) | Legal in 11e, no pack changes this cycle |
| Bringers of Flame | 10e codex + `##### BRINGERS OF FLAME DETACHMENT` errata in 11e pack | Legal in 11e, patched |
| Hallowed Martyrs | 10e codex + errata in pack | Legal in 11e, patched |
| Penitent Host | 10e codex + errata in pack | Legal in 11e, patched |
| Champions of Faith | 10e codex + full-rule update in 11e pack | Legal in 11e, updated |
| Chorus of Condemnation | 11e pack (new) | 11e-only |
| Sacred Champions | 11e pack (new) | 11e-only |
| Sanctified Orators | 11e pack (new) | 11e-only |

Everything Wahapedia carries that ISN'T in MFM (Penitents and Pilgrims, Pious Protectors) is retired for 11e — drop from the 11e set.

## Goal

Every currently-legal detachment (per MFM) has a brain `detachment-rule` node with `edition: '11th'`:
- 10e Wahapedia content copied into an 11e node when the pack doesn't cover it
- Pack content directly when the pack has a new detachment
- 10e content + pack errata layered when the pack patches an existing detachment

Retired-for-11e Wahapedia detachments stay only as `edition: '10th'` nodes (no 11e counterpart).

## Success criteria

1. `count-detachments.mjs` shows `MFM: 339` and 11e brain nodes summing to 339 (excluding chapter shards which inherit via subfaction).
2. Every MFM detachment name resolves to a brain `edition: '11th'` node with matching title (after normalization).
3. Retired-for-11e Wahapedia detachments (25 enumerated in the report) have `edition: '10th'` only — no 11e twin.
4. No `edition: '11th'` node with truncated title (`TASK FORCE`, `SEEKERS`, `PROTOTYPE CADRE`) or misspelled title (`Marshall's Household`, `Incarnadine Speartip`, `Dark Flight Pursuit`).
5. Pack errata content (`##### NAME DETACHMENT` blocks) is present on the corresponding 11e node's rule text — not silently dropped.

## Phase 1 — MFM allow-list for the 11e duplicate-eleventh promotion

Location: whatever produces the 11e duplicates from 10e Wahapedia. Grep for `11e:det` or the `duplicateEleventh()` implementation.

Current behavior: every 10e Wahapedia detachment gets an 11e duplicate.

New behavior: only promote a 10e detachment to 11e if its normalized name appears in `mfm-detachments.json` for that faction. Otherwise, keep the 10e node but skip the 11e emission.

Concrete: build an allow-list per faction from MFM at graph-build time. In `duplicateEleventh` (or equivalent), check `mfmAllowlist[factionId].has(normalizedTitle)` before emitting the 11e node.

Result: the 25 retired-for-11e entries lose their 11e twin. 11e set shrinks from ~236 (bloated with retired 10e) to the MFM-legal subset.

## Phase 2 — Fix the pack parser so ALL new 11e detachments land

Location: `apps/brain/server/src/lib/parsers/faction-pack-v2-to-nodes.ts` and the extraction into `apps/brain/server/.local/faction-pack-extracts/*.json`.

Current parser catches ~129 of the ~130 new/updated detachments across all 29 packs, but misses some due to formatting variance. Add these patterns:

| Pattern | Example | Which detachments |
|---|---|---|
| `## NAME` heading + intro prose + detachment mechanics | `## SPEEDWAAAGH!` | New 11e detachments with full rules |
| `### NAME` heading (some packs use H3 instead of H2) | `### WARPSTRIKE CHAMPIONS` (CSM) | Same content, different formatting |
| `*NAME — TYPE STRATAGEM*` italic tag | `*BLOOD LEGION — BATTLE TACTIC STRATAGEM*` | Attribution for detachment's stratagems |
| `*NAME STRATAGEM*` (some packs omit the qualifier) | `*CHORUS OF CONDEMNATION STRATAGEM*` | Sororitas, IK use this shorter form |
| TOC entry between `Detachments ..... N` and `Datasheets ..... N` | `Sanctified Orators ..... 4` | Authoritative roster within pack |

Fix multi-line-name artifacts (PDF column breaks):
- `RAGE ‑\nCURSED ONSLAUGHT` → `Rage-Cursed Onslaught` (Blood Angels)
- `THRONE ‑\nBONDED OUTRIDERS` → `Throne-Bonded Outriders` (Imperial Knights)
- `SPEARPOINT\nTASK FORCE` → `Spearpoint Task Force` (SM)
- `FORGEFATHER'S\nSEEKERS` → `Forgefather's Seekers` (SM)
- `EXPERIMENTAL\nPROTOTYPE CADRE` → `Experimental Prototype Cadre` (T'au)
- `COURT OF THE\nPHOENICIAN` → `Court of the Phoenician` (Emperor's Children)

Filter noise the parser mistakes for detachment names:
- Stratagem type qualifiers: `BATTLE TACTIC`, `STRATEGIC PLOY`, `WARGEAR`, `EPIC DEED`
- Section headers: `UNIT OPTIONS`, `ENHANCEMENT`, `DAMAGED`, `WHAT'S NEW`, `CORE STRATAGEM`
- Faction name repeats: `SPACE MARINES`, `T'AU EMPIRE`, `EMPEROR'S CHILDREN`, `ADEPTUS TITANICUS`, `DEATHWATCH`

Validation: per-faction count of "new-in-11e" pack detachments matches the count of MFM entries that DON'T match any 10e Wahapedia detachment. Should be small per faction (0–8), summing to roughly 100–130 across all 29 packs.

## Phase 3 — Extract pack errata and overlay onto duplicated 10e nodes

Pack errata pattern: `##### NAME DETACHMENT` heading followed by the update text. Example from Sororitas pack:

```
##### BRINGERS OF FLAME DETACHMENT
Shield of Aversion Stratagem, Effect Section Change to: '...'
```

This is a patch on a 10e-codex detachment. Current parser doesn't extract it as detachment content, so the 11e `Bringers of Flame` node ends up with only the 10e rule text and none of the pack's 11e updates.

New parser step: for every `##### NAME DETACHMENT` block, capture the update text and store on the extraction output as `errata` on the matching detachment record. If no full-rule section for `NAME` exists in the pack (typical for errata-only), still record the detachment name — this signals "codex-original detachment that was patched in 11e."

Ingest step: when building the 11e duplicate of a 10e Wahapedia detachment, append the pack's errata text to the rule body. Attach a `sources: [{ type: 'faction-pack', title: <pack file>, updates: true }]` entry so the source attribution surfaces "Wahapedia 10th edition + 11e Faction Pack updates" in the answer context.

## Phase 4 — Fix name typos in existing 11e nodes

From the drift matrix — `edition: '11th'` nodes with parser-caused bad titles:

| Current brain title | Correct title | Faction |
|---|---|---|
| `TASK FORCE` | `Spearpoint Task Force` | space-marines |
| `SEEKERS` | `Forgefather's Seekers` | space-marines |
| `Marshall's Household` | `Marshal's Household` | space-marines |
| `Incarnadine Speartip` | `Encarmine Speartip` | space-marines (BA content) |
| `Dark Flight Pursuit` | `Darkflight Pursuit` | space-marines (DA content) |
| `Living Miracle` | `The Living Miracle` | space-marines (BT content) |
| `PHOENICIAN` | `Court of the Phoenician` | emperors-children |
| `ASSAULT` | `Subterranean Assault` | tyranids |
| `ONSLAUGHT` (Tyranid) | `Warrior Bioform Onslaught` | tyranids |
| `ONSLAUGHT` (BA) | `Rage-Cursed Onslaught` | space-marines/blood-angels |
| `BATTLE CLADE` | `Haloscreed Battle Clade` | adeptus-mechanicus |
| `PROTOTYPE CADRE` | `Experimental Prototype Cadre` | tau-empire |
| `ELIMINATION FORCE` | `Veiled Blade Elimination Force` | imperial-agents |
| `Brood Brother Auxilia` | `Brood Brothers Auxilia` | genestealer-cults |

Fixed at extraction in Phase 2. Anything already in R2 gets corrected on next build-graph + upload.

## Phase 5 — Verify + deploy

1. Re-run pack parser after Phase 2 fixes — verify per-pack extract counts jump appropriately.
2. Run `pnpm --dir apps/brain/server build-graph`.
3. `node apps/brain/server/scripts/count-detachments.mjs` — expect BrainGraph 11e count to hit MFM 339 across non-chapter factions (chapters resolve via subfaction, so their shards stay small).
4. Diff per-faction 11e counts against MFM. Any faction where brain 11e < MFM count is a Phase 1 allow-list gap OR a Phase 2 parser miss — investigate per pack.
5. Deploy: upload nodes to R2, purge CDN cache. Verify `/browse/detachment/:id?edition=11th` returns each currently-legal detachment.
6. Re-run `count-factions.mjs` to make sure faction-count reconciliation didn't regress.

## Non-goals

- Not creating standalone 11e-codex data. When the pack has no new content or errata for a detachment, copy the 10e node into an 11e node as-is.
- Not fixing the space-marines 75-node count as inherently "wrong." Most of that is intended 10e+11e duplication under the duplicate-eleventh strategy. Only fix double-emitted 11e duplicates (Wrathful Procession × 2, Champions of Fenris × 2 in the 11e set) if two distinct ingest passes emit the same detachment.
- Not backfilling any "in MFM but nowhere upstream" phantoms. If a detachment name appears in MFM but neither 10e Wahapedia nor 11e pack has it, that's a real upstream gap — flag for manual review, don't stub.
- Not adding chapter-level detachment nodes. Chapters access SM detachments via `expandFactionForRetrieval` at query time through `dim_subfaction`.

## Files most likely touched

- `apps/brain/server/src/lib/parsers/faction-pack-v2-to-nodes.ts` — parser upgrades (Phase 2, 3)
- `apps/brain/server/src/lib/parsers/faction-pack-v2-to-nodes.test.ts` — new cases per pattern
- `apps/brain/server/src/lib/duplicate-eleventh.ts` — MFM allow-list (Phase 1)
- `apps/brain/server/src/lib/duplicate-eleventh.test.ts` — allow-list test
- `apps/brain/server/scripts/count-detachments.mjs` — reference oracle, don't change
