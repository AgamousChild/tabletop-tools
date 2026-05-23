# apps/content-ingestor/src/commit/commit.ts

> Commit approved drafts to the brain community.json graph file.

## Prompt

Export `commitApprovedNodes(dataDir, brainNodesDir)`.

Discovers all draft directories, loads drafts, filters to `status === 'approved'`, deduplicates by ID (`community:{slug}`), builds BrainNode objects with layer=community. Copies screenshots to community media directory. Appends to community.json. Returns `{ committed, screenshotsUploaded }`.

## Dependencies

- `fs`, `path`
- `../drafts/store` — `loadDrafts`
- `../extract/dedup` — `loadExistingNodes`
- `../review/interactive` — `findDraftDirs`
