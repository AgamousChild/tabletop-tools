PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_content_node_link` (
	`link_id` text PRIMARY KEY NOT NULL,
	`brain_node_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`match_method` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`prior_link_id` text,
	`validation_method` text NOT NULL,
	`validated_by` text NOT NULL,
	`validated_at` integer NOT NULL,
	`superseded_at` integer,
	FOREIGN KEY (`canonical_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prior_link_id`) REFERENCES `content_node_link`(`link_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Migrate existing 11th-ingest rows into the new chain shape as first-entry chain heads.
-- The old table had (brain_node_id PK, canonical_id, match_method, confidence). New
-- required columns get sensible defaults: synthetic link_id from brain_node_id, no
-- prior link, validation_method='auto-initial' (= inherited from pre-validation
-- history), validated_by='migration', validated_at=now, superseded_at NULL (active).
INSERT INTO `__new_content_node_link`("link_id", "brain_node_id", "canonical_id", "match_method", "confidence", "prior_link_id", "validation_method", "validated_by", "validated_at", "superseded_at")
SELECT
  'auto:' || `brain_node_id`,
  `brain_node_id`,
  `canonical_id`,
  `match_method`,
  `confidence`,
  NULL,
  'auto-initial',
  'migration',
  unixepoch(),
  NULL
FROM `content_node_link`;--> statement-breakpoint
DROP TABLE `content_node_link`;--> statement-breakpoint
ALTER TABLE `__new_content_node_link` RENAME TO `content_node_link`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_content_node_link_canonical` ON `content_node_link` (`canonical_id`);--> statement-breakpoint
CREATE INDEX `idx_content_node_link_brain_node` ON `content_node_link` (`brain_node_id`);--> statement-breakpoint
CREATE INDEX `idx_content_node_link_prior` ON `content_node_link` (`prior_link_id`);--> statement-breakpoint
CREATE INDEX `idx_content_node_link_active` ON `content_node_link` (`brain_node_id`,`superseded_at`);--> statement-breakpoint
ALTER TABLE `content_entity` ADD `wahapedia_id` text;--> statement-breakpoint
ALTER TABLE `content_entity` ADD `bsdata_id` text;--> statement-breakpoint
CREATE INDEX `idx_content_entity_wahapedia` ON `content_entity` (`wahapedia_id`);--> statement-breakpoint
CREATE INDEX `idx_content_entity_bsdata` ON `content_entity` (`bsdata_id`);