import { z } from 'zod'

// ── Enums ───────────────────────────────────────────────────────────────────

export const NodeLayerSchema = z.enum([
  'core', 'faction', 'unit', 'errata', 'balance', 'community',
])
export type NodeLayer = z.infer<typeof NodeLayerSchema>

export const NodeCategorySchema = z.enum([
  // Core rules
  'core-mechanic', 'phase-sequence', 'terrain', 'army-construction', 'mission', 'keyword',
  // Faction
  'detachment-rule', 'stratagem', 'enhancement', 'faction-ability',
  // Unit
  'datasheet', 'weapon', 'unit-ability', 'wargear-option', 'leader-attachment', 'unit-composition',
  // Overlay
  'balance-change', 'faq', 'commentary',
  // Community
  'ruling', 'tactic', 'worked-example',
])
export type NodeCategory = z.infer<typeof NodeCategorySchema>

export const GamePhaseSchema = z.enum([
  'command', 'movement', 'shooting', 'charge', 'fight',
  'any', 'pre-battle', 'deployment', 'end-of-turn',
])
export type GamePhase = z.infer<typeof GamePhaseSchema>

export const RefTypeSchema = z.enum([
  // Structural
  'part_of', 'supersedes', 'clarifies',
  // Mechanical — obvious
  'requires', 'modifies', 'triggers', 'sequence_adjacent',
  // Mechanical — non-obvious
  'interacts_with', 'commonly_confused', 'edge_case', 'stacks_with', 'prevents',
])
export type RefType = z.infer<typeof RefTypeSchema>

export const SourceTypeSchema = z.enum([
  'pdf', 'wahapedia', 'bsdata', 'faq', 'errata',
  'balance-dataslate', 'reddit', 'youtube', 'manual',
])
export type SourceType = z.infer<typeof SourceTypeSchema>

// ── Source ──────────────────────────────────────────────────────────────────

export const SourceSchema = z.object({
  type: SourceTypeSchema,
  title: z.string().min(1),
  url: z.string().optional(),
  page: z.number().int().positive().optional(),
  section: z.string().optional(),
  timestamp: z.string().optional(),
  retrievedAt: z.string().min(1),
})
export type Source = z.infer<typeof SourceSchema>

// ── NodeRef ────────────────────────────────────────────────────────────────

export const NodeRefSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  rel: RefTypeSchema,
  context: z.string().min(1),
  bidirectional: z.boolean().optional(),
})
export type NodeRef = z.infer<typeof NodeRefSchema>

// ── Node ───────────────────────────────────────────────────────────────────

export const NodeSchema = z.object({
  id: z.string().min(1),
  layer: NodeLayerSchema,
  category: NodeCategorySchema,

  // Content
  title: z.string().min(1),
  content: z.string().min(1),
  summary: z.string().min(1),

  // Taxonomy
  phase: GamePhaseSchema.optional(),
  factionId: z.string().optional(),
  detachmentId: z.string().optional(),
  datasheetId: z.string().optional(),

  // Source attribution
  sources: z.array(SourceSchema).min(1),

  // Graph
  refs: z.array(NodeRefSchema),

  // Errata/versioning
  effectiveDate: z.string().optional(),
  supersededBy: z.string().optional(),
  version: z.number().int().positive(),

  // Sub-faction (chapter, legion, craftworld, etc.)
  subfaction: z.string().optional(),

  // Search
  keywords: z.array(z.string()),
})
export type Node = z.infer<typeof NodeSchema>
