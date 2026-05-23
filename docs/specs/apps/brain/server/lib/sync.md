# apps/brain/server/src/lib/sync.ts

> Partition nodes/refs into files, build manifest, and sync to R2.

## Prompt

`partitionNodes(nodes)` — split into core.json, faction-{slug}.json, errata.json, etc.
`partitionRefs(refs)` — split into refs/{target-slug}-refs.json, keyed by target node.
`buildManifest(files)` — version, updatedAt, deterministic content hashing for cache invalidation.
`runBrainSync(nodes, refs, bucket)` — orchestrate: partition → manifest → write to R2.
