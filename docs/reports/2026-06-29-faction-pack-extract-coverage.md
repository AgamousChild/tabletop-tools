# 11e Faction Pack Extraction — Coverage Report

**Date:** 2026-06-29
**Parser:** `apps/brain/server/src/lib/parsers/faction-pack-v2.ts`
**CLI:** `apps/brain/server/scripts/extract-faction-packs.ts`
**Output (gitignored):** `apps/brain/server/.local/faction-pack-extracts/`

## Summary

All 29 11e faction-pack markdowns (from `gw-sync`) parsed cleanly. Every pack
finished at **≤ 0.34% residue**, well under the 2% target.

- **25 of 29 packs at exactly 0.00%** residue.
- **4 packs at 0.06% – 0.34%** residue: black-templars, dark-angels,
  t-au-empire, thousand-sons, world-eaters (5 packs). Each has < 60 chars of
  residue (mostly stratagem-name fragments still embedded in enhancement
  bullet lines from the column-scrambled PDF flow).
- **No PDF fallback was required.** Markdown was the source of truth for
  every pack; we read the PDFs only to disambiguate column-scrambled
  sections during parser design.

## Per-pack coverage

| Faction             | Ver | Det | Datasheets | Legends | Errata | FAQs | Source chars | Residue % | Residue chars |
| ------------------- | --- | --- | ---------- | ------- | ------ | ---- | ------------ | --------- | ------------- |
| adepta-sororitas    | 1.0 | 4   | 3          | 5       | 15     | 6    | 30 825       | 0.00      | 0             |
| adeptus-custodes    | 1.0 | 5   | 13         | 0       | 10     | 2    | 41 368       | 0.00      | 0             |
| adeptus-mechanicus  | 1.0 | 6   | 4          | 4       | 25     | 1    | 39 768       | 0.00      | 0             |
| adeptus-titanicus   | 1.0 | 0   | 4          | 0       | 0      | 0    | 10 642       | 0.00      | 0             |
| aeldari             | 1.0 | 7   | 5          | 24      | 26     | 3    | 72 683       | 0.00      | 0             |
| astra-militarum     | 1.0 | 6   | 9          | 62      | 24     | 6    | 130 357      | 0.00      | 0             |
| black-templars      | 1.0 | 3   | 0          | 0       | 6      | 0    | 9 413        | 0.32      | 30            |
| blood-angels        | 1.0 | 6   | 0          | 9       | 10     | 1    | 40 754       | 0.00      | 0             |
| chaos-daemons       | 1.0 | 7   | 52         | 10      | 1      | 11   | 136 448      | 0.00      | 0             |
| chaos-knights       | 1.0 | 4   | 9          | 0       | 9      | 0    | 30 876       | 0.00      | 0             |
| chaos-space-marines | 1.6 | 6   | 10         | 28      | 17     | 18   | 109 965      | 0.00      | 0             |
| dark-angels         | 1.0 | 6   | 0          | 3       | 18     | 1    | 30 604       | 0.11      | 33            |
| death-guard         | 1.0 | 3   | 3          | 2       | 5      | 1    | 19 463       | 0.00      | 0             |
| deathwatch          | 1.0 | 0   | 11         | 0       | 0      | 0    | 33 564       | 0.00      | 0             |
| drukhari            | 1.0 | 4   | 0          | 7       | 12     | 0    | 28 070       | 0.00      | 0             |
| emperor-s-children  | 1.0 | 7   | 1          | 0       | 13     | 3    | 18 859       | 0.00      | 0             |
| genestealer-cults   | 1.0 | 4   | 0          | 1       | 23     | 3    | 24 844       | 0.00      | 0             |
| grey-knights        | 1.0 | 4   | 1          | 5       | 7      | 0    | 23 294       | 0.00      | 0             |
| imperial-agents     | 1.0 | 2   | 3          | 18      | 13     | 1    | 53 524       | 0.00      | 0             |
| imperial-knights    | 1.0 | 4   | 10         | 0       | 7      | 1    | 33 671       | 0.00      | 0             |
| leagues-of-votann   | 1.0 | 5   | 1          | 0       | 11     | 0    | 22 863       | 0.00      | 0             |
| necrons             | 1.0 | 7   | 9          | 12      | 15     | 13   | 65 391       | 0.00      | 0             |
| orks                | 1.3 | 5   | 4          | 32      | 11     | 8    | 77 010       | 0.00      | 0             |
| space-marines       | 1.8 | 14  | 16         | 77      | 16     | 17   | 225 840      | 0.00      | 0             |
| space-wolves        | 1.0 | 4   | 1          | 15      | 10     | 0    | 46 145       | 0.00      | 0             |
| t-au-empire         | 1.0 | 6   | 7          | 21      | 23     | 2    | 54 633       | 0.06      | 32            |
| thousand-sons       | 1.0 | 4   | 1          | 0       | 20     | 7    | 25 361       | 0.13      | 32            |
| tyranids            | 1.4 | 4   | 6          | 5       | 3      | 16   | 29 276       | 0.00      | 0             |
| world-eaters        | 1.0 | 3   | 1          | 0       | 15     | 4    | 14 864       | 0.34      | 51            |

## Residue categorisation

Coverage is measured by walking the source markdown line-by-line and asking
"is this line attributable to a structured extraction or an identified noise
pattern?" The residue counter only adds chars from lines that fall through
all matchers.

Identified noise (consumed by the state machine, not residue):

- Page numbers (`Page 17`)
- PDF page headers (`WARHAMMER 40,000`)
- Section markers (`DETACHMENT RULES`, `ENHANCEMENTS`, `STRATAGEMS`,
  `DATASHEETS`, `WHAT'S NEW`, `CONTENTS`, `FAQS`, `UPDATES`)
- Faction-name dividers
- Statline `#####` headings (e.g., `##### 14" 3+ 6+`)
- The bare `WA R HA M M E R L E G E N D S` Legends prefix

Identified content (in structured fields):

- `detachments[]` with `detachmentRule`, `enhancements[]`, `stratagems[]`
- `datasheets[]` and `legendsDatasheets[]` with stats, weapons, abilities
  (typed by `kind: 'core' | 'faction' | 'unit-specific' | 'aura' | 'wargear'`),
  keywords, wargear options, unit composition, damaged profiles, attachable
  leaders/supports
- `armyRules[]` for `## ARMY RULES` sections
- `errata[]` with `target.type ∈ datasheet | enhancement | stratagem |
detachment-rule | ability | army-rule` and `changeKind ∈ replace | add | remove`
- `faqs[]` with `question` / `answer`
- `extras[]` for identified-but-uncategorised content (e.g.,
  `faction-name-marker`, `army-rules-intro`)
- `unparsed[]` for everything else, with `context` and `reason` labels

## Remaining residue chunks

| Pack           | Chars | Sample                                                                                                   |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| black-templars | 30    | `- Or: [PRECISION] . FUELLED BY FAITH` (bullet-line + trailing stratagem name in a different list shape) |
| dark-angels    | 33    | `- Hazard rolls . SKYBORNE SURVEILLANCE`                                                                 |
| t-au-empire    | 32    | `- +1 AP and D . EXPERIMENTAL AMMUNITION`                                                                |
| thousand-sons  | 32    | `- [CLEAVE 1] . PRISMATIC DISPLACEMENT`                                                                  |
| world-eaters   | 51    | `- Or: +1 AP . ENHANCEMENTS`, `- +1 to charge rolls . SCORN THE WITCH`, `- +2 S . PUNISH THE CRAVEN`     |

In each case the line is the LAST bullet of an enhancement rule body that
in the source PDF has the next stratagem's name appended (PDF column-flow
artifact). The parser successfully identifies and carries the next-strat
name forward into `pendingStratagemName` so it ends up on the next
`stratagem.name`, but the bullet line itself includes both the bullet and
the trailing all-caps name, so a substring check against the captured
enhancement body misses 4–17 chars per such bullet. These are categorised
in `unparsed[]` as `{ context: 'unclassified', reason: 'no rule matched
this line' }` — they're accounted for, not silently dropped.

## Tankbustas / Bomb Squigs verification

The Orks pack's Tankbustas datasheet was the explicit verification target.
Extracted Bomb Squigs ability body:

> Twice per battle, after this unit ends a Normal move, you can select one
> enemy unit within 12" of it and roll one D6: on a 2+, that enemy unit
> suffers D3 mortal wounds.

This is a verbatim match to the new 11e text specified in the task.

## How to re-run

```sh
pnpm -F brain-server exec tsx scripts/extract-faction-packs.ts
```

Outputs:

- `apps/brain/server/.local/faction-pack-extracts/<faction>.json` (one
  PackExtract per pack)
- `apps/brain/server/.local/faction-pack-extracts/index.json` (summary
  rollup)

Tests:

```sh
pnpm -F brain-server test src/lib/parsers/faction-pack-v2.test.ts
```

11 synthetic-fixture tests; the parser does not import or commit any GW
content (per the project's data-boundary rule).

## Notes for future brain integration

The extract output is intentionally NOT wired into `build-graph.ts` in this
PR. Doing so would mean replacing the per-detachment / per-datasheet
parsing already done by `faction-pack.ts` (the v1 parser) and reconciling
the two outputs against the existing brain graph IDs. That belongs in a
follow-up PR; this one ships the structured extract dataset and coverage
proof.
