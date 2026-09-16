# Portfolio FRANTZ — mémo projet

Site portfolio de François Teulé (frantzimann). Front statique Vite + three.js,
back Cloudflare (Worker + D1 + R2). Racine du dépôt : ce dossier `reduce/`.

## Où tourne quoi

| Brique | Détail |
|---|---|
| Site statique | dépôt GitHub `francoisteule-beep/mon-site-web`, branche `main` |
| API | Cloudflare Worker `portfolio-api` → `https://portfolio-api.francois-teule.workers.dev` |
| Base | Cloudflare D1 `portfolio-db` (id dans `wrangler.toml`) |
| Médias | Bucket R2 `video-portfolio`, servi par `https://assets.frantzimann.org` |
| Back-office | `public/_admin-ftz.html` (login via secrets du Worker) |

## Commandes

Toujours les lancer depuis ce dossier (celui qui contient `wrangler.toml`).

```bash
# Développement local du site
npm run dev            # vite, sert index.html et index4.html
npm run build          # génère dist/ (dist/ est gitignoré)

# Base de données D1 — TOUJOURS --remote pour la prod,
# sans --remote la commande ne touche qu'une copie locale
npx wrangler d1 execute portfolio-db --remote --file=<fichier>.sql
npx wrangler d1 execute portfolio-db --remote --command="SELECT id,title FROM projects ORDER BY sort_order"

# Worker
npx wrangler deploy
npx wrangler tail                      # logs en direct
npx wrangler secret put ADMIN_USERNAME # idem ADMIN_PASSWORD, ADMIN_SECRET

# Mise en ligne du site statique
git add -A && git commit -m "..." && git push
```

## Règle d'ordre à ne jamais inverser

Une migration qui ajoute des colonnes doit être exécutée **avant** `wrangler deploy`,
sinon le Worker écrit dans des colonnes qui n'existent pas et toutes les écritures échouent.

```bash
npx wrangler d1 execute portfolio-db --remote --file=migrate-002-thumb-desc-credits.sql
npx wrangler deploy
```

## Pièges de ce dépôt

`migrate.sql` commence par `DROP TABLE` : il recrée le schéma de zéro et efface tout.
Ne jamais le rejouer sur la base de production. Pour toute évolution, créer un nouveau
fichier `migrate-00X-<sujet>.sql` uniquement en `ALTER TABLE ... ADD COLUMN`.

Le back-office existe en deux exemplaires identiques, `_admin-ftz.html` à la racine et
`public/_admin-ftz.html`. Toute modification doit être appliquée aux deux, sinon la version
servie et la version versionnée divergent.

`dist/` est gitignoré : son contenu est un ancien build local et n'a aucun effet sur la prod.
Le fichier réellement publié est `index.html` à la racine.

Des fichiers macOS `._*` traînent dans le dépôt et sont suivis par git. Les ignorer.

## Schéma D1

```sql
projects(id, title, status, video_url, more_urls, sort_order, created_at,
         thumb_url, description, credits)
media(id, name, date, tools, url, sort_order)
clients(id, name, logo_url)
```

`more_urls` est un tableau JSON `[{"type":"video|img","src":"https://..."}]`.
`credits` est un tableau JSON `[{"role":"Direction artistique","name":"François Teulé"}]`.
`thumb_url` vide signifie que le site fabrique lui-même la vignette à partir de la vidéo.

## Routes du Worker

```
POST   /auth/login            { username, password } → { token }
GET    /projects              public
POST   /projects              auth
PUT    /projects/:id          auth
DELETE /projects/:id          auth
POST   /projects/reorder      auth  { ids: [...] }
GET|POST /media, PUT|DELETE /media/:id, POST /media/reorder
GET|POST /clients, DELETE /clients/:id
POST   /upload                auth  multipart { file, folder } → { url, key }
```

Les écritures exigent l'en-tête `Authorization: Bearer <ADMIN_SECRET>`.

## Pages du site

`index.html` est la version en ligne, scène three.js avec les télés cathodiques.
`index4.html` est la nouvelle version, mur de projets en CSS 3D, défilement infini,
vue liste, panneaux projet et infos. Pas encore en ligne.

Les constantes `CF_MEDIA` et `CF_IMAGE` en haut du script d'`index4.html` basculent
les médias sur les transformations Cloudflare (`/cdn-cgi/media/`, `/cdn-cgi/image/`)
une fois la fonctionnalité activée sur la zone.

## Avant de committer

Vérifier que les deux copies du back-office sont identiques :

```bash
shasum -a 256 _admin-ftz.html public/_admin-ftz.html
```

Ne pas committer les sauvegardes `*.bak`.
