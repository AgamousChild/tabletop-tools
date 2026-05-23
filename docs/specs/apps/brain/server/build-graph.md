# apps/brain/server/src/build-graph.ts

> CLI script — full ETL: parse all 40K rules sources → deduplicate → enrich → partition into JSON.

## Prompt

CLI script (`npx tsx`) orchestrating the complete brain graph build:

1. Parse 9 sources sequentially: core rules, rules commentary, balance dataslate, 16 faction packs, Wahapedia game data, community nodes, Chapter Approved cards, tournament companions.
2. Merge/deduplicate by ID + normalize factions via `mergeSources()`.
3. Massage: clean phantom nodes, normalize titles, re-attribute army rules.
4. Build detachments, faction root nodes, eligible_for refs (unit→detachment), stacks_with refs (combo detection).
5. Partition by layer/faction into `.local/brain/nodes/*.json` + `refs/*.json`.
6. Build forward/reverse indexes for graph traversal.
7. Emit query tests + stats.

## Dependencies

All parsers, merge-sources, massage, combo-detection, sync modules.
