CREATE TABLE `game_state` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`category` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_state_key_unique` ON `game_state` (`key`);--> statement-breakpoint
CREATE TABLE `mission_game_state` (
	`id` text PRIMARY KEY NOT NULL,
	`scoring_mission_id` text NOT NULL,
	`game_state_id` text NOT NULL,
	`points` integer,
	`count_mode` text DEFAULT 'flag' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`scoring_mission_id`) REFERENCES `scoring_mission`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_state_id`) REFERENCES `game_state`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mgs_mission` ON `mission_game_state` (`scoring_mission_id`);--> statement-breakpoint
CREATE INDEX `idx_mgs_state` ON `mission_game_state` (`game_state_id`);--> statement-breakpoint
CREATE TABLE `scoring_mission` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`side` text DEFAULT 'symmetric' NOT NULL,
	`cap` integer,
	`ui_pattern` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_scoring_mission_kind` ON `scoring_mission` (`kind`);