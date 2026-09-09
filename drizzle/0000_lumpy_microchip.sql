CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`donation_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`donation_id`) REFERENCES `donations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `donations` (
	`id` text PRIMARY KEY NOT NULL,
	`donor` text NOT NULL,
	`area` text NOT NULL,
	`food_type` text NOT NULL,
	`meals` integer NOT NULL,
	`pickup_by` text NOT NULL,
	`refrigerated` integer NOT NULL,
	`status` text NOT NULL,
	`partner_id` text,
	`driver_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`area` text NOT NULL,
	`vehicle` text NOT NULL,
	`status` text NOT NULL,
	`completed_trips` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `partners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`area` text NOT NULL,
	`distance_km` real NOT NULL,
	`capacity` integer NOT NULL,
	`refrigerated` integer NOT NULL,
	`reliability` integer NOT NULL
);
