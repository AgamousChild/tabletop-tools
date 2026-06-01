-- Tournament Phase 3: metric stack, passthrough events, BCP registration
-- Adds: ranking_metric, tournament_pairing_metric, tournament_placing_metric,
--       passthrough_event, bcp_registration tables.
-- Extends tournament_players with: faction_entity_id, detachment_entity_id, placement.
-- See docs/superpowers/plans/2026-06-01-tournament-bcp-phase3.md

CREATE TABLE `ranking_metric` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL,
  `label` text NOT NULL,
  `description` text,
  CONSTRAINT `ranking_metric_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint

CREATE TABLE `tournament_pairing_metric` (
  `id` text PRIMARY KEY NOT NULL,
  `tournament_id` text NOT NULL,
  `ranking_metric_id` text NOT NULL,
  `sort_order` integer NOT NULL,
  `enabled` integer NOT NULL DEFAULT true,
  FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`ranking_metric_id`) REFERENCES `ranking_metric`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `uq_tourn_pairing_metric` UNIQUE(`tournament_id`,`ranking_metric_id`)
);
--> statement-breakpoint

CREATE TABLE `tournament_placing_metric` (
  `id` text PRIMARY KEY NOT NULL,
  `tournament_id` text NOT NULL,
  `ranking_metric_id` text NOT NULL,
  `sort_order` integer NOT NULL,
  `enabled` integer NOT NULL DEFAULT true,
  FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`ranking_metric_id`) REFERENCES `ranking_metric`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `uq_tourn_placing_metric` UNIQUE(`tournament_id`,`ranking_metric_id`)
);
--> statement-breakpoint

CREATE TABLE `passthrough_event` (
  `id` text PRIMARY KEY NOT NULL,
  `bcp_event_id` text NOT NULL,
  `name` text NOT NULL,
  `event_date` integer,
  `location` text,
  `game_system` text,
  `player_count` integer,
  `registration_url` text,
  `last_synced_at` integer NOT NULL,
  CONSTRAINT `passthrough_event_bcp_event_id_unique` UNIQUE(`bcp_event_id`)
);
--> statement-breakpoint

CREATE TABLE `bcp_registration` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `bcp_event_id` text NOT NULL,
  `list_id` text,
  `method` text NOT NULL,
  `status` text NOT NULL,
  `consent_at` integer NOT NULL,
  `submitted_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE INDEX `idx_tourn_pairing_metric_tourn` ON `tournament_pairing_metric` (`tournament_id`);
--> statement-breakpoint
CREATE INDEX `idx_tourn_placing_metric_tourn` ON `tournament_placing_metric` (`tournament_id`);
--> statement-breakpoint
CREATE INDEX `idx_passthrough_event_date` ON `passthrough_event` (`event_date`);
--> statement-breakpoint
CREATE INDEX `idx_passthrough_bcp_event_id` ON `passthrough_event` (`bcp_event_id`);
--> statement-breakpoint
CREATE INDEX `idx_bcp_registration_user` ON `bcp_registration` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_bcp_registration_event` ON `bcp_registration` (`bcp_event_id`);
--> statement-breakpoint

ALTER TABLE `tournament_players` ADD `faction_entity_id` text REFERENCES `content_entity`(`id`);
--> statement-breakpoint
ALTER TABLE `tournament_players` ADD `detachment_entity_id` text REFERENCES `content_entity`(`id`);
--> statement-breakpoint
ALTER TABLE `tournament_players` ADD `placement` integer;
