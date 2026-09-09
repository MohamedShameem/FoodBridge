CREATE INDEX `idx_activities_donation_created` ON `activities` (`donation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_donations_status_created` ON `donations` (`status`,`created_at`);