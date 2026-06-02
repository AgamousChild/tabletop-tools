-- Game Tracker v2 — relational match model
-- New tables coexist with existing matches/turns (kept for v1 backward compat).
-- See docs/superpowers/specs/2026-05-26-game-tracker-data-design.md

CREATE TABLE `deployment` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `zone_overlay` text
);
--> statement-breakpoint

CREATE TABLE `deployment_objective` (
  `id` text PRIMARY KEY NOT NULL,
  `deployment_id` text NOT NULL,
  `label` text NOT NULL,
  `x` integer NOT NULL,
  `y` integer NOT NULL,
  FOREIGN KEY (`deployment_id`) REFERENCES `deployment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE `terrain_layout` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `source` text,
  `terrain_overlay` text
);
--> statement-breakpoint

CREATE TABLE `mission_card` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `primary_objective_id` text,
  `deployment_id` text,
  `mission_rule` text,
  FOREIGN KEY (`primary_objective_id`) REFERENCES `scoring_mission`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`deployment_id`) REFERENCES `deployment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `match_v2` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'setup',
  `deployment_id` text,
  `terrain_layout_id` text,
  `mission_rule` text,
  `mission_card_id` text,
  `conclusion` text,
  `result` text,
  `date` integer,
  `location` text,
  `tournament_id` text,
  `pairing_id` text,
  `require_photos` integer NOT NULL DEFAULT false,
  `paint_scoring` integer NOT NULL DEFAULT false,
  `created_at` integer NOT NULL,
  `closed_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`deployment_id`) REFERENCES `deployment`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`terrain_layout_id`) REFERENCES `terrain_layout`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`mission_card_id`) REFERENCES `mission_card`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `match_player` (
  `id` text PRIMARY KEY NOT NULL,
  `match_id` text NOT NULL,
  `seat` text NOT NULL,
  `is_you` integer NOT NULL DEFAULT false,
  `list_id` text,
  `faction` text,
  `detachment` text,
  `primary_objective_id` text,
  `secondary_mode` text NOT NULL DEFAULT 'tactical',
  `is_attacker` integer,
  `goes_first` integer,
  `battle_ready` integer NOT NULL DEFAULT true,
  `paint_score` integer NOT NULL DEFAULT 10,
  `final_primary_vp` integer,
  `final_secondary_vp` integer,
  FOREIGN KEY (`match_id`) REFERENCES `match_v2`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`primary_objective_id`) REFERENCES `scoring_mission`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `match_player_primary_option` (
  `id` text PRIMARY KEY NOT NULL,
  `match_player_id` text NOT NULL,
  `primary_objective_id` text NOT NULL,
  FOREIGN KEY (`match_player_id`) REFERENCES `match_player`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`primary_objective_id`) REFERENCES `scoring_mission`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `battle_round` (
  `id` text PRIMARY KEY NOT NULL,
  `match_id` text NOT NULL,
  `round_number` integer NOT NULL,
  FOREIGN KEY (`match_id`) REFERENCES `match_v2`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE `round_player` (
  `id` text PRIMARY KEY NOT NULL,
  `round_id` text NOT NULL,
  `match_player_id` text NOT NULL,
  `cp_gained` integer NOT NULL DEFAULT 0,
  `cp_spent` integer NOT NULL DEFAULT 0,
  FOREIGN KEY (`round_id`) REFERENCES `battle_round`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`match_player_id`) REFERENCES `match_player`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE `score_event` (
  `id` text PRIMARY KEY NOT NULL,
  `round_player_id` text NOT NULL,
  `scoring_mission_id` text NOT NULL,
  `vp` integer NOT NULL,
  FOREIGN KEY (`round_player_id`) REFERENCES `round_player`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`scoring_mission_id`) REFERENCES `scoring_mission`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `game_state_event` (
  `id` text PRIMARY KEY NOT NULL,
  `round_player_id` text NOT NULL,
  `game_state_id` text NOT NULL,
  `score_event_id` text,
  `count` integer NOT NULL DEFAULT 1,
  FOREIGN KEY (`round_player_id`) REFERENCES `round_player`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`game_state_id`) REFERENCES `game_state`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `match_secondary_v2` (
  `id` text PRIMARY KEY NOT NULL,
  `match_player_id` text NOT NULL,
  `scoring_mission_id` text NOT NULL,
  `mode` text NOT NULL DEFAULT 'tactical',
  `drawn_round` integer,
  `status` text NOT NULL DEFAULT 'active',
  `discard_timing` text,
  FOREIGN KEY (`match_player_id`) REFERENCES `match_player`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`scoring_mission_id`) REFERENCES `scoring_mission`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `unit_casualty` (
  `id` text PRIMARY KEY NOT NULL,
  `round_player_id` text NOT NULL,
  `list_unit_id` text,
  `kind` text NOT NULL,
  `destroyed_by_unit_id` text,
  FOREIGN KEY (`round_player_id`) REFERENCES `round_player`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`list_unit_id`) REFERENCES `list_unit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `unit_state` (
  `id` text PRIMARY KEY NOT NULL,
  `match_player_id` text NOT NULL,
  `list_unit_id` text,
  `state_key` text NOT NULL,
  `value` text,
  `active` integer NOT NULL DEFAULT true,
  `since_round` integer NOT NULL,
  `cleared_round` integer,
  FOREIGN KEY (`match_player_id`) REFERENCES `match_player`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`list_unit_id`) REFERENCES `list_unit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `stratagem_use` (
  `id` text PRIMARY KEY NOT NULL,
  `round_id` text NOT NULL,
  `used_by_id` text NOT NULL,
  `active_side_id` text NOT NULL,
  `stratagem_name` text NOT NULL,
  `cp_cost` integer NOT NULL DEFAULT 1,
  `phase` text,
  FOREIGN KEY (`round_id`) REFERENCES `battle_round`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`used_by_id`) REFERENCES `match_player`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`active_side_id`) REFERENCES `match_player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE INDEX `idx_deployment_obj_deployment` ON `deployment_objective` (`deployment_id`);
--> statement-breakpoint
CREATE INDEX `idx_match_v2_user` ON `match_v2` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_match_player_match` ON `match_player` (`match_id`);
--> statement-breakpoint
CREATE INDEX `idx_match_player_list` ON `match_player` (`list_id`);
--> statement-breakpoint
CREATE INDEX `idx_mppo_player` ON `match_player_primary_option` (`match_player_id`);
--> statement-breakpoint
CREATE INDEX `idx_battle_round_match` ON `battle_round` (`match_id`);
--> statement-breakpoint
CREATE INDEX `idx_round_player_round` ON `round_player` (`round_id`);
--> statement-breakpoint
CREATE INDEX `idx_round_player_player` ON `round_player` (`match_player_id`);
--> statement-breakpoint
CREATE INDEX `idx_score_event_round_player` ON `score_event` (`round_player_id`);
--> statement-breakpoint
CREATE INDEX `idx_score_event_mission` ON `score_event` (`scoring_mission_id`);
--> statement-breakpoint
CREATE INDEX `idx_gse_round_player` ON `game_state_event` (`round_player_id`);
--> statement-breakpoint
CREATE INDEX `idx_gse_game_state` ON `game_state_event` (`game_state_id`);
--> statement-breakpoint
CREATE INDEX `idx_msv2_player` ON `match_secondary_v2` (`match_player_id`);
--> statement-breakpoint
CREATE INDEX `idx_unit_casualty_round_player` ON `unit_casualty` (`round_player_id`);
--> statement-breakpoint
CREATE INDEX `idx_unit_state_player` ON `unit_state` (`match_player_id`);
--> statement-breakpoint
CREATE INDEX `idx_stratagem_use_round` ON `stratagem_use` (`round_id`);
