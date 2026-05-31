-- Phase 1.4 step 10 redesign — crosswalk uses UPDATE-in-place + audit log instead of
-- append-only chain. Removes the partial-unique-on-superseded transient window and the
-- write-order requirement; audit history moves to a separate table. See:
--   docs/superpowers/plans/2026-05-30-step-10-validation-process.md
PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- Drop indexes that reference columns we're removing (so the table-recreate dance below
-- has nothing dangling against the old shapes).
DROP INDEX IF EXISTS `idx_candidate_brain_node`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_candidate_status`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_candidate_proposed_at`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_candidate_prior_link`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_candidate_source`;--> statement-breakpoint
DROP INDEX IF EXISTS `uq_candidate_pending`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_content_node_link_canonical`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_content_node_link_brain_node`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_content_node_link_prior`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_content_node_link_active`;--> statement-breakpoint
DROP INDEX IF EXISTS `uq_content_node_link_active`;--> statement-breakpoint

-- Recreate content_node_link_candidate WITHOUT the chain-era FKs (prior_link_id /
-- resulting_link_id pointed at content_node_link.link_id, which is going away).
-- SQLite cannot DROP COLUMN that participates in an FK definition, so we rebuild
-- the table from scratch and copy preserved columns.
CREATE TABLE `__new_content_node_link_candidate` (
  `candidate_id` text PRIMARY KEY NOT NULL,
  `brain_node_id` text NOT NULL,
  `proposed_canonical_id` text NOT NULL,
  `match_method` text NOT NULL,
  `confidence` real DEFAULT 1 NOT NULL,
  `prior_canonical_id` text,
  `source` text NOT NULL,
  `run_id` text NOT NULL,
  `proposed_at` integer NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `decision_method` text,
  `decided_by` text,
  `decided_at` integer,
  `decision_reason` text,
  `resulting_history_id` text,
  `llm_attempt_count` integer DEFAULT 0 NOT NULL,
  `llm_last_attempted_at` integer,
  FOREIGN KEY (`proposed_canonical_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

INSERT INTO `__new_content_node_link_candidate`(
  "candidate_id", "brain_node_id", "proposed_canonical_id", "match_method",
  "confidence", "prior_canonical_id", "source", "run_id", "proposed_at",
  "status", "decision_method", "decided_by", "decided_at", "decision_reason",
  "resulting_history_id", "llm_attempt_count", "llm_last_attempted_at"
)
SELECT
  "candidate_id", "brain_node_id", "proposed_canonical_id", "match_method",
  "confidence", NULL, "source", "run_id", "proposed_at",
  "status", "decision_method", "decided_by", "decided_at", "decision_reason",
  NULL, "llm_attempt_count", "llm_last_attempted_at"
FROM `content_node_link_candidate`;--> statement-breakpoint

DROP TABLE `content_node_link_candidate`;--> statement-breakpoint
ALTER TABLE `__new_content_node_link_candidate` RENAME TO `content_node_link_candidate`;--> statement-breakpoint

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

-- Re-create the indexes for the rebuilt tables (matches the index set defined in schema.ts).
CREATE INDEX `idx_candidate_brain_node` ON `content_node_link_candidate` (`brain_node_id`);--> statement-breakpoint
CREATE INDEX `idx_candidate_status` ON `content_node_link_candidate` (`status`);--> statement-breakpoint
CREATE INDEX `idx_candidate_proposed_at` ON `content_node_link_candidate` (`proposed_at`);--> statement-breakpoint
CREATE INDEX `idx_candidate_source` ON `content_node_link_candidate` (`source`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_candidate_pending` ON `content_node_link_candidate` (`brain_node_id`,`proposed_canonical_id`) WHERE "content_node_link_candidate"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `idx_content_node_link_canonical` ON `content_node_link` (`canonical_id`);--> statement-breakpoint

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
