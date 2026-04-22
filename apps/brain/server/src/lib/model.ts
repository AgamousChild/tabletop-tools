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
  // Missions & deployment
  'primary-mission', 'secondary-mission', 'deployment-zone',
  'twist', 'challenger', 'terrain-layout',
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
  topPct: z.number().min(0).max(100).optional(),    // % from top of page where content starts
  heightPct: z.number().min(0).max(100).optional(),  // % of page height the content covers
  leftPct: z.number().min(0).max(100).optional(),   // % from left of page where content starts
  widthPct: z.number().min(0).max(100).optional(),   // % of page width the content covers
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
  factionName: z.string().optional(),    // Preferred display name (e.g., "SPACE MARINES")
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

  // Data quality (set by massage layer, surfaced to UI)
  qualityFlags: z.array(z.string()).optional(),
})
export type Node = z.infer<typeof NodeSchema>

// ── Record layer ────────────────────────────────────────────────────────────

/**
 * High-level content categories used to group nodes into browsable records.
 * Distinct from NodeCategory (which describes individual node granularity).
 */
export const RecordTypeSchema = z.enum([
  'unit', 'detachment', 'stratagem', 'enhancement',
  'rule', 'army-rule', 'errata', 'balance',
  'primary-mission', 'secondary-mission', 'deployment-zone',
  'twist', 'challenger', 'terrain-layout',
])
export type RecordType = z.infer<typeof RecordTypeSchema>

/**
 * A linked errata entry that annotates a node with clarification or correction text.
 */
export const ErrataAnnotationSchema = z.object({
  nodeId: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  source: z.object({
    type: z.string(),
    title: z.string(),
    page: z.number().optional(),
  }),
})
export type ErrataAnnotation = z.infer<typeof ErrataAnnotationSchema>

/**
 * A cross-reference from one record to another, with relationship context.
 */
export const CrossRefSchema = z.object({
  targetRecordId: z.string().min(1),
  targetTitle: z.string().min(1),
  targetType: RecordTypeSchema,
  rel: z.string().min(1),
  context: z.string(),
  refCount: z.number().int().min(1),
})
export type CrossRef = z.infer<typeof CrossRefSchema>

/**
 * A record groups a primary node with its child nodes, cross-references, and errata.
 * Named BrainRecord to avoid collision with TypeScript's built-in Record<K,V> utility type.
 */
export const RecordSchema = z.object({
  type: RecordTypeSchema,
  primaryNode: NodeSchema,
  childNodes: z.array(NodeSchema),
  crossRefs: z.array(CrossRefSchema),
  errata: z.array(ErrataAnnotationSchema),
  matchedChildIds: z.array(z.string()),
})
export type BrainRecord = z.infer<typeof RecordSchema>
