/**
 * Game Tracker v2 — relational match model
 * See docs/superpowers/specs/2026-05-26-game-tracker-data-design.md
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { list, listUnit } from './list-schema'
import { authUsers, gameState, scoringMission } from './schema'

// ── Reference catalog: deployment overlays ───────────────────────────────────
export const deployment = sqliteTable('deployment', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  zoneOverlay: text('zone_overlay'), // JSON: zones + measurements
})

export const deploymentObjective = sqliteTable(
  'deployment_objective',
  {
    id: text('id').primaryKey(),
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployment.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
  },
  (t) => [index('idx_deployment_obj_deployment').on(t.deploymentId)],
)

export const terrainLayout = sqliteTable('terrain_layout', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  source: text('source'),
  terrainOverlay: text('terrain_overlay'), // JSON: positioned terrain pieces
})

export const missionCard = sqliteTable('mission_card', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  primaryObjectiveId: text('primary_objective_id').references(() => scoringMission.id),
  deploymentId: text('deployment_id').references(() => deployment.id),
  missionRule: text('mission_rule'),
})

// ── Match + sides ─────────────────────────────────────────────────────────────
export const matchV2 = sqliteTable(
  'match_v2',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['setup', 'in_progress', 'complete'] })
      .notNull()
      .default('setup'),
    deploymentId: text('deployment_id').references(() => deployment.id),
    terrainLayoutId: text('terrain_layout_id').references(() => terrainLayout.id),
    missionRule: text('mission_rule'),
    missionCardId: text('mission_card_id').references(() => missionCard.id),
    conclusion: text('conclusion'), // 'played_to_end' | 'conceded' | 'time'
    result: text('result'), // 'P1_WIN' | 'P2_WIN' | 'DRAW'
    date: integer('date'),
    location: text('location'),
    tournamentId: text('tournament_id'),
    pairingId: text('pairing_id'),
    requirePhotos: integer('require_photos', { mode: 'boolean' }).notNull().default(false),
    paintScoring: integer('paint_scoring', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    closedAt: integer('closed_at'),
  },
  (t) => [index('idx_match_v2_user').on(t.userId)],
)

export const matchPlayer = sqliteTable(
  'match_player',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matchV2.id, { onDelete: 'cascade' }),
    seat: text('seat', { enum: ['P1', 'P2'] }).notNull(),
    isYou: integer('is_you', { mode: 'boolean' }).notNull().default(false),
    listId: text('list_id').references(() => list.id),
    faction: text('faction'),
    detachment: text('detachment'),
    primaryObjectiveId: text('primary_objective_id').references(() => scoringMission.id),
    secondaryMode: text('secondary_mode', { enum: ['tactical', 'fixed'] })
      .notNull()
      .default('tactical'),
    isAttacker: integer('is_attacker', { mode: 'boolean' }),
    goesFirst: integer('goes_first', { mode: 'boolean' }),
    battleReady: integer('battle_ready', { mode: 'boolean' }).notNull().default(true),
    paintScore: integer('paint_score').notNull().default(10),
    finalPrimaryVp: integer('final_primary_vp'),
    finalSecondaryVp: integer('final_secondary_vp'),
  },
  (t) => [
    index('idx_match_player_match').on(t.matchId),
    index('idx_match_player_list').on(t.listId),
  ],
)

export const matchPlayerPrimaryOption = sqliteTable(
  'match_player_primary_option',
  {
    id: text('id').primaryKey(),
    matchPlayerId: text('match_player_id')
      .notNull()
      .references(() => matchPlayer.id, { onDelete: 'cascade' }),
    primaryObjectiveId: text('primary_objective_id')
      .notNull()
      .references(() => scoringMission.id),
  },
  (t) => [index('idx_mppo_player').on(t.matchPlayerId)],
)

// ── Rounds ─────────────────────────────────────────────────────────────────────
export const battleRound = sqliteTable(
  'battle_round',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matchV2.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull(),
  },
  (t) => [index('idx_battle_round_match').on(t.matchId)],
)

export const roundPlayer = sqliteTable(
  'round_player',
  {
    id: text('id').primaryKey(),
    roundId: text('round_id')
      .notNull()
      .references(() => battleRound.id, { onDelete: 'cascade' }),
    matchPlayerId: text('match_player_id')
      .notNull()
      .references(() => matchPlayer.id, { onDelete: 'cascade' }),
    cpGained: integer('cp_gained').notNull().default(0),
    cpSpent: integer('cp_spent').notNull().default(0),
  },
  (t) => [
    index('idx_round_player_round').on(t.roundId),
    index('idx_round_player_player').on(t.matchPlayerId),
  ],
)

// ── Scoring ────────────────────────────────────────────────────────────────────
export const scoreEvent = sqliteTable(
  'score_event',
  {
    id: text('id').primaryKey(),
    roundPlayerId: text('round_player_id')
      .notNull()
      .references(() => roundPlayer.id, { onDelete: 'cascade' }),
    scoringMissionId: text('scoring_mission_id')
      .notNull()
      .references(() => scoringMission.id),
    vp: integer('vp').notNull(),
  },
  (t) => [
    index('idx_score_event_round_player').on(t.roundPlayerId),
    index('idx_score_event_mission').on(t.scoringMissionId),
  ],
)

export const gameStateEvent = sqliteTable(
  'game_state_event',
  {
    id: text('id').primaryKey(),
    roundPlayerId: text('round_player_id')
      .notNull()
      .references(() => roundPlayer.id, { onDelete: 'cascade' }),
    gameStateId: text('game_state_id')
      .notNull()
      .references(() => gameState.id),
    scoreEventId: text('score_event_id'), // informational text link (no FK — survives score deletion)
    count: integer('count').notNull().default(1),
  },
  (t) => [
    index('idx_gse_round_player').on(t.roundPlayerId),
    index('idx_gse_game_state').on(t.gameStateId),
  ],
)

// ── Secondary card lifecycle (v2) ─────────────────────────────────────────────
export const matchSecondaryV2 = sqliteTable(
  'match_secondary_v2',
  {
    id: text('id').primaryKey(),
    matchPlayerId: text('match_player_id')
      .notNull()
      .references(() => matchPlayer.id, { onDelete: 'cascade' }),
    scoringMissionId: text('scoring_mission_id')
      .notNull()
      .references(() => scoringMission.id),
    mode: text('mode', { enum: ['tactical', 'fixed'] })
      .notNull()
      .default('tactical'),
    drawnRound: integer('drawn_round'),
    status: text('status', { enum: ['active', 'scored', 'discarded'] })
      .notNull()
      .default('active'),
    discardTiming: text('discard_timing'), // 'command_phase' | 'end_of_turn'
  },
  (t) => [index('idx_msv2_player').on(t.matchPlayerId)],
)

// ── Board state ────────────────────────────────────────────────────────────────
export const unitCasualty = sqliteTable(
  'unit_casualty',
  {
    id: text('id').primaryKey(),
    roundPlayerId: text('round_player_id')
      .notNull()
      .references(() => roundPlayer.id, { onDelete: 'cascade' }),
    listUnitId: text('list_unit_id').references(() => listUnit.id),
    kind: text('kind', { enum: ['LOST', 'DESTROYED'] }).notNull(),
    destroyedByUnitId: text('destroyed_by_unit_id'), // informational text (no FK)
  },
  (t) => [index('idx_unit_casualty_round_player').on(t.roundPlayerId)],
)

export const unitState = sqliteTable(
  'unit_state',
  {
    id: text('id').primaryKey(),
    matchPlayerId: text('match_player_id')
      .notNull()
      .references(() => matchPlayer.id, { onDelete: 'cascade' }),
    listUnitId: text('list_unit_id').references(() => listUnit.id),
    stateKey: text('state_key').notNull(), // 'battle_shock' | 'hidden' | 'marked' | …
    value: text('value'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    sinceRound: integer('since_round').notNull(),
    clearedRound: integer('cleared_round'),
  },
  (t) => [index('idx_unit_state_player').on(t.matchPlayerId)],
)

export const stratagemUse = sqliteTable(
  'stratagem_use',
  {
    id: text('id').primaryKey(),
    roundId: text('round_id')
      .notNull()
      .references(() => battleRound.id, { onDelete: 'cascade' }),
    usedById: text('used_by_id')
      .notNull()
      .references(() => matchPlayer.id),
    activeSideId: text('active_side_id')
      .notNull()
      .references(() => matchPlayer.id),
    stratagemName: text('stratagem_name').notNull(),
    cpCost: integer('cp_cost').notNull().default(1),
    phase: text('phase'), // 'command' | 'movement' | 'shooting' | 'charge' | 'fight'
  },
  (t) => [index('idx_stratagem_use_round').on(t.roundId)],
)
