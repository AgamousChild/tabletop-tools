-- Phase 2 follow-up: add list.description column.
-- The UI already has a description-editing field; the column was missing from
-- the Phase 2 migration. Nullable text — pure ALTER ADD, no data migration.

ALTER TABLE `list` ADD `description` text;
