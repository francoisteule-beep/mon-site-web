-- ══════════════════════════════════════════════
--  FRANTZ Portfolio — Schéma D1
--  Exécuter via : wrangler d1 execute portfolio-db --file=schema.sql
-- ══════════════════════════════════════════════

-- Table projects
CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'published',  -- 'published' | 'coming_soon'
    video_url   TEXT    NOT NULL DEFAULT '',
    more_urls   TEXT    NOT NULL DEFAULT '[]',          -- JSON array de URLs "en coulisses"
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migrations si la table existait déjà (sans erreur si déjà présentes)
ALTER TABLE projects ADD COLUMN status    TEXT NOT NULL DEFAULT 'published';
ALTER TABLE projects ADD COLUMN video_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN more_urls TEXT NOT NULL DEFAULT '[]';

-- Table media (photos IA / captures)
CREATE TABLE IF NOT EXISTS media (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    date  TEXT NOT NULL DEFAULT '',
    tools TEXT NOT NULL DEFAULT '',
    url   TEXT NOT NULL
);

-- Table clients (logos)
CREATE TABLE IF NOT EXISTS clients (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    logo_url TEXT NOT NULL
);
