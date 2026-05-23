# apps/brain/server/src/validate-all.ts

> CLI script — exhaustive post-build validation of the knowledge graph.

## Prompt

Loads all nodes from `.local/brain/` manifest, runs 11 checks: faction names, deadly demise values, duplicate keywords, detachment completeness, faction coverage, browse layers, armor keywords, etc. Collects errors/warnings, pretty-prints grouped by category. Exits with code 0 (pass) or 1 (fail).
