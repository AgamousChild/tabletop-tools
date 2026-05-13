CREATE TABLE `ingest_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`source_type` text NOT NULL,
	`source_name` text,
	`title` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`gladia_job_id` text,
	`transcript` text,
	`nodes_extracted` integer DEFAULT 0,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
