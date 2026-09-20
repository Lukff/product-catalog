CREATE TABLE `brands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brands_name_unique` ON `brands` (`name`);--> statement-breakpoint
INSERT INTO `brands` (`name`) SELECT DISTINCT `brand` FROM `products` ORDER BY `brand`;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category_id` integer NOT NULL,
	`price` real NOT NULL,
	`stock` integer NOT NULL,
	`brand_id` integer NOT NULL,
	`sku` text NOT NULL,
	`weight` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_products` (`id`, `title`, `description`, `category_id`, `price`, `stock`, `brand_id`, `sku`, `weight`, `created_at`, `updated_at`)
SELECT `p`.`id`, `p`.`title`, `p`.`description`, `p`.`category_id`, `p`.`price`, `p`.`stock`, `b`.`id`, `p`.`sku`, `p`.`weight`, `p`.`created_at`, `p`.`updated_at`
FROM `products` `p` INNER JOIN `brands` `b` ON `b`.`name` = `p`.`brand`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);
