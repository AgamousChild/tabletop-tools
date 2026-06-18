-- Phase 2: List data model tables
-- list, list_unit, list_unit_loadout, list_unit_loadout_weapon
-- See docs/superpowers/specs/2026-05-26-list-data-model-design.md

CREATE TABLE `list` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`author` text,
	`edition` text DEFAULT '11th' NOT NULL,
	`faction_id` text,
	`subfaction_id` text,
	`detachment_id` text,
	`battle_size` text DEFAULT 'unknown' NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`dataslate_id` text,
	`source` text DEFAULT 'list-builder' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faction_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subfaction_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`detachment_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dataslate_id`) REFERENCES `dim_dataslate`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_list_user_id` ON `list` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_list_faction` ON `list` (`faction_id`);--> statement-breakpoint
CREATE INDEX `idx_list_detachment` ON `list` (`detachment_id`);--> statement-breakpoint
CREATE TABLE `list_unit` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`datasheet_id` text,
	`enhancement_id` text,
	`is_warlord` integer DEFAULT false NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`attached_to_unit_id` text,
	`attach_role` text,
	FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`datasheet_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enhancement_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attached_to_unit_id`) REFERENCES `list_unit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_list_unit_list_id` ON `list_unit` (`list_id`);--> statement-breakpoint
CREATE INDEX `idx_list_unit_datasheet` ON `list_unit` (`datasheet_id`);--> statement-breakpoint
CREATE INDEX `idx_list_unit_attached_to` ON `list_unit` (`attached_to_unit_id`);--> statement-breakpoint
CREATE TABLE `list_unit_loadout` (
	`id` text PRIMARY KEY NOT NULL,
	`list_unit_id` text NOT NULL,
	`model_count` integer NOT NULL,
	FOREIGN KEY (`list_unit_id`) REFERENCES `list_unit`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_list_unit_loadout_unit` ON `list_unit_loadout` (`list_unit_id`);--> statement-breakpoint
CREATE TABLE `list_unit_loadout_weapon` (
	`id` text PRIMARY KEY NOT NULL,
	`loadout_id` text NOT NULL,
	`weapon_id` text,
	`count` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`loadout_id`) REFERENCES `list_unit_loadout`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`weapon_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_list_unit_loadout_weapon_loadout` ON `list_unit_loadout_weapon` (`loadout_id`);
