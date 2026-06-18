# Turso (libSQL/SQLite) — Server Database Schema

> Source: `packages/db/src/schema.ts`
> ORM: Drizzle
> Engine: SQLite via Turso (HTTP edge)
> Single database instance shared by all Workers

---

## Table Summary

| # | Table | Domain | Parent FK | Cascade Delete |
|---|-------|--------|-----------|----------------|
| 1 | `user` | Auth | — | — |
| 2 | `session` | Auth | user.id | Yes |
| 3 | `account` | Auth | user.id | Yes |
| 4 | `verification` | Auth | — | — |
| 5 | `dice_sets` | NoCheat | user.id | Yes |
| 6 | `sessions` | NoCheat | user.id, dice_sets.id | Yes |
| 7 | `rolls` | NoCheat | sessions.id | Yes |
| 8 | `training_examples` | NoCheat | user.id, dice_sets.id | Yes |
| 9 | `training_frames` | NoCheat | user.id, dice_sets.id | Yes |
| 10 | `simulations` | Versus | user.id | Yes |
| 11 | `lists` | ListBuilder | user.id | Yes |
| 12 | `list_units` | ListBuilder | lists.id | Yes |
| 13 | `unit_ratings` | ListBuilder | — | — |
| 14 | `matches` | GameTracker | user.id | Yes |
| 15 | `turns` | GameTracker | matches.id | Yes |
| 16 | `match_secondaries` | GameTracker | matches.id | Yes |
| 17 | `stratagem_log` | GameTracker | turns.id | Yes |
| 18 | `tournaments` | Tournament | user.id | Yes |
| 19 | `tournament_players` | Tournament | tournaments.id, user.id | Yes |
| 20 | `rounds` | Tournament | tournaments.id | Yes |
| 21 | `pairings` | Tournament | rounds.id, tournament_players.id | Yes |
| 22 | `tournament_cards` | Tournament | tournaments.id, tournament_players.id, user.id | Yes |
| 23 | `tournament_awards` | Tournament | tournaments.id, tournament_players.id | Yes (set null on recipient) |
| 24 | `player_elo` | ELO | user.id | Yes |
| 25 | `elo_history` | ELO | user.id, pairings.id, user.id (opponent) | Yes |
| 26 | `imported_tournament_results` | NewMeta | user.id | Yes |
| 27 | `player_glicko` | Glicko-2 | user.id (nullable) | Yes |
| 28 | `glicko_history` | Glicko-2 | player_glicko.id | Yes |
| 29 | `dim_faction` | Meta Dims | — | — |
| 30 | `dim_subfaction` | Meta Dims | dim_faction.id | — |
| 31 | `dim_detachment` | Meta Dims | dim_faction.id, dim_subfaction.id | — |
| 32 | `dim_for_type` | Meta Dims | — | — |
| 33 | `dim_granularity` | Meta Dims | — | — |
| 34 | `dim_dataslate` | Meta Dims | — | — |
| 35 | `dim_tournament_pack` | Meta Dims | — | — |
| 36 | `dim_edition` | Meta Dims | — | — |
| 37 | `dim_region` | Meta Dims | — | — |
| 38 | `meta_events` | Meta 3NF | dim_region.id, dim_faction.id (win) | — |
| 39 | `meta_event_players` | Meta 3NF | meta_events.id, dim_faction.id | Yes (on event) |
| 40 | `meta_pairings` | Meta 3NF | meta_events.id, meta_event_players.id x2 | Yes |
| 41 | `meta_event_win_distribution` | Meta 3NF | meta_events.id | Yes |
| 42 | `meta_event_placements` | Meta 3NF | meta_events.id, dim_faction.id | Yes |
| 43 | `meta_for` | Meta Cube | dim_for_type.id, dim_dataslate.id, dim_tournament_pack.id, dim_edition.id | — |
| 44 | `meta_top` | Meta Cube | dim_granularity.id, dim_faction.id, meta_for.id | Yes (on meta_for) |
| 45 | `fact_game_results` | Meta Cube | meta_events.id, meta_event_players.id x2, dim_faction.id x2 | Yes |
| 46 | `meta_cube_status` | Meta Cube | — | — |
| 47 | `user_bans` | Admin | user.id x2 | Yes (on banned user) |
| 48 | `bcp_scrape_jobs` | BCP Scraper | — | — |
| 49 | `ingest_jobs` | ContentIngestor | — | — |

**Total: 49 tables**

---

## Auth Tables (Better Auth managed)

### `user`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| email | TEXT | NOT NULL, UNIQUE |
| email_verified | INTEGER (bool) | NOT NULL, default false |
| image | TEXT | nullable |
| username | TEXT | UNIQUE |
| display_username | TEXT | UNIQUE |
| created_at | INTEGER (timestamp) | NOT NULL |
| updated_at | INTEGER (timestamp) | NOT NULL |

### `session`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| token | TEXT | NOT NULL, UNIQUE |
| expires_at | INTEGER (timestamp) | NOT NULL |
| ip_address | TEXT | nullable |
| user_agent | TEXT | nullable |
| created_at | INTEGER (timestamp) | NOT NULL |
| updated_at | INTEGER (timestamp) | NOT NULL |

**Indexes:** `idx_session_user_id(user_id)`

### `account`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| account_id | TEXT | NOT NULL |
| provider_id | TEXT | NOT NULL |
| access_token | TEXT | nullable |
| refresh_token | TEXT | nullable |
| access_token_expires_at | INTEGER (timestamp) | nullable |
| refresh_token_expires_at | INTEGER (timestamp) | nullable |
| scope | TEXT | nullable |
| password | TEXT | nullable |
| created_at | INTEGER (timestamp) | NOT NULL |
| updated_at | INTEGER (timestamp) | NOT NULL |

**Indexes:** `idx_account_user_id(user_id)`

### `verification`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| identifier | TEXT | NOT NULL |
| value | TEXT | NOT NULL |
| expires_at | INTEGER (timestamp) | NOT NULL |
| created_at | INTEGER (timestamp) | nullable |
| updated_at | INTEGER (timestamp) | nullable |

**Indexes:** `idx_verification_identifier(identifier)`

---

## NoCheat Tables (Dice Cheat Detection)

### `dice_sets`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| name | TEXT | NOT NULL |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_dice_sets_user_id(user_id)`

### `sessions` (dice rolling sessions)
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| dice_set_id | TEXT | NOT NULL, FK → dice_sets.id CASCADE |
| opponent_name | TEXT | nullable |
| z_score | REAL | nullable |
| is_loaded | INTEGER | nullable |
| photo_url | TEXT | nullable |
| created_at | INTEGER | NOT NULL |
| closed_at | INTEGER | nullable |

**Indexes:** `idx_sessions_user_id(user_id)`, `idx_sessions_dice_set_id(dice_set_id)`

### `rolls`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| session_id | TEXT | NOT NULL, FK → sessions.id CASCADE |
| pip_values | TEXT | NOT NULL (comma-separated values) |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_rolls_session_id(session_id)`

### `training_examples`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| dice_set_id | TEXT | NOT NULL, FK → dice_sets.id CASCADE |
| label | INTEGER | NOT NULL (1-6 pip count, 0 = not a die) |
| guess | INTEGER | nullable (CV pipeline prediction) |
| confidence | REAL | nullable (kNN confidence 0-1) |
| features | TEXT | NOT NULL (JSON array of feature vector) |
| image_url | TEXT | nullable (R2 URL for ROI image) |
| is_correct | INTEGER | nullable (1 if label === guess, 0 otherwise) |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_training_examples_user_id(user_id)`, `idx_training_examples_dice_set_id(dice_set_id)`, `idx_training_examples_label(label)`

### `training_frames`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| dice_set_id | TEXT | NOT NULL, FK → dice_sets.id CASCADE |
| image_url | TEXT | NOT NULL |
| frame_width | INTEGER | NOT NULL |
| frame_height | INTEGER | NOT NULL |
| boxes_json | TEXT | NOT NULL (JSON: [{x, y, w, h, label}] normalized 0-1) |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_training_frames_user_id(user_id)`, `idx_training_frames_dice_set_id(dice_set_id)`

---

## Versus Tables (Combat Simulator)

### `simulations`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| attacker_content_id | TEXT | NOT NULL (game content ref, not FK) |
| attacker_name | TEXT | NOT NULL |
| defender_content_id | TEXT | NOT NULL (game content ref, not FK) |
| defender_name | TEXT | NOT NULL |
| result | TEXT | NOT NULL (JSON — full simulation output) |
| config_hash | TEXT | nullable (hash of weapons+rules+models+leader) |
| weapon_config | TEXT | nullable (JSON — selected weapons + rules config) |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_simulations_user_id(user_id)`

---

## List Builder Tables

### `lists`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| faction | TEXT | NOT NULL (user-entered, not validated) |
| name | TEXT | NOT NULL |
| total_pts | INTEGER | NOT NULL, default 0 |
| detachment | TEXT | nullable |
| description | TEXT | nullable |
| battle_size | INTEGER | nullable (500/1000/2000/3000) |
| synced_at | INTEGER | nullable |
| created_at | INTEGER | NOT NULL |
| updated_at | INTEGER | NOT NULL |

**Indexes:** `idx_lists_user_id(user_id)`

### `list_units`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| list_id | TEXT | NOT NULL, FK → lists.id CASCADE |
| unit_content_id | TEXT | NOT NULL (game content ref, not FK) |
| unit_name | TEXT | NOT NULL (denormalized for offline display) |
| unit_points | INTEGER | NOT NULL (denormalized) |
| count | INTEGER | NOT NULL, default 1 |
| model_count | INTEGER | nullable |
| is_warlord | INTEGER | NOT NULL, default 0 |
| enhancement_id | TEXT | nullable |
| enhancement_name | TEXT | nullable |
| enhancement_cost | INTEGER | nullable |

**Indexes:** `idx_list_units_list_id(list_id)`

### `unit_ratings`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| unit_content_id | TEXT | NOT NULL (game content ref, not FK) |
| rating | TEXT | NOT NULL (S/A/B/C/D) |
| win_contrib | REAL | NOT NULL |
| pts_eff | REAL | NOT NULL |
| meta_window | TEXT | NOT NULL (e.g., "2025-Q2") |
| computed_at | INTEGER | NOT NULL |

**Indexes:** `idx_unit_ratings_unit_content_id(unit_content_id)`, `idx_unit_ratings_meta_window(meta_window)`
**Unique:** `uq_unit_ratings_unit_window(unit_content_id, meta_window)`

---

## Game Tracker Tables

### `matches`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| list_id | TEXT | nullable (optional ref to lists table) |
| opponent_faction | TEXT | NOT NULL (user-entered) |
| mission | TEXT | NOT NULL |
| result | TEXT | nullable (WIN/LOSS/DRAW, null while in progress) |
| your_final_score | INTEGER | nullable |
| their_final_score | INTEGER | nullable |
| is_tournament | INTEGER | NOT NULL, default 0 |
| opponent_name | TEXT | nullable |
| opponent_detachment | TEXT | nullable |
| your_faction | TEXT | nullable |
| your_detachment | TEXT | nullable |
| terrain_layout | TEXT | nullable |
| deployment_zone | TEXT | nullable |
| twist_cards | TEXT | nullable (JSON) |
| challenger_cards | TEXT | nullable (JSON) |
| require_photos | INTEGER | NOT NULL, default 0 |
| attacker_defender | TEXT | nullable (YOU_ATTACK/YOU_DEFEND) |
| who_goes_first | TEXT | nullable (YOU/THEM) |
| date | INTEGER | nullable |
| location | TEXT | nullable |
| tournament_name | TEXT | nullable |
| tournament_id | TEXT | nullable |
| created_at | INTEGER | NOT NULL |
| closed_at | INTEGER | nullable |
| hidden_at | INTEGER | nullable |

**Indexes:** `idx_matches_user_id(user_id)`

### `turns`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| match_id | TEXT | NOT NULL, FK → matches.id CASCADE |
| turn_number | INTEGER | NOT NULL |
| photo_url | TEXT | nullable |
| your_units_lost | TEXT | NOT NULL, default '[]' (JSON) |
| their_units_lost | TEXT | NOT NULL, default '[]' (JSON) |
| primary_scored | INTEGER | NOT NULL, default 0 |
| secondary_scored | INTEGER | NOT NULL, default 0 |
| cp_spent | INTEGER | NOT NULL, default 0 |
| notes | TEXT | nullable |
| your_cp_start | INTEGER | NOT NULL, default 0 |
| your_cp_gained | INTEGER | NOT NULL, default 1 |
| your_cp_spent | INTEGER | NOT NULL, default 0 |
| their_cp_start | INTEGER | NOT NULL, default 0 |
| their_cp_gained | INTEGER | NOT NULL, default 1 |
| their_cp_spent | INTEGER | NOT NULL, default 0 |
| your_primary | INTEGER | NOT NULL, default 0 |
| their_primary | INTEGER | NOT NULL, default 0 |
| your_secondary | INTEGER | NOT NULL, default 0 |
| their_secondary | INTEGER | NOT NULL, default 0 |
| your_photo_url | TEXT | nullable |
| their_photo_url | TEXT | nullable |
| your_units_destroyed | TEXT | NOT NULL, default '[]' (JSON) |
| their_units_destroyed | TEXT | NOT NULL, default '[]' (JSON) |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_turns_match_id(match_id)`
**Unique:** `uq_turns_match_number(match_id, turn_number)`

### `match_secondaries`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| match_id | TEXT | NOT NULL, FK → matches.id CASCADE |
| player | TEXT | NOT NULL (YOUR/THEIRS) |
| secondary_name | TEXT | NOT NULL |
| vp_per_round | TEXT | NOT NULL, default '[]' (JSON: [r1, r2, r3, r4, r5]) |

**Indexes:** `idx_match_secondaries_match_id(match_id)`

### `stratagem_log`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| turn_id | TEXT | NOT NULL, FK → turns.id CASCADE |
| player | TEXT | NOT NULL (YOUR/THEIRS) |
| stratagem_name | TEXT | NOT NULL |
| cp_cost | INTEGER | NOT NULL, default 1 |

**Indexes:** `idx_stratagem_log_turn_id(turn_id)`

---

## Tournament Tables

### `tournaments`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| to_user_id | TEXT | NOT NULL, FK → user.id CASCADE (organizer) |
| name | TEXT | NOT NULL |
| event_date | INTEGER | NOT NULL |
| location | TEXT | nullable |
| format | TEXT | NOT NULL |
| total_rounds | INTEGER | NOT NULL |
| status | TEXT | NOT NULL, default 'DRAFT' (DRAFT/REGISTRATION/CHECK_IN/IN_PROGRESS/COMPLETE) |
| description | TEXT | nullable |
| image_url | TEXT | nullable |
| external_link | TEXT | nullable |
| start_time | TEXT | nullable (HH:MM format) |
| latitude | REAL | nullable |
| longitude | REAL | nullable |
| mission_pool | TEXT | nullable (JSON: per-round mission assignments) |
| require_photos | INTEGER | NOT NULL, default 0 |
| include_twists | INTEGER | NOT NULL, default 0 |
| include_challenger | INTEGER | NOT NULL, default 0 |
| max_players | INTEGER | nullable |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_tournaments_user_id(to_user_id)`

### `tournament_players`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| tournament_id | TEXT | NOT NULL, FK → tournaments.id CASCADE |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| display_name | TEXT | NOT NULL |
| faction | TEXT | NOT NULL (user-entered) |
| detachment | TEXT | nullable |
| list_text | TEXT | nullable (raw army list, stored verbatim) |
| list_id | TEXT | nullable (FK to lists table, from list-builder sync) |
| list_locked | INTEGER | NOT NULL, default 0 |
| checked_in | INTEGER | NOT NULL, default 0 |
| dropped | INTEGER | NOT NULL, default 0 |
| registered_at | INTEGER | NOT NULL |

**Indexes:** `idx_tournament_players_tourn_id(tournament_id)`, `idx_tournament_players_user_id(user_id)`
**Unique:** `uq_tournament_players_tourn_user(tournament_id, user_id)`

### `rounds`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| tournament_id | TEXT | NOT NULL, FK → tournaments.id CASCADE |
| round_number | INTEGER | NOT NULL |
| status | TEXT | NOT NULL, default 'PENDING' (PENDING/ACTIVE/COMPLETE) |
| start_time | TEXT | nullable |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_rounds_tournament_id(tournament_id)`
**Unique:** `uq_rounds_tourn_number(tournament_id, round_number)`

### `pairings`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| round_id | TEXT | NOT NULL, FK → rounds.id CASCADE |
| table_number | INTEGER | NOT NULL |
| player1_id | TEXT | NOT NULL, FK → tournament_players.id CASCADE |
| player2_id | TEXT | nullable (NULL = bye for player1) |
| mission | TEXT | NOT NULL |
| player1_vp | INTEGER | nullable |
| player2_vp | INTEGER | nullable |
| result | TEXT | nullable (P1_WIN/P2_WIN/DRAW/BYE) |
| reported_by | TEXT | nullable |
| confirmed | INTEGER | NOT NULL, default 0 |
| to_override | INTEGER | NOT NULL, default 0 |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_pairings_round_id(round_id)`, `idx_pairings_player1_id(player1_id)`, `idx_pairings_player2_id(player2_id)`

### `tournament_cards`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| tournament_id | TEXT | NOT NULL, FK → tournaments.id CASCADE |
| player_id | TEXT | NOT NULL, FK → tournament_players.id CASCADE |
| issued_by | TEXT | NOT NULL, FK → user.id CASCADE |
| card_type | TEXT | NOT NULL (YELLOW/RED) |
| reason | TEXT | NOT NULL |
| issued_at | INTEGER | NOT NULL |

**Indexes:** `idx_tournament_cards_tournament_id(tournament_id)`, `idx_tournament_cards_player_id(player_id)`

### `tournament_awards`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| tournament_id | TEXT | NOT NULL, FK → tournaments.id CASCADE |
| name | TEXT | NOT NULL |
| description | TEXT | nullable |
| recipient_id | TEXT | nullable, FK → tournament_players.id SET NULL |
| created_at | INTEGER | NOT NULL |

**Indexes:** `idx_tournament_awards_tournament_id(tournament_id)`

---

## ELO Rating Tables

### `player_elo`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, UNIQUE, FK → user.id CASCADE |
| rating | INTEGER | NOT NULL, default 1200 |
| games_played | INTEGER | NOT NULL, default 0 |
| updated_at | INTEGER | NOT NULL |

### `elo_history`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| pairing_id | TEXT | NOT NULL, FK → pairings.id CASCADE |
| rating_before | INTEGER | NOT NULL |
| rating_after | INTEGER | NOT NULL |
| delta | INTEGER | NOT NULL |
| opponent_id | TEXT | NOT NULL, FK → user.id CASCADE |
| recorded_at | INTEGER | NOT NULL |

**Indexes:** `idx_elo_history_user_id(user_id)`, `idx_elo_history_pairing_id(pairing_id)`, `idx_elo_history_opponent_id(opponent_id)`

---

## Imported Tournament Results

### `imported_tournament_results`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| imported_by | TEXT | NOT NULL, FK → user.id CASCADE |
| event_name | TEXT | NOT NULL |
| event_date | INTEGER | NOT NULL |
| format | TEXT | NOT NULL |
| meta_window | TEXT | NOT NULL |
| raw_data | TEXT | NOT NULL (original CSV stored verbatim) |
| parsed_data | TEXT | NOT NULL (JSON of TournamentRecord[]) |
| imported_at | INTEGER | NOT NULL |

**Indexes:** `idx_imported_results_imported_by(imported_by)`

---

## Glicko-2 Rating Tables (new-meta)

### `player_glicko`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | nullable, FK → user.id CASCADE (null = anonymous import) |
| player_name | TEXT | NOT NULL |
| rating | REAL | NOT NULL, default 1500 |
| rating_deviation | REAL | NOT NULL, default 350 |
| volatility | REAL | NOT NULL, default 0.06 |
| games_played | INTEGER | NOT NULL, default 0 |
| last_rating_period | TEXT | nullable |
| updated_at | INTEGER | NOT NULL |

**Indexes:** `idx_player_glicko_user_id(user_id)`

### `glicko_history`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| player_id | TEXT | NOT NULL, FK → player_glicko.id CASCADE |
| rating_period | TEXT | NOT NULL |
| rating_before | REAL | NOT NULL |
| rd_before | REAL | NOT NULL |
| rating_after | REAL | NOT NULL |
| rd_after | REAL | NOT NULL |
| volatility_after | REAL | NOT NULL |
| delta | REAL | NOT NULL |
| games_in_period | INTEGER | NOT NULL |
| recorded_at | INTEGER | NOT NULL |

**Indexes:** `idx_glicko_history_player_id(player_id)`

---

## Meta Analytics — Dimension Tables

### `dim_faction`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| allegiance | TEXT | NOT NULL |

### `dim_subfaction`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| faction_id | TEXT | NOT NULL, FK → dim_faction.id |

**Indexes:** `idx_dim_subfaction_faction(faction_id)`

### `dim_detachment`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| faction_id | TEXT | NOT NULL, FK → dim_faction.id |
| subfaction_id | TEXT | nullable, FK → dim_subfaction.id |

**Indexes:** `idx_dim_detachment_faction(faction_id)`, `idx_dim_detachment_subfaction(subfaction_id)`

### `dim_for_type`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK |
| name | TEXT | NOT NULL, UNIQUE |

### `dim_granularity`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK |
| name | TEXT | NOT NULL, UNIQUE |

### `dim_dataslate`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| effective_date | INTEGER | NOT NULL |
| end_date | INTEGER | nullable |

### `dim_tournament_pack`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| effective_date | INTEGER | NOT NULL |
| end_date | INTEGER | nullable |

### `dim_edition`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| start_date | INTEGER | NOT NULL |
| end_date | INTEGER | nullable |

### `dim_region`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK |
| name | TEXT | NOT NULL |
| country | TEXT | nullable |

---

## Meta Analytics — 3NF Source Tables

### `meta_events`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| date | INTEGER | NOT NULL |
| location | TEXT | nullable |
| gps_coords | TEXT | nullable |
| region_id | INTEGER | nullable, FK → dim_region.id |
| format | TEXT | NOT NULL |
| rounds | INTEGER | nullable |
| player_count | INTEGER | NOT NULL |
| source | TEXT | NOT NULL |
| source_id | TEXT | nullable |
| imported_at | INTEGER | NOT NULL |
| win_faction_id | TEXT | nullable, FK → dim_faction.id |
| win_subfaction_id | TEXT | nullable, FK → dim_subfaction.id |
| win_detachment_id | TEXT | nullable, FK → dim_detachment.id |

**Indexes:** `idx_meta_events_date(date)`, `idx_meta_events_format(format)`, `idx_meta_events_region(region_id)`
**Unique:** `uq_meta_events_source(source, source_id)`

### `meta_event_players`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| event_id | TEXT | NOT NULL, FK → meta_events.id CASCADE |
| player_name | TEXT | NOT NULL |
| source_player_id | TEXT | nullable |
| faction_id | TEXT | NOT NULL, FK → dim_faction.id |
| subfaction_id | TEXT | nullable, FK → dim_subfaction.id |
| detachment_id | TEXT | nullable, FK → dim_detachment.id |
| placement | INTEGER | NOT NULL |
| list_text | TEXT | nullable |
| list_ttt | TEXT | nullable |
| wins | INTEGER | NOT NULL, default 0 |
| losses | INTEGER | NOT NULL, default 0 |
| draws | INTEGER | NOT NULL, default 0 |
| gl2_rating_start | REAL | nullable |
| gl2_rd_start | REAL | nullable |
| gl2_vol_start | REAL | nullable |
| gl2_rating_end | REAL | nullable |
| gl2_rd_end | REAL | nullable |
| gl2_vol_end | REAL | nullable |

**Indexes:** `idx_meta_event_players_event(event_id)`, `idx_meta_event_players_faction(faction_id)`

### `meta_pairings`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| event_id | TEXT | NOT NULL, FK → meta_events.id CASCADE |
| round | INTEGER | NOT NULL |
| player1_id | TEXT | NOT NULL, FK → meta_event_players.id CASCADE |
| player2_id | TEXT | NOT NULL, FK → meta_event_players.id CASCADE |
| player1_score | INTEGER | nullable |
| player2_score | INTEGER | nullable |
| player1_gl2 | REAL | nullable |
| player2_gl2 | REAL | nullable |
| result | TEXT | NOT NULL |

**Indexes:** `idx_meta_pairings_event_round(event_id, round)`, `idx_meta_pairings_player1(player1_id)`, `idx_meta_pairings_player2(player2_id)`

### `meta_event_win_distribution`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| event_id | TEXT | NOT NULL, FK → meta_events.id CASCADE |
| wins | INTEGER | NOT NULL |
| player_count | INTEGER | NOT NULL |
| player_pct | REAL | NOT NULL |

**Indexes:** `idx_event_win_dist_event(event_id)`

### `meta_event_placements`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| event_id | TEXT | NOT NULL, FK → meta_events.id CASCADE |
| tier | TEXT | NOT NULL |
| faction_id | TEXT | NOT NULL, FK → dim_faction.id |
| subfaction_id | TEXT | nullable, FK → dim_subfaction.id |
| detachment_id | TEXT | nullable, FK → dim_detachment.id |
| player_name | TEXT | NOT NULL |
| placement | INTEGER | NOT NULL |

**Indexes:** `idx_event_placements_event(event_id)`, `idx_event_placements_faction(faction_id)`

---

## Meta Analytics — Cube Tables

### `meta_for` (time dimension)
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| type_id | INTEGER | NOT NULL, FK → dim_for_type.id |
| date | INTEGER | NOT NULL |
| end_date | INTEGER | nullable |
| day | INTEGER | nullable |
| month | INTEGER | nullable |
| quarter | INTEGER | nullable |
| year | INTEGER | NOT NULL |
| dataslate_id | TEXT | nullable, FK → dim_dataslate.id |
| tourney_pack_id | TEXT | nullable, FK → dim_tournament_pack.id |
| edition_id | TEXT | nullable, FK → dim_edition.id |

**Indexes:** `idx_meta_for_type(type_id)`, `idx_meta_for_type_date(type_id, date)`

### `meta_top` (aggregated statistics)
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| granularity_id | INTEGER | NOT NULL, FK → dim_granularity.id |
| faction_id | TEXT | NOT NULL, FK → dim_faction.id |
| subfaction_id | TEXT | nullable, FK → dim_subfaction.id |
| detachment_id | TEXT | nullable, FK → dim_detachment.id |
| meta_for_id | TEXT | NOT NULL, FK → meta_for.id CASCADE |
| win_rate | REAL | NOT NULL |
| draw_rate | REAL | NOT NULL |
| over_rep | REAL | NOT NULL |
| four_oh_start | REAL | NOT NULL |
| event_wins | INTEGER | NOT NULL, default 0 |
| event_finals | INTEGER | NOT NULL, default 0 |
| event_top4 | INTEGER | NOT NULL, default 0 |
| event_top8 | INTEGER | NOT NULL, default 0 |
| event_top16 | INTEGER | NOT NULL, default 0 |
| player_pop_pct | REAL | NOT NULL |
| wins | INTEGER | NOT NULL, default 0 |
| losses | INTEGER | NOT NULL, default 0 |
| draws | INTEGER | NOT NULL, default 0 |
| games | INTEGER | NOT NULL, default 0 |
| players | INTEGER | NOT NULL, default 0 |

**Indexes:** `idx_meta_top_for(meta_for_id)`, `idx_meta_top_for_granularity(meta_for_id, granularity_id)`, `idx_meta_top_faction_for(faction_id, meta_for_id)`

### `fact_game_results`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| event_id | TEXT | NOT NULL, FK → meta_events.id CASCADE |
| player_id | TEXT | NOT NULL, FK → meta_event_players.id CASCADE |
| opponent_id | TEXT | nullable, FK → meta_event_players.id CASCADE |
| round | INTEGER | NOT NULL |
| faction_id | TEXT | NOT NULL, FK → dim_faction.id |
| subfaction_id | TEXT | nullable, FK → dim_subfaction.id |
| detachment_id | TEXT | nullable, FK → dim_detachment.id |
| opponent_faction_id | TEXT | nullable, FK → dim_faction.id |
| opponent_subfaction_id | TEXT | nullable, FK → dim_subfaction.id |
| opponent_detachment_id | TEXT | nullable, FK → dim_detachment.id |
| result | REAL | NOT NULL |
| player_score | INTEGER | nullable |
| opponent_score | INTEGER | nullable |

**Indexes:** `idx_fact_results_faction(faction_id)`, `idx_fact_results_event(event_id)`, `idx_fact_results_player(player_id)`, `idx_fact_results_matchup(faction_id, opponent_faction_id)`

### `meta_cube_status`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, default 1 |
| last_started_at | INTEGER | nullable |
| last_completed_at | INTEGER | nullable |
| last_event_id | TEXT | nullable |
| status | TEXT | NOT NULL, default 'pending' |

---

## Admin / Pipeline Tables

### `user_bans`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | NOT NULL, FK → user.id CASCADE |
| reason | TEXT | NOT NULL |
| banned_by | TEXT | NOT NULL, FK → user.id |
| banned_at | INTEGER | NOT NULL |
| lifted_at | INTEGER | nullable |

**Indexes:** `idx_user_bans_user_id(user_id)`

### `bcp_scrape_jobs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| started_at | INTEGER (timestamp) | NOT NULL |
| completed_at | INTEGER (timestamp) | nullable |
| status | TEXT | NOT NULL, default 'running' |
| events_found | INTEGER | default 0 |
| events_scraped | INTEGER | default 0 |
| pairings_scraped | INTEGER | default 0 |
| lists_scraped | INTEGER | default 0 |
| errors | TEXT | nullable |
| triggered_by | TEXT | NOT NULL, default 'cron' |

### `ingest_jobs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| url | TEXT | NOT NULL |
| source_type | TEXT | NOT NULL |
| source_name | TEXT | nullable |
| title | TEXT | nullable |
| status | TEXT | NOT NULL, default 'pending' |
| gladia_job_id | TEXT | nullable |
| transcript | TEXT | nullable |
| nodes_extracted | INTEGER | default 0 |
| error | TEXT | nullable |
| created_at | INTEGER (timestamp) | NOT NULL |
| completed_at | INTEGER (timestamp) | nullable |

---

## Index Summary (27+ indexes)

All FK columns have indexes. Composite indexes on frequently joined/filtered column pairs. 4 composite unique constraints prevent duplicate records.

## Cascade Delete Chains

Deleting a `user` cascades through: sessions, accounts, dice_sets → sessions → rolls, training_examples, training_frames, simulations, lists → list_units, matches → turns → stratagem_log + match_secondaries, tournaments → rounds → pairings → elo_history + tournament_players, player_elo, player_glicko → glicko_history, user_bans, imported_tournament_results.
