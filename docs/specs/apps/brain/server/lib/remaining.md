# apps/brain/server/src/lib/ — Remaining Library Modules

> Graph enrichment, cross-referencing, entity linking, and formatting utilities.

## Modules

### cross-refs.ts
Load forward/reverse index JSON from R2 (cached per isolate). For each record, walk refs, filter by faction scope, deduplicate by target, sort by refCount, cap at 20.

### entity-linker.ts
Build entity index (name→nodeId map) from manifest. Replace entity names in content text with `brain:` links, longest-first, case-insensitive, once per entity.

### errata-linker.ts
Fuzzy-match errata/FAQ nodes to rules: exact title (1.0), substring (0.8), content mention (0.5), keyword overlap (0.3). Pure functions, no I/O.

### extract-fields.ts
Parse structured fields from node content: CP cost, target keywords, model restrictions, upgrade flag, epic hero flag. Six regex-based extractors, mutates in-place.

### faction-codes.ts
Wahapedia short codes (AS, SM, DG) → canonical slugs (adepta-sororitas, space-marines). `normalizeFactionId()` checks slug first, then code lookup.

### faction-detect.ts
Parse queries for faction/subfaction detection. Priority ordering (longer patterns first). Expand mechanic aliases (ftgg→for the greater good). Strip faction tokens from query.

### format.ts
Format nodes as conversational prose grouped by impact tier (army-wide→weapons). Strip flavor text. Build LLM context with primary + connected nodes grouped by category.

### massage.ts
7-pass cleanup: drop phantoms, drop short content, dedup summaries, flag inferred content, flag invalid PDF, flag orphans, re-attribute army rules (SM chapter rules).

### merge-sources.ts
Deduplicate nodes/refs across Wahapedia + faction packs. Normalize factionIds to slugs. Title-based dedup for detachment-rules (keep richer). Prepend faction name to datasheet summaries.

### slugify.ts
`slugify()` — lowercase, remove apostrophes, collapse non-alphanumeric to hyphens. ID builders: `coreId()`, `factionId()`, `detachmentId()`, `errataId()`, `balanceId()`, `weaponId()`, `abilityId()`, `communityId()`.

### strip-flavor.ts
Remove flavor text from content, keeping game-relevant rules. Filter lines for rule headers (WHEN, EFFECT, CP), keywords (SUSTAINED, LETHAL), game mechanics.

### records.ts
Classify nodes into record types, aggregate search results into parent+child groupings, fetch complete unit weapon/ability lists from R2.

### pdf-positions.ts
Map nodes to exact PDF page regions using .positions.json sidecars. Three strategies: exact heading, substring, content line. Convert PDF coords to CSS percentages.

### derive-unit-type.ts
Derive unit type (Epic Hero, Knight, Dreadnought, etc.) from keywords via priority hierarchy.

### combat-knowledge.ts
Build community-layer competitive knowledge nodes (tactics, combos) with cross-refs to core rules. 15+ hard-coded tactic nodes + ingested community.json.

### combat-tiers.ts
Toughness/strength/save tiers. `woundRollNeeded()` (S vs T rules). `avgDamagePerAttack()`. `usefulApCap()`.

### combo-detection.ts
Build stacks_with refs between complementary abilities (reroll + sustained/lethal = fishing). Build faction root nodes, detachment containers, unit→detachment eligibility refs.
