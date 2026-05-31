-- Phase 1.4 step 10 redesign — crosswalk uses UPDATE-in-place + audit log instead of
-- append-only chain. Removes the partial-unique-on-superseded transient window and the
-- write-order requirement; audit history moves to a separate table. See:
--   docs/superpowers/plans/2026-05-30-step-10-validation-process.md
PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- Drop indexes that reference columns we're removing (so DROP COLUMN doesn't choke).
DROP INDEX IF EXISTS `idx_candidate_prior_link`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_content_node_link_canonical`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_content_node_link_brain_node`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_content_node_link_prior`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_content_node_link_active`;--> statement-breakpoint
DROP INDEX IF EXISTS `uq_content_node_link_active`;--> statement-breakpoint

-- Adjust candidate table FIRST so we drop its FK references to content_node_link.link_id
-- before that column goes away in the recreate below.
ALTER TABLE `content_node_link_candidate` DROP COLUMN `prior_link_id`;--> statement-breakpoint
ALTER TABLE `content_node_link_candidate` DROP COLUMN `resulting_link_id`;--> statement-breakpoint
ALTER TABLE `content_node_link_candidate` ADD COLUMN `prior_canonical_id` text;--> statement-breakpoint
ALTER TABLE `content_node_link_candidate` ADD COLUMN `resulting_history_id` text;--> statement-breakpoint

-- Recreate content_node_link as one-row-per-brain_node_id. Migrate only currently-active
-- rows (superseded_at IS NULL); chain history rows are discarded — the equivalent record
-- lives in the new content_node_link_history (which we backfill below for any pre-existing
-- 'auto-initial' rows so the audit trail starts populated, not empty).
CREATE TABLE `__new_content_node_link` (
  `brain_node_id` text PRIMARY KEY NOT NULL,
  `canonical_id` text NOT NULL,
  `match_method` text NOT NULL,
  `confidence` real DEFAULT 1 NOT NULL,
  `validation_method` text NOT NULL,
  `validated_by` text NOT NULL,
  `validated_at` integer NOT NULL,
  FOREIGN KEY (`canonical_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

INSERT INTO `__new_content_node_link`(
  "brain_node_id", "canonical_id", "match_method", "confidence",
  "validation_method", "validated_by", "validated_at"
)
SELECT
  "brain_node_id", "canonical_id", "match_method", "confidence",
  "validation_method", "validated_by", "validated_at"
FROM `content_node_link`
WHERE `superseded_at` IS NULL;--> statement-breakpoint

DROP TABLE `content_node_link`;--> statement-breakpoint
ALTER TABLE `__new_content_node_link` RENAME TO `content_node_link`;--> statement-breakpoint

PRAGMA foreign_keys=ON;--> statement-breakpoint

-- New audit log: every change to a content_node_link row gets one history row.
-- prior_canonical_id / new_canonical_id are TEXT (no FK) so audit retention survives
-- entity deletion. candidate_id is informational text too.
CREATE TABLE `content_node_link_history` (
  `history_id` text PRIMARY KEY NOT NULL,
  `brain_node_id` text NOT NULL,
  `prior_canonical_id` text,
  `new_canonical_id` text NOT NULL,
  `changed_at` integer NOT NULL,
  `changed_by` text NOT NULL,
  `change_method` text NOT NULL,
  `change_reason` text,
  `candidate_id` text
);--> statement-breakpoint

CREATE INDEX `idx_content_node_link_history_brain_node` ON `content_node_link_history` (`brain_node_id`);--> statement-breakpoint
CREATE INDEX `idx_content_node_link_history_changed_at` ON `content_node_link_history` (`changed_at`);--> statement-breakpoint

-- Backfill: every migrated content_node_link row gets an 'auto-initial' history entry
-- (prior_canonical_id NULL) so the audit log starts populated, not empty.
INSERT INTO `content_node_link_history` (
  history_id, brain_node_id, prior_canonical_id, new_canonical_id,
  changed_at, changed_by, change_method, change_reason, candidate_id
)
SELECT
  'migrate:' || brain_node_id,
  brain_node_id,
  NULL,
  canonical_id,
  unixepoch(),
  'migration:0005',
  'migration',
  'backfill from 0005 redesign',
  NULL
FROM `content_node_link`;
