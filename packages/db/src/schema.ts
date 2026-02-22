import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
    .references(() => authUsers.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const authAccounts = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id),
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
})

export const authVerifications = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// === NoCheat tables ===

export const diceSets = sqliteTable('dice_sets', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
})

// Named diceRollingSessions to avoid collision with authSessions.
// Database table name is 'sessions' (plural), auth table is 'session' (singular).
export const diceRollingSessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id),
  diceSetId: text('dice_set_id')
    .notNull()
    .references(() => diceSets.id),
  opponentName: text('opponent_name'),
  zScore: real('z_score'),
  isLoaded: integer('is_loaded'),
  photoUrl: text('photo_url'),
  createdAt: integer('created_at').notNull(),
  closedAt: integer('closed_at'),
})

export const rolls = sqliteTable('rolls', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => diceRollingSessions.id),
  pipValues: text('pip_values').notNull(),
  createdAt: integer('created_at').notNull(),
})

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
    .references(() => authUsers.id),
  // faction is a user-entered string — NOT validated against GW data
  faction: text('faction').notNull(),
  name: text('name').notNull(),
  totalPts: integer('total_pts').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const listUnits = sqliteTable('list_units', {
  id: text('id').primaryKey(),
  listId: text('list_id')
    .notNull()
    .references(() => lists.id),
  // unit_content_id is a reference into the game content adapter — not a DB FK
  unitContentId: text('unit_content_id').notNull(),
  // Denormalized at add-time so the list renders without a content lookup
  unitName: text('unit_name').notNull(),
  unitPoints: integer('unit_points').notNull(),
  count: integer('count').notNull().default(1),
})

export const unitRatings = sqliteTable('unit_ratings', {
  id: text('id').primaryKey(),
  // unit_content_id references the game content adapter — not a DB FK
  unitContentId: text('unit_content_id').notNull(),
  rating: text('rating').notNull(),    // S / A / B / C / D
  winContrib: real('win_contrib').notNull(),
  ptsEff: real('pts_eff').notNull(),
  metaWindow: text('meta_window').notNull(),  // e.g. "2025-Q2" — resets on dataslate
  computedAt: integer('computed_at').notNull(),
})

// === Game Tracker tables ===
//
// opponent_faction is a user-entered string — not a BSData FK.
// your_units_lost / their_units_lost are JSON arrays of { contentId, name }
// where name is denormalized for display without a content lookup.

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id),
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
  createdAt: integer('created_at').notNull(),
  closedAt: integer('closed_at'),
})

export const turns = sqliteTable('turns', {
  id: text('id').primaryKey(),
  matchId: text('match_id')
    .notNull()
    .references(() => matches.id),
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
  createdAt: integer('created_at').notNull(),
})

// === Tournament tables ===
//
// faction and list_text are user-entered strings.
// The platform never validates them against GW data.

export const tournaments = sqliteTable('tournaments', {
  id: text('id').primaryKey(),
  toUserId: text('to_user_id')
    .notNull()
    .references(() => authUsers.id),
  name: text('name').notNull(),
  eventDate: integer('event_date').notNull(),
  location: text('location'),
  format: text('format').notNull(),
  totalRounds: integer('total_rounds').notNull(),
  // DRAFT | REGISTRATION | CHECK_IN | IN_PROGRESS | COMPLETE
  status: text('status').notNull().default('DRAFT'),
  createdAt: integer('created_at').notNull(),
})

export const tournamentPlayers = sqliteTable('tournament_players', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id),
  displayName: text('display_name').notNull(),
  // user-entered string — NOT a BSData FK
  faction: text('faction').notNull(),
  // army list pasted as raw text — stored verbatim, never parsed for GW content
  listText: text('list_text'),
  listLocked: integer('list_locked').notNull().default(0),
  checkedIn: integer('checked_in').notNull().default(0),
  dropped: integer('dropped').notNull().default(0),
  registeredAt: integer('registered_at').notNull(),
})

export const rounds = sqliteTable('rounds', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id),
  roundNumber: integer('round_number').notNull(),
  // PENDING | ACTIVE | COMPLETE
  status: text('status').notNull().default('PENDING'),
  createdAt: integer('created_at').notNull(),
})

export const pairings = sqliteTable('pairings', {
  id: text('id').primaryKey(),
  roundId: text('round_id')
    .notNull()
    .references(() => rounds.id),
  tableNumber: integer('table_number').notNull(),
  player1Id: text('player1_id')
    .notNull()
    .references(() => tournamentPlayers.id),
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
})

// === ELO tables ===

export const playerElo = sqliteTable('player_elo', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => authUsers.id),
  rating: integer('rating').notNull().default(1200),
  gamesPlayed: integer('games_played').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
})

export const eloHistory = sqliteTable('elo_history', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id),
  pairingId: text('pairing_id')
    .notNull()
    .references(() => pairings.id),
  ratingBefore: integer('rating_before').notNull(),
  ratingAfter: integer('rating_after').notNull(),
  delta: integer('delta').notNull(),
  opponentId: text('opponent_id')
    .notNull()
    .references(() => authUsers.id),
  recordedAt: integer('recorded_at').notNull(),
})

// === Imported tournament results ===
//
// Raw + parsed tournament data imported by the operator.
// Used by the rating engine alongside native match records.
// faction / unit references are user-entered strings.

export const importedTournamentResults = sqliteTable('imported_tournament_results', {
  id: text('id').primaryKey(),
  importedBy: text('imported_by')
    .notNull()
    .references(() => authUsers.id),
  eventName: text('event_name').notNull(),
  eventDate: integer('event_date').notNull(),
  format: text('format').notNull(),
  metaWindow: text('meta_window').notNull(),
  // original CSV stored verbatim — never re-parsed into GW data
  rawData: text('raw_data').notNull(),
  // JSON of TournamentRecord[]
  parsedData: text('parsed_data').notNull(),
  importedAt: integer('imported_at').notNull(),
})
