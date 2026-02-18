-- SteelArt dashboard schema snapshot
-- generated_at: 2026-02-18T08:09:12.856Z

-- TABLE: artists
CREATE TABLE `artists` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name_ko` varchar(150) NOT NULL,
  `name_en` varchar(150) NOT NULL,
  `type` enum('COMPANY','INDIVIDUAL') NOT NULL,
  `profile_image_url` varchar(500) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_artists_deleted_at` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLE: artworks
CREATE TABLE `artworks` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `title_ko` varchar(200) NOT NULL,
  `title_en` varchar(200) NOT NULL,
  `artist_id` bigint(20) NOT NULL,
  `place_id` bigint(20) NOT NULL,
  `category` enum('STEEL_ART','PUBLIC_ART') NOT NULL,
  `production_year` int(11) DEFAULT NULL,
  `size_text_ko` varchar(120) DEFAULT NULL,
  `size_text_en` varchar(120) DEFAULT NULL,
  `description_ko` mediumtext NOT NULL,
  `description_en` mediumtext NOT NULL,
  `photo_day_url` varchar(500) NOT NULL,
  `photo_night_url` varchar(500) NOT NULL,
  `audio_url_ko` varchar(500) DEFAULT NULL,
  `audio_url_en` varchar(500) DEFAULT NULL,
  `likes_count` int(11) NOT NULL DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_artworks_artist_id` (`artist_id`),
  KEY `idx_artworks_place_id` (`place_id`),
  KEY `idx_artworks_category` (`category`),
  KEY `idx_artworks_likes_count` (`likes_count`),
  KEY `idx_artworks_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_artworks_artist` FOREIGN KEY (`artist_id`) REFERENCES `artists` (`id`),
  CONSTRAINT `fk_artworks_place` FOREIGN KEY (`place_id`) REFERENCES `places` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=124 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLE: courses
CREATE TABLE `courses` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `title_ko` varchar(120) NOT NULL,
  `title_en` varchar(120) NOT NULL,
  `description_ko` text DEFAULT NULL,
  `description_en` text DEFAULT NULL,
  `is_official` tinyint(1) NOT NULL DEFAULT 0,
  `created_by_user_id` bigint(20) DEFAULT NULL,
  `likes_count` int(11) NOT NULL DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_courses_created_by` (`created_by_user_id`),
  KEY `idx_courses_is_official` (`is_official`),
  KEY `idx_courses_likes_count` (`likes_count`),
  KEY `idx_courses_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_courses_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=47 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLE: course_items
CREATE TABLE `course_items` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `course_id` bigint(20) NOT NULL,
  `seq` int(11) NOT NULL,
  `artwork_id` bigint(20) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_items_course_seq` (`course_id`,`seq`),
  KEY `idx_course_items_course_id` (`course_id`),
  KEY `idx_course_items_artwork_id` (`artwork_id`),
  CONSTRAINT `fk_course_items_artwork` FOREIGN KEY (`artwork_id`) REFERENCES `artworks` (`id`),
  CONSTRAINT `fk_course_items_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=244 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLE: course_checkins
CREATE TABLE `course_checkins` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `course_id` bigint(20) NOT NULL,
  `course_item_id` bigint(20) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_checkins_user_course_item` (`user_id`,`course_item_id`),
  KEY `idx_course_checkins_user_course` (`user_id`,`course_id`),
  KEY `idx_course_checkins_course_id` (`course_id`),
  KEY `fk_course_checkins_course_item` (`course_item_id`),
  CONSTRAINT `fk_course_checkins_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_course_checkins_course_item` FOREIGN KEY (`course_item_id`) REFERENCES `course_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_course_checkins_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLE: home_banners
CREATE TABLE `home_banners` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `artwork_id` bigint(20) NOT NULL,
  `display_order` int(11) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_home_banners_artwork` (`artwork_id`),
  UNIQUE KEY `uq_home_banners_display_order` (`display_order`),
  KEY `idx_home_banners_order` (`display_order`),
  CONSTRAINT `fk_home_banners_artwork` FOREIGN KEY (`artwork_id`) REFERENCES `artworks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLE: places
CREATE TABLE `places` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name_ko` varchar(150) NOT NULL,
  `name_en` varchar(150) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `lat` decimal(10,7) NOT NULL,
  `lng` decimal(10,7) NOT NULL,
  `zone_id` bigint(20) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_places_zone_id` (`zone_id`),
  KEY `idx_places_lat_lng` (`lat`,`lng`),
  KEY `idx_places_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_places_zone` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLE: zones
CREATE TABLE `zones` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name_ko` varchar(100) NOT NULL,
  `name_en` varchar(100) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_zones_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
