CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_account_user` ON `account` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_provider` ON `account` (`providerId`,`accountId`);--> statement-breakpoint
CREATE TABLE `aiJobs` (
	`messageId` text PRIMARY KEY NOT NULL,
	`chatId` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` integer NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `apiLimits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billingEvents` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`blocker` text NOT NULL,
	`blocked` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`blocker`, `blocked`),
	FOREIGN KEY (`blocker`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_blocks_blocked` ON `blocks` (`blocked`);--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`mode` text DEFAULT 'text' NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`aiPersona` text,
	`createdAt` integer NOT NULL,
	`endedAt` integer,
	`meetingId` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_slug_unique` ON `chats` (`slug`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` text PRIMARY KEY NOT NULL,
	`requester` text NOT NULL,
	`recipient` text NOT NULL,
	`pairKey` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`requester`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendships_pairKey_unique` ON `friendships` (`pairKey`);--> statement-breakpoint
CREATE INDEX `idx_friends_recipient` ON `friendships` (`recipient`,`status`);--> statement-breakpoint
CREATE INDEX `idx_friends_requester` ON `friendships` (`requester`,`status`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`chatId` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`chatId`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_games_chat` ON `games` (`chatId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `matchQueue` (
	`profileId` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`options` text NOT NULL,
	`joinedAt` integer NOT NULL,
	`heartbeatAt` integer NOT NULL,
	`chatId` text,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_queue_mode` ON `matchQueue` (`mode`,`heartbeatAt`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`chatId` text,
	`objectKey` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`purpose` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`ownerId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_media_owner` ON `media` (`ownerId`);--> statement-breakpoint
CREATE TABLE `members` (
	`chatId` text NOT NULL,
	`profileId` text NOT NULL,
	`joinedAt` integer NOT NULL,
	`leftAt` integer,
	`lastRead` integer DEFAULT 0,
	PRIMARY KEY(`chatId`, `profileId`),
	FOREIGN KEY (`chatId`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_members_profile` ON `members` (`profileId`,`joinedAt`);--> statement-breakpoint
CREATE TABLE `messages` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`chatId` text NOT NULL,
	`senderId` text NOT NULL,
	`text` text NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`mediaId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`chatId`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_id_unique` ON `messages` (`id`);--> statement-breakpoint
CREATE INDEX `idx_messages_chat_sequence` ON `messages` (`chatId`,`sequence`);--> statement-breakpoint
CREATE TABLE `moderationAudit` (
	`id` text PRIMARY KEY NOT NULL,
	`adminId` text NOT NULL,
	`profileId` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`profileId` text NOT NULL,
	`type` text NOT NULL,
	`text` text NOT NULL,
	`targetId` text,
	`readAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_profile` ON `notifications` (`profileId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`authId` text NOT NULL,
	`username` text NOT NULL,
	`avatar` text DEFAULT '🪐' NOT NULL,
	`banner` text DEFAULT 'violet' NOT NULL,
	`gender` text DEFAULT 'undisclosed' NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`prefs` text DEFAULT '{}' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`standing` text DEFAULT 'good' NOT NULL,
	`stripeCustomerId` text,
	`createdAt` integer NOT NULL,
	`lastSeen` integer NOT NULL,
	FOREIGN KEY (`authId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_authId_unique` ON `profiles` (`authId`);--> statement-breakpoint
CREATE INDEX `idx_profiles_seen` ON `profiles` (`lastSeen`);--> statement-breakpoint
CREATE TABLE `pushSubscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`profileId` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pushSubscriptions_endpoint_unique` ON `pushSubscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `rateLimit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`lastRequest` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rateLimit_key_unique` ON `rateLimit` (`key`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter` text NOT NULL,
	`reported` text NOT NULL,
	`chatId` text NOT NULL,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reports_status` ON `reports` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `idx_session_user` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `socketTickets` (
	`hash` text PRIMARY KEY NOT NULL,
	`profileId` text NOT NULL,
	`chatId` text NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tickets_expiry` ON `socketTickets` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`profileId` text NOT NULL,
	`plan` text NOT NULL,
	`status` text NOT NULL,
	`periodEnd` integer,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subscription_profile` ON `subscriptions` (`profileId`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`isAnonymous` integer DEFAULT false
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);