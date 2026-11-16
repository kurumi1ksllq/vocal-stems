-- SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
CREATE TABLE `job_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`job_id` text NOT NULL,
	`seq` integer NOT NULL,
	`line` text NOT NULL,
	`at` integer NOT NULL,
	CONSTRAINT `fk_job_logs_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY,
	`mode` text NOT NULL,
	`source` text NOT NULL,
	`filename` text NOT NULL,
	`input_path` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`output_dir` text,
	`exit_code` integer,
	`error` text,
	`options` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `renderer_errors` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`message` text NOT NULL,
	`stack` text,
	`component_stack` text,
	`url` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stems` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`job_id` text NOT NULL,
	`path` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`fused` integer DEFAULT false NOT NULL,
	`fuse_mode` text,
	`size` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_stems_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `job_logs_job_seq_idx` ON `job_logs` (`job_id`,`seq`);--> statement-breakpoint
CREATE INDEX `jobs_created_at_idx` ON `jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `renderer_errors_at_idx` ON `renderer_errors` (`at`);--> statement-breakpoint
CREATE INDEX `stems_job_idx` ON `stems` (`job_id`);