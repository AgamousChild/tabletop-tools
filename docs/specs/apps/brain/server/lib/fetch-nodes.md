# apps/brain/server/src/lib/fetch-nodes.ts

> R2 node fetching and graph walking for connected nodes.

## Prompt

`fetchNodesFromR2(ids, bucket)` — loads manifest (cached), iterates node files, collects requested IDs.

`fetchConnectedNodes(nodeIds, bucket, factionFilter?)` — walks reverse index for inbound refs, pre-filters by faction, collects refs sorted by priority (abilities > stratagems > weapons), resolves part_of parents via forward index, follows stacks_with combo partners, applies subfaction filter. Returns selected nodes + parentMap.
