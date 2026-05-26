/**
 * @see docs/schema-indexeddb-brain.md — Full node model documentation with all enums and types
 * @see docs/etl-data-pipelines.md — Brain build pipeline that produces nodes
 */
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
  'faction', 'army-rule', 'army-ability', 'detachment', 'detachment-rule', 'stratagem', 'enhancement', 'faction-ability',
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
  // Army construction
  'eligible_for', 'can_lead',
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
  publishedAt: z.string().optional(),   // when the source material was published/released
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

  // Structured fields (parsed from content text)
  cpCost: z.number().int().min(0).optional(),           // Stratagem CP cost
  targetKeywords: z.array(z.string()).optional(),        // Keywords a stratagem/detachment-rule targets (e.g., ["DEATH COMPANY"])
  modelRestriction: z.string().optional(),               // Enhancement model restriction (e.g., "PHOBOS model only")
  isUpgrade: z.boolean().optional(),                     // Enhancement is a unit upgrade (not character-only)
  isEpicHero: z.boolean().optional(),                    // Unit is a named character — cannot take enhancements
  points: z.array(z.object({                            // Unit points costs by model count
    models: z.string(),                                   // e.g., "5 models", "1 model"
    cost: z.number(),
  })).optional(),

  // Unit stat line (parsed from Wahapedia structured data)
  stats: z.object({
    M: z.string(),    // e.g., "6\"", "12\""
    T: z.number(),
    SV: z.string(),   // e.g., "3+", "2+"
    W: z.number(),
    LD: z.string(),   // e.g., "6+", "5+"
    OC: z.number(),
    invSv: z.string().optional(), // e.g., "4+"
  }).optional(),

  // Weapon stat line (parsed from Wahapedia structured data)
  weaponStats: z.object({
    range: z.string(),  // e.g., "24\"", "Melee"
    A: z.string(),      // e.g., "2", "D6"
    skill: z.string(),  // e.g., "3+", "2+"
    S: z.number(),
    AP: z.number(),
    D: z.string(),      // e.g., "1", "D3"
  }).optional(),

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

  // Edition (e.g., '10th', '11th')
  edition: z.string().optional(),

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
  'faction', 'detachment', 'unit', 'stratagem', 'enhancement', 'army-rule',
  'rule', 'errata', 'balance',
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
