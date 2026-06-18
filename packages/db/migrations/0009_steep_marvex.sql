-- Phase 3: Versus simulation tables (normalized)
-- Replaces the old `simulations` JSON-blob table with three properly normalized tables.
-- See docs/superpowers/specs/2026-05-26-versus-data-model-design.md

CREATE TABLE `simulation` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `label` text,
  `attacker_unit_id` text,
  `defender_unit_id` text,
  `attacker_name` text NOT NULL,
  `defender_name` text NOT NULL,
  `dataslate_id` text,
  `expected_wounds` real NOT NULL,
  `expected_models_removed` real NOT NULL,
  `survivors` real NOT NULL,
  `worst_wounds` real NOT NULL,
  `worst_models` real NOT NULL,
  `best_wounds` real NOT NULL,
  `best_models` real NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`attacker_unit_id`) REFERENCES `list_unit`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`defender_unit_id`) REFERENCES `list_unit`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `simulation_weapon` (
  `id` text PRIMARY KEY NOT NULL,
  `simulation_id` text NOT NULL,
  `profile_kind` text NOT NULL,
  `profile_id` text,
  `weapon_name` text NOT NULL,
  `model_count` integer NOT NULL,
  `weapons_per_model` integer NOT NULL,
  `attacks_per_weapon` real NOT NULL,
  `total_attacks` real NOT NULL,
  `expected_wounds` real NOT NULL,
  `expected_models_removed` real NOT NULL,
  FOREIGN KEY (`simulation_id`) REFERENCES `simulation`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `simulation_modifier` (
  `id` text PRIMARY KEY NOT NULL,
  `simulation_id` text NOT NULL,
  `side` text NOT NULL,
  `source` text NOT NULL,
  `key` text NOT NULL,
  `value` text,
  FOREIGN KEY (`simulation_id`) REFERENCES `simulation`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_simulation_user_id` ON `simulation` (`user_id`);
CREATE INDEX `idx_simulation_attacker` ON `simulation` (`attacker_unit_id`);
CREATE INDEX `idx_simulation_defender` ON `simulation` (`defender_unit_id`);
CREATE INDEX `idx_simulation_created` ON `simulation` (`created_at`);
CREATE INDEX `idx_sim_weapon_sim_id` ON `simulation_weapon` (`simulation_id`);
CREATE INDEX `idx_sim_modifier_sim_id` ON `simulation_modifier` (`simulation_id`);
