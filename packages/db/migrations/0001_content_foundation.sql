CREATE TABLE `content_entity` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`faction_id` text,
	`parent_id` text,
	`dataslate_id` text,
	`r2_key` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`faction_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dataslate_id`) REFERENCES `dim_dataslate`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_content_entity_type` ON `content_entity` (`type`);--> statement-breakpoint
CREATE INDEX `idx_content_entity_faction` ON `content_entity` (`faction_id`);--> statement-breakpoint
CREATE INDEX `idx_content_entity_parent` ON `content_entity` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_content_entity_dataslate` ON `content_entity` (`dataslate_id`);--> statement-breakpoint
CREATE INDEX `idx_content_entity_name` ON `content_entity` (`name`);--> statement-breakpoint
CREATE TABLE `content_node_link` (
	`brain_node_id` text PRIMARY KEY NOT NULL,
	`canonical_id` text NOT NULL,
	`match_method` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`canonical_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_content_node_link_canonical` ON `content_node_link` (`canonical_id`);