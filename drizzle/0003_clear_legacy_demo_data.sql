DELETE FROM `activities` WHERE `donation_id` IN ('FB-566', 'FB-449', 'FB-380', 'FB-513');--> statement-breakpoint
DELETE FROM `donations` WHERE `id` IN ('FB-566', 'FB-449', 'FB-380', 'FB-513');--> statement-breakpoint
PRAGMA optimize;
