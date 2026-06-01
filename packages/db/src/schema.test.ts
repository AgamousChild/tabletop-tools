import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  authUsers,
  bcpRegistration,
  diceRollingSessions,
  diceSets,
  glickoHistory,
  list,
  lists,
  listUnit,
  listUnitLoadout,
  listUnitLoadoutWeapon,
  listUnits,
  matches,
  matchSecondaries,
  pairings,
  passthroughEvent,
  playerGlicko,
  rankingMetric,
  rolls,
  rounds,
  simulation,
  simulationModifier,
  simulations,
  simulationWeapon,
  stratagemLog,
  tournamentAwards,
  tournamentCards,
  tournamentPairingMetric,
  tournamentPlacingMetric,
  tournamentPlayers,
  tournaments,
  trainingExamples,
  trainingFrames,
  turns,
  unitRatings,
  userBans,
} from './schema'

const client = createClient({ url: ':memory:' })
const db = drizzle(client)

afterAll(() => {
  client.close()
})

beforeAll(async () => {
  // V2: Enable foreign key enforcement (SQLite disables it by default)
  await client.execute('PRAGMA foreign_keys = ON')

  // Auth tables (Better Auth managed)
  await client.execute(`CREATE TABLE "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    username TEXT UNIQUE,
    display_username TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE "session" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE "account" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at INTEGER,
    refresh_token_expires_at INTEGER,
    scope TEXT,
    password TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER,
    updated_at INTEGER
  )`)

  // NoCheat tables
  await client.execute(`CREATE TABLE dice_sets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    dice_set_id TEXT NOT NULL REFERENCES dice_sets(id) ON DELETE CASCADE,
    opponent_name TEXT,
    z_score REAL,
    is_loaded INTEGER,
    photo_url TEXT,
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  )`)

  await client.execute(`CREATE TABLE rolls (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    pip_values TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE training_examples (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    dice_set_id TEXT NOT NULL REFERENCES dice_sets(id) ON DELETE CASCADE,
    label INTEGER NOT NULL,
    guess INTEGER,
    confidence REAL,
    features TEXT NOT NULL,
    image_url TEXT,
    is_correct INTEGER,
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE training_frames (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    dice_set_id TEXT NOT NULL REFERENCES dice_sets(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    frame_width INTEGER NOT NULL,
    frame_height INTEGER NOT NULL,
    boxes_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)

  // Versus tables
  await client.execute(`CREATE TABLE simulations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    attacker_content_id TEXT NOT NULL,
    attacker_name TEXT NOT NULL,
    defender_content_id TEXT NOT NULL,
    defender_name TEXT NOT NULL,
    result TEXT NOT NULL,
    config_hash TEXT,
    weapon_config TEXT,
    created_at INTEGER NOT NULL
  )`)

  // List Builder tables
  await client.execute(`CREATE TABLE lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    faction TEXT NOT NULL,
    name TEXT NOT NULL,
    total_pts INTEGER NOT NULL DEFAULT 0,
    detachment TEXT,
    description TEXT,
    battle_size INTEGER,
    synced_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE list_units (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    unit_content_id TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    unit_points INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    model_count INTEGER,
    is_warlord INTEGER NOT NULL DEFAULT 0,
    enhancement_id TEXT,
    enhancement_name TEXT,
    enhancement_cost INTEGER
  )`)

  await client.execute(`CREATE TABLE unit_ratings (
    id TEXT PRIMARY KEY,
    unit_content_id TEXT NOT NULL,
    rating TEXT NOT NULL,
    win_contrib REAL NOT NULL,
    pts_eff REAL NOT NULL,
    meta_window TEXT NOT NULL,
    computed_at INTEGER NOT NULL
  )`)

  // Game Tracker tables
  await client.execute(`CREATE TABLE matches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    list_id TEXT,
    opponent_faction TEXT NOT NULL,
    mission TEXT NOT NULL,
    result TEXT,
    your_final_score INTEGER,
    their_final_score INTEGER,
    is_tournament INTEGER NOT NULL DEFAULT 0,
    opponent_name TEXT,
    opponent_detachment TEXT,
    your_faction TEXT,
    your_detachment TEXT,
    terrain_layout TEXT,
    deployment_zone TEXT,
    twist_cards TEXT,
    challenger_cards TEXT,
    require_photos INTEGER NOT NULL DEFAULT 0,
    attacker_defender TEXT,
    who_goes_first TEXT,
    date INTEGER,
    location TEXT,
    tournament_name TEXT,
    tournament_id TEXT,
    created_at INTEGER NOT NULL,
    closed_at INTEGER,
    hidden_at INTEGER
  )`)

  await client.execute(`CREATE TABLE turns (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    photo_url TEXT,
    your_units_lost TEXT NOT NULL DEFAULT '[]',
    their_units_lost TEXT NOT NULL DEFAULT '[]',
    primary_scored INTEGER NOT NULL DEFAULT 0,
    secondary_scored INTEGER NOT NULL DEFAULT 0,
    cp_spent INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    your_cp_start INTEGER NOT NULL DEFAULT 0,
    your_cp_gained INTEGER NOT NULL DEFAULT 1,
    your_cp_spent INTEGER NOT NULL DEFAULT 0,
    their_cp_start INTEGER NOT NULL DEFAULT 0,
    their_cp_gained INTEGER NOT NULL DEFAULT 1,
    their_cp_spent INTEGER NOT NULL DEFAULT 0,
    your_primary INTEGER NOT NULL DEFAULT 0,
    their_primary INTEGER NOT NULL DEFAULT 0,
    your_secondary INTEGER NOT NULL DEFAULT 0,
    their_secondary INTEGER NOT NULL DEFAULT 0,
    your_photo_url TEXT,
    their_photo_url TEXT,
    your_units_destroyed TEXT NOT NULL DEFAULT '[]',
    their_units_destroyed TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  )`)

  // Tournament tables
  await client.execute(`CREATE TABLE tournaments (
    id TEXT PRIMARY KEY,
    to_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_date INTEGER NOT NULL,
    location TEXT,
    format TEXT NOT NULL,
    total_rounds INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    description TEXT,
    image_url TEXT,
    external_link TEXT,
    start_time TEXT,
    latitude REAL,
    longitude REAL,
    mission_pool TEXT,
    require_photos INTEGER NOT NULL DEFAULT 0,
    include_twists INTEGER NOT NULL DEFAULT 0,
    include_challenger INTEGER NOT NULL DEFAULT 0,
    max_players INTEGER,
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE tournament_players (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    faction TEXT NOT NULL,
    detachment TEXT,
    list_text TEXT,
    list_id TEXT,
    list_locked INTEGER NOT NULL DEFAULT 0,
    checked_in INTEGER NOT NULL DEFAULT 0,
    dropped INTEGER NOT NULL DEFAULT 0,
    registered_at INTEGER NOT NULL,
    faction_entity_id TEXT,
    detachment_entity_id TEXT,
    placement INTEGER
  )`)

  await client.execute(`CREATE TABLE rounds (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    start_time TEXT,
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE pairings (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    player1_id TEXT NOT NULL REFERENCES tournament_players(id) ON DELETE CASCADE,
    player2_id TEXT,
    mission TEXT NOT NULL,
    player1_vp INTEGER,
    player2_vp INTEGER,
    result TEXT,
    reported_by TEXT,
    confirmed INTEGER NOT NULL DEFAULT 0,
    to_override INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`)

  // Glicko-2 tables
  await client.execute(`CREATE TABLE player_glicko (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 1500,
    rating_deviation REAL NOT NULL DEFAULT 350,
    volatility REAL NOT NULL DEFAULT 0.06,
    games_played INTEGER NOT NULL DEFAULT 0,
    last_rating_period TEXT,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE glicko_history (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES player_glicko(id) ON DELETE CASCADE,
    rating_period TEXT NOT NULL,
    rating_before REAL NOT NULL,
    rd_before REAL NOT NULL,
    rating_after REAL NOT NULL,
    rd_after REAL NOT NULL,
    volatility_after REAL NOT NULL,
    delta REAL NOT NULL,
    games_in_period INTEGER NOT NULL,
    recorded_at INTEGER NOT NULL
  )`)

  // --- V2: Indexes on FK and query columns ---
  // Auth
  await client.execute('CREATE INDEX idx_session_user_id ON "session"(user_id)')
  await client.execute('CREATE INDEX idx_account_user_id ON "account"(user_id)')
  await client.execute('CREATE INDEX idx_verification_identifier ON verification(identifier)')
  // NoCheat
  await client.execute('CREATE INDEX idx_dice_sets_user_id ON dice_sets(user_id)')
  await client.execute('CREATE INDEX idx_sessions_user_id ON sessions(user_id)')
  await client.execute('CREATE INDEX idx_sessions_dice_set_id ON sessions(dice_set_id)')
  await client.execute('CREATE INDEX idx_rolls_session_id ON rolls(session_id)')
  // Training
  await client.execute('CREATE INDEX idx_training_examples_user_id ON training_examples(user_id)')
  await client.execute(
    'CREATE INDEX idx_training_examples_dice_set_id ON training_examples(dice_set_id)',
  )
  await client.execute('CREATE INDEX idx_training_examples_label ON training_examples(label)')
  // Versus
  await client.execute('CREATE INDEX idx_simulations_user_id ON simulations(user_id)')
  // List Builder
  await client.execute('CREATE INDEX idx_lists_user_id ON lists(user_id)')
  await client.execute('CREATE INDEX idx_list_units_list_id ON list_units(list_id)')
  await client.execute(
    'CREATE INDEX idx_unit_ratings_unit_content_id ON unit_ratings(unit_content_id)',
  )
  await client.execute('CREATE INDEX idx_unit_ratings_meta_window ON unit_ratings(meta_window)')
  // Game Tracker
  await client.execute('CREATE INDEX idx_matches_user_id ON matches(user_id)')
  await client.execute('CREATE INDEX idx_turns_match_id ON turns(match_id)')
  // Tournament
  await client.execute('CREATE INDEX idx_tournaments_user_id ON tournaments(to_user_id)')
  await client.execute(
    'CREATE INDEX idx_tournament_players_tourn_id ON tournament_players(tournament_id)',
  )
  await client.execute('CREATE INDEX idx_tournament_players_user_id ON tournament_players(user_id)')
  await client.execute('CREATE INDEX idx_rounds_tournament_id ON rounds(tournament_id)')
  await client.execute('CREATE INDEX idx_pairings_round_id ON pairings(round_id)')
  await client.execute('CREATE INDEX idx_pairings_player1_id ON pairings(player1_id)')
  await client.execute('CREATE INDEX idx_pairings_player2_id ON pairings(player2_id)')
  // Glicko
  await client.execute('CREATE INDEX idx_player_glicko_user_id ON player_glicko(user_id)')
  await client.execute('CREATE INDEX idx_glicko_history_player_id ON glicko_history(player_id)')

  // --- V3: New tables ---

  // Tournament cards (Yellow/Red)
  await client.execute(`CREATE TABLE tournament_cards (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES tournament_players(id) ON DELETE CASCADE,
    issued_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    card_type TEXT NOT NULL,
    reason TEXT NOT NULL,
    issued_at INTEGER NOT NULL
  )`)

  // Tournament awards
  await client.execute(`CREATE TABLE tournament_awards (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    recipient_id TEXT REFERENCES tournament_players(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  )`)

  // Phase 3: ranking metrics + passthrough events + BCP registration
  await client.execute(`CREATE TABLE ranking_metric (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT
  )`)

  await client.execute(`CREATE TABLE tournament_pairing_metric (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    ranking_metric_id TEXT NOT NULL REFERENCES ranking_metric(id),
    sort_order INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_tourn_pairing_metric UNIQUE(tournament_id, ranking_metric_id)
  )`)

  await client.execute(`CREATE TABLE tournament_placing_metric (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    ranking_metric_id TEXT NOT NULL REFERENCES ranking_metric(id),
    sort_order INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_tourn_placing_metric UNIQUE(tournament_id, ranking_metric_id)
  )`)

  await client.execute(`CREATE TABLE passthrough_event (
    id TEXT PRIMARY KEY,
    bcp_event_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    event_date INTEGER,
    location TEXT,
    game_system TEXT,
    player_count INTEGER,
    registration_url TEXT,
    last_synced_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE bcp_registration (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    bcp_event_id TEXT NOT NULL,
    list_id TEXT,
    method TEXT NOT NULL,
    status TEXT NOT NULL,
    consent_at INTEGER NOT NULL,
    submitted_at INTEGER NOT NULL
  )`)

  // Match secondaries (game-tracker)
  await client.execute(`CREATE TABLE match_secondaries (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player TEXT NOT NULL,
    secondary_name TEXT NOT NULL,
    vp_per_round TEXT NOT NULL DEFAULT '[]'
  )`)

  // Stratagem usage log (game-tracker)
  await client.execute(`CREATE TABLE stratagem_log (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
    player TEXT NOT NULL,
    stratagem_name TEXT NOT NULL,
    cp_cost INTEGER NOT NULL DEFAULT 1
  )`)

  // User bans (admin)
  await client.execute(`CREATE TABLE user_bans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    banned_by TEXT NOT NULL REFERENCES "user"(id),
    banned_at INTEGER NOT NULL,
    lifted_at INTEGER
  )`)

  // V3 indexes on new tables
  await client.execute(
    'CREATE INDEX idx_tournament_cards_tournament_id ON tournament_cards(tournament_id)',
  )
  await client.execute('CREATE INDEX idx_tournament_cards_player_id ON tournament_cards(player_id)')
  await client.execute(
    'CREATE INDEX idx_tournament_awards_tournament_id ON tournament_awards(tournament_id)',
  )
  await client.execute('CREATE INDEX idx_match_secondaries_match_id ON match_secondaries(match_id)')
  await client.execute('CREATE INDEX idx_stratagem_log_turn_id ON stratagem_log(turn_id)')
  await client.execute('CREATE INDEX idx_user_bans_user_id ON user_bans(user_id)')
  await client.execute(
    'CREATE INDEX idx_tourn_pairing_metric_tourn ON tournament_pairing_metric(tournament_id)',
  )
  await client.execute(
    'CREATE INDEX idx_tourn_placing_metric_tourn ON tournament_placing_metric(tournament_id)',
  )
  await client.execute('CREATE INDEX idx_passthrough_event_date ON passthrough_event(event_date)')
  await client.execute(
    'CREATE INDEX idx_passthrough_bcp_event_id ON passthrough_event(bcp_event_id)',
  )
  await client.execute('CREATE INDEX idx_bcp_registration_user ON bcp_registration(user_id)')
  await client.execute('CREATE INDEX idx_bcp_registration_event ON bcp_registration(bcp_event_id)')

  // --- V2: Composite unique constraints ---
  await client.execute(
    'CREATE UNIQUE INDEX uq_unit_ratings_unit_window ON unit_ratings(unit_content_id, meta_window)',
  )
  await client.execute(
    'CREATE UNIQUE INDEX uq_tournament_players_tourn_user ON tournament_players(tournament_id, user_id)',
  )
  await client.execute(
    'CREATE UNIQUE INDEX uq_rounds_tourn_number ON rounds(tournament_id, round_number)',
  )
  await client.execute('CREATE UNIQUE INDEX uq_turns_match_number ON turns(match_id, turn_number)')

  // Seed shared users for FK tests
  await db.insert(authUsers).values({
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await db.insert(authUsers).values({
    id: 'user-2',
    name: 'Opponent User',
    email: 'opponent@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // V2: User for cascade tests
  await db.insert(authUsers).values({
    id: 'user-3',
    name: 'Cascade User',
    email: 'cascade@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // Phase 2: Stub tables needed as FK targets by the new list tables
  await client.execute(`CREATE TABLE IF NOT EXISTS dim_dataslate (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    effective_date INTEGER NOT NULL,
    end_date INTEGER
  )`)

  await client.execute(`CREATE TABLE IF NOT EXISTS content_entity (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    faction_id TEXT,
    parent_id TEXT,
    dataslate_id TEXT,
    r2_key TEXT,
    wahapedia_id TEXT,
    bsdata_id TEXT,
    updated_at INTEGER NOT NULL
  )`)

  // Phase 2: List data model tables
  await client.execute(`CREATE TABLE list (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    author TEXT,
    edition TEXT NOT NULL DEFAULT '11th',
    faction_id TEXT REFERENCES content_entity(id),
    subfaction_id TEXT REFERENCES content_entity(id),
    detachment_id TEXT REFERENCES content_entity(id),
    battle_size TEXT NOT NULL DEFAULT 'unknown',
    total_points INTEGER NOT NULL DEFAULT 0,
    dataslate_id TEXT REFERENCES dim_dataslate(id),
    source TEXT NOT NULL DEFAULT 'list-builder',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE list_unit (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES list(id) ON DELETE CASCADE,
    datasheet_id TEXT REFERENCES content_entity(id),
    enhancement_id TEXT REFERENCES content_entity(id),
    is_warlord INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    attached_to_unit_id TEXT REFERENCES list_unit(id),
    attach_role TEXT
  )`)

  await client.execute(`CREATE TABLE list_unit_loadout (
    id TEXT PRIMARY KEY,
    list_unit_id TEXT NOT NULL REFERENCES list_unit(id) ON DELETE CASCADE,
    model_count INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE list_unit_loadout_weapon (
    id TEXT PRIMARY KEY,
    loadout_id TEXT NOT NULL REFERENCES list_unit_loadout(id) ON DELETE CASCADE,
    weapon_id TEXT REFERENCES content_entity(id),
    count INTEGER NOT NULL DEFAULT 1
  )`)

  // Phase 3: Versus normalized simulation tables
  await client.execute(`CREATE TABLE simulation (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    label TEXT,
    attacker_unit_id TEXT REFERENCES list_unit(id) ON DELETE SET NULL,
    defender_unit_id TEXT REFERENCES list_unit(id) ON DELETE SET NULL,
    attacker_name TEXT NOT NULL,
    defender_name TEXT NOT NULL,
    dataslate_id TEXT,
    expected_wounds REAL NOT NULL,
    expected_models_removed REAL NOT NULL,
    survivors REAL NOT NULL,
    worst_wounds REAL NOT NULL,
    worst_models REAL NOT NULL,
    best_wounds REAL NOT NULL,
    best_models REAL NOT NULL,
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE simulation_weapon (
    id TEXT PRIMARY KEY,
    simulation_id TEXT NOT NULL REFERENCES simulation(id) ON DELETE CASCADE,
    profile_kind TEXT NOT NULL,
    profile_id TEXT,
    weapon_name TEXT NOT NULL,
    model_count INTEGER NOT NULL,
    weapons_per_model INTEGER NOT NULL,
    attacks_per_weapon REAL NOT NULL,
    total_attacks REAL NOT NULL,
    expected_wounds REAL NOT NULL,
    expected_models_removed REAL NOT NULL
  )`)

  await client.execute(`CREATE TABLE simulation_modifier (
    id TEXT PRIMARY KEY,
    simulation_id TEXT NOT NULL REFERENCES simulation(id) ON DELETE CASCADE,
    side TEXT NOT NULL,
    source TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT
  )`)

  // Phase 3 indexes
  await client.execute('CREATE INDEX idx_simulation_user_id ON simulation(user_id)')
  await client.execute('CREATE INDEX idx_simulation_attacker ON simulation(attacker_unit_id)')
  await client.execute('CREATE INDEX idx_simulation_defender ON simulation(defender_unit_id)')
  await client.execute('CREATE INDEX idx_simulation_created ON simulation(created_at)')
  await client.execute('CREATE INDEX idx_sim_weapon_sim_id ON simulation_weapon(simulation_id)')
  await client.execute('CREATE INDEX idx_sim_modifier_sim_id ON simulation_modifier(simulation_id)')
})

// ============================================================
// Existing tests
// ============================================================

describe('authUsers', () => {
  it('inserts and retrieves a user', async () => {
    const result = await db.select().from(authUsers).where(eq(authUsers.id, 'user-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.email).toBe('test@example.com')
  })

  it('enforces unique email constraint', async () => {
    await expect(
      db.insert(authUsers).values({
        id: 'user-2-dupe',
        name: 'Dupe',
        email: 'test@example.com', // duplicate
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow()
  })
})

describe('diceSets', () => {
  it('inserts and retrieves a dice set', async () => {
    await db.insert(diceSets).values({
      id: 'set-1',
      userId: 'user-1',
      name: 'Red Dice',
      createdAt: Date.now(),
    })

    const result = await db.select().from(diceSets).where(eq(diceSets.id, 'set-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Red Dice')
    expect(result[0]?.userId).toBe('user-1')
  })
})

describe('diceRollingSessions', () => {
  it('inserts an open session with null verdict fields', async () => {
    await db.insert(diceRollingSessions).values({
      id: 'sess-1',
      userId: 'user-1',
      diceSetId: 'set-1',
      opponentName: 'Bob',
      createdAt: Date.now(),
    })

    const result = await db
      .select()
      .from(diceRollingSessions)
      .where(eq(diceRollingSessions.id, 'sess-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.closedAt).toBeNull()
    expect(result[0]?.isLoaded).toBeNull()
    expect(result[0]?.zScore).toBeNull()
  })

  it('closes a session with a verdict', async () => {
    const closedAt = Date.now()
    await db
      .update(diceRollingSessions)
      .set({ zScore: 2.84, isLoaded: 1, closedAt })
      .where(eq(diceRollingSessions.id, 'sess-1'))

    const result = await db
      .select()
      .from(diceRollingSessions)
      .where(eq(diceRollingSessions.id, 'sess-1'))
    expect(result[0]?.isLoaded).toBe(1)
    expect(result[0]?.zScore).toBeCloseTo(2.84)
    expect(result[0]?.closedAt).toBe(closedAt)
  })
})

describe('rolls', () => {
  it('inserts a roll and retrieves pip values', async () => {
    const pipValues = [3, 5, 2, 6, 1, 4]

    await db.insert(rolls).values({
      id: 'roll-1',
      sessionId: 'sess-1',
      pipValues: JSON.stringify(pipValues),
      createdAt: Date.now(),
    })

    const result = await db.select().from(rolls).where(eq(rolls.sessionId, 'sess-1'))
    expect(result).toHaveLength(1)
    expect(JSON.parse(result[0]?.pipValues ?? '[]')).toEqual(pipValues)
  })

  it('deletes a roll', async () => {
    await db.delete(rolls).where(eq(rolls.id, 'roll-1'))

    const result = await db.select().from(rolls).where(eq(rolls.id, 'roll-1'))
    expect(result).toHaveLength(0)
  })
})

describe('trainingExamples', () => {
  it('inserts and retrieves a training example', async () => {
    await db.insert(diceSets).values({
      id: 'ds-train',
      userId: 'user-1',
      name: 'Training Dice',
      createdAt: Date.now(),
    })

    const features = [
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
    ]

    await db.insert(trainingExamples).values({
      id: 'train-1',
      userId: 'user-1',
      diceSetId: 'ds-train',
      label: 4,
      guess: 3,
      confidence: 0.75,
      features: JSON.stringify(features),
      imageUrl: 'https://cdn.example.com/training/train-1.png',
      isCorrect: 0,
      createdAt: Date.now(),
    })

    const result = await db
      .select()
      .from(trainingExamples)
      .where(eq(trainingExamples.id, 'train-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.label).toBe(4)
    expect(result[0]?.guess).toBe(3)
    expect(result[0]?.isCorrect).toBe(0)
    expect(JSON.parse(result[0]?.features ?? '[]')).toEqual(features)
  })

  it('cascades delete when dice set is deleted', async () => {
    await db.delete(diceSets).where(eq(diceSets.id, 'ds-train'))
    const result = await db
      .select()
      .from(trainingExamples)
      .where(eq(trainingExamples.id, 'train-1'))
    expect(result).toHaveLength(0)
  })
})

describe('trainingFrames', () => {
  it('inserts and retrieves a training frame', async () => {
    await db.insert(diceSets).values({
      id: 'ds-frame',
      userId: 'user-1',
      name: 'Frame Dice',
      createdAt: Date.now(),
    })

    const boxes = [{ x: 0.2, y: 0.3, w: 0.1, h: 0.1, label: 4 }]
    await db.insert(trainingFrames).values({
      id: 'frame-1',
      userId: 'user-1',
      diceSetId: 'ds-frame',
      imageUrl: 'https://cdn.example.com/frames/frame-1.png',
      frameWidth: 640,
      frameHeight: 480,
      boxesJson: JSON.stringify(boxes),
      createdAt: Date.now(),
    })

    const result = await db.select().from(trainingFrames).where(eq(trainingFrames.id, 'frame-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.frameWidth).toBe(640)
    expect(result[0]?.frameHeight).toBe(480)
    expect(JSON.parse(result[0]?.boxesJson ?? '[]')).toEqual(boxes)
  })

  it('cascades delete when dice set is deleted', async () => {
    await db.delete(diceSets).where(eq(diceSets.id, 'ds-frame'))
    const result = await db.select().from(trainingFrames).where(eq(trainingFrames.id, 'frame-1'))
    expect(result).toHaveLength(0)
  })
})

// ============================================================
// List Builder table tests
// ============================================================

describe('lists', () => {
  it('inserts and retrieves a list', async () => {
    await db.insert(lists).values({
      id: 'list-1',
      userId: 'user-1',
      faction: 'Test Faction',
      name: 'My GT List',
      totalPts: 2000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const result = await db.select().from(lists).where(eq(lists.id, 'list-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('My GT List')
    expect(result[0]?.faction).toBe('Test Faction')
    expect(result[0]?.totalPts).toBe(2000)
  })
})

describe('listUnits', () => {
  it('inserts a list unit with denormalized name and points', async () => {
    await db.insert(listUnits).values({
      id: 'lu-1',
      listId: 'list-1',
      unitContentId: 'bsdata-unit-abc123',
      unitName: 'Iron Warrior',
      unitPoints: 75,
      count: 1,
    })

    const result = await db.select().from(listUnits).where(eq(listUnits.listId, 'list-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.unitContentId).toBe('bsdata-unit-abc123')
    expect(result[0]?.unitName).toBe('Iron Warrior')
    expect(result[0]?.unitPoints).toBe(75)
  })

  it('unit_content_id has no FK constraint (game content boundary)', async () => {
    // Should insert without error — no FK to validate against
    await expect(
      db.insert(listUnits).values({
        id: 'lu-2',
        listId: 'list-1',
        unitContentId: 'nonexistent-content-id',
        unitName: 'Phantom Unit',
        unitPoints: 100,
        count: 1,
      }),
    ).resolves.not.toThrow()
  })
})

describe('unitRatings', () => {
  it('inserts a unit rating', async () => {
    await db.insert(unitRatings).values({
      id: 'rating-1',
      unitContentId: 'bsdata-unit-abc123',
      rating: 'A',
      winContrib: 0.62,
      ptsEff: 1.4,
      metaWindow: '2025-Q2',
      computedAt: Date.now(),
    })

    const result = await db
      .select()
      .from(unitRatings)
      .where(eq(unitRatings.unitContentId, 'bsdata-unit-abc123'))
    expect(result).toHaveLength(1)
    expect(result[0]?.rating).toBe('A')
    expect(result[0]?.metaWindow).toBe('2025-Q2')
  })
})

// ============================================================
// Game Tracker table tests
// ============================================================

describe('matches', () => {
  it('inserts an open match', async () => {
    await db.insert(matches).values({
      id: 'match-1',
      userId: 'user-1',
      opponentFaction: 'Test Opponent Faction',
      mission: 'Test Mission Alpha',
      createdAt: Date.now(),
    })

    const result = await db.select().from(matches).where(eq(matches.id, 'match-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.result).toBeNull()
    expect(result[0]?.closedAt).toBeNull()
    expect(result[0]?.isTournament).toBe(0)
  })

  it('opponent_faction stored as plain string (no FK)', async () => {
    // opponentFaction can be any string — no FK to validate
    await expect(
      db.insert(matches).values({
        id: 'match-2',
        userId: 'user-1',
        opponentFaction: 'Totally Made Up Faction Name',
        mission: 'Any Mission',
        createdAt: Date.now(),
      }),
    ).resolves.not.toThrow()
  })

  it('closes a match with a result', async () => {
    const closedAt = Date.now()
    await db
      .update(matches)
      .set({ result: 'WIN', yourFinalScore: 85, theirFinalScore: 62, closedAt })
      .where(eq(matches.id, 'match-1'))

    const result = await db.select().from(matches).where(eq(matches.id, 'match-1'))
    expect(result[0]?.result).toBe('WIN')
    expect(result[0]?.yourFinalScore).toBe(85)
    expect(result[0]?.closedAt).toBe(closedAt)
  })
})

describe('turns', () => {
  it('inserts a turn with JSON unit loss arrays', async () => {
    const yourUnitsLost = [{ contentId: 'unit-x', name: 'Iron Warrior' }]
    const theirUnitsLost = [{ contentId: 'unit-y', name: 'Null Titan' }]

    await db.insert(turns).values({
      id: 'turn-1',
      matchId: 'match-1',
      turnNumber: 1,
      yourUnitsLost: JSON.stringify(yourUnitsLost),
      theirUnitsLost: JSON.stringify(theirUnitsLost),
      primaryScored: 4,
      secondaryScored: 3,
      cpSpent: 2,
      createdAt: Date.now(),
    })

    const result = await db.select().from(turns).where(eq(turns.matchId, 'match-1'))
    expect(result).toHaveLength(1)
    expect(JSON.parse(result[0]?.yourUnitsLost ?? '[]')).toEqual(yourUnitsLost)
    expect(result[0]?.primaryScored).toBe(4)
    expect(result[0]?.cpSpent).toBe(2)
  })
})

// ============================================================
// Tournament table tests
// ============================================================

describe('tournaments', () => {
  it('inserts a tournament in DRAFT status', async () => {
    await db.insert(tournaments).values({
      id: 'tourn-1',
      toUserId: 'user-1',
      name: 'Test GT 2025',
      eventDate: Date.now(),
      format: '2000pts Matched Play',
      totalRounds: 5,
      createdAt: Date.now(),
    })

    const result = await db.select().from(tournaments).where(eq(tournaments.id, 'tourn-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('DRAFT')
    expect(result[0]?.totalRounds).toBe(5)
  })
})

describe('tournamentPlayers', () => {
  it('registers a player with faction as plain string', async () => {
    await db.insert(tournamentPlayers).values({
      id: 'tp-1',
      tournamentId: 'tourn-1',
      userId: 'user-1',
      displayName: 'Alice',
      faction: 'Test Faction',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })

    const result = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.id, 'tp-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.faction).toBe('Test Faction')
    expect(result[0]?.listLocked).toBe(0)
  })

  it('registers a second player for pairing tests', async () => {
    await db.insert(tournamentPlayers).values({
      id: 'tp-2',
      tournamentId: 'tourn-1',
      userId: 'user-2',
      displayName: 'Bob',
      faction: 'Another Faction',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, 'tourn-1'))
    expect(result).toHaveLength(2)
  })
})

describe('rounds and pairings', () => {
  it('creates a round and a pairing', async () => {
    await db.insert(rounds).values({
      id: 'round-1',
      tournamentId: 'tourn-1',
      roundNumber: 1,
      status: 'ACTIVE',
      createdAt: Date.now(),
    })

    await db.insert(pairings).values({
      id: 'pairing-1',
      roundId: 'round-1',
      tableNumber: 1,
      player1Id: 'tp-1',
      player2Id: 'tp-2',
      mission: 'Sweeping Engagement',
      createdAt: Date.now(),
    })

    const result = await db.select().from(pairings).where(eq(pairings.roundId, 'round-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.confirmed).toBe(0)
    expect(result[0]?.player1Vp).toBeNull()
  })

  it('records a result on a pairing', async () => {
    await db
      .update(pairings)
      .set({ player1Vp: 72, player2Vp: 45, result: 'P1_WIN', confirmed: 1 })
      .where(eq(pairings.id, 'pairing-1'))

    const result = await db.select().from(pairings).where(eq(pairings.id, 'pairing-1'))
    expect(result[0]?.result).toBe('P1_WIN')
    expect(result[0]?.confirmed).toBe(1)
  })

  it('supports bye pairings (player2_id is null)', async () => {
    await db.insert(pairings).values({
      id: 'pairing-bye',
      roundId: 'round-1',
      tableNumber: 99,
      player1Id: 'tp-1',
      player2Id: null,
      mission: 'BYE',
      result: 'BYE',
      createdAt: Date.now(),
    })

    const result = await db.select().from(pairings).where(eq(pairings.id, 'pairing-bye'))
    expect(result[0]?.player2Id).toBeNull()
    expect(result[0]?.result).toBe('BYE')
  })
})

// ============================================================
// tournamentPlayers detachment column
// ============================================================

describe('tournamentPlayers detachment', () => {
  // V2: Use a separate tournament to avoid unique constraint conflict with tp-1/tp-2
  beforeAll(async () => {
    await db.insert(tournaments).values({
      id: 'tourn-2',
      toUserId: 'user-1',
      name: 'Detachment Test GT',
      eventDate: Date.now(),
      format: '2000pts',
      totalRounds: 3,
      createdAt: Date.now(),
    })
  })

  it('stores detachment as nullable string', async () => {
    await db.insert(tournamentPlayers).values({
      id: 'tp-det-1',
      tournamentId: 'tourn-2',
      userId: 'user-1',
      displayName: 'Alice',
      faction: 'Space Marines',
      detachment: 'Gladius Task Force',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.id, 'tp-det-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.detachment).toBe('Gladius Task Force')
  })

  it('detachment is null when not provided', async () => {
    await db.insert(tournamentPlayers).values({
      id: 'tp-det-2',
      tournamentId: 'tourn-2',
      userId: 'user-2',
      displayName: 'Bob',
      faction: 'Orks',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.id, 'tp-det-2'))
    expect(result[0]?.detachment).toBeNull()
  })
})

// ============================================================
// Glicko-2 table tests
// ============================================================

describe('playerGlicko', () => {
  it('creates a Glicko-2 entry at default values', async () => {
    await db.insert(playerGlicko).values({
      id: 'glicko-1',
      playerName: 'Alice',
      updatedAt: Date.now(),
    })

    const result = await db.select().from(playerGlicko).where(eq(playerGlicko.id, 'glicko-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.rating).toBe(1500)
    expect(result[0]?.ratingDeviation).toBe(350)
    expect(result[0]?.volatility).toBeCloseTo(0.06)
    expect(result[0]?.gamesPlayed).toBe(0)
    expect(result[0]?.userId).toBeNull()
  })

  it('links to a platform account when userId is provided', async () => {
    await db.insert(playerGlicko).values({
      id: 'glicko-2',
      userId: 'user-1',
      playerName: 'Test User',
      updatedAt: Date.now(),
    })

    const result = await db.select().from(playerGlicko).where(eq(playerGlicko.id, 'glicko-2'))
    expect(result[0]?.userId).toBe('user-1')
    expect(result[0]?.playerName).toBe('Test User')
  })

  it('updates rating after a period', async () => {
    await db
      .update(playerGlicko)
      .set({ rating: 1687, ratingDeviation: 94, gamesPlayed: 5, updatedAt: Date.now() })
      .where(eq(playerGlicko.id, 'glicko-1'))

    const result = await db.select().from(playerGlicko).where(eq(playerGlicko.id, 'glicko-1'))
    expect(result[0]?.rating).toBeCloseTo(1687)
    expect(result[0]?.ratingDeviation).toBeCloseTo(94)
    expect(result[0]?.gamesPlayed).toBe(5)
  })
})

describe('glickoHistory', () => {
  it('records a rating period update', async () => {
    await db.insert(glickoHistory).values({
      id: 'gh-1',
      playerId: 'glicko-1',
      ratingPeriod: 'import-1',
      ratingBefore: 1500,
      rdBefore: 350,
      ratingAfter: 1687,
      rdAfter: 94,
      volatilityAfter: 0.06,
      delta: 187,
      gamesInPeriod: 5,
      recordedAt: Date.now(),
    })

    const result = await db
      .select()
      .from(glickoHistory)
      .where(eq(glickoHistory.playerId, 'glicko-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.ratingPeriod).toBe('import-1')
    expect(result[0]?.delta).toBeCloseTo(187)
    expect(result[0]?.gamesInPeriod).toBe(5)
  })
})

// ============================================================
// V2: Index existence tests
// ============================================================

describe('V2: Index existence', () => {
  it('has all required indexes on all tables', async () => {
    const expectedIndexes: Record<string, string[]> = {
      session: ['idx_session_user_id'],
      account: ['idx_account_user_id'],
      verification: ['idx_verification_identifier'],
      dice_sets: ['idx_dice_sets_user_id'],
      sessions: ['idx_sessions_user_id', 'idx_sessions_dice_set_id'],
      rolls: ['idx_rolls_session_id'],
      training_examples: [
        'idx_training_examples_user_id',
        'idx_training_examples_dice_set_id',
        'idx_training_examples_label',
      ],
      simulations: ['idx_simulations_user_id'],
      simulation: [
        'idx_simulation_user_id',
        'idx_simulation_attacker',
        'idx_simulation_defender',
        'idx_simulation_created',
      ],
      simulation_weapon: ['idx_sim_weapon_sim_id'],
      simulation_modifier: ['idx_sim_modifier_sim_id'],
      lists: ['idx_lists_user_id'],
      list_units: ['idx_list_units_list_id'],
      unit_ratings: [
        'idx_unit_ratings_unit_content_id',
        'idx_unit_ratings_meta_window',
        'uq_unit_ratings_unit_window',
      ],
      matches: ['idx_matches_user_id'],
      turns: ['idx_turns_match_id', 'uq_turns_match_number'],
      tournaments: ['idx_tournaments_user_id'],
      tournament_players: [
        'idx_tournament_players_tourn_id',
        'idx_tournament_players_user_id',
        'uq_tournament_players_tourn_user',
      ],
      rounds: ['idx_rounds_tournament_id', 'uq_rounds_tourn_number'],
      pairings: ['idx_pairings_round_id', 'idx_pairings_player1_id', 'idx_pairings_player2_id'],
      player_glicko: ['idx_player_glicko_user_id'],
      glicko_history: ['idx_glicko_history_player_id'],
      tournament_cards: ['idx_tournament_cards_tournament_id', 'idx_tournament_cards_player_id'],
      tournament_awards: ['idx_tournament_awards_tournament_id'],
      match_secondaries: ['idx_match_secondaries_match_id'],
      stratagem_log: ['idx_stratagem_log_turn_id'],
      user_bans: ['idx_user_bans_user_id'],
      tournament_pairing_metric: ['idx_tourn_pairing_metric_tourn'],
      tournament_placing_metric: ['idx_tourn_placing_metric_tourn'],
      passthrough_event: ['idx_passthrough_event_date', 'idx_passthrough_bcp_event_id'],
      bcp_registration: ['idx_bcp_registration_user', 'idx_bcp_registration_event'],
    }

    for (const [table, indexes] of Object.entries(expectedIndexes)) {
      const result = await client.execute(`PRAGMA index_list("${table}")`)
      const indexNames = result.rows.map((r) => r.name as string)
      for (const idx of indexes) {
        expect(indexNames, `Missing index ${idx} on table ${table}`).toContain(idx)
      }
    }
  })
})

// ============================================================
// V2: Composite unique constraint enforcement
// ============================================================

describe('V2: Unique constraints', () => {
  it('rejects duplicate (unit_content_id, meta_window) in unitRatings', async () => {
    await expect(
      db.insert(unitRatings).values({
        id: 'rating-dupe',
        unitContentId: 'bsdata-unit-abc123',
        rating: 'B',
        winContrib: 0.5,
        ptsEff: 1.0,
        metaWindow: '2025-Q2',
        computedAt: Date.now(),
      }),
    ).rejects.toThrow()
  })

  it('rejects duplicate (tournament_id, user_id) in tournamentPlayers', async () => {
    await expect(
      db.insert(tournamentPlayers).values({
        id: 'tp-dupe',
        tournamentId: 'tourn-1',
        userId: 'user-1',
        displayName: 'Alice Again',
        faction: 'Test',
        listLocked: 0,
        checkedIn: 0,
        dropped: 0,
        registeredAt: Date.now(),
      }),
    ).rejects.toThrow()
  })

  it('rejects duplicate (tournament_id, round_number) in rounds', async () => {
    await expect(
      db.insert(rounds).values({
        id: 'round-dupe',
        tournamentId: 'tourn-1',
        roundNumber: 1,
        createdAt: Date.now(),
      }),
    ).rejects.toThrow()
  })

  it('rejects duplicate (match_id, turn_number) in turns', async () => {
    await expect(
      db.insert(turns).values({
        id: 'turn-dupe',
        matchId: 'match-1',
        turnNumber: 1,
        createdAt: Date.now(),
      }),
    ).rejects.toThrow()
  })
})

// ============================================================
// V3: New table tests
// ============================================================

describe('tournamentCards', () => {
  it('issues a yellow card to a player', async () => {
    await db.insert(tournamentCards).values({
      id: 'card-1',
      tournamentId: 'tourn-1',
      playerId: 'tp-1',
      issuedBy: 'user-1',
      cardType: 'YELLOW',
      reason: 'Slow play',
      issuedAt: Date.now(),
    })

    const result = await db.select().from(tournamentCards).where(eq(tournamentCards.id, 'card-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.cardType).toBe('YELLOW')
    expect(result[0]?.reason).toBe('Slow play')
  })

  it('issues a red card', async () => {
    await db.insert(tournamentCards).values({
      id: 'card-2',
      tournamentId: 'tourn-1',
      playerId: 'tp-2',
      issuedBy: 'user-1',
      cardType: 'RED',
      reason: 'Unsportsmanlike conduct',
      issuedAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentCards)
      .where(eq(tournamentCards.tournamentId, 'tourn-1'))
    expect(result).toHaveLength(2)
  })
})

describe('tournamentAwards', () => {
  it('creates an award without a recipient', async () => {
    await db.insert(tournamentAwards).values({
      id: 'award-1',
      tournamentId: 'tourn-1',
      name: 'Best Painted',
      description: 'Most impressive paint job',
      createdAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentAwards)
      .where(eq(tournamentAwards.id, 'award-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Best Painted')
    expect(result[0]?.recipientId).toBeNull()
  })

  it('assigns a recipient to an award', async () => {
    await db
      .update(tournamentAwards)
      .set({ recipientId: 'tp-1' })
      .where(eq(tournamentAwards.id, 'award-1'))

    const result = await db
      .select()
      .from(tournamentAwards)
      .where(eq(tournamentAwards.id, 'award-1'))
    expect(result[0]?.recipientId).toBe('tp-1')
  })
})

describe('matchSecondaries', () => {
  it('tracks a secondary objective with per-round VP', async () => {
    const vpPerRound = [0, 4, 3, 4, 2]
    await db.insert(matchSecondaries).values({
      id: 'sec-1',
      matchId: 'match-1',
      player: 'YOUR',
      secondaryName: 'Assassination',
      vpPerRound: JSON.stringify(vpPerRound),
    })

    const result = await db
      .select()
      .from(matchSecondaries)
      .where(eq(matchSecondaries.matchId, 'match-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.secondaryName).toBe('Assassination')
    expect(JSON.parse(result[0]?.vpPerRound ?? '[]')).toEqual(vpPerRound)
  })
})

describe('stratagemLog', () => {
  it('logs a stratagem usage in a turn', async () => {
    await db.insert(stratagemLog).values({
      id: 'strat-1',
      turnId: 'turn-1',
      player: 'YOUR',
      stratagemName: 'Fire Discipline',
      cpCost: 1,
    })

    const result = await db.select().from(stratagemLog).where(eq(stratagemLog.turnId, 'turn-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.stratagemName).toBe('Fire Discipline')
    expect(result[0]?.cpCost).toBe(1)
  })

  it('logs multiple stratagems in the same turn', async () => {
    await db.insert(stratagemLog).values({
      id: 'strat-2',
      turnId: 'turn-1',
      player: 'THEIRS',
      stratagemName: 'Armour of Contempt',
      cpCost: 1,
    })

    const result = await db.select().from(stratagemLog).where(eq(stratagemLog.turnId, 'turn-1'))
    expect(result).toHaveLength(2)
  })
})

describe('userBans', () => {
  it('creates a user ban', async () => {
    await db.insert(userBans).values({
      id: 'ban-1',
      userId: 'user-2',
      reason: 'Repeated violations',
      bannedBy: 'user-1',
      bannedAt: Date.now(),
    })

    const result = await db.select().from(userBans).where(eq(userBans.id, 'ban-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.reason).toBe('Repeated violations')
    expect(result[0]?.liftedAt).toBeNull()
  })

  it('lifts a ban', async () => {
    await db.update(userBans).set({ liftedAt: Date.now() }).where(eq(userBans.id, 'ban-1'))

    const result = await db.select().from(userBans).where(eq(userBans.id, 'ban-1'))
    expect(result[0]?.liftedAt).not.toBeNull()
  })
})

// ============================================================
// V3: New column tests
// ============================================================

describe('V3: simulations new columns', () => {
  it('stores configHash and weaponConfig', async () => {
    const weaponConfig = JSON.stringify({ weapons: ['bolt_rifle'], rules: ['sustained_1'] })
    await db.insert(simulations).values({
      id: 'sim-v3',
      userId: 'user-1',
      attackerContentId: 'a1',
      attackerName: 'Attacker',
      defenderContentId: 'd1',
      defenderName: 'Defender',
      result: '{}',
      configHash: 'abc123hash',
      weaponConfig,
      createdAt: Date.now(),
    })

    const result = await db.select().from(simulations).where(eq(simulations.id, 'sim-v3'))
    expect(result[0]?.configHash).toBe('abc123hash')
    expect(result[0]?.weaponConfig).toBe(weaponConfig)
  })
})

describe('V3: lists new columns', () => {
  it('stores detachment, description, battleSize, syncedAt', async () => {
    await db.insert(lists).values({
      id: 'list-v3',
      userId: 'user-1',
      faction: 'Space Marines',
      name: 'Blood Angels List',
      totalPts: 2000,
      detachment: 'Gladius Task Force',
      description: 'My GT list',
      battleSize: 2000,
      syncedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const result = await db.select().from(lists).where(eq(lists.id, 'list-v3'))
    expect(result[0]?.detachment).toBe('Gladius Task Force')
    expect(result[0]?.description).toBe('My GT list')
    expect(result[0]?.battleSize).toBe(2000)
    expect(result[0]?.syncedAt).not.toBeNull()
  })
})

describe('V3: listUnits new columns', () => {
  it('stores warlord flag and enhancement fields', async () => {
    await db.insert(listUnits).values({
      id: 'lu-v3',
      listId: 'list-v3',
      unitContentId: 'captain-1',
      unitName: 'Captain',
      unitPoints: 100,
      count: 1,
      isWarlord: 1,
      enhancementId: 'enh-1',
      enhancementName: 'Artificer Armour',
      enhancementCost: 25,
    })

    const result = await db.select().from(listUnits).where(eq(listUnits.id, 'lu-v3'))
    expect(result[0]?.isWarlord).toBe(1)
    expect(result[0]?.enhancementId).toBe('enh-1')
    expect(result[0]?.enhancementName).toBe('Artificer Armour')
    expect(result[0]?.enhancementCost).toBe(25)
  })
})

describe('V3: matches new columns', () => {
  it('stores extended match setup data', async () => {
    await db.insert(matches).values({
      id: 'match-v3',
      userId: 'user-1',
      opponentFaction: 'Orks',
      mission: 'Take and Hold',
      opponentName: 'Bob',
      opponentDetachment: 'Waaagh! Tribe',
      yourFaction: 'Space Marines',
      yourDetachment: 'Gladius Task Force',
      terrainLayout: 'Layout 3',
      deploymentZone: 'Tipping Point',
      attackerDefender: 'YOU_ATTACK',
      whoGoesFirst: 'YOU',
      date: Date.now(),
      location: 'Local Game Store',
      tournamentName: 'Monthly RTT',
      createdAt: Date.now(),
    })

    const result = await db.select().from(matches).where(eq(matches.id, 'match-v3'))
    expect(result[0]?.opponentName).toBe('Bob')
    expect(result[0]?.yourDetachment).toBe('Gladius Task Force')
    expect(result[0]?.attackerDefender).toBe('YOU_ATTACK')
    expect(result[0]?.location).toBe('Local Game Store')
  })
})

describe('V3: turns new columns', () => {
  it('stores per-player CP and scoring data', async () => {
    await db.insert(turns).values({
      id: 'turn-v3',
      matchId: 'match-v3',
      turnNumber: 1,
      yourCpStart: 0,
      yourCpGained: 1,
      yourCpSpent: 1,
      theirCpStart: 0,
      theirCpGained: 1,
      theirCpSpent: 0,
      yourPrimary: 4,
      theirPrimary: 4,
      yourSecondary: 3,
      theirSecondary: 2,
      yourUnitsDestroyed: JSON.stringify(['Intercessor Squad']),
      theirUnitsDestroyed: JSON.stringify(['Boyz']),
      createdAt: Date.now(),
    })

    const result = await db.select().from(turns).where(eq(turns.id, 'turn-v3'))
    expect(result[0]?.yourCpGained).toBe(1)
    expect(result[0]?.yourPrimary).toBe(4)
    expect(result[0]?.theirSecondary).toBe(2)
    expect(JSON.parse(result[0]?.yourUnitsDestroyed ?? '[]')).toEqual(['Intercessor Squad'])
  })
})

describe('V3: tournaments new columns', () => {
  it('stores rich event metadata', async () => {
    await db.insert(tournaments).values({
      id: 'tourn-v3',
      toUserId: 'user-1',
      name: 'Regional GT',
      eventDate: Date.now(),
      format: '2000pts',
      totalRounds: 5,
      description: 'A great tournament',
      startTime: '10:00',
      latitude: 40.7128,
      longitude: -74.006,
      missionPool: JSON.stringify(['Take and Hold', 'Supply Drop']),
      requirePhotos: 1,
      includeTwists: 0,
      includeChallenger: 1,
      maxPlayers: 32,
      createdAt: Date.now(),
    })

    const result = await db.select().from(tournaments).where(eq(tournaments.id, 'tourn-v3'))
    expect(result[0]?.description).toBe('A great tournament')
    expect(result[0]?.latitude).toBeCloseTo(40.7128)
    expect(result[0]?.maxPlayers).toBe(32)
    expect(result[0]?.requirePhotos).toBe(1)
  })
})

describe('V3: tournamentPlayers listId', () => {
  it('stores listId reference', async () => {
    await db.insert(tournamentPlayers).values({
      id: 'tp-v3',
      tournamentId: 'tourn-v3',
      userId: 'user-1',
      displayName: 'Alice',
      faction: 'Space Marines',
      listId: 'list-v3',
      listLocked: 1,
      checkedIn: 1,
      dropped: 0,
      registeredAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.id, 'tp-v3'))
    expect(result[0]?.listId).toBe('list-v3')
  })
})

// ============================================================
// Phase 3: ranking metrics, passthrough events, BCP registration
// ============================================================

describe('rankingMetric', () => {
  it('inserts and retrieves a ranking metric', async () => {
    await db.insert(rankingMetric).values({
      id: 'wins',
      key: 'wins',
      label: 'Wins',
      description: 'Number of wins',
    })

    const result = await db.select().from(rankingMetric).where(eq(rankingMetric.id, 'wins'))
    expect(result).toHaveLength(1)
    expect(result[0]?.label).toBe('Wins')
    expect(result[0]?.key).toBe('wins')
  })

  it('enforces unique key constraint', async () => {
    await expect(
      db.insert(rankingMetric).values({ id: 'wins-dupe', key: 'wins', label: 'Wins Dupe' }),
    ).rejects.toThrow()
  })
})

describe('tournamentPairingMetric', () => {
  it('inserts and retrieves a pairing metric stack entry', async () => {
    await db.insert(tournamentPairingMetric).values({
      id: 'tpm-1',
      tournamentId: 'tourn-1',
      rankingMetricId: 'wins',
      sortOrder: 1,
      enabled: true,
    })

    const result = await db
      .select()
      .from(tournamentPairingMetric)
      .where(eq(tournamentPairingMetric.id, 'tpm-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.sortOrder).toBe(1)
    expect(result[0]?.enabled).toBe(true)
  })

  it('enforces unique (tournament_id, ranking_metric_id) constraint', async () => {
    await expect(
      db.insert(tournamentPairingMetric).values({
        id: 'tpm-dupe',
        tournamentId: 'tourn-1',
        rankingMetricId: 'wins',
        sortOrder: 2,
        enabled: true,
      }),
    ).rejects.toThrow()
  })
})

describe('tournamentPlacingMetric', () => {
  it('inserts and retrieves a placing metric stack entry', async () => {
    await db.insert(tournamentPlacingMetric).values({
      id: 'tplm-1',
      tournamentId: 'tourn-1',
      rankingMetricId: 'wins',
      sortOrder: 1,
      enabled: true,
    })

    const result = await db
      .select()
      .from(tournamentPlacingMetric)
      .where(eq(tournamentPlacingMetric.id, 'tplm-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.sortOrder).toBe(1)
  })
})

describe('passthroughEvent', () => {
  it('inserts and retrieves a BCP passthrough event', async () => {
    await db.insert(passthroughEvent).values({
      id: 'pe-1',
      bcpEventId: 'bcp-evt-123',
      name: 'Regional GT 2026',
      eventDate: 1780000000,
      location: 'Chicago, IL',
      gameSystem: 'Warhammer 40,000',
      playerCount: 64,
      registrationUrl: 'https://bcp.io/register/123',
      lastSyncedAt: Date.now(),
    })

    const result = await db.select().from(passthroughEvent).where(eq(passthroughEvent.id, 'pe-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Regional GT 2026')
    expect(result[0]?.playerCount).toBe(64)
    expect(result[0]?.bcpEventId).toBe('bcp-evt-123')
  })

  it('enforces unique bcp_event_id constraint', async () => {
    await expect(
      db.insert(passthroughEvent).values({
        id: 'pe-dupe',
        bcpEventId: 'bcp-evt-123',
        name: 'Duplicate',
        lastSyncedAt: Date.now(),
      }),
    ).rejects.toThrow()
  })
})

describe('bcpRegistration', () => {
  it('inserts and retrieves a BCP registration with consent', async () => {
    const now = Date.now()
    await db.insert(bcpRegistration).values({
      id: 'bcpreg-1',
      userId: 'user-1',
      bcpEventId: 'bcp-evt-123',
      listId: 'list-v3',
      method: 'server',
      status: 'submitted',
      consentAt: now,
      submittedAt: now,
    })

    const result = await db.select().from(bcpRegistration).where(eq(bcpRegistration.id, 'bcpreg-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.method).toBe('server')
    expect(result[0]?.status).toBe('submitted')
    expect(result[0]?.consentAt).toBe(now)
  })
})

describe('tournamentPlayers Phase 3 columns', () => {
  it('stores placement on an existing player', async () => {
    // tp-1 was inserted in an earlier describe block (tourn-1 / user-1)
    await db.update(tournamentPlayers).set({ placement: 1 }).where(eq(tournamentPlayers.id, 'tp-1'))

    const result = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.id, 'tp-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.placement).toBe(1)
  })
})

// ============================================================
// V2: Cascading delete tests
// ============================================================

describe('V2: Cascading deletes', () => {
  // Set up complete data chains for user-3
  beforeAll(async () => {
    // user-3 → diceSets → diceRollingSessions → rolls
    await db.insert(diceSets).values({
      id: 'c-set-1',
      userId: 'user-3',
      name: 'Cascade Dice',
      createdAt: Date.now(),
    })
    await db.insert(diceRollingSessions).values({
      id: 'c-sess-1',
      userId: 'user-3',
      diceSetId: 'c-set-1',
      createdAt: Date.now(),
    })
    await db.insert(rolls).values({
      id: 'c-roll-1',
      sessionId: 'c-sess-1',
      pipValues: '[1,2,3]',
      createdAt: Date.now(),
    })

    // user-3 → simulations
    await db.insert(simulations).values({
      id: 'c-sim-1',
      userId: 'user-3',
      attackerContentId: 'x',
      attackerName: 'X',
      defenderContentId: 'y',
      defenderName: 'Y',
      result: '{}',
      createdAt: Date.now(),
    })

    // user-3 → matches → turns
    await db.insert(matches).values({
      id: 'c-match-1',
      userId: 'user-3',
      opponentFaction: 'Test',
      mission: 'M1',
      createdAt: Date.now(),
    })
    await db.insert(turns).values({
      id: 'c-turn-1',
      matchId: 'c-match-1',
      turnNumber: 1,
      createdAt: Date.now(),
    })

    // user-3 → tournaments → tournament_players, rounds → pairings
    await db.insert(tournaments).values({
      id: 'c-tourn-1',
      toUserId: 'user-3',
      name: 'Cascade GT',
      eventDate: Date.now(),
      format: 'GT',
      totalRounds: 3,
      createdAt: Date.now(),
    })
    await db.insert(tournamentPlayers).values({
      id: 'c-tp-1',
      tournamentId: 'c-tourn-1',
      userId: 'user-3',
      displayName: 'C',
      faction: 'X',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })
    await db.insert(tournamentPlayers).values({
      id: 'c-tp-2',
      tournamentId: 'c-tourn-1',
      userId: 'user-2',
      displayName: 'D',
      faction: 'Y',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })
    await db.insert(rounds).values({
      id: 'c-round-1',
      tournamentId: 'c-tourn-1',
      roundNumber: 1,
      createdAt: Date.now(),
    })
    await db.insert(pairings).values({
      id: 'c-pairing-1',
      roundId: 'c-round-1',
      tableNumber: 1,
      player1Id: 'c-tp-1',
      player2Id: 'c-tp-2',
      mission: 'M1',
      createdAt: Date.now(),
    })

    // user-3 → playerGlicko → glickoHistory
    await db.insert(playerGlicko).values({
      id: 'c-glicko-1',
      userId: 'user-3',
      playerName: 'C',
      updatedAt: Date.now(),
    })
    await db.insert(glickoHistory).values({
      id: 'c-gh-1',
      playerId: 'c-glicko-1',
      ratingPeriod: 'p1',
      ratingBefore: 1500,
      rdBefore: 350,
      ratingAfter: 1600,
      rdAfter: 200,
      volatilityAfter: 0.06,
      delta: 100,
      gamesInPeriod: 3,
      recordedAt: Date.now(),
    })

    // Delete user-3 — should cascade through everything
    await db.delete(authUsers).where(eq(authUsers.id, 'user-3'))
  })

  it('cascade: user -> diceSets -> diceRollingSessions -> rolls', async () => {
    const sets = await db.select().from(diceSets).where(eq(diceSets.userId, 'user-3'))
    expect(sets).toHaveLength(0)

    const sessions = await db
      .select()
      .from(diceRollingSessions)
      .where(eq(diceRollingSessions.id, 'c-sess-1'))
    expect(sessions).toHaveLength(0)

    const rollsResult = await db.select().from(rolls).where(eq(rolls.id, 'c-roll-1'))
    expect(rollsResult).toHaveLength(0)
  })

  it('cascade: user -> matches -> turns', async () => {
    const matchesResult = await db.select().from(matches).where(eq(matches.id, 'c-match-1'))
    expect(matchesResult).toHaveLength(0)

    const turnsResult = await db.select().from(turns).where(eq(turns.id, 'c-turn-1'))
    expect(turnsResult).toHaveLength(0)
  })

  it('cascade: user -> tournaments -> rounds -> pairings', async () => {
    const tournsResult = await db.select().from(tournaments).where(eq(tournaments.id, 'c-tourn-1'))
    expect(tournsResult).toHaveLength(0)

    const roundsResult = await db.select().from(rounds).where(eq(rounds.id, 'c-round-1'))
    expect(roundsResult).toHaveLength(0)

    const pairingsResult = await db.select().from(pairings).where(eq(pairings.id, 'c-pairing-1'))
    expect(pairingsResult).toHaveLength(0)
  })

  it('cascade: list -> listUnits', async () => {
    // Create fresh list data to test list -> listUnits cascade in isolation
    await db.insert(lists).values({
      id: 'list-cascade',
      userId: 'user-1',
      faction: 'T',
      name: 'CascadeList',
      totalPts: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await db.insert(listUnits).values({
      id: 'lu-cascade',
      listId: 'list-cascade',
      unitContentId: 'u1',
      unitName: 'U',
      unitPoints: 50,
    })

    // Delete the list — units should cascade
    await db.delete(lists).where(eq(lists.id, 'list-cascade'))

    const unitsResult = await db.select().from(listUnits).where(eq(listUnits.id, 'lu-cascade'))
    expect(unitsResult).toHaveLength(0)
  })

  it('cascade: match -> matchSecondaries', async () => {
    // match-1 was deleted via user-3 cascade is gone, but match-2 exists (user-1)
    // Let's create a fresh match with secondaries to test
    await db.insert(matches).values({
      id: 'c-match-sec',
      userId: 'user-1',
      opponentFaction: 'T',
      mission: 'M',
      createdAt: Date.now(),
    })
    await db.insert(matchSecondaries).values({
      id: 'c-sec-1',
      matchId: 'c-match-sec',
      player: 'YOUR',
      secondaryName: 'Assassination',
    })
    await db.delete(matches).where(eq(matches.id, 'c-match-sec'))

    const result = await db
      .select()
      .from(matchSecondaries)
      .where(eq(matchSecondaries.id, 'c-sec-1'))
    expect(result).toHaveLength(0)
  })

  it('cascade: turn -> stratagemLog', async () => {
    await db.insert(matches).values({
      id: 'c-match-strat',
      userId: 'user-1',
      opponentFaction: 'T',
      mission: 'M',
      createdAt: Date.now(),
    })
    await db.insert(turns).values({
      id: 'c-turn-strat',
      matchId: 'c-match-strat',
      turnNumber: 1,
      createdAt: Date.now(),
    })
    await db.insert(stratagemLog).values({
      id: 'c-strat-1',
      turnId: 'c-turn-strat',
      player: 'YOUR',
      stratagemName: 'Fire Discipline',
      cpCost: 1,
    })
    await db.delete(matches).where(eq(matches.id, 'c-match-strat'))

    const result = await db.select().from(stratagemLog).where(eq(stratagemLog.id, 'c-strat-1'))
    expect(result).toHaveLength(0)
  })

  it('cascade: tournament -> tournamentCards and tournamentAwards', async () => {
    await db.insert(tournaments).values({
      id: 'c-tourn-cards',
      toUserId: 'user-1',
      name: 'CascadeCards',
      eventDate: Date.now(),
      format: 'GT',
      totalRounds: 3,
      createdAt: Date.now(),
    })
    await db.insert(tournamentPlayers).values({
      id: 'c-tp-cards',
      tournamentId: 'c-tourn-cards',
      userId: 'user-1',
      displayName: 'X',
      faction: 'Y',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })
    await db.insert(tournamentCards).values({
      id: 'c-card-1',
      tournamentId: 'c-tourn-cards',
      playerId: 'c-tp-cards',
      issuedBy: 'user-1',
      cardType: 'YELLOW',
      reason: 'Test',
      issuedAt: Date.now(),
    })
    await db.insert(tournamentAwards).values({
      id: 'c-award-1',
      tournamentId: 'c-tourn-cards',
      name: 'Best Painted',
      recipientId: 'c-tp-cards',
      createdAt: Date.now(),
    })

    await db.delete(tournaments).where(eq(tournaments.id, 'c-tourn-cards'))

    const cards = await db.select().from(tournamentCards).where(eq(tournamentCards.id, 'c-card-1'))
    expect(cards).toHaveLength(0)

    const awards = await db
      .select()
      .from(tournamentAwards)
      .where(eq(tournamentAwards.id, 'c-award-1'))
    expect(awards).toHaveLength(0)
  })

  it('non-cascading: deleting a tournament player does NOT delete the user', async () => {
    // user-2 was a player (c-tp-2) in c-tourn-1 — that got cascade-deleted with user-3.
    // But user-2 itself should still exist.
    const userResult = await db.select().from(authUsers).where(eq(authUsers.id, 'user-2'))
    expect(userResult).toHaveLength(1)
    expect(userResult[0]?.name).toBe('Opponent User')
  })

  describe('list (v2)', () => {
    it('inserts and reads a list row', async () => {
      await db.insert(list).values({
        id: 'v2-list-1',
        userId: 'user-1',
        name: 'My Test List',
        edition: '11th',
        battleSize: 'Strike Force',
        totalPoints: 0,
        source: 'list-builder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      const rows = await db.select().from(list).where(eq(list.id, 'v2-list-1'))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.name).toBe('My Test List')
      expect(rows[0]?.edition).toBe('11th')
    })

    it('cascades delete from list to list_unit', async () => {
      await db.insert(list).values({
        id: 'v2-list-cascade',
        userId: 'user-1',
        name: 'Cascade Test',
        edition: '11th',
        battleSize: 'unknown',
        totalPoints: 0,
        source: 'list-builder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await db.insert(listUnit).values({
        id: 'v2-unit-cascade',
        listId: 'v2-list-cascade',
        isWarlord: false,
        points: 100,
      })
      await db.delete(list).where(eq(list.id, 'v2-list-cascade'))
      const units = await db.select().from(listUnit).where(eq(listUnit.id, 'v2-unit-cascade'))
      expect(units).toHaveLength(0)
    })
  })

  describe('listUnit (v2)', () => {
    it('inserts a unit and reads it back', async () => {
      await db.insert(list).values({
        id: 'v2-list-for-unit',
        userId: 'user-1',
        name: 'Unit Test List',
        edition: '11th',
        battleSize: 'unknown',
        totalPoints: 0,
        source: 'list-builder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await db.insert(listUnit).values({
        id: 'v2-unit-1',
        listId: 'v2-list-for-unit',
        isWarlord: true,
        points: 200,
      })
      const rows = await db.select().from(listUnit).where(eq(listUnit.id, 'v2-unit-1'))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.isWarlord).toBe(true)
      expect(rows[0]?.points).toBe(200)
    })

    it('supports self-referential attachment (attachedToUnitId)', async () => {
      await db.insert(listUnit).values({
        id: 'v2-bodyguard-1',
        listId: 'v2-list-for-unit',
        isWarlord: false,
        points: 150,
      })
      await db.insert(listUnit).values({
        id: 'v2-character-1',
        listId: 'v2-list-for-unit',
        isWarlord: false,
        points: 80,
        attachedToUnitId: 'v2-bodyguard-1',
        attachRole: 'leader',
      })
      const rows = await db.select().from(listUnit).where(eq(listUnit.id, 'v2-character-1'))
      expect(rows[0]?.attachedToUnitId).toBe('v2-bodyguard-1')
      expect(rows[0]?.attachRole).toBe('leader')
    })

    it('rejects insert with invalid list_id FK', async () => {
      await expect(
        db.insert(listUnit).values({
          id: 'v2-unit-bad-fk',
          listId: 'nonexistent-list',
          isWarlord: false,
          points: 0,
        }),
      ).rejects.toThrow()
    })
  })

  describe('listUnitLoadout (v2)', () => {
    it('inserts a loadout and cascades delete to weapons', async () => {
      await db.insert(listUnitLoadout).values({
        id: 'v2-loadout-1',
        listUnitId: 'v2-unit-1',
        modelCount: 5,
      })
      await db.insert(listUnitLoadoutWeapon).values({
        id: 'v2-weapon-1',
        loadoutId: 'v2-loadout-1',
        count: 1,
      })
      const loadouts = await db
        .select()
        .from(listUnitLoadout)
        .where(eq(listUnitLoadout.id, 'v2-loadout-1'))
      expect(loadouts).toHaveLength(1)
      expect(loadouts[0]?.modelCount).toBe(5)

      // Cascade: deleting loadout removes weapon
      await db.delete(listUnitLoadout).where(eq(listUnitLoadout.id, 'v2-loadout-1'))
      const weapons = await db
        .select()
        .from(listUnitLoadoutWeapon)
        .where(eq(listUnitLoadoutWeapon.id, 'v2-weapon-1'))
      expect(weapons).toHaveLength(0)
    })
  })

  // Phase 3: simulation cascade chain
  describe('simulation (Phase 3)', () => {
    it('inserts a simulation with weapon + modifier rows', async () => {
      await db.insert(simulation).values({
        id: 'p3-sim-1',
        userId: 'user-1',
        attackerName: 'Intercessors',
        defenderName: 'Ork Boyz',
        expectedWounds: 2.5,
        expectedModelsRemoved: 1.2,
        survivors: 8.8,
        worstWounds: 0,
        worstModels: 0,
        bestWounds: 8,
        bestModels: 4,
        createdAt: Date.now(),
      })
      await db.insert(simulationWeapon).values({
        id: 'p3-weapon-1',
        simulationId: 'p3-sim-1',
        profileKind: 'ranged',
        weaponName: 'Bolt Rifle',
        modelCount: 10,
        weaponsPerModel: 1,
        attacksPerWeapon: 2,
        totalAttacks: 20,
        expectedWounds: 2.5,
        expectedModelsRemoved: 1.2,
      })
      await db.insert(simulationModifier).values({
        id: 'p3-mod-1',
        simulationId: 'p3-sim-1',
        side: 'ATTACK',
        source: 'weapon_ability',
        key: 'LETHAL_HITS',
        value: null,
      })

      const sims = await db.select().from(simulation).where(eq(simulation.id, 'p3-sim-1'))
      expect(sims).toHaveLength(1)
      expect(sims[0]?.attackerName).toBe('Intercessors')
      expect(sims[0]?.expectedWounds).toBeCloseTo(2.5)
    })

    it('cascade: simulation -> simulation_weapon + simulation_modifier', async () => {
      await db.delete(simulation).where(eq(simulation.id, 'p3-sim-1'))

      const weapons = await db
        .select()
        .from(simulationWeapon)
        .where(eq(simulationWeapon.id, 'p3-weapon-1'))
      expect(weapons).toHaveLength(0)

      const mods = await db
        .select()
        .from(simulationModifier)
        .where(eq(simulationModifier.id, 'p3-mod-1'))
      expect(mods).toHaveLength(0)
    })

    it('attacker_unit_id set to NULL on list_unit delete (SET NULL)', async () => {
      await db.insert(list).values({
        id: 'p3-list-1',
        userId: 'user-1',
        name: 'P3 List',
        edition: '11th',
        battleSize: 'unknown',
        totalPoints: 0,
        source: 'list-builder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await db.insert(listUnit).values({
        id: 'p3-lu-1',
        listId: 'p3-list-1',
        isWarlord: false,
        points: 90,
      })
      await db.insert(simulation).values({
        id: 'p3-sim-2',
        userId: 'user-1',
        attackerUnitId: 'p3-lu-1',
        attackerName: 'Intercessors',
        defenderName: 'Boyz',
        expectedWounds: 1,
        expectedModelsRemoved: 0.5,
        survivors: 9.5,
        worstWounds: 0,
        worstModels: 0,
        bestWounds: 4,
        bestModels: 2,
        createdAt: Date.now(),
      })

      await db.delete(listUnit).where(eq(listUnit.id, 'p3-lu-1'))

      const sims = await db.select().from(simulation).where(eq(simulation.id, 'p3-sim-2'))
      expect(sims).toHaveLength(1)
      expect(sims[0]?.attackerUnitId).toBeNull()
    })
  })
})
