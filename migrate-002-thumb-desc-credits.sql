-- ══════════════════════════════════════════════
--  MIGRATION 002 — miniature, description, crédits
--  Additive : aucune donnée existante n'est touchée.
--  wrangler d1 execute portfolio-db --remote --file=migrate-002-thumb-desc-credits.sql
-- ══════════════════════════════════════════════

-- Miniature personnalisée affichée sur le mur et dans la liste.
-- Vide = le site fabrique lui-même une image à partir de la vidéo.
ALTER TABLE projects ADD COLUMN thumb_url TEXT NOT NULL DEFAULT '';

-- Texte libre : ce que tu as fait sur le projet.
ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- Crédits : tableau JSON [{"role":"Direction artistique","name":"François Teulé"}]
ALTER TABLE projects ADD COLUMN credits TEXT NOT NULL DEFAULT '[]';
