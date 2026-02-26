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
CREATE INDEX `idx_user_bans_user_id` ON `user_bans` (`user_id`);--> statement-breakpoint
ALTER TABLE `list_units` ADD `is_warlord` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `list_units` ADD `enhancement_id` text;--> statement-breakpoint
ALTER TABLE `list_units` ADD `enhancement_name` text;--> statement-breakpoint
ALTER TABLE `list_units` ADD `enhancement_cost` integer;--> statement-breakpoint
ALTER TABLE `lists` ADD `detachment` text;--> statement-breakpoint
ALTER TABLE `lists` ADD `description` text;--> statement-breakpoint
ALTER TABLE `lists` ADD `battle_size` integer;--> statement-breakpoint
ALTER TABLE `lists` ADD `synced_at` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `opponent_name` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `opponent_detachment` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `your_faction` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `your_detachment` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `terrain_layout` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `deployment_zone` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `twist_cards` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `challenger_cards` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `require_photos` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `attacker_defender` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `who_goes_first` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `date` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `location` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `tournament_name` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `tournament_id` text;--> statement-breakpoint
ALTER TABLE `simulations` ADD `config_hash` text;--> statement-breakpoint
ALTER TABLE `simulations` ADD `weapon_config` text;--> statement-breakpoint
ALTER TABLE `tournament_players` ADD `list_id` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `description` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `external_link` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `start_time` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `mission_pool` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `require_photos` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `include_twists` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `include_challenger` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `max_players` integer;--> statement-breakpoint
ALTER TABLE `turns` ADD `your_cp_start` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `your_cp_gained` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `your_cp_spent` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `their_cp_start` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `their_cp_gained` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `their_cp_spent` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `your_primary` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `their_primary` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `your_secondary` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `their_secondary` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `your_photo_url` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `their_photo_url` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `your_units_destroyed` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `their_units_destroyed` text DEFAULT '[]' NOT NULL;