# apps/brain/client/src/lib/ — Client Library Modules

## Modules

### store.ts
IndexedDB client store for brain data (DB: "tabletop-tools-brain" v1). Three stores: nodes (indexed on layer/category/factionId/phase), refs, meta. CRUD operations: saveNodes, getNode, searchNodes, getNodesByLayer/Faction, saveRefs, getRefsFrom/To, setBrainMeta, getBrainMeta, clearBrainData.

### sync.ts
Brain data sync pipeline. `checkForBrainUpdates()` — fetch manifest.json, compare local hashes. `syncBrainData(manifest, onProgress)` — download only changed node/ref JSON files, save to IndexedDB, update sync metadata.

### hooks.ts
React hooks wrapping store operations. `useNode`, `useNodesByLayer`, `useNodesByFaction`, `useNodeSearch`, `useNodeRefs`, `useConnectedNodes`. All return `{ data, error, isLoading }` triple via `useBrainQuery` factory.

### card-data-builder.ts
Convert API response nodes to typed CardData for rendering. Parsers for stat lines, weapons, stratagems, enhancements, sub-rules. Routes category → card type (unit/stratagem/enhancement/rule/mission/etc.).

### card-display.ts
Server node → card view resolution. Routes node.category → CardData builder. Extracts PDF source. Returns `{ card, pdfSource?, qualityFlags }`.

### entity-linker.ts
Client-side text segmentation with entity link detection. Splits text into `{ text, entity? }` segments. Longest-match-first, case-insensitive. Handles bracketed [KEYWORD] tokens.

### faction-names.ts
Slug ↔ display name mapping. `factionDisplayName('space-marines')` → `'SPACE MARINES'`. Falls back to slug→ALLCAPS.

### render-markdown.ts
Markdown → styled HTML for card content. Handles headings, bullets, bold/italic, Designer's Note blocks, Example blocks, section headers.
