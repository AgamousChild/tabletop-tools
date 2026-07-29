/**
 * @see docs/schema-turso.md — Full schema documentation with all columns, constraints, and indexes
 * @see docs/schema-overview.md — Cross-database overview
 * @see docs/etl-app-workers.md — Which Workers read/write which tables
 */
import { sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// === Auth tables — managed by Better Auth ===

export const authUsers = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  username: text('username').unique(),
  displayUsername: text('display_username').unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const authSessions = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('idx_session_user_id').on(table.userId)],
)

export const authAccounts = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('idx_account_user_id').on(table.userId)],
)

export const authVerifications = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (table) => [index('idx_verification_identifier').on(table.identifier)],
)

// === NoCheat tables ===

export const diceSets = sqliteTable(
  'dice_sets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_dice_sets_user_id').on(table.userId)],
)

// Named diceRollingSessions to avoid collision with authSessions.
// Database table name is 'sessions' (plural), auth table is 'session' (singular).
export const diceRollingSessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    diceSetId: text('dice_set_id')
      .notNull()
      .references(() => diceSets.id, { onDelete: 'cascade' }),
    opponentName: text('opponent_name'),
    zScore: real('z_score'),
    isLoaded: integer('is_loaded'),
    photoUrl: text('photo_url'),
    createdAt: integer('created_at').notNull(),
    closedAt: integer('closed_at'),
  },
  (table) => [
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_dice_set_id').on(table.diceSetId),
  ],
)

export const rolls = sqliteTable(
  'rolls',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => diceRollingSessions.id, { onDelete: 'cascade' }),
    pipValues: text('pip_values').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_rolls_session_id').on(table.sessionId)],
)

export const trainingExamples = sqliteTable(
  'training_examples',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    diceSetId: text('dice_set_id')
      .notNull()
      .references(() => diceSets.id, { onDelete: 'cascade' }),
    label: integer('label').notNull(), // 1-6 pip count, 0 = not a die
    guess: integer('guess'), // what the CV pipeline guessed (null if no guess)
    confidence: real('confidence'), // kNN confidence 0-1
    features: text('features').notNull(), // JSON array of feature vector
    imageUrl: text('image_url'), // R2 URL for ROI image
    isCorrect: integer('is_correct'), // 1 if label === guess, 0 otherwise
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_training_examples_user_id').on(table.userId),
    index('idx_training_examples_dice_set_id').on(table.diceSetId),
    index('idx_training_examples_label').on(table.label),
  ],
)

export const trainingFrames = sqliteTable(
  'training_frames',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    diceSetId: text('dice_set_id')
      .notNull()
      .references(() => diceSets.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    frameWidth: integer('frame_width').notNull(),
    frameHeight: integer('frame_height').notNull(),
    boxesJson: text('boxes_json').notNull(), // JSON: [{x, y, w, h, label}] normalized 0-1
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_training_frames_user_id').on(table.userId),
    index('idx_training_frames_dice_set_id').on(table.diceSetId),
  ],
)

// === Versus tables ===
//
// IMPORTANT: No foreign keys into game content.
// attacker_content_id / defender_content_id are plain TEXT.

export const simulations = sqliteTable(
  'simulations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    attackerContentId: text('attacker_content_id').notNull(),
    attackerName: text('attacker_name').notNull(),
    defenderContentId: text('defender_content_id').notNull(),
    defenderName: text('defender_name').notNull(),
    result: text('result').notNull(), // JSON — full simulation output
    // V3: hash of (weapons, rules, modelCounts, leader) for cache lookup
    configHash: text('config_hash'),
    // V3: JSON — selected weapons + rules configuration
    weaponConfig: text('weapon_config'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_simulations_user_id').on(table.userId)],
)

// === List Builder tables ===
//
// IMPORTANT: No foreign keys into game content.
// Game content IDs are stored as plain TEXT (_content_id suffix).
// unit_name and unit_points are denormalized at add-time so lists
// display correctly even if the content adapter is unavailable.

export const lists = sqliteTable(
  'lists',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    // faction is a user-entered string — NOT validated against GW data
    faction: text('faction').notNull(),
    name: text('name').notNull(),
    totalPts: integer('total_pts').notNull().default(0),
    // V3 additions
    detachment: text('detachment'),
    description: text('description'),
    battleSize: integer('battle_size'), // 500/1000/2000/3000
    syncedAt: integer('synced_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_lists_user_id').on(table.userId)],
)

export const listUnits = sqliteTable(
  'list_units',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    // unit_content_id is a reference into the game content adapter — not a DB FK
    unitContentId: text('unit_content_id').notNull(),
    // Denormalized at add-time so the list renders without a content lookup
    unitName: text('unit_name').notNull(),
    unitPoints: integer('unit_points').notNull(),
    count: integer('count').notNull().default(1),
    modelCount: integer('model_count'),
    // V3 additions
    isWarlord: integer('is_warlord').notNull().default(0),
    enhancementId: text('enhancement_id'),
    enhancementName: text('enhancement_name'),
    enhancementCost: integer('enhancement_cost'),
  },
  (table) => [index('idx_list_units_list_id').on(table.listId)],
)

export const unitRatings = sqliteTable(
  'unit_ratings',
  {
    id: text('id').primaryKey(),
    // unit_content_id references the game content adapter — not a DB FK
    unitContentId: text('unit_content_id').notNull(),
    rating: text('rating').notNull(), // S / A / B / C / D
    winContrib: real('win_contrib').notNull(),
    ptsEff: real('pts_eff').notNull(),
    metaWindow: text('meta_window').notNull(), // e.g. "2025-Q2" — resets on dataslate
    computedAt: integer('computed_at').notNull(),
  },
  (table) => [
    index('idx_unit_ratings_unit_content_id').on(table.unitContentId),
    index('idx_unit_ratings_meta_window').on(table.metaWindow),
    uniqueIndex('uq_unit_ratings_unit_window').on(table.unitContentId, table.metaWindow),
  ],
)

// === Game Tracker tables ===
//
// opponent_faction is a user-entered string — not a BSData FK.
// your_units_lost / their_units_lost are JSON arrays of { contentId, name }
// where name is denormalized for display without a content lookup.

export const matches = sqliteTable(
  'matches',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    // optional: references a list from list-builder
    listId: text('list_id'),
    // user-entered string — NOT a BSData FK
    opponentFaction: text('opponent_faction').notNull(),
    mission: text('mission').notNull(),
    // WIN | LOSS | DRAW — null while in progress
    result: text('result'),
    yourFinalScore: integer('your_final_score'),
    theirFinalScore: integer('their_final_score'),
    // whether this match should feed into the tournament rating engine
    isTournament: integer('is_tournament').notNull().default(0),
    // V3 additions
    opponentName: text('opponent_name'),
    opponentDetachment: text('opponent_detachment'),
    yourFaction: text('your_faction'),
    yourDetachment: text('your_detachment'),
    terrainLayout: text('terrain_layout'),
    deploymentZone: text('deployment_zone'),
    twistCards: text('twist_cards'), // JSON
    challengerCards: text('challenger_cards'), // JSON
    requirePhotos: integer('require_photos').notNull().default(0),
    attackerDefender: text('attacker_defender'), // YOU_ATTACK | YOU_DEFEND
    whoGoesFirst: text('who_goes_first'), // YOU | THEM
    date: integer('date'),
    location: text('location'),
    tournamentName: text('tournament_name'),
    tournamentId: text('tournament_id'),
    createdAt: integer('created_at').notNull(),
    closedAt: integer('closed_at'),
    hiddenAt: integer('hidden_at'),
  },
  (table) => [index('idx_matches_user_id').on(table.userId)],
)

export const turns = sqliteTable(
  'turns',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    turnNumber: integer('turn_number').notNull(),
    photoUrl: text('photo_url'),
    // JSON: [{ contentId: string, name: string }]
    yourUnitsLost: text('your_units_lost').notNull().default('[]'),
    // JSON: [{ contentId: string, name: string }]
    theirUnitsLost: text('their_units_lost').notNull().default('[]'),
    primaryScored: integer('primary_scored').notNull().default(0),
    secondaryScored: integer('secondary_scored').notNull().default(0),
    cpSpent: integer('cp_spent').notNull().default(0),
    notes: text('notes'),
    // V3 additions — per-player scoring
    yourCpStart: integer('your_cp_start').notNull().default(0),
    yourCpGained: integer('your_cp_gained').notNull().default(1),
    yourCpSpent: integer('your_cp_spent').notNull().default(0),
    theirCpStart: integer('their_cp_start').notNull().default(0),
    theirCpGained: integer('their_cp_gained').notNull().default(1),
    theirCpSpent: integer('their_cp_spent').notNull().default(0),
    yourPrimary: integer('your_primary').notNull().default(0),
    theirPrimary: integer('their_primary').notNull().default(0),
    yourSecondary: integer('your_secondary').notNull().default(0),
    theirSecondary: integer('their_secondary').notNull().default(0),
    yourPhotoUrl: text('your_photo_url'),
    theirPhotoUrl: text('their_photo_url'),
    yourUnitsDestroyed: text('your_units_destroyed').notNull().default('[]'),
    theirUnitsDestroyed: text('their_units_destroyed').notNull().default('[]'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_turns_match_id').on(table.matchId),
    uniqueIndex('uq_turns_match_number').on(table.matchId, table.turnNumber),
  ],
)

// === Tournament tables ===
//
// faction and list_text are user-entered strings.
// The platform never validates them against GW data.

export const tournaments = sqliteTable(
  'tournaments',
  {
    id: text('id').primaryKey(),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    eventDate: integer('event_date').notNull(),
    location: text('location'),
    format: text('format').notNull(),
    totalRounds: integer('total_rounds').notNull(),
    // DRAFT | REGISTRATION | CHECK_IN | IN_PROGRESS | COMPLETE
    status: text('status').notNull().default('DRAFT'),
    // V3 additions
    description: text('description'),
    imageUrl: text('image_url'),
    externalLink: text('external_link'),
    startTime: text('start_time'), // HH:MM format
    latitude: real('latitude'),
    longitude: real('longitude'),
    missionPool: text('mission_pool'), // JSON: per-round mission assignments
    requirePhotos: integer('require_photos').notNull().default(0),
    includeTwists: integer('include_twists').notNull().default(0),
    includeChallenger: integer('include_challenger').notNull().default(0),
    maxPlayers: integer('max_players'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_tournaments_user_id').on(table.toUserId)],
)

export const tournamentPlayers = sqliteTable(
  'tournament_players',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    // user-entered string — kept for backward compat + meta export
    faction: text('faction').notNull(),
    // user-entered detachment name — kept for backward compat
    detachment: text('detachment'),
    // Phase 3: FK into content_entity (type='faction') — canonical registry
    factionEntityId: text('faction_entity_id').references((): AnySQLiteColumn => contentEntity.id),
    // Phase 3: FK into content_entity (type='detachment')
    detachmentEntityId: text('detachment_entity_id').references(
      (): AnySQLiteColumn => contentEntity.id,
    ),
    // army list pasted as raw text — stored verbatim, never parsed for GW content
    listText: text('list_text'),
    // V3: FK to lists table (optional — from list-builder sync)
    listId: text('list_id'),
    listLocked: integer('list_locked').notNull().default(0),
    checkedIn: integer('checked_in').notNull().default(0),
    dropped: integer('dropped').notNull().default(0),
    // Phase 3: snapshot written on tournament COMPLETE
    placement: integer('placement'),
    registeredAt: integer('registered_at').notNull(),
  },
  (table) => [
    index('idx_tournament_players_tourn_id').on(table.tournamentId),
    index('idx_tournament_players_user_id').on(table.userId),
    uniqueIndex('uq_tournament_players_tourn_user').on(table.tournamentId, table.userId),
  ],
)

export const rounds = sqliteTable(
  'rounds',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull(),
    // PENDING | ACTIVE | COMPLETE
    status: text('status').notNull().default('PENDING'),
    // Optional start time for this round (HH:MM format or free text like "10:00 AM")
    startTime: text('start_time'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_rounds_tournament_id').on(table.tournamentId),
    uniqueIndex('uq_rounds_tourn_number').on(table.tournamentId, table.roundNumber),
  ],
)

export const pairings = sqliteTable(
  'pairings',
  {
    id: text('id').primaryKey(),
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    tableNumber: integer('table_number').notNull(),
    player1Id: text('player1_id')
      .notNull()
      .references(() => tournamentPlayers.id, { onDelete: 'cascade' }),
    // NULL = bye for player1
    player2Id: text('player2_id'),
    mission: text('mission').notNull(),
    player1Vp: integer('player1_vp'),
    player2Vp: integer('player2_vp'),
    // P1_WIN | P2_WIN | DRAW | BYE — computed from VP
    result: text('result'),
    reportedBy: text('reported_by'),
    confirmed: integer('confirmed').notNull().default(0),
    toOverride: integer('to_override').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_pairings_round_id').on(table.roundId),
    index('idx_pairings_player1_id').on(table.player1Id),
    index('idx_pairings_player2_id').on(table.player2Id),
  ],
)

// === Tournament management tables (V3) ===

export const tournamentCards = sqliteTable(
  'tournament_cards',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => tournamentPlayers.id, { onDelete: 'cascade' }),
    issuedBy: text('issued_by')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    cardType: text('card_type').notNull(), // YELLOW | RED
    reason: text('reason').notNull(),
    issuedAt: integer('issued_at').notNull(),
  },
  (table) => [
    index('idx_tournament_cards_tournament_id').on(table.tournamentId),
    index('idx_tournament_cards_player_id').on(table.playerId),
  ],
)

export const tournamentAwards = sqliteTable(
  'tournament_awards',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    recipientId: text('recipient_id').references(() => tournamentPlayers.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_tournament_awards_tournament_id').on(table.tournamentId)],
)

// === Tournament Phase 3 — metric stack + BCP tables ===

export const rankingMetric = sqliteTable('ranking_metric', {
  id: text('id').primaryKey(), // slug: 'wins' | 'battle_points' | 'sos_wins' | ...
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
})

export const tournamentPairingMetric = sqliteTable(
  'tournament_pairing_metric',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    rankingMetricId: text('ranking_metric_id')
      .notNull()
      .references(() => rankingMetric.id),
    sortOrder: integer('sort_order').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    index('idx_tourn_pairing_metric_tourn').on(t.tournamentId),
    uniqueIndex('uq_tourn_pairing_metric').on(t.tournamentId, t.rankingMetricId),
  ],
)

export const tournamentPlacingMetric = sqliteTable(
  'tournament_placing_metric',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    rankingMetricId: text('ranking_metric_id')
      .notNull()
      .references(() => rankingMetric.id),
    sortOrder: integer('sort_order').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    index('idx_tourn_placing_metric_tourn').on(t.tournamentId),
    uniqueIndex('uq_tourn_placing_metric').on(t.tournamentId, t.rankingMetricId),
  ],
)

export const passthroughEvent = sqliteTable(
  'passthrough_event',
  {
    id: text('id').primaryKey(),
    bcpEventId: text('bcp_event_id').notNull().unique(),
    name: text('name').notNull(),
    eventDate: integer('event_date'),
    location: text('location'),
    gameSystem: text('game_system'),
    playerCount: integer('player_count'),
    registrationUrl: text('registration_url'),
    lastSyncedAt: integer('last_synced_at').notNull(),
  },
  (t) => [
    index('idx_passthrough_event_date').on(t.eventDate),
    index('idx_passthrough_bcp_event_id').on(t.bcpEventId),
  ],
)

export const bcpRegistration = sqliteTable(
  'bcp_registration',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    bcpEventId: text('bcp_event_id').notNull(),
    listId: text('list_id'),
    method: text('method', { enum: ['server', 'agent'] }).notNull(),
    status: text('status', { enum: ['submitted', 'failed'] }).notNull(),
    consentAt: integer('consent_at').notNull(),
    submittedAt: integer('submitted_at').notNull(),
  },
  (t) => [
    index('idx_bcp_registration_user').on(t.userId),
    index('idx_bcp_registration_event').on(t.bcpEventId),
  ],
)

// === Match detail tables (V3 — game-tracker) ===

export const matchSecondaries = sqliteTable(
  'match_secondaries',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    player: text('player').notNull(), // YOUR | THEIRS
    secondaryName: text('secondary_name').notNull(),
    // JSON: VP scored per round [r1, r2, r3, r4, r5]
    vpPerRound: text('vp_per_round').notNull().default('[]'),
  },
  (table) => [index('idx_match_secondaries_match_id').on(table.matchId)],
)

export const stratagemLog = sqliteTable(
  'stratagem_log',
  {
    id: text('id').primaryKey(),
    turnId: text('turn_id')
      .notNull()
      .references(() => turns.id, { onDelete: 'cascade' }),
    player: text('player').notNull(), // YOUR | THEIRS
    stratagemName: text('stratagem_name').notNull(),
    cpCost: integer('cp_cost').notNull().default(1),
  },
  (table) => [index('idx_stratagem_log_turn_id').on(table.turnId)],
)

// === User management tables (V3 — admin) ===

export const userBans = sqliteTable(
  'user_bans',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    bannedBy: text('banned_by')
      .notNull()
      .references(() => authUsers.id),
    bannedAt: integer('banned_at').notNull(),
    liftedAt: integer('lifted_at'),
  },
  (table) => [index('idx_user_bans_user_id').on(table.userId)],
)

// === Glicko-2 tables (new-meta app) ===

export const playerGlicko = sqliteTable(
  'player_glicko',
  {
    id: text('id').primaryKey(),
    // null = anonymous player (name-string import, not matched to a platform account)
    userId: text('user_id').references(() => authUsers.id, { onDelete: 'cascade' }),
    playerName: text('player_name').notNull(),
    rating: real('rating').notNull().default(1500),
    ratingDeviation: real('rating_deviation').notNull().default(350),
    volatility: real('volatility').notNull().default(0.06),
    gamesPlayed: integer('games_played').notNull().default(0),
    // import ID of the last tournament period that updated this record
    lastRatingPeriod: text('last_rating_period'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_player_glicko_user_id').on(table.userId)],
)

export const glickoHistory = sqliteTable(
  'glicko_history',
  {
    id: text('id').primaryKey(),
    playerId: text('player_id')
      .notNull()
      .references(() => playerGlicko.id, { onDelete: 'cascade' }),
    // import ID or "native-YYYY-QN" for native match records
    ratingPeriod: text('rating_period').notNull(),
    ratingBefore: real('rating_before').notNull(),
    rdBefore: real('rd_before').notNull(),
    ratingAfter: real('rating_after').notNull(),
    rdAfter: real('rd_after').notNull(),
    volatilityAfter: real('volatility_after').notNull(),
    delta: real('delta').notNull(),
    gamesInPeriod: integer('games_in_period').notNull(),
    recordedAt: integer('recorded_at').notNull(),
  },
  (table) => [index('idx_glicko_history_player_id').on(table.playerId)],
)

// === Meta Analytics — Dimension Tables ===

export const dimFaction = sqliteTable('dim_faction', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  allegiance: text('allegiance').notNull(),
})

export const dimFactionAlias = sqliteTable(
  'dim_faction_alias',
  {
    alias: text('alias').primaryKey(), // BCP name, Wahapedia code, chapter name, etc.
    factionId: text('faction_id')
      .notNull()
      .references(() => dimFaction.id),
  },
  (table) => [index('idx_dim_faction_alias_faction').on(table.factionId)],
)

export const dimSubfaction = sqliteTable(
  'dim_subfaction',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    factionId: text('faction_id')
      .notNull()
      .references(() => dimFaction.id),
  },
  (table) => [index('idx_dim_subfaction_faction').on(table.factionId)],
)

export const dimDetachment = sqliteTable(
  'dim_detachment',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    factionId: text('faction_id')
      .notNull()
      .references(() => dimFaction.id),
    subfactionId: text('subfaction_id').references(() => dimSubfaction.id),
  },
  (table) => [
    index('idx_dim_detachment_faction').on(table.factionId),
    index('idx_dim_detachment_subfaction').on(table.subfactionId),
  ],
)

export const dimForType = sqliteTable('dim_for_type', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
})

export const dimGranularity = sqliteTable('dim_granularity', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
})

export const dimDataslate = sqliteTable('dim_dataslate', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  effectiveDate: integer('effective_date').notNull(),
  endDate: integer('end_date'),
})

export const dimTournamentPack = sqliteTable('dim_tournament_pack', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  effectiveDate: integer('effective_date').notNull(),
  endDate: integer('end_date'),
})

export const dimEdition = sqliteTable('dim_edition', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startDate: integer('start_date').notNull(),
  endDate: integer('end_date'),
})

export const dimRegion = sqliteTable('dim_region', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country'),
})

// === Meta Analytics — 3NF Source Tables ===

export const metaEvents = sqliteTable(
  'meta_events',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    date: integer('date').notNull(),
    location: text('location'),
    gpsCoords: text('gps_coords'),
    regionId: integer('region_id').references(() => dimRegion.id),
    format: text('format').notNull(),
    rounds: integer('rounds'),
    playerCount: integer('player_count').notNull(),
    source: text('source').notNull(),
    sourceId: text('source_id'),
    importedAt: integer('imported_at').notNull(),
    winFactionId: text('win_faction_id').references(() => dimFaction.id),
    winSubfactionId: text('win_subfaction_id').references(() => dimSubfaction.id),
    winDetachmentId: text('win_detachment_id').references(() => dimDetachment.id),
  },
  (table) => [
    index('idx_meta_events_date').on(table.date),
    index('idx_meta_events_format').on(table.format),
    index('idx_meta_events_region').on(table.regionId),
    uniqueIndex('uq_meta_events_source').on(table.source, table.sourceId),
  ],
)

export const metaEventPlayers = sqliteTable(
  'meta_event_players',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => metaEvents.id, { onDelete: 'cascade' }),
    playerName: text('player_name').notNull(),
    sourcePlayerId: text('source_player_id'),
    factionId: text('faction_id')
      .notNull()
      .references(() => dimFaction.id),
    subfactionId: text('subfaction_id').references(() => dimSubfaction.id),
    detachmentId: text('detachment_id').references(() => dimDetachment.id),
    placement: integer('placement').notNull(),
    listText: text('list_text'),
    listTtt: text('list_ttt'),
    sourceListId: text('source_list_id'),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    gl2RatingStart: real('gl2_rating_start'),
    gl2RdStart: real('gl2_rd_start'),
    gl2VolStart: real('gl2_vol_start'),
    gl2RatingEnd: real('gl2_rating_end'),
    gl2RdEnd: real('gl2_rd_end'),
    gl2VolEnd: real('gl2_vol_end'),
  },
  (table) => [
    index('idx_meta_event_players_event').on(table.eventId),
    index('idx_meta_event_players_faction').on(table.factionId),
  ],
)

export const metaPairings = sqliteTable(
  'meta_pairings',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => metaEvents.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    player1Id: text('player1_id')
      .notNull()
      .references(() => metaEventPlayers.id, { onDelete: 'cascade' }),
    player2Id: text('player2_id')
      .notNull()
      .references(() => metaEventPlayers.id, { onDelete: 'cascade' }),
    player1Score: integer('player1_score'),
    player2Score: integer('player2_score'),
    player1Gl2: real('player1_gl2'),
    player2Gl2: real('player2_gl2'),
    result: text('result').notNull(),
  },
  (table) => [
    index('idx_meta_pairings_event_round').on(table.eventId, table.round),
    index('idx_meta_pairings_player1').on(table.player1Id),
    index('idx_meta_pairings_player2').on(table.player2Id),
  ],
)

export const metaEventWinDistribution = sqliteTable(
  'meta_event_win_distribution',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => metaEvents.id, { onDelete: 'cascade' }),
    wins: integer('wins').notNull(),
    playerCount: integer('player_count').notNull(),
    playerPct: real('player_pct').notNull(),
  },
  (table) => [
    index('idx_event_win_dist_event').on(table.eventId),
    uniqueIndex('idx_event_win_dist_unique').on(table.eventId, table.wins),
  ],
)

export const metaEventPlacements = sqliteTable(
  'meta_event_placements',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => metaEvents.id, { onDelete: 'cascade' }),
    tier: text('tier').notNull(),
    factionId: text('faction_id')
      .notNull()
      .references(() => dimFaction.id),
    subfactionId: text('subfaction_id').references(() => dimSubfaction.id),
    detachmentId: text('detachment_id').references(() => dimDetachment.id),
    playerName: text('player_name').notNull(),
    placement: integer('placement').notNull(),
  },
  (table) => [
    index('idx_event_placements_event').on(table.eventId),
    index('idx_event_placements_faction').on(table.factionId),
  ],
)

// === Meta Analytics — Cube Tables ===

export const metaFor = sqliteTable(
  'meta_for',
  {
    id: text('id').primaryKey(),
    typeId: integer('type_id')
      .notNull()
      .references(() => dimForType.id),
    date: integer('date').notNull(),
    endDate: integer('end_date'),
    day: integer('day'),
    month: integer('month'),
    quarter: integer('quarter'),
    year: integer('year').notNull(),
    dataslateId: text('dataslate_id').references(() => dimDataslate.id),
    tourneyPackId: text('tourney_pack_id').references(() => dimTournamentPack.id),
    editionId: text('edition_id').references(() => dimEdition.id),
  },
  (table) => [
    index('idx_meta_for_type').on(table.typeId),
    index('idx_meta_for_type_date').on(table.typeId, table.date),
  ],
)

export const metaTop = sqliteTable(
  'meta_top',
  {
    id: text('id').primaryKey(),
    granularityId: integer('granularity_id')
      .notNull()
      .references(() => dimGranularity.id),
    factionId: text('faction_id')
      .notNull()
      .references(() => dimFaction.id),
    subfactionId: text('subfaction_id').references(() => dimSubfaction.id),
    detachmentId: text('detachment_id').references(() => dimDetachment.id),
    metaForId: text('meta_for_id')
      .notNull()
      .references(() => metaFor.id, { onDelete: 'cascade' }),
    winRate: real('win_rate').notNull(),
    drawRate: real('draw_rate').notNull(),
    overRep: real('over_rep').notNull(),
    fourOhStart: real('four_oh_start').notNull(),
    eventWins: integer('event_wins').notNull().default(0),
    eventFinals: integer('event_finals').notNull().default(0),
    eventTop4: integer('event_top4').notNull().default(0),
    eventTop8: integer('event_top8').notNull().default(0),
    eventTop16: integer('event_top16').notNull().default(0),
    playerPopPct: real('player_pop_pct').notNull(),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    games: integer('games').notNull().default(0),
    players: integer('players').notNull().default(0),
  },
  (table) => [
    index('idx_meta_top_for').on(table.metaForId),
    index('idx_meta_top_for_granularity').on(table.metaForId, table.granularityId),
    index('idx_meta_top_faction_for').on(table.factionId, table.metaForId),
  ],
)

export const factGameResults = sqliteTable(
  'fact_game_results',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => metaEvents.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => metaEventPlayers.id, { onDelete: 'cascade' }),
    opponentId: text('opponent_id').references(() => metaEventPlayers.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    factionId: text('faction_id')
      .notNull()
      .references(() => dimFaction.id),
    subfactionId: text('subfaction_id').references(() => dimSubfaction.id),
    detachmentId: text('detachment_id').references(() => dimDetachment.id),
    opponentFactionId: text('opponent_faction_id').references(() => dimFaction.id),
    opponentSubfactionId: text('opponent_subfaction_id').references(() => dimSubfaction.id),
    opponentDetachmentId: text('opponent_detachment_id').references(() => dimDetachment.id),
    result: real('result').notNull(),
    playerScore: integer('player_score'),
    opponentScore: integer('opponent_score'),
  },
  (table) => [
    index('idx_fact_results_faction').on(table.factionId),
    index('idx_fact_results_event').on(table.eventId),
    index('idx_fact_results_player').on(table.playerId),
    index('idx_fact_results_matchup').on(table.factionId, table.opponentFactionId),
  ],
)

export const metaCubeStatus = sqliteTable('meta_cube_status', {
  id: integer('id').primaryKey().default(1),
  lastStartedAt: integer('last_started_at'),
  lastCompletedAt: integer('last_completed_at'),
  lastEventId: text('last_event_id'),
  status: text('status').notNull().default('pending'),
})

// ── Imported tournament results (raw CSV import artifact) ────────────────────

export const importedTournamentResults = sqliteTable(
  'imported_tournament_results',
  {
    id: text('id').primaryKey(),
    importedBy: text('imported_by')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    eventName: text('event_name').notNull(),
    eventDate: integer('event_date', { mode: 'timestamp' }).notNull(),
    format: text('format').notNull(),
    metaWindow: text('meta_window').notNull(),
    rawData: text('raw_data').notNull(),
    parsedData: text('parsed_data').notNull(),
    importedAt: integer('imported_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('idx_imported_results_imported_by').on(table.importedBy)],
)

// ── BCP Scraper ──────────────────────────────────────────────────────────────

export const bcpScrapeJobs = sqliteTable('bcp_scrape_jobs', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('running'),
  eventsFound: integer('events_found').default(0),
  eventsScraped: integer('events_scraped').default(0),
  pairingsScraped: integer('pairings_scraped').default(0),
  listsScraped: integer('lists_scraped').default(0),
  errors: text('errors'),
  triggeredBy: text('triggered_by').notNull().default('cron'),
})

// ── Content Ingestor ─────────────────────────────────────────────────────────

export const ingestJobs = sqliteTable('ingest_jobs', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  sourceType: text('source_type').notNull(),
  sourceName: text('source_name'),
  title: text('title'),
  status: text('status').notNull().default('pending'),
  gladiaJobId: text('gladia_job_id'),
  transcript: text('transcript'),
  nodesExtracted: integer('nodes_extracted').default(0),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

export const ingestSources = sqliteTable('ingest_sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull().unique(),
  type: text('type').notNull(), // 'youtube' | 'web'
  active: integer('active').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const ingestContent = sqliteTable(
  'ingest_content',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull().unique(),
    title: text('title'),
    sourceId: text('source_id')
      .notNull()
      .references(() => ingestSources.id),
    status: text('status').notNull().default('discovered'),
    // discovered → transcribing → extracting → completed | failed | skipped
    gladiaJobId: text('gladia_job_id'),
    transcript: text('transcript'),
    nodesExtracted: integer('nodes_extracted').default(0),
    error: text('error'),
    discoveredAt: integer('discovered_at').notNull(),
    processedAt: integer('processed_at'),
  },
  (table) => [
    index('idx_ingest_content_source').on(table.sourceId),
    index('idx_ingest_content_status').on(table.status),
  ],
)

// === Pipeline observability — unified source / item / run model ===
// One coherent model for the self-operating pipeline, replacing the scattered
// ingest_jobs / ingest_content / bcp_scrape_jobs / meta_cube_status trackers.
// See docs/superpowers/specs/2026-05-28-admin-pipeline-observability-data-design.md (rationale only).

export const pipelineSources = sqliteTable(
  'pipeline_source',
  {
    id: text('id').primaryKey(), // slug, e.g. 'auspex-tactics'
    name: text('name').notNull(), // human-readable, e.g. 'Auspex Tactics'
    kind: text('kind').notNull(), // 'youtube' | 'web' | 'bcp'
    url: text('url').notNull(),
    externalId: text('external_id'), // resolved source-side id (e.g. YouTube channel_id)
    active: integer('active').notNull().default(1), // 1 = crawl on schedule
    createdAt: integer('created_at').notNull(), // epoch ms
    lastCheckedAt: integer('last_checked_at'), // last crawl attempt
    lastSuccessAt: integer('last_success_at'), // last successful crawl
    lastError: text('last_error'),
  },
  (table) => [uniqueIndex('uq_pipeline_source_url').on(table.url)],
)

export const pipelineItems = sqliteTable(
  'pipeline_item',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => pipelineSources.id, { onDelete: 'cascade' }),
    title: text('title'), // human-readable; null until discovery resolves it
    kind: text('kind').notNull(), // 'video' | 'article'
    externalUrl: text('external_url').notNull(),
    externalId: text('external_id').notNull(), // source-side stable id (video id / slug)
    // discovered | queued | processing | done | failed | skipped
    status: text('status').notNull().default('discovered'),
    discoveredAt: integer('discovered_at').notNull(), // when WE found it (epoch ms)
    publishedAt: integer('published_at'), // when the SOURCE published it
    processedAt: integer('processed_at'),
    resultSummary: text('result_summary'), // e.g. '8 brain nodes'
    error: text('error'),
  },
  (table) => [
    // idempotent discovery: same source-side item never double-inserts
    uniqueIndex('uq_pipeline_item_source_external').on(table.sourceId, table.externalId),
    index('idx_pipeline_item_source').on(table.sourceId),
    index('idx_pipeline_item_status').on(table.status),
    index('idx_pipeline_item_discovered').on(table.discoveredAt),
  ],
)

export const pipelineRuns = sqliteTable(
  'pipeline_run',
  {
    id: text('id').primaryKey(),
    // 'content-discovery' | 'content-process' | 'bcp-scrape' | 'meta-cube' | 'brain-rebuild' | 'glicko'
    pipeline: text('pipeline').notNull(),
    trigger: text('trigger').notNull(), // 'cron' | 'manual' | 'api'
    status: text('status').notNull().default('running'), // running | ok | failed
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    found: integer('found').notNull().default(0),
    processed: integer('processed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    triggeredBy: text('triggered_by'), // user id, or 'cron'
    summary: text('summary'), // human one-liner of what happened
    error: text('error'),
  },
  (table) => [
    index('idx_pipeline_run_pipeline').on(table.pipeline),
    index('idx_pipeline_run_started').on(table.startedAt),
  ],
)

export const pipelineRunItems = sqliteTable(
  'pipeline_run_item',
  {
    runId: text('run_id')
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => pipelineItems.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.itemId] }),
    index('idx_pipeline_run_item_item').on(table.itemId),
  ],
)

// ── Content foundation (unified-data seam) ───────────────────────────────────
// One canonical index for every game-content entity. The full document lives in
// R2 (r2_key); this is the thin, FK-able registry the apps reference instead of
// opaque strings. dim_* folds in here over time (type='faction'/'subfaction'/…).
// See docs/superpowers/specs/2026-05-28-content-silo-bridge-design.md

export const contentEntity = sqliteTable(
  'content_entity',
  {
    id: text('id').primaryKey(), // canonical content id (BSData GUID, weapon:{ds}:{slug}, dim_* id, …)
    type: text('type', {
      enum: [
        'datasheet',
        'weapon',
        'faction',
        'subfaction',
        'detachment',
        'detachment_ability',
        'ability',
        'stratagem',
        'enhancement',
        'mission',
      ],
    }).notNull(),
    name: text('name').notNull(),
    factionId: text('faction_id').references((): AnySQLiteColumn => contentEntity.id), // faction → self
    parentId: text('parent_id').references((): AnySQLiteColumn => contentEntity.id), // weapon → datasheet, detachment → faction
    dataslateId: text('dataslate_id').references(() => dimDataslate.id), // version context
    r2Key: text('r2_key'), // content/{type}/{id}.json
    wahapediaId: text('wahapedia_id'), // given source id from Wahapedia (provenance — never discarded)
    bsdataId: text('bsdata_id'), // given source id from BSData (datasheets only; equals id by convention)
    /** 11th-ed Support rule: false means the character must always be attached to a bodyguard unit
     *  (cannot deploy solo). Defaults to true so all existing data is unaffected until a per-codex
     *  11th-ed source explicitly flags individual characters.
     */
    canDeploySolo: integer('can_deploy_solo', { mode: 'boolean' }).notNull().default(true),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_content_entity_type').on(table.type),
    index('idx_content_entity_faction').on(table.factionId),
    index('idx_content_entity_parent').on(table.parentId),
    index('idx_content_entity_dataslate').on(table.dataslateId),
    index('idx_content_entity_name').on(table.name),
    index('idx_content_entity_wahapedia').on(table.wahapediaId),
    index('idx_content_entity_bsdata').on(table.bsdataId),
  ],
)

// Brain crosswalk — current canonical link for each brain node.
// One row per brain_node_id (PK). Re-keys are UPDATE-in-place + an INSERT into
// content_node_link_history. Validation gates re-keys (admin or LLM via the
// candidate queue); first-time links auto-insert. No chain rows, no transient
// active-window — the audit trail lives in content_node_link_history.
// See docs/superpowers/specs/2026-05-28-content-silo-bridge-design.md §5.1
export const contentNodeLink = sqliteTable('content_node_link', {
  brainNodeId: text('brain_node_id').primaryKey(), // the brain Node id, UNCHANGED — one row per
  canonicalId: text('canonical_id')
    .notNull()
    .references(() => contentEntity.id, { onDelete: 'cascade' }),
  matchMethod: text('match_method', {
    enum: ['datasheet_id', 'name_faction', 'manual', 'llm'],
  }).notNull(),
  confidence: real('confidence').notNull().default(1),
  validationMethod: text('validation_method', {
    enum: ['admin', 'llm', 'auto-initial'],
  }).notNull(),
  validatedBy: text('validated_by').notNull(),
  validatedAt: integer('validated_at', { mode: 'timestamp' }).notNull(),
})

// Append-only audit log of every change to a content_node_link row.
// Records prior_canonical_id + new_canonical_id (text, no FK — preserved even
// if the referenced entity is later deleted, for audit retention). One row
// per CHANGE; first-time inserts also get a history row with prior_canonical_id
// IS NULL.
export const contentNodeLinkHistory = sqliteTable(
  'content_node_link_history',
  {
    historyId: text('history_id').primaryKey(), // synthetic UUID
    brainNodeId: text('brain_node_id').notNull(),
    priorCanonicalId: text('prior_canonical_id'), // null for first-time link; informational text (no FK)
    newCanonicalId: text('new_canonical_id').notNull(), // informational text (no FK so it survives entity deletion)
    changedAt: integer('changed_at', { mode: 'timestamp' }).notNull(),
    changedBy: text('changed_by').notNull(), // user id, 'llm:<model>', source string, or 'migration'
    changeMethod: text('change_method', {
      enum: ['admin', 'llm', 'auto-initial', 'migration'],
    }).notNull(),
    changeReason: text('change_reason'), // nullable; LLM reasoning or admin note
    candidateId: text('candidate_id'), // informational text — links back to a candidate when applicable
  },
  (table) => [
    index('idx_content_node_link_history_brain_node').on(table.brainNodeId),
    index('idx_content_node_link_history_changed_at').on(table.changedAt),
  ],
)

// Crosswalk validation queue (Phase 1.4 step 10).
// Pending re-key candidates live here until an admin (or LLM evaluator) decides
// approve / reject / llm_unsure / overridden. First-time links bypass this and
// auto-insert directly into content_node_link with validation_method='auto-initial'.
// See docs/superpowers/plans/2026-05-30-step-10-validation-process.md
export const contentNodeLinkCandidate = sqliteTable(
  'content_node_link_candidate',
  {
    candidateId: text('candidate_id').primaryKey(),
    brainNodeId: text('brain_node_id').notNull(),
    proposedCanonicalId: text('proposed_canonical_id')
      .notNull()
      .references(() => contentEntity.id, { onDelete: 'cascade' }),
    matchMethod: text('match_method', {
      enum: ['datasheet_id', 'name_faction', 'manual', 'llm'],
    }).notNull(),
    confidence: real('confidence').notNull().default(1),
    // Snapshot of the canonical_id the brain_node pointed at when the candidate
    // was proposed. Informational (no FK) so audit retention survives entity deletion.
    priorCanonicalId: text('prior_canonical_id'),
    source: text('source').notNull(),
    runId: text('run_id').notNull(),
    proposedAt: integer('proposed_at', { mode: 'timestamp' }).notNull(),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected', 'llm_unsure', 'overridden'],
    })
      .notNull()
      .default('pending'),
    decisionMethod: text('decision_method', { enum: ['admin', 'llm'] }),
    decidedBy: text('decided_by'),
    decidedAt: integer('decided_at', { mode: 'timestamp' }),
    decisionReason: text('decision_reason'),
    // When approved, the history row id written for this change. Informational
    // (no FK — links via text id, audit retention).
    resultingHistoryId: text('resulting_history_id'),
    llmAttemptCount: integer('llm_attempt_count').notNull().default(0),
    llmLastAttemptedAt: integer('llm_last_attempted_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('idx_candidate_brain_node').on(table.brainNodeId),
    index('idx_candidate_status').on(table.status),
    index('idx_candidate_proposed_at').on(table.proposedAt),
    index('idx_candidate_source').on(table.source),
    // Partial unique: at most one PENDING candidate per (brain_node, proposed) pair.
    // Rejected / approved / llm_unsure / overridden rows do NOT participate, so
    // history grows naturally. Prevents re-runs from duplicate-queueing.
    uniqueIndex('uq_candidate_pending')
      .on(table.brainNodeId, table.proposedCanonicalId)
      .where(sql`${table.status} = 'pending'`),
  ],
)

// ── content_can_lead ─────────────────────────────────────────────────────────
// Junction table: which Character datasheets may attach to which bodyguard
// datasheets, and in which role (leader | support). PK is composite
// (leader_datasheet_id, bodyguard_datasheet_id, role) — a character can appear
// in both roles for the same bodyguard (one row each). Both datasheet columns FK
// content_entity for referential integrity + cascade on entity deletion. The
// list-builder updateUnit and eligibleBodyguards procedures query this filtered
// by role, enforcing the 11th-edition "distinct Leader and Support slots" rule.
//
// Data gap (2026-06-01): Wahapedia leader_attachments is 10th-ed Leader data
// only. All existing rows default to role='leader'. Support rows (role='support')
// will be written by produceCanSupport when a per-codex 11th-ed source lands.

export const contentCanLead = sqliteTable(
  'content_can_lead',
  {
    leaderDatasheetId: text('leader_datasheet_id')
      .notNull()
      .references(() => contentEntity.id, { onDelete: 'cascade' }),
    bodyguardDatasheetId: text('bodyguard_datasheet_id')
      .notNull()
      .references(() => contentEntity.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['leader', 'support'] })
      .notNull()
      .default('leader'),
  },
  (table) => [
    primaryKey({ columns: [table.leaderDatasheetId, table.bodyguardDatasheetId, table.role] }),
    index('idx_can_lead_leader').on(table.leaderDatasheetId),
    index('idx_can_lead_bodyguard').on(table.bodyguardDatasheetId),
    index('idx_can_lead_role').on(table.role),
  ],
)

// ── Game-tracker mission catalog (scoring_mission + canonical game states) ────
// A mission (primary or secondary) is a content_entity; scoring_mission is its
// game-tracker projection (1:1, id = the canonical content id). Each mission
// scores via canonical game_state facts (defined once, reused) linked through
// mission_game_state. See docs/superpowers/specs/2026-05-26-game-tracker-data-design.md

export const scoringMission = sqliteTable(
  'scoring_mission',
  {
    id: text('id')
      .primaryKey()
      .references(() => contentEntity.id, { onDelete: 'cascade' }), // = canonical mission content id
    name: text('name').notNull(),
    kind: text('kind', { enum: ['primary', 'secondary'] }).notNull(),
    side: text('side', { enum: ['symmetric', 'attacker', 'defender'] })
      .notNull()
      .default('symmetric'),
    cap: integer('cap'), // this mission's VP cap (data — flexes per edition)
    uiPattern: text('ui_pattern').notNull(), // 'count' | 'checklist' | 'tier' | 'action' | 'zoned_count' | …
  },
  (table) => [index('idx_scoring_mission_kind').on(table.kind)],
)

export const gameState = sqliteTable('game_state', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(), // stable slug, e.g. 'control_objective_no_mans_land'
  label: text('label').notNull(), // our functional wording (NOT GW card text)
  category: text('category').notNull(), // 'objective_control' | 'unit_destroyed' | 'position' | 'action_completed' | 'comparative' | …
})

export const missionGameState = sqliteTable(
  'mission_game_state',
  {
    id: text('id').primaryKey(),
    scoringMissionId: text('scoring_mission_id')
      .notNull()
      .references(() => scoringMission.id, { onDelete: 'cascade' }),
    gameStateId: text('game_state_id')
      .notNull()
      .references(() => gameState.id),
    points: integer('points'), // declared VP for this state in this mission
    countMode: text('count_mode', { enum: ['flag', 'per_objective', 'per_unit', 'tier'] })
      .notNull()
      .default('flag'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_mgs_mission').on(table.scoringMissionId),
    index('idx_mgs_state').on(table.gameStateId),
  ],
)

// ── Battle size lookup (tournament-standard points brackets) ─────────────────
// Canonical points-bracket taxonomy for 11th edition matched play. Was forked
// ×4 (list-builder ×3, bcp-scraper ×1) with a real semantic divergence — the
// bcp-scraper fork used a 4-name/4-points mapping (Combat Patrol 500 /
// Incursion 1000 / Strike Force 2000 / Onslaught 3000+) while list-builder's
// used a 4-row/3-name mapping (Incursion 500 / Strike Force 1000 / Strike
// Force 2000 / Onslaught 3000). Grounded against
// docs/superpowers/specs/2026-05-26-11th-edition-game-flow.md §1.1 (Incursion
// ~1,000 pts, Strike Force 2,000 pts) and this package's own `list.battle_size`
// enum (list-schema.ts — already 4 distinct names: Combat Patrol / Incursion /
// Strike Force / Onslaught). Both sources confirm the bcp-scraper convention;
// see wargame/w2/decisions/D2-04-data-in-code-cleanup.md items 4-7.
//
// Structural tournament-format data (points brackets, not GW datasheet
// content) — same class as scoring_mission/game_state above and
// dim_dataslate/dim_tournament_pack/dim_edition, seeded the same way (see
// packages/db/src/seed-battle-size.ts).
export const battleSize = sqliteTable('battle_size', {
  id: text('id').primaryKey(), // slug, e.g. 'combat-patrol'
  name: text('name').notNull(), // canonical display name, e.g. 'Combat Patrol'
  points: integer('points').notNull(), // points cap for this bracket
  maxDuplicates: integer('max_duplicates').notNull(), // non-Battleline datasheet duplicate limit
  description: text('description'), // short blurb (UI display)
  sortOrder: integer('sort_order').notNull().default(0),
})

// Alternate names for a battle_size row (e.g. a source that spells
// 'Combat Patrol' differently, or a future edition renaming a bracket).
// Empty today — the table exists so a divergent-name source can be
// reconciled via a data row instead of a second code fork.
export const battleSizeAlias = sqliteTable(
  'battle_size_alias',
  {
    alias: text('alias').primaryKey(),
    battleSizeId: text('battle_size_id')
      .notNull()
      .references(() => battleSize.id, { onDelete: 'cascade' }),
  },
  (table) => [index('idx_battle_size_alias_battle_size').on(table.battleSizeId)],
)

// === Phase 2 list tables ===
export { list, listUnit, listUnitLoadout, listUnitLoadoutWeapon } from './list-schema'

// === Phase 3 versus tables ===
// The old `simulations` table above is DEPRECATED — use simulation/simulation_weapon/simulation_modifier.
export { simulation, simulationModifier, simulationWeapon } from './versus-schema'

// === Game Tracker v2 tables ===
// New relational match model. Legacy matches/turns tables above remain for v1 backward compat.
export * from './match-schema'
