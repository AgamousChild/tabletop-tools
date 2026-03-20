CREATE TABLE `training_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dice_set_id` text NOT NULL,
	`label` integer NOT NULL,
	`guess` integer,
	`confidence` real,
	`features` text NOT NULL,
	`image_url` text,
	`is_correct` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dice_set_id`) REFERENCES `dice_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_training_examples_user_id` ON `training_examples` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_training_examples_dice_set_id` ON `training_examples` (`dice_set_id`);--> statement-breakpoint
CREATE INDEX `idx_training_examples_label` ON `training_examples` (`label`);--> statement-breakpoint
CREATE TABLE `training_frames` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dice_set_id` text NOT NULL,
	`image_url` text NOT NULL,
	`frame_width` integer NOT NULL,
	`frame_height` integer NOT NULL,
	`boxes_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dice_set_id`) REFERENCES `dice_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_training_frames_user_id` ON `training_frames` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_training_frames_dice_set_id` ON `training_frames` (`dice_set_id`);--> statement-breakpoint
ALTER TABLE `matches` ADD `hidden_at` integer;--> statement-breakpoint
ALTER TABLE `rounds` ADD `start_time` text;