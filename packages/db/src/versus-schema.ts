/**
 * Phase 3 — Versus simulation tables
 * simulation          — one row per saved run
 * simulation_weapon   — one row per weapon profile fired in a run
 * simulation_modifier — one resolved modifier active in a run
 * See docs/superpowers/specs/2026-05-26-versus-data-model-design.md
 */
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { listUnit } from './list-schema'
import { authUsers } from './schema'

export const simulation = sqliteTable(
  'simulation',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    label: text('label'), // optional user-given name
    // FK into list_unit — the configured unit (models + loadout + attachments)
    attackerUnitId: text('attacker_unit_id').references(() => listUnit.id, {
      onDelete: 'set null',
    }),
    defenderUnitId: text('defender_unit_id').references(() => listUnit.id, {
      onDelete: 'set null',
    }),
    // Denormalized names for display when list_unit is unavailable
    attackerName: text('attacker_name').notNull(),
    defenderName: text('defender_name').notNull(),
    dataslateId: text('dataslate_id'), // version context (plain text — no FK required)
    // Headline result columns (no JSON blobs)
    expectedWounds: real('expected_wounds').notNull(),
    expectedModelsRemoved: real('expected_models_removed').notNull(),
    survivors: real('survivors').notNull(),
    worstWounds: real('worst_wounds').notNull(),
    worstModels: real('worst_models').notNull(),
    bestWounds: real('best_wounds').notNull(),
    bestModels: real('best_models').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_simulation_user_id').on(table.userId),
    index('idx_simulation_attacker').on(table.attackerUnitId),
    index('idx_simulation_defender').on(table.defenderUnitId),
    index('idx_simulation_created').on(table.createdAt),
  ],
)

export const simulationWeapon = sqliteTable(
  'simulation_weapon',
  {
    id: text('id').primaryKey(),
    simulationId: text('simulation_id')
      .notNull()
      .references(() => simulation.id, { onDelete: 'cascade' }),
    // 'ranged' | 'melee' — which kind of profile was fired
    profileKind: text('profile_kind', { enum: ['ranged', 'melee'] }).notNull(),
    // Canonical weapon content_entity id (plain text — no FK required; content may be unlinked)
    profileId: text('profile_id'),
    // Denormalized weapon name for display
    weaponName: text('weapon_name').notNull(),
    // Attack-count invariant factors (all three stored — total must equal product)
    modelCount: integer('model_count').notNull(),
    weaponsPerModel: integer('weapons_per_model').notNull(),
    attacksPerWeapon: real('attacks_per_weapon').notNull(), // expected value (D6 → 3.5)
    totalAttacks: real('total_attacks').notNull(), // = modelCount × weaponsPerModel × attacksPerWeapon
    // Per-weapon result
    expectedWounds: real('expected_wounds').notNull(),
    expectedModelsRemoved: real('expected_models_removed').notNull(),
  },
  (table) => [index('idx_sim_weapon_sim_id').on(table.simulationId)],
)

export const simulationModifier = sqliteTable(
  'simulation_modifier',
  {
    id: text('id').primaryKey(),
    simulationId: text('simulation_id')
      .notNull()
      .references(() => simulation.id, { onDelete: 'cascade' }),
    side: text('side', { enum: ['ATTACK', 'DEFENSE'] }).notNull(),
    source: text('source').notNull(), // e.g. 'weapon_ability', 'special_rule', 'leader'
    key: text('key').notNull(), // e.g. 'SUSTAINED_HITS', 'LETHAL_HITS', 'HIT_MOD'
    value: text('value'), // JSON-stringified numeric or null for boolean flags
  },
  (table) => [index('idx_sim_modifier_sim_id').on(table.simulationId)],
)
