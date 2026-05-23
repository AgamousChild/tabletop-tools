# apps/brain/server/src/lib/browse.ts

> Filter top-level browse-worthy nodes (exclude weapons, abilities, sub-rules).

## Prompt

Export `filterBrowseNodes(nodes)`. Removes child categories (weapon, unit-ability, wargear-option, leader-attachment, unit-composition) and army-rule sub-rules (detected by "(ParentName)" title suffix + faction-ability category + no detachmentId).
