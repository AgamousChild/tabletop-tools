-- W2 roadmap Phase 2 / D2-04 items 4-7: battle_size lookup table.
-- Moves the battle-size taxonomy (Combat Patrol/Incursion/Strike Force/
-- Onslaught points brackets + duplicate limits) out of hardcoded .ts source
-- (Rule 6) and out from under a 4x cross-app fork (Rule 3) into one
-- canonical table. Structural tournament-format data, not GW content — same
-- class as scoring_mission/game_state/dim_dataslate. Seeded via
-- packages/db/src/seed-battle-size.ts (seedBattleSizes), not via migration
-- INSERT, matching how dim_dataslate/dim_tournament_pack/dim_edition are
-- seeded at runtime rather than baked into migrations.
--
-- Consumer call sites (list-builder's armyRules.ts/useListsV2.ts/
-- ListBuilderScreen.tsx, bcp-scraper's bs-parser.ts/gw-parser.ts) are NOT
-- switched over in this migration — that is Phase 3 (D2-04 item 3.3).

CREATE TABLE `battle_size` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`points` integer NOT NULL,
	`max_duplicates` integer NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `battle_size_alias` (
	`alias` text PRIMARY KEY NOT NULL,
	`battle_size_id` text NOT NULL,
	FOREIGN KEY (`battle_size_id`) REFERENCES `battle_size`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_battle_size_alias_battle_size` ON `battle_size_alias` (`battle_size_id`);
