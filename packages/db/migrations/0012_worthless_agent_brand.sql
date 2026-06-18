-- Migration 0012: 11th-edition Support attachment role
--
-- 1. Add can_deploy_solo column to content_entity (default TRUE — no data change)
-- 2. Recreate content_can_lead with role column added to PK
--    (leader_datasheet_id, bodyguard_datasheet_id, role)
--    All 1811 existing rows backfilled as role='leader' via the new DEFAULT.
--
-- SQLite does not support ALTER TABLE DROP/ADD PRIMARY KEY, so we use the
-- standard SQLite table-recreation pattern: new table → copy → drop old → rename.

--> statement-breakpoint
ALTER TABLE `content_entity` ADD COLUMN `can_deploy_solo` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE `content_can_lead_new` (
	`leader_datasheet_id` text NOT NULL,
	`bodyguard_datasheet_id` text NOT NULL,
	`role` text NOT NULL DEFAULT 'leader',
	PRIMARY KEY (`leader_datasheet_id`, `bodyguard_datasheet_id`, `role`),
	FOREIGN KEY (`leader_datasheet_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bodyguard_datasheet_id`) REFERENCES `content_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `content_can_lead_new` (`leader_datasheet_id`, `bodyguard_datasheet_id`, `role`)
SELECT `leader_datasheet_id`, `bodyguard_datasheet_id`, 'leader'
FROM `content_can_lead`;
--> statement-breakpoint
DROP TABLE `content_can_lead`;
--> statement-breakpoint
ALTER TABLE `content_can_lead_new` RENAME TO `content_can_lead`;
--> statement-breakpoint
PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE INDEX `idx_can_lead_leader` ON `content_can_lead` (`leader_datasheet_id`);
--> statement-breakpoint
CREATE INDEX `idx_can_lead_bodyguard` ON `content_can_lead` (`bodyguard_datasheet_id`);
--> statement-breakpoint
CREATE INDEX `idx_can_lead_role` ON `content_can_lead` (`role`);
