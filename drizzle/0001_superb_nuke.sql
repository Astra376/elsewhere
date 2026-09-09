ALTER TABLE `profiles` ADD `acceptedAt` integer;--> statement-breakpoint
ALTER TABLE `profiles` ADD `policyVersion` text;--> statement-breakpoint
ALTER TABLE `socketTickets` ADD `sessionId` text DEFAULT '' NOT NULL;