# apps/brain/server/src/lib/parsers/ — All Parsers

> Convert raw 40K rules sources (markdown, game data) into brain nodes and refs.

## Parsers

### core-rules.ts
`parseCoreRules(markdown, retrievedAt)` — parse normalized markdown into hierarchical nodes with phase detection. Multi-level headings (##-#####) → nodes. `part_of` refs up heading hierarchy. `sequence_adjacent` refs between consecutive phases.

### balance-dataslate.ts
`parseBalanceDataslate(markdown, retrievedAt)` — convert balance dataslate markdown into balance-change nodes. Splits on #### faction headers. Generates `modifies` refs to `core:` or `faction:` targets.

### chapter-approved.ts
`parsePrimaryMissions()`, `parseSecondaryMissions()`, `parseTwistCards()`, `parseChallengerCards()` — parse Chapter Approved cards (primary/secondary/twist/challenger). Regex-based card boundary detection. Extracts scoring bars, WHEN/condition→VP pairs, actions, paired stratagems.

### faction-pack.ts
`parseFactionPack(markdown, factionSlug, retrievedAt)` — state machine parsing detachment rules, stratagems, enhancements, FAQ/errata. Splits errata on "Page NNN". `part_of` refs to detachments. Chapter lock detection.

### game-data.ts
`convertGameData(input, retrievedAt?)` — convert Wahapedia/BSData game data into 10,000+ nodes + refs. Datasheets with stat/points/keywords, weapons with strength/AP tiers, abilities with sub-rules, faction abilities, detachments + stratagems + enhancements. `requires` refs to core mechanics.

### rules-commentary.ts
`parseRulesCommentary(markdown, retrievedAt)` — parse FAQs/errata/clarifications. Zone-based parsing. `clarifies` refs to addressed core rules.

### tournament-companion.ts
`parseTournamentCompanion(markdown, source, retrievedAt)` — parse Pariah Nexus / Chapter Approved tournament companions. `supersedes` refs to original cards.

## Normalize

### normalize/normalize.ts
`normalizeMarkdown(input)` — transform raw GW PDF markdown: normalize Unicode, split ALL-CAPS headings, insert line breaks at sentence boundaries, format stratagem WHEN/TARGET/EFFECT.

### normalize/patterns.ts
Utility regex: `isSectionHeading()`, `findSentenceBoundaries()`, `splitAtHeadings()`. Skips abbreviations.

## Data

### data/11th-edition-detachments.ts
Hand-transcribed 11th Edition detachment data from faction focus articles. Structured data: faction ID, detachment rule, stratagems (CP/timing/effect), enhancements.

### data/challenger-cards.ts
`CHALLENGER_CARDS` — hand-transcribed challenger card data from Chapter Approved 2025 PDFs.

### data/primary-missions.ts
`PRIMARY_MISSIONS` — hand-transcribed primary mission data with scoring blocks, actions, max VP.
