/**
 * Phase 2 — List data model tables
 * The relational "server-of-truth" for army lists consumed by all apps.
 * See docs/superpowers/specs/2026-05-26-list-data-model-design.md
 */
import { type AnySQLiteColumn, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { dimDataslate } from './schema'
import { authUsers, contentEntity } from './schema'

// ── list — TTT Meta + selection (replaces old 'lists') ───────────────────────
export const list = sqliteTable(
  'list',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    author: text('author'),
    edition: text('edition', { enum: ['10th', '11th'] })
      .notNull()
      .default('11th'),
    // FK into content_entity (type='faction')
    factionId: text('faction_id').references(() => contentEntity.id),
    // FK into content_entity (type='subfaction')
    subfactionId: text('subfaction_id').references(() => contentEntity.id),
    // FK into content_entity (type='detachment')
    detachmentId: text('detachment_id').references(() => contentEntity.id),
    battleSize: text('battle_size', {
      enum: ['Combat Patrol', 'Incursion', 'Strike Force', 'Onslaught', 'unknown'],
    })
      .notNull()
      .default('unknown'),
    totalPoints: integer('total_points').notNull().default(0), // saved snapshot
    dataslateId: text('dataslate_id').references(() => dimDataslate.id),
    source: text('source').notNull().default('list-builder'), // 'list-builder' | 'bcp-import'
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_list_user_id').on(table.userId),
    index('idx_list_faction').on(table.factionId),
    index('idx_list_detachment').on(table.detachmentId),
  ],
)

// ── list_unit — THE CONFIGURED UNIT (shared with Versus/Game Tracker/Tournament)
// list_id is NOT NULL: a row exists only inside a real list (no scratch rows).
// Self-ref: a Character list_unit points at its bodyguard via attached_to_unit_id + attach_role.
export const listUnit = sqliteTable(
  'list_unit',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => list.id, { onDelete: 'cascade' }),
    // FK into content_entity (type='datasheet')
    datasheetId: text('datasheet_id').references(() => contentEntity.id),
    // FK into content_entity (type='enhancement')
    enhancementId: text('enhancement_id').references(() => contentEntity.id),
    isWarlord: integer('is_warlord', { mode: 'boolean' }).notNull().default(false),
    points: integer('points').notNull().default(0), // saved snapshot
    // Self-ref: character -> bodyguard unit_id
    attachedToUnitId: text('attached_to_unit_id').references((): AnySQLiteColumn => listUnit.id),
    attachRole: text('attach_role', { enum: ['leader', 'support'] }),
  },
  (table) => [
    index('idx_list_unit_list_id').on(table.listId),
    index('idx_list_unit_datasheet').on(table.datasheetId),
    index('idx_list_unit_attached_to').on(table.attachedToUnitId),
  ],
)

// ── list_unit_loadout — a model group: N models sharing one loadout ──────────
export const listUnitLoadout = sqliteTable(
  'list_unit_loadout',
  {
    id: text('id').primaryKey(),
    listUnitId: text('list_unit_id')
      .notNull()
      .references(() => listUnit.id, { onDelete: 'cascade' }),
    modelCount: integer('model_count').notNull(),
  },
  (table) => [index('idx_list_unit_loadout_unit').on(table.listUnitId)],
)

// ── list_unit_loadout_weapon — weapons in a model group ──────────────────────
export const listUnitLoadoutWeapon = sqliteTable(
  'list_unit_loadout_weapon',
  {
    id: text('id').primaryKey(),
    loadoutId: text('loadout_id')
      .notNull()
      .references(() => listUnitLoadout.id, { onDelete: 'cascade' }),
    // FK into content_entity (type='weapon') — scoped to this unit's datasheet
    weaponId: text('weapon_id').references(() => contentEntity.id),
    count: integer('count').notNull().default(1), // weapons per model
  },
  (table) => [index('idx_list_unit_loadout_weapon_loadout').on(table.loadoutId)],
)
