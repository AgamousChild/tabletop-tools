# apps/brain/server/src/lib/retrieve.ts

> Unified retrieval pipeline — query → embed → Vectorize → R2 → enriched results.

## Prompt

Export `retrieve(opts): Promise<RetrieveResult>`.

Pipeline: 1) Detect factions + extract keywords from query. 2) Embed via Workers AI (dual embedding for keywords if /ask). 3) Query Vectorize topK=50, post-filter by faction/subfaction, sort by exact title match → rank → score. 4) Fetch full nodes from R2. 5) Inject direct title matches from all files. 6) Optionally fetch connected nodes (reverse index walk) + faction filter + combo partner following. 7) Aggregate into records (parent+children, cross-refs, errata).

Returns results + connected + parentMap for UI traversal.
