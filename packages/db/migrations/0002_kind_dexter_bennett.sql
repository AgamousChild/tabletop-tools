PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_account`("id", "user_id", "account_id", "provider_id", "access_token", "refresh_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "password", "created_at", "updated_at") SELECT "id", "user_id", "account_id", "provider_id", "access_token", "refresh_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "password", "created_at", "updated_at" FROM `account`;--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
ALTER TABLE `__new_account` RENAME TO `account`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_account_user_id` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_session`("id", "user_id", "token", "expires_at", "ip_address", "user_agent", "created_at", "updated_at") SELECT "id", "user_id", "token", "expires_at", "ip_address", "user_agent", "created_at", "updated_at" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `idx_session_user_id` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dice_set_id` text NOT NULL,
	`opponent_name` text,
	`z_score` real,
	`is_loaded` integer,
	`photo_url` text,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dice_set_id`) REFERENCES `dice_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "user_id", "dice_set_id", "opponent_name", "z_score", "is_loaded", "photo_url", "created_at", "closed_at") SELECT "id", "user_id", "dice_set_id", "opponent_name", "z_score", "is_loaded", "photo_url", "created_at", "closed_at" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_dice_set_id` ON `sessions` (`dice_set_id`);--> statement-breakpoint
CREATE TABLE `__new_dice_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_dice_sets`("id", "user_id", "name", "created_at") SELECT "id", "user_id", "name", "created_at" FROM `dice_sets`;--> statement-breakpoint
DROP TABLE `dice_sets`;--> statement-breakpoint
ALTER TABLE `__new_dice_sets` RENAME TO `dice_sets`;--> statement-breakpoint
CREATE INDEX `idx_dice_sets_user_id` ON `dice_sets` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_elo_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`pairing_id` text NOT NULL,
	`rating_before` integer NOT NULL,
	`rating_after` integer NOT NULL,
	`delta` integer NOT NULL,
	`opponent_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pairing_id`) REFERENCES `pairings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opponent_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_elo_history`("id", "user_id", "pairing_id", "rating_before", "rating_after", "delta", "opponent_id", "recorded_at") SELECT "id", "user_id", "pairing_id", "rating_before", "rating_after", "delta", "opponent_id", "recorded_at" FROM `elo_history`;--> statement-breakpoint
DROP TABLE `elo_history`;--> statement-breakpoint
ALTER TABLE `__new_elo_history` RENAME TO `elo_history`;--> statement-breakpoint
CREATE INDEX `idx_elo_history_user_id` ON `elo_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_elo_history_pairing_id` ON `elo_history` (`pairing_id`);--> statement-breakpoint
CREATE INDEX `idx_elo_history_opponent_id` ON `elo_history` (`opponent_id`);--> statement-breakpoint
CREATE TABLE `__new_glicko_history` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`rating_period` text NOT NULL,
	`rating_before` real NOT NULL,
	`rd_before` real NOT NULL,
	`rating_after` real NOT NULL,
	`rd_after` real NOT NULL,
	`volatility_after` real NOT NULL,
	`delta` real NOT NULL,
	`games_in_period` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `player_glicko`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_glicko_history`("id", "player_id", "rating_period", "rating_before", "rd_before", "rating_after", "rd_after", "volatility_after", "delta", "games_in_period", "recorded_at") SELECT "id", "player_id", "rating_period", "rating_before", "rd_before", "rating_after", "rd_after", "volatility_after", "delta", "games_in_period", "recorded_at" FROM `glicko_history`;--> statement-breakpoint
DROP TABLE `glicko_history`;--> statement-breakpoint
ALTER TABLE `__new_glicko_history` RENAME TO `glicko_history`;--> statement-breakpoint
CREATE INDEX `idx_glicko_history_player_id` ON `glicko_history` (`player_id`);--> statement-breakpoint
CREATE TABLE `__new_imported_tournament_results` (
	`id` text PRIMARY KEY NOT NULL,
	`imported_by` text NOT NULL,
	`event_name` text NOT NULL,
	`event_date` integer NOT NULL,
	`format` text NOT NULL,
	`meta_window` text NOT NULL,
	`raw_data` text NOT NULL,
	`parsed_data` text NOT NULL,
	`imported_at` integer NOT NULL,
	FOREIGN KEY (`imported_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_imported_tournament_results`("id", "imported_by", "event_name", "event_date", "format", "meta_window", "raw_data", "parsed_data", "imported_at") SELECT "id", "imported_by", "event_name", "event_date", "format", "meta_window", "raw_data", "parsed_data", "imported_at" FROM `imported_tournament_results`;--> statement-breakpoint
DROP TABLE `imported_tournament_results`;--> statement-breakpoint
ALTER TABLE `__new_imported_tournament_results` RENAME TO `imported_tournament_results`;--> statement-breakpoint
CREATE INDEX `idx_imported_results_imported_by` ON `imported_tournament_results` (`imported_by`);--> statement-breakpoint
CREATE TABLE `__new_list_units` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`unit_content_id` text NOT NULL,
	`unit_name` text NOT NULL,
	`unit_points` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_list_units`("id", "list_id", "unit_content_id", "unit_name", "unit_points", "count") SELECT "id", "list_id", "unit_content_id", "unit_name", "unit_points", "count" FROM `list_units`;--> statement-breakpoint
DROP TABLE `list_units`;--> statement-breakpoint
ALTER TABLE `__new_list_units` RENAME TO `list_units`;--> statement-breakpoint
CREATE INDEX `idx_list_units_list_id` ON `list_units` (`list_id`);--> statement-breakpoint
CREATE TABLE `__new_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`faction` text NOT NULL,
	`name` text NOT NULL,
	`total_pts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_lists`("id", "user_id", "faction", "name", "total_pts", "created_at", "updated_at") SELECT "id", "user_id", "faction", "name", "total_pts", "created_at", "updated_at" FROM `lists`;--> statement-breakpoint
DROP TABLE `lists`;--> statement-breakpoint
ALTER TABLE `__new_lists` RENAME TO `lists`;--> statement-breakpoint
CREATE INDEX `idx_lists_user_id` ON `lists` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`list_id` text,
	`opponent_faction` text NOT NULL,
	`mission` text NOT NULL,
	`result` text,
	`your_final_score` integer,
	`their_final_score` integer,
	`is_tournament` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_matches`("id", "user_id", "list_id", "opponent_faction", "mission", "result", "your_final_score", "their_final_score", "is_tournament", "created_at", "closed_at") SELECT "id", "user_id", "list_id", "opponent_faction", "mission", "result", "your_final_score", "their_final_score", "is_tournament", "created_at", "closed_at" FROM `matches`;--> statement-breakpoint
DROP TABLE `matches`;--> statement-breakpoint
ALTER TABLE `__new_matches` RENAME TO `matches`;--> statement-breakpoint
CREATE INDEX `idx_matches_user_id` ON `matches` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`table_number` integer NOT NULL,
	`player1_id` text NOT NULL,
	`player2_id` text,
	`mission` text NOT NULL,
	`player1_vp` integer,
	`player2_vp` integer,
	`result` text,
	`reported_by` text,
	`confirmed` integer DEFAULT 0 NOT NULL,
	`to_override` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player1_id`) REFERENCES `tournament_players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_pairings`("id", "round_id", "table_number", "player1_id", "player2_id", "mission", "player1_vp", "player2_vp", "result", "reported_by", "confirmed", "to_override", "created_at") SELECT "id", "round_id", "table_number", "player1_id", "player2_id", "mission", "player1_vp", "player2_vp", "result", "reported_by", "confirmed", "to_override", "created_at" FROM `pairings`;--> statement-breakpoint
DROP TABLE `pairings`;--> statement-breakpoint
ALTER TABLE `__new_pairings` RENAME TO `pairings`;--> statement-breakpoint
CREATE INDEX `idx_pairings_round_id` ON `pairings` (`round_id`);--> statement-breakpoint
CREATE INDEX `idx_pairings_player1_id` ON `pairings` (`player1_id`);--> statement-breakpoint
CREATE INDEX `idx_pairings_player2_id` ON `pairings` (`player2_id`);--> statement-breakpoint
CREATE TABLE `__new_player_elo` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer DEFAULT 1200 NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_player_elo`("id", "user_id", "rating", "games_played", "updated_at") SELECT "id", "user_id", "rating", "games_played", "updated_at" FROM `player_elo`;--> statement-breakpoint
DROP TABLE `player_elo`;--> statement-breakpoint
ALTER TABLE `__new_player_elo` RENAME TO `player_elo`;--> statement-breakpoint
CREATE UNIQUE INDEX `player_elo_user_id_unique` ON `player_elo` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_player_glicko` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`player_name` text NOT NULL,
	`rating` real DEFAULT 1500 NOT NULL,
	`rating_deviation` real DEFAULT 350 NOT NULL,
	`volatility` real DEFAULT 0.06 NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`last_rating_period` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_player_glicko`("id", "user_id", "player_name", "rating", "rating_deviation", "volatility", "games_played", "last_rating_period", "updated_at") SELECT "id", "user_id", "player_name", "rating", "rating_deviation", "volatility", "games_played", "last_rating_period", "updated_at" FROM `player_glicko`;--> statement-breakpoint
DROP TABLE `player_glicko`;--> statement-breakpoint
ALTER TABLE `__new_player_glicko` RENAME TO `player_glicko`;--> statement-breakpoint
CREATE INDEX `idx_player_glicko_user_id` ON `player_glicko` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_rolls` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`pip_values` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_rolls`("id", "session_id", "pip_values", "created_at") SELECT "id", "session_id", "pip_values", "created_at" FROM `rolls`;--> statement-breakpoint
DROP TABLE `rolls`;--> statement-breakpoint
ALTER TABLE `__new_rolls` RENAME TO `rolls`;--> statement-breakpoint
CREATE INDEX `idx_rolls_session_id` ON `rolls` (`session_id`);--> statement-breakpoint
CREATE TABLE `__new_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_rounds`("id", "tournament_id", "round_number", "status", "created_at") SELECT "id", "tournament_id", "round_number", "status", "created_at" FROM `rounds`;--> statement-breakpoint
DROP TABLE `rounds`;--> statement-breakpoint
ALTER TABLE `__new_rounds` RENAME TO `rounds`;--> statement-breakpoint
CREATE INDEX `idx_rounds_tournament_id` ON `rounds` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rounds_tourn_number` ON `rounds` (`tournament_id`,`round_number`);--> statement-breakpoint
CREATE TABLE `__new_simulations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attacker_content_id` text NOT NULL,
	`attacker_name` text NOT NULL,
	`defender_content_id` text NOT NULL,
	`defender_name` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_simulations`("id", "user_id", "attacker_content_id", "attacker_name", "defender_content_id", "defender_name", "result", "created_at") SELECT "id", "user_id", "attacker_content_id", "attacker_name", "defender_content_id", "defender_name", "result", "created_at" FROM `simulations`;--> statement-breakpoint
DROP TABLE `simulations`;--> statement-breakpoint
ALTER TABLE `__new_simulations` RENAME TO `simulations`;--> statement-breakpoint
CREATE INDEX `idx_simulations_user_id` ON `simulations` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_tournament_players` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`faction` text NOT NULL,
	`detachment` text,
	`list_text` text,
	`list_locked` integer DEFAULT 0 NOT NULL,
	`checked_in` integer DEFAULT 0 NOT NULL,
	`dropped` integer DEFAULT 0 NOT NULL,
	`registered_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tournament_players`("id", "tournament_id", "user_id", "display_name", "faction", "detachment", "list_text", "list_locked", "checked_in", "dropped", "registered_at") SELECT "id", "tournament_id", "user_id", "display_name", "faction", "detachment", "list_text", "list_locked", "checked_in", "dropped", "registered_at" FROM `tournament_players`;--> statement-breakpoint
DROP TABLE `tournament_players`;--> statement-breakpoint
ALTER TABLE `__new_tournament_players` RENAME TO `tournament_players`;--> statement-breakpoint
CREATE INDEX `idx_tournament_players_tourn_id` ON `tournament_players` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `idx_tournament_players_user_id` ON `tournament_players` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tournament_players_tourn_user` ON `tournament_players` (`tournament_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `__new_tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`to_user_id` text NOT NULL,
	`name` text NOT NULL,
	`event_date` integer NOT NULL,
	`location` text,
	`format` text NOT NULL,
	`total_rounds` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tournaments`("id", "to_user_id", "name", "event_date", "location", "format", "total_rounds", "status", "created_at") SELECT "id", "to_user_id", "name", "event_date", "location", "format", "total_rounds", "status", "created_at" FROM `tournaments`;--> statement-breakpoint
DROP TABLE `tournaments`;--> statement-breakpoint
ALTER TABLE `__new_tournaments` RENAME TO `tournaments`;--> statement-breakpoint
CREATE INDEX `idx_tournaments_user_id` ON `tournaments` (`to_user_id`);--> statement-breakpoint
CREATE TABLE `__new_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`turn_number` integer NOT NULL,
	`photo_url` text,
	`your_units_lost` text DEFAULT '[]' NOT NULL,
	`their_units_lost` text DEFAULT '[]' NOT NULL,
	`primary_scored` integer DEFAULT 0 NOT NULL,
	`secondary_scored` integer DEFAULT 0 NOT NULL,
	`cp_spent` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_turns`("id", "match_id", "turn_number", "photo_url", "your_units_lost", "their_units_lost", "primary_scored", "secondary_scored", "cp_spent", "notes", "created_at") SELECT "id", "match_id", "turn_number", "photo_url", "your_units_lost", "their_units_lost", "primary_scored", "secondary_scored", "cp_spent", "notes", "created_at" FROM `turns`;--> statement-breakpoint
DROP TABLE `turns`;--> statement-breakpoint
ALTER TABLE `__new_turns` RENAME TO `turns`;--> statement-breakpoint
CREATE INDEX `idx_turns_match_id` ON `turns` (`match_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_turns_match_number` ON `turns` (`match_id`,`turn_number`);--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `idx_unit_ratings_unit_content_id` ON `unit_ratings` (`unit_content_id`);--> statement-breakpoint
CREATE INDEX `idx_unit_ratings_meta_window` ON `unit_ratings` (`meta_window`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_unit_ratings_unit_window` ON `unit_ratings` (`unit_content_id`,`meta_window`);