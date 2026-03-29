-- ══════════════════════════════════════════════
--  MIGRATION — Recrée le schéma et insère les projets existants
--  wrangler d1 execute portfolio-db --file=migrate.sql
-- ══════════════════════════════════════════════

-- 1. Supprime les anciennes tables (données vides, sans risque)
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS media;
DROP TABLE IF EXISTS clients;

-- 2. Recrée avec le bon schéma
CREATE TABLE projects (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    title       TEXT     NOT NULL,
    status      TEXT     NOT NULL DEFAULT 'published',
    video_url   TEXT     NOT NULL DEFAULT '',
    more_urls   TEXT     NOT NULL DEFAULT '[]',
    sort_order  INTEGER  NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    date  TEXT NOT NULL DEFAULT '',
    tools TEXT NOT NULL DEFAULT '',
    url   TEXT NOT NULL
);

CREATE TABLE clients (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    logo_url TEXT NOT NULL
);

-- 3. Insère les projets existants (dans l'ordre d'affichage)
INSERT INTO projects (title, status, video_url, more_urls, sort_order) VALUES
(
    'BOILER ROOM',
    'published',
    'https://assets.frantzimann.org/boiler-room-2025/boiler-2025-2.mp4',
    '[
        {"type":"video","src":"https://assets.frantzimann.org/boiler-room-2025/boiler-2025-1.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/boiler-room-2025/boiler-2025-3.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/boiler-room-2025/boiler-2025-4.mp4"},
        {"type":"img",  "src":"https://assets.frantzimann.org/boiler-room-2025/boiler-2025-4.webp"},
        {"type":"video","src":"https://assets.frantzimann.org/boiler-room-2025/boiler-2025-5.mp4"},
        {"type":"img",  "src":"https://assets.frantzimann.org/boiler-room-2025/boiler-2025-5.webp"}
    ]',
    1
),
(
    'PICKLES SESH × STUDIO 56',
    'published',
    'https://assets.frantzimann.org/pickles-nov-2025/pickles-nov-2025.mp4',
    '[]',
    2
),
(
    'OBJECTIF N1 — ADIDAS BACKSTAGE',
    'published',
    'https://assets.frantzimann.org/shoot-nina-2026/shooting-nina-202610.mp4',
    '[
        {"type":"video","src":"https://assets.frantzimann.org/shoot-nina-2026/shooting-nina-20261.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/shoot-nina-2026/shooting-nina-20262.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/shoot-nina-2026/shooting-nina-20263.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/shoot-nina-2026/shooting-nina-20264.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/shoot-nina-2026/shooting-nina-20265.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/shoot-nina-2026/shooting-nina-20266.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/shoot-nina-2026/shooting-nina-20267.mp4"},
        {"type":"img",  "src":"https://assets.frantzimann.org/shoot-nina-2026/shooting-nina-20269.png"}
    ]',
    3
),
(
    'HERMÈS × RICK OWENS — CARRÉ',
    'published',
    'https://assets.frantzimann.org/carre-hermes/carre-hermes2.mp4',
    '[]',
    4
),
(
    'PROJET-WINDOWS',
    'published',
    'https://assets.frantzimann.org/window-projetct/window-project.mp4',
    '[]',
    5
),
(
    'MONUMENT-EXTENDED',
    'published',
    'https://assets.frantzimann.org/monument-extended/typo-anim_7.mp4',
    '[
        {"type":"video","src":"https://assets.frantzimann.org/monument-extended/typo-anim_1.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/monument-extended/typo-anim_2.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/monument-extended/typo-anim_3.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/monument-extended/typo-anim_4.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/monument-extended/typo-anim_5.mp4"},
        {"type":"video","src":"https://assets.frantzimann.org/monument-extended/typo-anim_6.mp4"}
    ]',
    6
),
(
    'MAFIA DE LA BRAISE - HIPPOPOTAMUS',
    'coming_soon',
    '/noproj.mp4',
    '[]',
    7
),
(
    'COMMING SOON',
    'coming_soon',
    '/noproj.mp4',
    '[]',
    8
);
