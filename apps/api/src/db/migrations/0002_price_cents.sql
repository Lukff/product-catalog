CREATE TABLE `__new_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category_id` integer NOT NULL,
	`price_cents` integer NOT NULL,
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
INSERT INTO `__new_products` (`id`, `title`, `description`, `category_id`, `price_cents`, `stock`, `brand_id`, `sku`, `weight`, `created_at`, `updated_at`)
SELECT `id`, `title`, `description`, `category_id`, CAST(ROUND(`price` * 100) AS integer), `stock`, `brand_id`, `sku`, `weight`, `created_at`, `updated_at`
FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);
