-- Migration 0014: Add source_list_id to meta_event_players
--
-- Stores the BCP list ID (from pairing data) so the list-text scraper
-- can look up rows that still need their army list fetched.
-- The scraper queries: source_list_id IS NOT NULL AND list_text IS NULL.
--> statement-breakpoint
ALTER TABLE `meta_event_players` ADD COLUMN `source_list_id` text;
