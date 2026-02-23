CREATE TABLE `elo_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`pairing_id` text NOT NULL,
	`rating_before` integer NOT NULL,
	`rating_after` integer NOT NULL,
	`delta` integer NOT NULL,
	`opponent_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pairing_id`) REFERENCES `pairings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opponent_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
	FOREIGN KEY (`player_id`) REFERENCES `player_glicko`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
	FOREIGN KEY (`imported_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `list_units` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`unit_content_id` text NOT NULL,
	`unit_name` text NOT NULL,
	`unit_points` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`faction` text NOT NULL,
	`name` text NOT NULL,
	`total_pts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player1_id`) REFERENCES `tournament_players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `player_elo` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer DEFAULT 1200 NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_elo_user_id_unique` ON `player_elo` (`user_id`);--> statement-breakpoint
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
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `simulations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attacker_content_id` text NOT NULL,
	`attacker_name` text NOT NULL,
	`defender_content_id` text NOT NULL,
	`defender_name` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tournament_players` (
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
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`to_user_id` text NOT NULL,
	`name` text NOT NULL,
	`event_date` integer NOT NULL,
	`location` text,
	`format` text NOT NULL,
	`total_rounds` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
	`created_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `unit_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_content_id` text NOT NULL,
	`rating` text NOT NULL,
	`win_contrib` real NOT NULL,
	`pts_eff` real NOT NULL,
	`meta_window` text NOT NULL,
	`computed_at` integer NOT NULL
);
