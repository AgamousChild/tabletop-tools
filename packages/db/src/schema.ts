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

// === App tables ===

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
