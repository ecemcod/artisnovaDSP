-- Add description field to albums table for TiVo reviews and editorial content
-- Version: 002
-- Description: Add description field to store album reviews and editorial content from Qobuz/TiVo

ALTER TABLE albums ADD COLUMN description TEXT;

-- Update migration metadata
INSERT OR IGNORE INTO schema_migrations (version) VALUES (2);