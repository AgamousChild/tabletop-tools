import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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

export const authSessions = sqliteTable('session', {
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
}, (table) => [
  index('idx_session_user_id').on(table.userId),
])

export const authAccounts = sqliteTable('account', {
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
}, (table) => [
  index('idx_account_user_id').on(table.userId),
])

export const authVerifications = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (table) => [
  index('idx_verification_identifier').on(table.identifier),
])

// === NoCheat tables ===

export const diceSets = sqliteTable('dice_sets', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_dice_sets_user_id').on(table.userId),
])

// Named diceRollingSessions to avoid collision with authSessions.
// Database table name is 'sessions' (plural), auth table is 'session' (singular).
export const diceRollingSessions = sqliteTable('sessions', {
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
}, (table) => [
  index('idx_sessions_user_id').on(table.userId),
  index('idx_sessions_dice_set_id').on(table.diceSetId),
])

export const rolls = sqliteTable('rolls', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => diceRollingSessions.id, { onDelete: 'cascade' }),
  pipValues: text('pip_values').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_rolls_session_id').on(table.sessionId),
])

// === Versus tables ===
//
// IMPORTANT: No foreign keys into game content.
// attacker_content_id / defender_content_id are plain TEXT.

export const simulations = sqliteTable('simulations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  attackerContentId: text('attacker_content_id').notNull(),
  attackerName: text('attacker_name').notNull(),
  defenderContentId: text('defender_content_id').notNull(),
  defenderName: text('defender_name').notNull(),
  result: text('result').notNull(),  // JSON — full simulation output
  // V3: hash of (weapons, rules, modelCounts, leader) for cache lookup
  configHash: text('config_hash'),
  // V3: JSON — selected weapons + rules configuration
  weaponConfig: text('weapon_config'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_simulations_user_id').on(table.userId),
])

// === List Builder tables ===
//
// IMPORTANT: No foreign keys into game content.
// Game content IDs are stored as plain TEXT (_content_id suffix).
// unit_name and unit_points are denormalized at add-time so lists
// display correctly even if the content adapter is unavailable.

export const lists = sqliteTable('lists', {
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
  battleSize: integer('battle_size'),  // 500/1000/2000/3000
  syncedAt: integer('synced_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('idx_lists_user_id').on(table.userId),
])

export const listUnits = sqliteTable('list_units', {
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
}, (table) => [
  index('idx_list_units_list_id').on(table.listId),
])

export const unitRatings = sqliteTable('unit_ratings', {
  id: text('id').primaryKey(),
  // unit_content_id references the game content adapter — not a DB FK
  unitContentId: text('unit_content_id').notNull(),
  rating: text('rating').notNull(),    // S / A / B / C / D
  winContrib: real('win_contrib').notNull(),
  ptsEff: real('pts_eff').notNull(),
  metaWindow: text('meta_window').notNull(),  // e.g. "2025-Q2" — resets on dataslate
  computedAt: integer('computed_at').notNull(),
}, (table) => [
  index('idx_unit_ratings_unit_content_id').on(table.unitContentId),
  index('idx_unit_ratings_meta_window').on(table.metaWindow),
  uniqueIndex('uq_unit_ratings_unit_window').on(table.unitContentId, table.metaWindow),
])

// === Game Tracker tables ===
//
// opponent_faction is a user-entered string — not a BSData FK.
// your_units_lost / their_units_lost are JSON arrays of { contentId, name }
// where name is denormalized for display without a content lookup.

export const matches = sqliteTable('matches', {
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
  twistCards: text('twist_cards'),           // JSON
  challengerCards: text('challenger_cards'),  // JSON
  requirePhotos: integer('require_photos').notNull().default(0),
  attackerDefender: text('attacker_defender'),  // YOU_ATTACK | YOU_DEFEND
  whoGoesFirst: text('who_goes_first'),        // YOU | THEM
  date: integer('date'),
  location: text('location'),
  tournamentName: text('tournament_name'),
  tournamentId: text('tournament_id'),
  createdAt: integer('created_at').notNull(),
  closedAt: integer('closed_at'),
  hiddenAt: integer('hidden_at'),
}, (table) => [
  index('idx_matches_user_id').on(table.userId),
])

export const turns = sqliteTable('turns', {
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
}, (table) => [
  index('idx_turns_match_id').on(table.matchId),
  uniqueIndex('uq_turns_match_number').on(table.matchId, table.turnNumber),
])

// === Tournament tables ===
//
// faction and list_text are user-entered strings.
// The platform never validates them against GW data.

export const tournaments = sqliteTable('tournaments', {
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
  startTime: text('start_time'),         // HH:MM format
  latitude: real('latitude'),
  longitude: real('longitude'),
  missionPool: text('mission_pool'),     // JSON: per-round mission assignments
  requirePhotos: integer('require_photos').notNull().default(0),
  includeTwists: integer('include_twists').notNull().default(0),
  includeChallenger: integer('include_challenger').notNull().default(0),
  maxPlayers: integer('max_players'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_tournaments_user_id').on(table.toUserId),
])

export const tournamentPlayers = sqliteTable('tournament_players', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  // user-entered string — NOT a BSData FK
  faction: text('faction').notNull(),
  // user-entered detachment name — NOT validated against GW data
  detachment: text('detachment'),
  // army list pasted as raw text — stored verbatim, never parsed for GW content
  listText: text('list_text'),
  // V3: FK to lists table (optional — from list-builder sync)
  listId: text('list_id'),
  listLocked: integer('list_locked').notNull().default(0),
  checkedIn: integer('checked_in').notNull().default(0),
  dropped: integer('dropped').notNull().default(0),
  registeredAt: integer('registered_at').notNull(),
}, (table) => [
  index('idx_tournament_players_tourn_id').on(table.tournamentId),
  index('idx_tournament_players_user_id').on(table.userId),
  uniqueIndex('uq_tournament_players_tourn_user').on(table.tournamentId, table.userId),
])

export const rounds = sqliteTable('rounds', {
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
}, (table) => [
  index('idx_rounds_tournament_id').on(table.tournamentId),
  uniqueIndex('uq_rounds_tourn_number').on(table.tournamentId, table.roundNumber),
])

export const pairings = sqliteTable('pairings', {
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
}, (table) => [
  index('idx_pairings_round_id').on(table.roundId),
  index('idx_pairings_player1_id').on(table.player1Id),
  index('idx_pairings_player2_id').on(table.player2Id),
])

// === ELO tables ===

export const playerElo = sqliteTable('player_elo', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull().default(1200),
  gamesPlayed: integer('games_played').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
})

export const eloHistory = sqliteTable('elo_history', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  pairingId: text('pairing_id')
    .notNull()
    .references(() => pairings.id, { onDelete: 'cascade' }),
  ratingBefore: integer('rating_before').notNull(),
  ratingAfter: integer('rating_after').notNull(),
  delta: integer('delta').notNull(),
  opponentId: text('opponent_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  recordedAt: integer('recorded_at').notNull(),
}, (table) => [
  index('idx_elo_history_user_id').on(table.userId),
  index('idx_elo_history_pairing_id').on(table.pairingId),
  index('idx_elo_history_opponent_id').on(table.opponentId),
])

// === Imported tournament results ===
//
// Raw + parsed tournament data imported by the operator.
// Used by the rating engine alongside native match records.
// faction / unit references are user-entered strings.

export const importedTournamentResults = sqliteTable('imported_tournament_results', {
  id: text('id').primaryKey(),
  importedBy: text('imported_by')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  eventName: text('event_name').notNull(),
  eventDate: integer('event_date').notNull(),
  format: text('format').notNull(),
  metaWindow: text('meta_window').notNull(),
  // original CSV stored verbatim — never re-parsed into GW data
  rawData: text('raw_data').notNull(),
  // JSON of TournamentRecord[]
  parsedData: text('parsed_data').notNull(),
  importedAt: integer('imported_at').notNull(),
}, (table) => [
  index('idx_imported_results_imported_by').on(table.importedBy),
])

// === Tournament management tables (V3) ===

export const tournamentCards = sqliteTable('tournament_cards', {
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
  cardType: text('card_type').notNull(),  // YELLOW | RED
  reason: text('reason').notNull(),
  issuedAt: integer('issued_at').notNull(),
}, (table) => [
  index('idx_tournament_cards_tournament_id').on(table.tournamentId),
  index('idx_tournament_cards_player_id').on(table.playerId),
])

export const tournamentAwards = sqliteTable('tournament_awards', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  recipientId: text('recipient_id')
    .references(() => tournamentPlayers.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_tournament_awards_tournament_id').on(table.tournamentId),
])

// === Match detail tables (V3 — game-tracker) ===

export const matchSecondaries = sqliteTable('match_secondaries', {
  id: text('id').primaryKey(),
  matchId: text('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  player: text('player').notNull(),  // YOUR | THEIRS
  secondaryName: text('secondary_name').notNull(),
  // JSON: VP scored per round [r1, r2, r3, r4, r5]
  vpPerRound: text('vp_per_round').notNull().default('[]'),
}, (table) => [
  index('idx_match_secondaries_match_id').on(table.matchId),
])

export const stratagemLog = sqliteTable('stratagem_log', {
  id: text('id').primaryKey(),
  turnId: text('turn_id')
    .notNull()
    .references(() => turns.id, { onDelete: 'cascade' }),
  player: text('player').notNull(),  // YOUR | THEIRS
  stratagemName: text('stratagem_name').notNull(),
  cpCost: integer('cp_cost').notNull().default(1),
}, (table) => [
  index('idx_stratagem_log_turn_id').on(table.turnId),
])

// === User management tables (V3 — admin) ===

export const userBans = sqliteTable('user_bans', {
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
}, (table) => [
  index('idx_user_bans_user_id').on(table.userId),
])

// === Glicko-2 tables (new-meta app) ===

export const playerGlicko = sqliteTable('player_glicko', {
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
}, (table) => [
  index('idx_player_glicko_user_id').on(table.userId),
])

export const glickoHistory = sqliteTable('glicko_history', {
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
}, (table) => [
  index('idx_glicko_history_player_id').on(table.playerId),
])
