# apps/brain/server/src/lib/model.ts

> Zod schemas for all node types, references, sources, and records.

## Prompt

Defines the complete brain data model with Zod schemas:

- `NodeLayer` enum: core, faction, unit, errata, balance, community
- `NodeCategory` enum: ~25 categories (detachment, stratagem, enhancement, army-rule, datasheet, weapon, etc.)
- `GamePhase` enum: command, movement, shooting, charge, fight
- `RefType` enum: part_of, modifies, clarifies, supersedes, requires, stacks_with, eligible_for, sequence_adjacent
- `SourceType` enum: core-rules, balance-dataslate, faction-pack, wahapedia, community, chapter-approved, etc.

`Node` schema: id, title, content, summary, layer, category, factionId, subfactionId, detachmentId, sources[], refs[], keywords[], edition, points/stats/weaponStats structured fields.

`NodeRef`: directed edge (sourceId, targetId, rel, context).

`BrainRecord`: aggregation wrapper (primaryNode + childNodes + crossRefs + errata).
