CREATE TABLE `content_node_link_candidate` (
	`candidate_id` text PRIMARY KEY NOT NULL,
	`brain_node_id` text NOT NULL,
	`proposed_canonical_id` text NOT NULL,
	`match_method` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`prior_link_id` text,
	`source` text NOT NULL,
	`run_id` text NOT NULL,
	`proposed_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decision_method` text,
	`decided_by` text,
	`decided_at` integer,
	`decision_reason` text,
	`resulting_link_id` text,
	`llm_attempt_count` integer DEFAULT 0 NOT NULL,
	`llm_last_attempted_at` integer,
	FOREIGN KEY (`proposed_canonical_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prior_link_id`) REFERENCES `content_node_link`(`link_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resulting_link_id`) REFERENCES `content_node_link`(`link_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_candidate_brain_node` ON `content_node_link_candidate` (`brain_node_id`);--> statement-breakpoint
CREATE INDEX `idx_candidate_status` ON `content_node_link_candidate` (`status`);--> statement-breakpoint
CREATE INDEX `idx_candidate_proposed_at` ON `content_node_link_candidate` (`proposed_at`);--> statement-breakpoint
CREATE INDEX `idx_candidate_prior_link` ON `content_node_link_candidate` (`prior_link_id`);--> statement-breakpoint
CREATE INDEX `idx_candidate_source` ON `content_node_link_candidate` (`source`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_candidate_pending` ON `content_node_link_candidate` (`brain_node_id`,`proposed_canonical_id`) WHERE "content_node_link_candidate"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `uq_content_node_link_active` ON `content_node_link` (`brain_node_id`) WHERE "content_node_link"."superseded_at" IS NULL;