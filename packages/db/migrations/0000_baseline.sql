CREATE TABLE `account` (
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
CREATE INDEX `idx_account_user_id` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
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
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `idx_session_user_id` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`username` text,
	`display_username` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_display_username_unique` ON `user` (`display_username`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `bcp_scrape_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`events_found` integer DEFAULT 0,
	`events_scraped` integer DEFAULT 0,
	`pairings_scraped` integer DEFAULT 0,
	`lists_scraped` integer DEFAULT 0,
	`errors` text,
	`triggered_by` text DEFAULT 'cron' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
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
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_dice_set_id` ON `sessions` (`dice_set_id`);--> statement-breakpoint
CREATE TABLE `dice_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_dice_sets_user_id` ON `dice_sets` (`user_id`);--> statement-breakpoint
CREATE TABLE `dim_dataslate` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`effective_date` integer NOT NULL,
	`end_date` integer
);
--> statement-breakpoint
CREATE TABLE `dim_detachment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`faction_id` text NOT NULL,
	`subfaction_id` text,
	FOREIGN KEY (`faction_id`) REFERENCES `dim_faction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subfaction_id`) REFERENCES `dim_subfaction`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_dim_detachment_faction` ON `dim_detachment` (`faction_id`);--> statement-breakpoint
CREATE INDEX `idx_dim_detachment_subfaction` ON `dim_detachment` (`subfaction_id`);--> statement-breakpoint
CREATE TABLE `dim_edition` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer
);
--> statement-breakpoint
CREATE TABLE `dim_faction` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`allegiance` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dim_faction_alias` (
	`alias` text PRIMARY KEY NOT NULL,
	`faction_id` text NOT NULL,
	FOREIGN KEY (`faction_id`) REFERENCES `dim_faction`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_dim_faction_alias_faction` ON `dim_faction_alias` (`faction_id`);--> statement-breakpoint
CREATE TABLE `dim_for_type` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dim_for_type_name_unique` ON `dim_for_type` (`name`);--> statement-breakpoint
CREATE TABLE `dim_granularity` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dim_granularity_name_unique` ON `dim_granularity` (`name`);--> statement-breakpoint
CREATE TABLE `dim_region` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text
);
--> statement-breakpoint
CREATE TABLE `dim_subfaction` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`faction_id` text NOT NULL,
	FOREIGN KEY (`faction_id`) REFERENCES `dim_faction`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_dim_subfaction_faction` ON `dim_subfaction` (`faction_id`);--> statement-breakpoint
CREATE TABLE `dim_tournament_pack` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`effective_date` integer NOT NULL,
	`end_date` integer
);
--> statement-breakpoint
CREATE TABLE `fact_game_results` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`player_id` text NOT NULL,
	`opponent_id` text,
	`round` integer NOT NULL,
	`faction_id` text NOT NULL,
	`subfaction_id` text,
	`detachment_id` text,
	`opponent_faction_id` text,
	`opponent_subfaction_id` text,
	`opponent_detachment_id` text,
	`result` real NOT NULL,
	`player_score` integer,
	`opponent_score` integer,
	FOREIGN KEY (`event_id`) REFERENCES `meta_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `meta_event_players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opponent_id`) REFERENCES `meta_event_players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faction_id`) REFERENCES `dim_faction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subfaction_id`) REFERENCES `dim_subfaction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`detachment_id`) REFERENCES `dim_detachment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opponent_faction_id`) REFERENCES `dim_faction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opponent_subfaction_id`) REFERENCES `dim_subfaction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opponent_detachment_id`) REFERENCES `dim_detachment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_fact_results_faction` ON `fact_game_results` (`faction_id`);--> statement-breakpoint
CREATE INDEX `idx_fact_results_event` ON `fact_game_results` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_fact_results_player` ON `fact_game_results` (`player_id`);--> statement-breakpoint
CREATE INDEX `idx_fact_results_matchup` ON `fact_game_results` (`faction_id`,`opponent_faction_id`);--> statement-breakpoint
CREATE TABLE `glicko_history` (
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
CREATE INDEX `idx_glicko_history_player_id` ON `glicko_history` (`player_id`);--> statement-breakpoint
CREATE TABLE `imported_tournament_results` (
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
CREATE INDEX `idx_imported_results_imported_by` ON `imported_tournament_results` (`imported_by`);--> statement-breakpoint
CREATE TABLE `ingest_content` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`source_id` text NOT NULL,
	`status` text DEFAULT 'discovered' NOT NULL,
	`gladia_job_id` text,
	`transcript` text,
	`nodes_extracted` integer DEFAULT 0,
	`error` text,
	`discovered_at` integer NOT NULL,
	`processed_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `ingest_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingest_content_url_unique` ON `ingest_content` (`url`);--> statement-breakpoint
CREATE INDEX `idx_ingest_content_source` ON `ingest_content` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_ingest_content_status` ON `ingest_content` (`status`);--> statement-breakpoint
CREATE TABLE `ingest_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`source_type` text NOT NULL,
	`source_name` text,
	`title` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`gladia_job_id` text,
	`transcript` text,
	`nodes_extracted` integer DEFAULT 0,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `ingest_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`type` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingest_sources_url_unique` ON `ingest_sources` (`url`);--> statement-breakpoint
CREATE TABLE `list_units` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`unit_content_id` text NOT NULL,
	`unit_name` text NOT NULL,
	`unit_points` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`model_count` integer,
	`is_warlord` integer DEFAULT 0 NOT NULL,
	`enhancement_id` text,
	`enhancement_name` text,
	`enhancement_cost` integer,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_list_units_list_id` ON `list_units` (`list_id`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`faction` text NOT NULL,
	`name` text NOT NULL,
	`total_pts` integer DEFAULT 0 NOT NULL,
	`detachment` text,
	`description` text,
	`battle_size` integer,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_lists_user_id` ON `lists` (`user_id`);--> statement-breakpoint
CREATE TABLE `match_secondaries` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`player` text NOT NULL,
	`secondary_name` text NOT NULL,
	`vp_per_round` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_match_secondaries_match_id` ON `match_secondaries` (`match_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`list_id` text,
	`opponent_faction` text NOT NULL,
	`mission` text NOT NULL,
	`result` text,
	`your_final_score` integer,
	`their_final_score` integer,
	`is_tournament` integer DEFAULT 0 NOT NULL,
	`opponent_name` text,
	`opponent_detachment` text,
	`your_faction` text,
	`your_detachment` text,
	`terrain_layout` text,
	`deployment_zone` text,
	`twist_cards` text,
	`challenger_cards` text,
	`require_photos` integer DEFAULT 0 NOT NULL,
	`attacker_defender` text,
	`who_goes_first` text,
	`date` integer,
	`location` text,
	`tournament_name` text,
	`tournament_id` text,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	`hidden_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_matches_user_id` ON `matches` (`user_id`);--> statement-breakpoint
CREATE TABLE `meta_cube_status` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`last_started_at` integer,
	`last_completed_at` integer,
	`last_event_id` text,
	`status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta_event_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`tier` text NOT NULL,
	`faction_id` text NOT NULL,
	`subfaction_id` text,
	`detachment_id` text,
	`player_name` text NOT NULL,
	`placement` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `meta_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faction_id`) REFERENCES `dim_faction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subfaction_id`) REFERENCES `dim_subfaction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`detachment_id`) REFERENCES `dim_detachment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_event_placements_event` ON `meta_event_placements` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_event_placements_faction` ON `meta_event_placements` (`faction_id`);--> statement-breakpoint
CREATE TABLE `meta_event_players` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`player_name` text NOT NULL,
	`source_player_id` text,
	`faction_id` text NOT NULL,
	`subfaction_id` text,
	`detachment_id` text,
	`placement` integer NOT NULL,
	`list_text` text,
	`list_ttt` text,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	`gl2_rating_start` real,
	`gl2_rd_start` real,
	`gl2_vol_start` real,
	`gl2_rating_end` real,
	`gl2_rd_end` real,
	`gl2_vol_end` real,
	FOREIGN KEY (`event_id`) REFERENCES `meta_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faction_id`) REFERENCES `dim_faction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subfaction_id`) REFERENCES `dim_subfaction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`detachment_id`) REFERENCES `dim_detachment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_meta_event_players_event` ON `meta_event_players` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_meta_event_players_faction` ON `meta_event_players` (`faction_id`);--> statement-breakpoint
CREATE TABLE `meta_event_win_distribution` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`wins` integer NOT NULL,
	`player_count` integer NOT NULL,
	`player_pct` real NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `meta_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_event_win_dist_event` ON `meta_event_win_distribution` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_win_dist_unique` ON `meta_event_win_distribution` (`event_id`,`wins`);--> statement-breakpoint
CREATE TABLE `meta_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` integer NOT NULL,
	`location` text,
	`gps_coords` text,
	`region_id` integer,
	`format` text NOT NULL,
	`rounds` integer,
	`player_count` integer NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`imported_at` integer NOT NULL,
	`win_faction_id` text,
	`win_subfaction_id` text,
	`win_detachment_id` text,
	FOREIGN KEY (`region_id`) REFERENCES `dim_region`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`win_faction_id`) REFERENCES `dim_faction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`win_subfaction_id`) REFERENCES `dim_subfaction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`win_detachment_id`) REFERENCES `dim_detachment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_meta_events_date` ON `meta_events` (`date`);--> statement-breakpoint
CREATE INDEX `idx_meta_events_format` ON `meta_events` (`format`);--> statement-breakpoint
CREATE INDEX `idx_meta_events_region` ON `meta_events` (`region_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_meta_events_source` ON `meta_events` (`source`,`source_id`);--> statement-breakpoint
CREATE TABLE `meta_for` (
	`id` text PRIMARY KEY NOT NULL,
	`type_id` integer NOT NULL,
	`date` integer NOT NULL,
	`end_date` integer,
	`day` integer,
	`month` integer,
	`quarter` integer,
	`year` integer NOT NULL,
	`dataslate_id` text,
	`tourney_pack_id` text,
	`edition_id` text,
	FOREIGN KEY (`type_id`) REFERENCES `dim_for_type`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dataslate_id`) REFERENCES `dim_dataslate`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tourney_pack_id`) REFERENCES `dim_tournament_pack`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`edition_id`) REFERENCES `dim_edition`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_meta_for_type` ON `meta_for` (`type_id`);--> statement-breakpoint
CREATE INDEX `idx_meta_for_type_date` ON `meta_for` (`type_id`,`date`);--> statement-breakpoint
CREATE TABLE `meta_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round` integer NOT NULL,
	`player1_id` text NOT NULL,
	`player2_id` text NOT NULL,
	`player1_score` integer,
	`player2_score` integer,
	`player1_gl2` real,
	`player2_gl2` real,
	`result` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `meta_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player1_id`) REFERENCES `meta_event_players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player2_id`) REFERENCES `meta_event_players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_meta_pairings_event_round` ON `meta_pairings` (`event_id`,`round`);--> statement-breakpoint
CREATE INDEX `idx_meta_pairings_player1` ON `meta_pairings` (`player1_id`);--> statement-breakpoint
CREATE INDEX `idx_meta_pairings_player2` ON `meta_pairings` (`player2_id`);--> statement-breakpoint
CREATE TABLE `meta_top` (
	`id` text PRIMARY KEY NOT NULL,
	`granularity_id` integer NOT NULL,
	`faction_id` text NOT NULL,
	`subfaction_id` text,
	`detachment_id` text,
	`meta_for_id` text NOT NULL,
	`win_rate` real NOT NULL,
	`draw_rate` real NOT NULL,
	`over_rep` real NOT NULL,
	`four_oh_start` real NOT NULL,
	`event_wins` integer DEFAULT 0 NOT NULL,
	`event_finals` integer DEFAULT 0 NOT NULL,
	`event_top4` integer DEFAULT 0 NOT NULL,
	`event_top8` integer DEFAULT 0 NOT NULL,
	`event_top16` integer DEFAULT 0 NOT NULL,
	`player_pop_pct` real NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	`games` integer DEFAULT 0 NOT NULL,
	`players` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`granularity_id`) REFERENCES `dim_granularity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`faction_id`) REFERENCES `dim_faction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subfaction_id`) REFERENCES `dim_subfaction`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`detachment_id`) REFERENCES `dim_detachment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`meta_for_id`) REFERENCES `meta_for`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_meta_top_for` ON `meta_top` (`meta_for_id`);--> statement-breakpoint
CREATE INDEX `idx_meta_top_for_granularity` ON `meta_top` (`meta_for_id`,`granularity_id`);--> statement-breakpoint
CREATE INDEX `idx_meta_top_faction_for` ON `meta_top` (`faction_id`,`meta_for_id`);--> statement-breakpoint
CREATE TABLE `pairings` (
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
CREATE INDEX `idx_pairings_round_id` ON `pairings` (`round_id`);--> statement-breakpoint
CREATE INDEX `idx_pairings_player1_id` ON `pairings` (`player1_id`);--> statement-breakpoint
CREATE INDEX `idx_pairings_player2_id` ON `pairings` (`player2_id`);--> statement-breakpoint
CREATE TABLE `pipeline_item` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`title` text,
	`kind` text NOT NULL,
	`external_url` text NOT NULL,
	`external_id` text NOT NULL,
	`status` text DEFAULT 'discovered' NOT NULL,
	`discovered_at` integer NOT NULL,
	`published_at` integer,
	`processed_at` integer,
	`result_summary` text,
	`error` text,
	FOREIGN KEY (`source_id`) REFERENCES `pipeline_source`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pipeline_item_source_external` ON `pipeline_item` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_pipeline_item_source` ON `pipeline_item` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_pipeline_item_status` ON `pipeline_item` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pipeline_item_discovered` ON `pipeline_item` (`discovered_at`);--> statement-breakpoint
CREATE TABLE `pipeline_run_item` (
	`run_id` text NOT NULL,
	`item_id` text NOT NULL,
	PRIMARY KEY(`run_id`, `item_id`),
	FOREIGN KEY (`run_id`) REFERENCES `pipeline_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `pipeline_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pipeline_run_item_item` ON `pipeline_run_item` (`item_id`);--> statement-breakpoint
CREATE TABLE `pipeline_run` (
	`id` text PRIMARY KEY NOT NULL,
	`pipeline` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`found` integer DEFAULT 0 NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`triggered_by` text,
	`summary` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_pipeline_run_pipeline` ON `pipeline_run` (`pipeline`);--> statement-breakpoint
CREATE INDEX `idx_pipeline_run_started` ON `pipeline_run` (`started_at`);--> statement-breakpoint
CREATE TABLE `pipeline_source` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`external_id` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`last_checked_at` integer,
	`last_success_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pipeline_source_url` ON `pipeline_source` (`url`);--> statement-breakpoint
CREATE TABLE `player_glicko` (
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
CREATE INDEX `idx_player_glicko_user_id` ON `player_glicko` (`user_id`);--> statement-breakpoint
CREATE TABLE `rolls` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`pip_values` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_rolls_session_id` ON `rolls` (`session_id`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`start_time` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_rounds_tournament_id` ON `rounds` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rounds_tourn_number` ON `rounds` (`tournament_id`,`round_number`);--> statement-breakpoint
CREATE TABLE `simulations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attacker_content_id` text NOT NULL,
	`attacker_name` text NOT NULL,
	`defender_content_id` text NOT NULL,
	`defender_name` text NOT NULL,
	`result` text NOT NULL,
	`config_hash` text,
	`weapon_config` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_simulations_user_id` ON `simulations` (`user_id`);--> statement-breakpoint
CREATE TABLE `stratagem_log` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`player` text NOT NULL,
	`stratagem_name` text NOT NULL,
	`cp_cost` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stratagem_log_turn_id` ON `stratagem_log` (`turn_id`);--> statement-breakpoint
CREATE TABLE `tournament_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`recipient_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `tournament_players`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_tournament_awards_tournament_id` ON `tournament_awards` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `tournament_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`player_id` text NOT NULL,
	`issued_by` text NOT NULL,
	`card_type` text NOT NULL,
	`reason` text NOT NULL,
	`issued_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `tournament_players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tournament_cards_tournament_id` ON `tournament_cards` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `idx_tournament_cards_player_id` ON `tournament_cards` (`player_id`);--> statement-breakpoint
CREATE TABLE `tournament_players` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`faction` text NOT NULL,
	`detachment` text,
	`list_text` text,
	`list_id` text,
	`list_locked` integer DEFAULT 0 NOT NULL,
	`checked_in` integer DEFAULT 0 NOT NULL,
	`dropped` integer DEFAULT 0 NOT NULL,
	`registered_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tournament_players_tourn_id` ON `tournament_players` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `idx_tournament_players_user_id` ON `tournament_players` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tournament_players_tourn_user` ON `tournament_players` (`tournament_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`to_user_id` text NOT NULL,
	`name` text NOT NULL,
	`event_date` integer NOT NULL,
	`location` text,
	`format` text NOT NULL,
	`total_rounds` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`description` text,
	`image_url` text,
	`external_link` text,
	`start_time` text,
	`latitude` real,
	`longitude` real,
	`mission_pool` text,
	`require_photos` integer DEFAULT 0 NOT NULL,
	`include_twists` integer DEFAULT 0 NOT NULL,
	`include_challenger` integer DEFAULT 0 NOT NULL,
	`max_players` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tournaments_user_id` ON `tournaments` (`to_user_id`);--> statement-breakpoint
CREATE TABLE `training_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dice_set_id` text NOT NULL,
	`label` integer NOT NULL,
	`guess` integer,
	`confidence` real,
	`features` text NOT NULL,
	`image_url` text,
	`is_correct` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dice_set_id`) REFERENCES `dice_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_training_examples_user_id` ON `training_examples` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_training_examples_dice_set_id` ON `training_examples` (`dice_set_id`);--> statement-breakpoint
CREATE INDEX `idx_training_examples_label` ON `training_examples` (`label`);--> statement-breakpoint
CREATE TABLE `training_frames` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dice_set_id` text NOT NULL,
	`image_url` text NOT NULL,
	`frame_width` integer NOT NULL,
	`frame_height` integer NOT NULL,
	`boxes_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dice_set_id`) REFERENCES `dice_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_training_frames_user_id` ON `training_frames` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_training_frames_dice_set_id` ON `training_frames` (`dice_set_id`);--> statement-breakpoint
CREATE TABLE `turns` (
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
	`your_cp_start` integer DEFAULT 0 NOT NULL,
	`your_cp_gained` integer DEFAULT 1 NOT NULL,
	`your_cp_spent` integer DEFAULT 0 NOT NULL,
	`their_cp_start` integer DEFAULT 0 NOT NULL,
	`their_cp_gained` integer DEFAULT 1 NOT NULL,
	`their_cp_spent` integer DEFAULT 0 NOT NULL,
	`your_primary` integer DEFAULT 0 NOT NULL,
	`their_primary` integer DEFAULT 0 NOT NULL,
	`your_secondary` integer DEFAULT 0 NOT NULL,
	`their_secondary` integer DEFAULT 0 NOT NULL,
	`your_photo_url` text,
	`their_photo_url` text,
	`your_units_destroyed` text DEFAULT '[]' NOT NULL,
	`their_units_destroyed` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_turns_match_id` ON `turns` (`match_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_turns_match_number` ON `turns` (`match_id`,`turn_number`);--> statement-breakpoint
CREATE TABLE `unit_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_content_id` text NOT NULL,
	`rating` text NOT NULL,
	`win_contrib` real NOT NULL,
	`pts_eff` real NOT NULL,
	`meta_window` text NOT NULL,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_unit_ratings_unit_content_id` ON `unit_ratings` (`unit_content_id`);--> statement-breakpoint
CREATE INDEX `idx_unit_ratings_meta_window` ON `unit_ratings` (`meta_window`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_unit_ratings_unit_window` ON `unit_ratings` (`unit_content_id`,`meta_window`);--> statement-breakpoint
CREATE TABLE `user_bans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`banned_by` text NOT NULL,
	`banned_at` integer NOT NULL,
	`lifted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`banned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_user_bans_user_id` ON `user_bans` (`user_id`);