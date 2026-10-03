-- ══════════════════════════════════════════════
--  MIGRATION 004 — galerie et description pour les photos
--  Additive : aucune donnée existante n'est touchée.
--  wrangler d1 execute portfolio-db --remote --file=migrate-004-media-gallery.sql
-- ══════════════════════════════════════════════

-- Texte libre : type de photo, contexte du shoot...
ALTER TABLE media ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- Images supplémentaires du même projet photo, même format que
-- more_urls sur projects : [{"type":"img","src":"https://..."}]
-- (url reste l'image de couverture, more_urls les images en plus)
ALTER TABLE media ADD COLUMN more_urls TEXT NOT NULL DEFAULT '[]';
