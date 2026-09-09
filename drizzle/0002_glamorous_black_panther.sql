CREATE TABLE `supportTickets` (
	`id` text PRIMARY KEY NOT NULL,
	`profileId` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`response` text,
	`createdAt` integer NOT NULL,
	`resolvedAt` integer
);
--> statement-breakpoint
CREATE INDEX `idx_support_status` ON `supportTickets` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_support_profile` ON `supportTickets` (`profileId`);--> statement-breakpoint
ALTER TABLE `reports` ADD `context` text DEFAULT '[]' NOT NULL;