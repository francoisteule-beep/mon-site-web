/**
 * FRANTZ Portfolio — Cloudflare Worker
 *
 * Bindings (wrangler.toml + secrets) :
 *   portfolio_db    → D1 database
 *   R2              → R2 bucket (video-portfolio)
 *   ADMIN_USERNAME  → wrangler secret put ADMIN_USERNAME
 *   ADMIN_PASSWORD  → wrangler secret put ADMIN_PASSWORD
 *   ADMIN_SECRET    → wrangler secret put ADMIN_SECRET  (token statique retourné à la connexion)
 *   R2_PUBLIC_URL   → variable wrangler.toml  (ex: https://assets.frantzimann.org)
 */

// ── Helpers ────────────────────────────────────────────────────────────────

const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

function isAuthed(request, env) {
    const auth = request.headers.get("Authorization") || "";
    return auth === `Bearer ${env.ADMIN_SECRET}`;
}

// ── Router ──────────────────────────────────────────────────────────────────

export default {
    async fetch(request, env) {
        const { pathname: path } = new URL(request.url);
        const method = request.method;

        // Preflight CORS
        if (method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS });
        }

        try {

            // ════════════════════════════════
            //  POST /auth/login
            // ════════════════════════════════
            if (path === "/auth/login" && method === "POST") {
                // Vérifier que les secrets sont bien configurés
                if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.ADMIN_SECRET) {
                    return json({ error: "Secrets non configurés — exécuter wrangler secret put" }, 500);
                }
                const body = await request.json().catch(() => ({}));
                const okUser = (body.username || "").trim() === env.ADMIN_USERNAME.trim();
                const okPass = (body.password || "").trim() === env.ADMIN_PASSWORD.trim();
                if (okUser && okPass) {
                    return json({ token: env.ADMIN_SECRET });
                }
                return json({ error: "Identifiants invalides" }, 401);
            }

            // Toutes les routes d'écriture nécessitent un token valide
            const isWrite = method !== "GET";
            if (isWrite && !isAuthed(request, env)) {
                return json({ error: "Non autorisé" }, 401);
            }

            // ════════════════════════════════
            //  PROJECTS
            // ════════════════════════════════

            if (path === "/projects") {

                if (method === "GET") {
                    const { results } = await env.portfolio_db
                        .prepare("SELECT * FROM projects ORDER BY sort_order ASC, created_at ASC")
                        .all();
                    results.forEach(p => {
                        try { p.more = JSON.parse(p.more_urls || "[]"); } catch { p.more = []; }
                    });
                    return json(results);
                }

                if (method === "POST") {
                    const { title, status = "published", video_url, more = [] } = await request.json();
                    if (!title || !video_url) return json({ error: "title et video_url requis" }, 400);
                    // sort_order = max existant + 1
                    const { results: rows } = await env.portfolio_db
                        .prepare("SELECT MAX(sort_order) as m FROM projects").all();
                    const nextOrder = ((rows[0]?.m) ?? 0) + 1;
                    await env.portfolio_db
                        .prepare("INSERT INTO projects (title, status, video_url, more_urls, sort_order) VALUES (?, ?, ?, ?, ?)")
                        .bind(title, status, video_url, JSON.stringify(more), nextOrder)
                        .run();
                    return json({ success: true });
                }
            }

            // POST /projects/reorder  — body: { ids: [3,1,2,5,...] }
            if (path === "/projects/reorder" && method === "POST") {
                const { ids } = await request.json();
                if (!Array.isArray(ids)) return json({ error: "ids[] requis" }, 400);
                const stmts = ids.map((id, i) =>
                    env.portfolio_db.prepare("UPDATE projects SET sort_order=? WHERE id=?").bind(i + 1, id)
                );
                await env.portfolio_db.batch(stmts);
                return json({ success: true });
            }

            // PUT /projects/:id
            if (path.match(/^\/projects\/\d+$/) && method === "PUT") {
                const id = path.split("/")[2];
                const { title, status, video_url, more = [] } = await request.json();
                await env.portfolio_db
                    .prepare("UPDATE projects SET title=?, status=?, video_url=?, more_urls=? WHERE id=?")
                    .bind(title, status, video_url, JSON.stringify(more), id)
                    .run();
                return json({ success: true });
            }

            // DELETE /projects/:id
            if (path.match(/^\/projects\/\d+$/) && method === "DELETE") {
                const id = path.split("/")[2];
                await env.portfolio_db
                    .prepare("DELETE FROM projects WHERE id = ?")
                    .bind(id).run();
                return json({ success: true });
            }

            // ════════════════════════════════
            //  MEDIA (photos)
            // ════════════════════════════════

            if (path === "/media") {

                if (method === "GET") {
                    const { results } = await env.portfolio_db
                        .prepare("SELECT * FROM media ORDER BY id DESC")
                        .all();
                    return json(results);
                }

                if (method === "POST") {
                    const { name, date, tools, url } = await request.json();
                    if (!name || !url) return json({ error: "name et url requis" }, 400);
                    await env.portfolio_db
                        .prepare("INSERT INTO media (name, date, tools, url) VALUES (?, ?, ?, ?)")
                        .bind(name, date || "", tools || "", url)
                        .run();
                    return json({ success: true });
                }
            }

            // PUT /media/:id
            if (path.match(/^\/media\/\d+$/) && method === "PUT") {
                const id = path.split("/")[2];
                const { name, date, tools, url } = await request.json();
                await env.portfolio_db
                    .prepare("UPDATE media SET name=?, date=?, tools=?, url=? WHERE id=?")
                    .bind(name, date || "", tools || "", url, id)
                    .run();
                return json({ success: true });
            }

            // DELETE /media/:id
            if (path.match(/^\/media\/\d+$/) && method === "DELETE") {
                const id = path.split("/")[2];
                await env.portfolio_db
                    .prepare("DELETE FROM media WHERE id = ?")
                    .bind(id).run();
                return json({ success: true });
            }

            // ════════════════════════════════
            //  CLIENTS
            // ════════════════════════════════

            if (path === "/clients") {

                if (method === "GET") {
                    const { results } = await env.portfolio_db
                        .prepare("SELECT * FROM clients ORDER BY name ASC")
                        .all();
                    return json(results);
                }

                if (method === "POST") {
                    const { name, logo_url } = await request.json();
                    if (!name || !logo_url) return json({ error: "name et logo_url requis" }, 400);
                    await env.portfolio_db
                        .prepare("INSERT INTO clients (name, logo_url) VALUES (?, ?)")
                        .bind(name, logo_url)
                        .run();
                    return json({ success: true });
                }
            }

            // DELETE /clients/:id
            if (path.match(/^\/clients\/\d+$/) && method === "DELETE") {
                const id = path.split("/")[2];
                await env.portfolio_db
                    .prepare("DELETE FROM clients WHERE id = ?")
                    .bind(id).run();
                return json({ success: true });
            }

            // ════════════════════════════════
            //  UPLOAD → R2
            // ════════════════════════════════

            if (path === "/upload" && method === "POST") {
                if (!isAuthed(request, env)) return json({ error: "Non autorisé" }, 401);

                const formData = await request.formData();
                const file     = formData.get("file");
                const folder   = (formData.get("folder") || "uploads").replace(/[^a-z0-9_-]/gi, "");

                if (!file || typeof file === "string") {
                    return json({ error: "Aucun fichier reçu" }, 400);
                }

                // Clé unique : folder/timestamp-random.ext
                const originalName = file.name || "file";
                const ext  = originalName.split(".").pop().toLowerCase();
                const slug = originalName
                    .replace(/\.[^.]+$/, "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "-")
                    .slice(0, 40);
                const key = `${folder}/${Date.now()}-${slug}.${ext}`;

                await env.R2.put(key, file.stream(), {
                    httpMetadata: { contentType: file.type || "application/octet-stream" },
                });

                const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;
                return json({ url: publicUrl, key });
            }

            // ════════════════════════════════
            //  Route inconnue
            // ════════════════════════════════
            return json({ error: "Route inconnue" }, 404);

        } catch (err) {
            console.error(err);
            return json({ error: "Erreur serveur : " + err.message }, 500);
        }
    },
};
