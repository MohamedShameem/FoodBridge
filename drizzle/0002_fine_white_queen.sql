ALTER TABLE `donations` ADD `agent_summary` text;--> statement-breakpoint
ALTER TABLE `donations` ADD `model_provider` text;--> statement-breakpoint
ALTER TABLE `donations` ADD `runtime_mode` text;--> statement-breakpoint
ALTER TABLE `donations` ADD `completed_at` text;--> statement-breakpoint
DELETE FROM `activities` WHERE `donation_id` IN ('FB-283', 'FB-284');--> statement-breakpoint
DELETE FROM `donations` WHERE `id` IN ('FB-283', 'FB-284');--> statement-breakpoint
PRAGMA optimize;
