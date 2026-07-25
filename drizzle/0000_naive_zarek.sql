CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`evidence_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `alerts_household_status_idx` ON `alerts` (`household_id`,`status`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`memory_id` text NOT NULL,
	`statement` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`memory_id`) REFERENCES `memories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approvals_memory_id_unique` ON `approvals` (`memory_id`);--> statement-breakpoint
CREATE INDEX `approvals_household_state_idx` ON `approvals` (`household_id`,`state`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_household_time_idx` ON `audit_events` (`household_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT 'TOMO household' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`description` text NOT NULL,
	`object_labels` text DEFAULT '[]' NOT NULL,
	`occurred_at` text NOT NULL,
	`best_frame_key` text,
	`video_key` text,
	`boxes` text DEFAULT '[]' NOT NULL,
	`embedding` text,
	`embedding_model` text,
	`importance` text DEFAULT 'routine' NOT NULL,
	`approval_state` text DEFAULT 'pending' NOT NULL,
	`provenance` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `memories_household_time_idx` ON `memories` (`household_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `memories_household_approval_idx` ON `memories` (`household_id`,`approval_state`);