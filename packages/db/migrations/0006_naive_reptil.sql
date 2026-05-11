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
CREATE INDEX `idx_meta_top_faction_for` ON `meta_top` (`faction_id`,`meta_for_id`);