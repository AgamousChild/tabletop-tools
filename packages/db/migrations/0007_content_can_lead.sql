-- Phase 2 follow-up: content_can_lead junction table.
-- Which Character datasheets may lead which bodyguard datasheets. Populated by
-- the data-import producer from Wahapedia's leader_attachments CSV. Used by
-- the list-builder attachment engine to gate list_unit.attached_to_unit_id.

CREATE TABLE `content_can_lead` (
	`leader_datasheet_id` text NOT NULL,
	`bodyguard_datasheet_id` text NOT NULL,
	PRIMARY KEY (`leader_datasheet_id`, `bodyguard_datasheet_id`),
	FOREIGN KEY (`leader_datasheet_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bodyguard_datasheet_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_can_lead_leader` ON `content_can_lead` (`leader_datasheet_id`);--> statement-breakpoint
CREATE INDEX `idx_can_lead_bodyguard` ON `content_can_lead` (`bodyguard_datasheet_id`);
