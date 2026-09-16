-- ══════════════════════════════════════════════
--  MIGRATION 003 — date personnalisée du projet
--  Additive : aucune donnée existante n'est touchée.
--  wrangler d1 execute portfolio-db --remote --file=migrate-003-project-date.sql
-- ══════════════════════════════════════════════

-- Date affichable, texte libre (ex: "Fév. 2026"). Vide = non renseignée.
ALTER TABLE projects ADD COLUMN project_date TEXT NOT NULL DEFAULT '';
