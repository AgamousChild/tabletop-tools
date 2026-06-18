/**
 * card-layout-types.ts — Shared layout descriptor types.
 *
 * Used by both:
 *   - apps/brain/server/src/lib/card-layout.ts  (produces layout JSON)
 *   - apps/brain/client/src/lib/server-cards/   (consumes layout JSON)
 *
 * Pure TypeScript — no React, no browser APIs, no Node-only APIs.
 * Safe to import from Worker (server) and from Vite (client).
 */

// ── Primitives ────────────────────────────────────────────────────────────────

/** Header band (gradient background, unit name, subtitle, right-side badge). */
export interface HeaderNode {
  type: 'header'
  title: string
  subtitle?: string
  badge?: string
  badgeColor?: 'amber' | 'blue' | 'green' | 'red'
}

/** Six-cell stat bar (M / T / SV / W / LD / OC plus optional INV / FNP). */
export interface StatBarNode {
  type: 'stat-bar'
  stats: Array<{ label: string; value: string }>
}

/** Table with a header row and body rows (ranged / melee weapons). */
export interface TableNode {
  type: 'table'
  label: string
  accentColor?: 'amber' | 'red' | 'green' | 'blue'
  columns: string[]
  rows: Array<{
    cells: string[]
    /** Ability tags rendered inside the first cell, e.g. ["HEAVY", "BLAST"]. */
    tags?: string[]
  }>
}

/** A section heading (e.g. "ABILITIES"). */
export interface HeadingNode {
  type: 'heading'
  text: string
  accentColor?: 'amber' | 'red' | 'green' | 'blue'
}

/** A labelled key-value pair (e.g. "Composition: 1 Warboss"). */
export interface KeyValueNode {
  type: 'key-value'
  label: string
  value: string
}

/** A list of small pill badges (keywords, core abilities). */
export interface PillListNode {
  type: 'pill-list'
  /** Label shown before the pills, e.g. "Keywords". */
  label?: string
  pills: Array<{
    text: string
    /** Pill style variant. */
    variant?: 'default' | 'faction' | 'amber' | 'green'
  }>
}

/** An ability block: bold name + description paragraph. */
export interface AbilityNode {
  type: 'ability'
  name: string
  description: string
  /** When true, renders collapsed by default (USR-style). */
  collapsible?: boolean
}

/** Horizontal rule / visual divider. */
export interface DividerNode {
  type: 'divider'
}

/** A flex-row or flex-column container of child nodes. */
export interface BoxNode {
  type: 'box'
  direction?: 'row' | 'column'
  children: CardLayoutNode[]
}

/** Plain text paragraph. */
export interface TextNode {
  type: 'text'
  value: string
  size?: 'sm' | 'xs'
  muted?: boolean
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type CardLayoutNode =
  | HeaderNode
  | StatBarNode
  | TableNode
  | HeadingNode
  | KeyValueNode
  | PillListNode
  | AbilityNode
  | DividerNode
  | BoxNode
  | TextNode

/** Root layout descriptor returned by the server. */
export interface CardLayout {
  /** Layout schema version — bump when the shape changes incompatibly. */
  version: 1
  nodes: CardLayoutNode[]
}
