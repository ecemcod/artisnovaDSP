-- Enhanced Music Information Schema Migration
-- Version: 001
-- Description: Create comprehensive music metadata tables for enhanced music information system

-- Artists table with comprehensive metadata
CREATE TABLE IF NOT EXISTS artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,                   -- MusicBrainz ID
    name TEXT NOT NULL,
    sort_name TEXT,
    disambiguation TEXT,
    type TEXT,                          -- Person, Group, Orchestra, etc.
    gender TEXT,
    country TEXT,
    area TEXT,
    begin_date TEXT,
    end_date TEXT,
    biography TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Albums/Releases table
CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,
    title TEXT NOT NULL,
    disambiguation TEXT,
    artist_id INTEGER,
    release_date TEXT,
    release_type TEXT,                  -- Album, Single, EP, etc.
    status TEXT,                        -- Official, Promotion, etc.
    label_id INTEGER,
    catalog_number TEXT,
    barcode TEXT,
    artwork_url TEXT,
    track_count INTEGER,
    disc_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    FOREIGN KEY (label_id) REFERENCES labels(id)
);

-- Record Labels table
CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,
    name TEXT NOT NULL,
    sort_name TEXT,
    type TEXT,                          -- Original Production, Bootleg Production, etc.
    label_code INTEGER,
    country TEXT,
    founded_year INTEGER,
    dissolved_year INTEGER,
    description TEXT,
    website TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tracks table
CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,
    title TEXT NOT NULL,
    album_id INTEGER,
    position INTEGER,
    disc_number INTEGER DEFAULT 1,
    duration INTEGER,                   -- in milliseconds
    artist_credit TEXT,                 -- JSON array of credited artists
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (album_id) REFERENCES albums(id)
);

-- Genres and Tags
CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    parent_id INTEGER,                  -- For hierarchical genres
    description TEXT,
    FOREIGN KEY (parent_id) REFERENCES genres(id)
);

-- Many-to-many relationships
CREATE TABLE IF NOT EXISTS artist_genres (
    artist_id INTEGER,
    genre_id INTEGER,
    weight INTEGER DEFAULT 1,           -- Relevance weight
    PRIMARY KEY (artist_id, genre_id),
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    FOREIGN KEY (genre_id) REFERENCES genres(id)
);

CREATE TABLE IF NOT EXISTS album_genres (
    album_id INTEGER,
    genre_id INTEGER,
    weight INTEGER DEFAULT 1,
    PRIMARY KEY (album_id, genre_id),
    FOREIGN KEY (album_id) REFERENCES albums(id),
    FOREIGN KEY (genre_id) REFERENCES genres(id)
);

-- Credits and Personnel
CREATE TABLE IF NOT EXISTS credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER,
    album_id INTEGER,                   -- For album-level credits
    person_name TEXT NOT NULL,
    role TEXT NOT NULL,                 -- Producer, Engineer, Composer, etc.
    instrument TEXT,                    -- If applicable
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (track_id) REFERENCES tracks(id),
    FOREIGN KEY (album_id) REFERENCES albums(id)
);

-- Data source tracking and quality
CREATE TABLE IF NOT EXISTS data_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,          -- artist, album, track, etc.
    entity_id INTEGER NOT NULL,
    source_name TEXT NOT NULL,          -- musicbrainz, discogs, lastfm, etc.
    source_id TEXT,                     -- ID in the external system
    quality_score REAL DEFAULT 0.5,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_hash TEXT                      -- For change detection
);

-- Cache management
CREATE TABLE IF NOT EXISTS cache_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL,                 -- JSON data
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User interactions and preferences
CREATE TABLE IF NOT EXISTS user_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    original_value TEXT,
    corrected_value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_artists_mbid ON artists(mbid);
CREATE INDEX IF NOT EXISTS idx_albums_title ON albums(title);
CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_data_sources_entity ON data_sources(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_cache_key ON cache_entries(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_labels_name ON labels(name);
CREATE INDEX IF NOT EXISTS idx_genres_name ON genres(name);
CREATE INDEX IF NOT EXISTS idx_credits_track ON credits(track_id);
CREATE INDEX IF NOT EXISTS idx_credits_album ON credits(album_id);

-- Migration metadata
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);