ALTER TABLE `alerts` ADD `evidence_data_url` text;
ALTER TABLE `alerts` ADD `video_key` text;
ALTER TABLE `alerts` ADD `boxes` text NOT NULL DEFAULT '[]';
