/* ══════════════════════════════════════════════════════════
   ARCHIVE ENGINE — grille torique projetée sur cylindre
   Reconstruction du moteur décrit dans kavieng-archive-spec.md
   (rétro-ingénierie de kaviengcreative.com), adaptée aux données
   et à l'identité visuelle de ce site : la structure de rendu,
   l'inertie et la répulsion au survol viennent de la spec ; le
   contenu, la palette, la police et les gabarits de vignette
   (.tile/.tframe/.tlabel) restent ceux du projet.

   Contrat avec index.html (script classique, chargé avant celui-ci
   car les modules sont toujours différés) :
     - window._archiveReady  : Promise résolue une fois les projets chargés
     - window.ArchiveData    : tableau ALL (projets + médias)
     - window.ArchiveHelpers : { esc, thumb, isReduced, isBlocked, open }
   Ce module expose en retour window.ArchiveEngine = { setFilter, setEnabled }.
═══════════════════════════════════════════════════════════ */
import { gsap } from 'gsap';

const ROWS = 9, COLS = 7;
const CENTER_ROW = (ROWS - 1) / 2, CENTER_COL = (COLS - 1) / 2;

const SCALE_REST = 0.985;
const SCALE_HOVER = 1.075;

const WHEEL_FACTOR = 0.74;
const DRAG_X = 1.12;
const DRAG_Y = 1.08;
const SMOOTH_IDLE = 21;
const SMOOTH_DRAG = 27;
const KEY_STEP = 56;
const KEY_STEP_SHIFT = 118;

const PUSH_INNER = 0.2;
const PUSH_RANGE = 2.8;
const PUSH_FALLOFF = 0.8;
const PUSH_DECAY = Math.log(3);

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function mod(n, m) { return ((n % m) + m) % m; }
function deg(rad) { return (rad * 180) / Math.PI; }
function wrapSigned(v, period) { return mod(v + period / 2, period) - period / 2; }
function smoothstep(a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

function metrics() {
  const narrow = innerWidth <= 700;
  const cellWidth = narrow
    ? clamp(innerWidth * 0.78, 260, 315)
    : clamp(innerWidth * 0.30, 340, 470);
  return {
    cellWidth,
    cellHeight: cellWidth * 0.61,
    columnGap: narrow ? 14 : 24,
    rowGap: narrow ? 5 : 6,
    radiusX: narrow ? Math.max(innerWidth * 4.10, 1450) : Math.max(innerWidth * 1.90, 2200),
    radiusY: narrow ? Math.max(innerHeight * 0.94, 700) : Math.max(innerHeight * 1.25, 980),
    baseDepth: narrow ? -610 : -820,
    far: narrow ? 2350 : 3100,
  };
}

function blurForDepth(d) {
  if (d < 42) return 0.6;
  if (d < 150) return 1;
  if (d < 320) return 1.6;
  if (d < 560) return 2.3;
  return innerWidth <= 700 ? 2.8 : 3.2;
}

const TILE_COUNT = ROWS * COLS;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* Voisins d'une case sur le tore (gauche/droite/haut/bas, avec repli
   sur le bord opposé) — utilisé pour ne jamais placer deux fois le
   même projet sur deux cases qui se touchent. */
function neighborsOf(idx) {
  const r = Math.floor(idx / COLS), c = idx % COLS;
  return [
    r * COLS + mod(c - 1, COLS),
    r * COLS + mod(c + 1, COLS),
    mod(r - 1, ROWS) * COLS + c,
    mod(r + 1, ROWS) * COLS + c,
  ];
}

/* Remplit les 63 cases avec les projets/médias correspondant au filtre,
   répétés à parts égales et mélangés, sans jamais placer deux fois le
   même projet sur deux cases voisines (gauche/droite/haut/bas, y compris
   à la couture du tore) — ce qui évite les doublons côte à côte et les
   vignettes "Bientôt" qui se regroupent au lieu de se répartir. */
function buildAssignment(items) {
  const pool = [];
  while (pool.length < TILE_COUNT) pool.push(...shuffle(items.slice()));
  pool.length = TILE_COUNT;
  shuffle(pool);
  if (items.length < 2) return pool;

  const grid = pool.slice();
  const conflicts = () => {
    const bad = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      if (neighborsOf(i).some(j => j > i && grid[j] === grid[i])) bad.push(i);
    }
    return bad;
  };

  /* Un doublon voisin restant est réparé en l'échangeant avec une case
     ailleurs sur la grille qui ne crée aucun nouveau conflit. Quelques
     passages suffisent toujours sur une grille de cette taille. */
  for (let pass = 0; pass < 6; pass++) {
    const bad = conflicts();
    if (!bad.length) break;
    for (const i of bad) {
      for (let j = 0; j < TILE_COUNT; j++) {
        if (j === i || grid[j] === grid[i]) continue;
        const iNeighbors = neighborsOf(i), jNeighbors = neighborsOf(j);
        const iOk = iNeighbors.every(k => k === j || grid[k] !== grid[j]);
        const jOk = jNeighbors.every(k => k === i || grid[k] !== grid[i]);
        if (iOk && jOk) { const tmp = grid[i]; grid[i] = grid[j]; grid[j] = tmp; break; }
      }
    }
  }
  return grid;
}

async function boot() {
  await window._archiveReady;
  const H = window.ArchiveHelpers;
  const ALL = window.ArchiveData || [];
  const N = ALL.length;

  const stageEl = document.getElementById('wall');
  const worldEl = document.getElementById('plane');
  const liveEl = document.getElementById('archive-live');
  const depthEl = document.getElementById('count');
  if (!stageEl || !worldEl || N === 0) { window.ArchiveEngine = { setFilter(){}, setEnabled(){} }; return; }

  const REDUCED = H.isReduced();
  const HOVER_CAPABLE = matchMedia('(hover: hover)').matches;

  let m = metrics();
  const target = { panX: 0, scrollY: 0 };
  const view = { panX: 0, scrollY: 0 };
  const state = { filter: 'TOUT', pointer: null, dragged: false, suppressClick: false, enabled: true };
  const reticle = { value: 0, row: CENTER_ROW, column: CENTER_COL, targetRow: CENTER_ROW, targetColumn: CENTER_COL, active: false };
  let focusTile = null;
  let announcedKey = null;
  let dirty = false;

  /* ── 63 vignettes DOM, créées une fois, jamais détruites. Leur contenu
     (t.item) est assigné par applyContent(), pas ici : il change à
     chaque changement de filtre. ── */
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tileEl = document.createElement('button');
      tileEl.type = 'button';
      tileEl.tabIndex = -1;

      const frame = document.createElement('span');
      frame.className = 'tframe';

      const label = document.createElement('span');
      label.className = 'tlabel';

      tileEl.appendChild(frame);
      tileEl.appendChild(label);
      worldEl.appendChild(tileEl);

      const t = {
        tile: tileEl, frame, label, item: null,
        row: r, column: c, dispRow: r, dispColumn: c,
        push: { x: 0, y: 0 },
        px: 0, py: 0, pz: 0, hAngle: 0, vAngle: 0,
        opacity: 0, painted: false, focusDepth: 0,
        lastTransform: null, lastOpacity: null, lastBlur: null,
        lastPointer: null, lastVisibility: null,
      };
      tiles.push(t);

      tileEl.addEventListener('click', () => {
        if (state.dragged || state.suppressClick || !t.item || t.item.soon) return;
        H.open(t.item.key);
      });
      if (HOVER_CAPABLE) {
        tileEl.addEventListener('pointerenter', () => {
          reticle.targetRow = t.dispRow;
          reticle.targetColumn = t.dispColumn;
          reticle.active = true;
        });
        tileEl.addEventListener('pointerleave', () => { reticle.active = false; });
      }
    }
  }

  function sizeTiles() {
    const w = m.cellWidth + 'px', h = m.cellHeight + 'px';
    for (const t of tiles) { t.tile.style.width = w; t.tile.style.height = h; }
  }
  sizeTiles();

  function loadThumb(t) {
    const it = t.item;
    if (it.soon || !it.src) return;
    H.thumb(it.thumb || it.src, it.thumb ? 'photo' : it.kind, function (url) {
      if (!url || t.item !== it) return; /* le contenu a changé entretemps */
      const im = document.createElement('img');
      im.alt = ''; im.decoding = 'async';
      im.src = url;
      t.frame.innerHTML = '';
      t.frame.appendChild(im);
    });
  }

  /* Recalcule quel projet/média s'affiche sur chaque case pour le filtre
     donné, et met à jour le DOM des seules tuiles dont le contenu change. */
  function applyContent(filter) {
    const items = filter === 'TOUT' ? ALL : ALL.filter(i => i.cat === filter);
    if (!items.length) return;
    const grid = buildAssignment(items);
    const changed = [];

    for (const t of tiles) {
      const item = grid[t.row * COLS + t.column];
      t.dispRow = t.row; t.dispColumn = t.column;
      if (t.item === item) continue;
      t.item = item;
      changed.push(t);

      t.tile.className = 'tile' + (item.soon ? ' soon' : '');
      t.tile.setAttribute('aria-label', item.soon ? 'Projet à venir' : ('Ouvrir ' + item.title));
      t.frame.innerHTML = '<span class="ph">' + H.esc(item.soon ? 'Bientôt' : item.title) + '</span>';
      t.label.innerHTML = item.soon ? 'Bientôt'
        : H.esc(item.title) + (item.year ? ' <em>· ' + H.esc(item.year) + '</em>' : '');
    }

    /* Les tuiles proches du centre chargent en premier. */
    changed.sort((a, b) => {
      const da = Math.max(Math.abs(a.row - CENTER_ROW), Math.abs(a.column - CENTER_COL));
      const db = Math.max(Math.abs(b.row - CENTER_ROW), Math.abs(b.column - CENTER_COL));
      return da - db;
    }).forEach(loadThumb);
  }
  applyContent('TOUT');

  /* ── position projetée d'une cellule arbitraire (centre de répulsion) ── */
  function arcPosition(row, column, stepX, stepY, periodX, periodY) {
    const ax = wrapSigned((column - Math.floor(COLS / 2)) * stepX + view.panX, periodX) / m.radiusX;
    const ay = wrapSigned((row - Math.floor(ROWS / 2)) * stepY - view.scrollY, periodY) / m.radiusY;
    return { x: Math.sin(ax) * m.radiusX, y: Math.sin(ay) * m.radiusY };
  }

  function applyPush(stepX, stepY, periodX, periodY) {
    const a = reticle.value;
    if (a < 0.001) { tiles.forEach(t => { t.push.x = 0; t.push.y = 0; }); return; }
    const centre = arcPosition(reticle.row, reticle.column, stepX, stepY, periodX, periodY);
    const ampX = m.cellWidth * (SCALE_HOVER - SCALE_REST) / 2;
    const ampY = m.cellHeight * (SCALE_HOVER - SCALE_REST) / 2;

    for (const t of tiles) {
      const gridDist = Math.hypot(
        wrapSigned(t.dispColumn - reticle.column, COLS),
        wrapSigned(t.dispRow - reticle.row, ROWS)
      );
      const vx = t.px - centre.x, vy = t.py - centre.y;
      const d = Math.hypot(vx, vy);
      if (gridDist > PUSH_RANGE || d < 0.01) { t.push.x = 0; t.push.y = 0; continue; }
      const ramp = smoothstep(PUSH_INNER, 1, gridDist);
      const decay = Math.exp(-Math.max(gridDist - 1, 0) * PUSH_DECAY);
      const edge = clamp((PUSH_RANGE - gridDist) / PUSH_FALLOFF, 0, 1);
      const force = ramp * decay * edge * a;
      t.push.x = (vx / d) * ampX * force;
      t.push.y = (vy / d) * ampY * force;
    }
  }

  function render() {
    const stepX = m.cellWidth + m.columnGap, periodX = stepX * COLS;
    const stepY = m.cellHeight + m.rowGap, periodY = stepY * ROWS;
    let focus = null;

    for (const t of tiles) {
      const ox = (t.dispColumn - Math.floor(COLS / 2)) * stepX;
      const arcX = wrapSigned(ox + view.panX, periodX);
      const ax = arcX / m.radiusX;
      const hAngle = deg(ax);
      const x = Math.sin(ax) * m.radiusX;
      const dx = m.radiusX * (1 - Math.cos(ax));

      const oy = (t.dispRow - Math.floor(ROWS / 2)) * stepY;
      const arcY = wrapSigned(oy - view.scrollY, periodY);
      const ay = arcY / m.radiusY;
      const vAngle = deg(ay);
      const y = Math.sin(ay) * m.radiusY;
      const dy = m.radiusY * (1 - Math.cos(ay));

      const z = m.baseDepth + dx + dy;
      const depth = dx + dy;

      const visible = z < -75 && z > -m.far && Math.abs(vAngle) < 82 && Math.abs(hAngle) < 82;
      const farFade = clamp(1 - (Math.abs(z) - 340) / (m.far - 340), 0.12, 1);
      const nearFade = clamp((-z - 75) / 150, 0, 1);
      const opacity = visible ? farFade * nearFade : 0;
      const blur = opacity < 0.2 ? 0 : blurForDepth(depth);

      const interactive = opacity > 0.22 && !t.item.soon;
      const painted = opacity > 0.018;

      if (t.lastPointer !== interactive) { t.tile.style.pointerEvents = interactive ? 'auto' : 'none'; t.lastPointer = interactive; }
      if (t.lastVisibility !== painted) { t.tile.style.visibility = painted ? 'visible' : 'hidden'; t.lastVisibility = painted; }
      if (t.lastBlur !== blur) { t.tile.style.setProperty('--perspective-blur', blur + 'px'); t.lastBlur = blur; }

      if (t.lastOpacity === null || Math.abs(t.lastOpacity - opacity) > 0.004) {
        t.tile.style.opacity = opacity.toFixed(3);
        t.lastOpacity = opacity;
      }

      if (opacity > 0.45 && (!focus || depth < focus.focusDepth)) focus = t;

      Object.assign(t, { px: x, py: y, pz: z, hAngle, vAngle, painted, opacity, focusDepth: depth });
    }

    applyPush(stepX, stepY, periodX, periodY);

    for (const t of tiles) {
      if (!t.painted) continue;
      const p = t.push;
      const transform =
        'translate(-50%, -50%) translate3d(' + (t.px + p.x).toFixed(2) + 'px, ' + (t.py + p.y).toFixed(2) + 'px, ' + t.pz.toFixed(2) + 'px) ' +
        'rotateX(' + (-t.vAngle).toFixed(2) + 'deg) rotateY(' + (-t.hAngle * 0.42).toFixed(2) + 'deg)';
      if (t.lastTransform !== transform) { t.tile.style.transform = transform; t.lastTransform = transform; }
    }

    if (focusTile !== focus) {
      if (focusTile) focusTile.tile.tabIndex = -1;
      if (focus) focus.tile.tabIndex = 0;
      focusTile = focus;
    }
    if (focus && announcedKey !== focus.item.key) {
      announcedKey = focus.item.key;
      if (liveEl) liveEl.textContent = focus.item.title + (focus.item.year ? ' · ' + focus.item.year : '');
    }
    if (depthEl) {
      const cn = '↓ ' + String(Math.round(mod(view.scrollY, periodY))).padStart(4, '0');
      if (depthEl._v !== cn) { depthEl.textContent = cn; depthEl._v = cn; }
    }
  }

  /* ── inertie : lissage exponentiel indépendant du framerate ── */
  function invalidate() {
    if (REDUCED) { view.scrollY = target.scrollY; view.panX = target.panX; render(); return; }
    dirty = true;
  }

  function tick() {
    if (!state.enabled || !dirty) return;
    const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 0.05);
    const k = state.pointer ? SMOOTH_DRAG : SMOOTH_IDLE;
    const t = 1 - Math.exp(-k * dt);
    view.scrollY += (target.scrollY - view.scrollY) * t;
    view.panX += (target.panX - view.panX) * t;
    render();
    if (Math.abs(target.scrollY - view.scrollY) < 0.02 && Math.abs(target.panX - view.panX) < 0.02) {
      view.scrollY = target.scrollY;
      view.panX = target.panX;
      dirty = false;
      render();
    }
  }
  gsap.ticker.add(tick);

  /* ── suivi du réticule de survol, ticker séparé, constante 8 ── */
  function reticleTick() {
    if (!state.enabled) return;
    const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 0.05);
    const follow = 1 - Math.exp(-8 * dt);
    reticle.row += wrapSigned(reticle.targetRow - reticle.row, ROWS) * follow;
    reticle.column += wrapSigned(reticle.targetColumn - reticle.column, COLS) * follow;
    const targetValue = reticle.active ? 1 : 0;
    const rate = targetValue > reticle.value ? (1 / 0.42) : (1 / 0.34);
    const wasActive = reticle.value > 0.001;
    reticle.value += (targetValue - reticle.value) * (1 - Math.exp(-rate * dt));
    if (wasActive || reticle.value > 0.001) render();
  }
  gsap.ticker.add(reticleTick);

  /* ── entrées : molette, glisser, clavier ── */
  stageEl.addEventListener('wheel', function (e) {
    if (!state.enabled) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    target.scrollY += dy * WHEEL_FACTOR;
    invalidate();
  }, { passive: false });

  stageEl.addEventListener('pointerdown', function (e) {
    if (!state.enabled || e.button !== 0) return;
    state.pointer = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, time: e.timeStamp, vx: 0, vy: 0 };
    state.dragged = false;
    stageEl.dataset.dragging = 'true';
  });
  stageEl.addEventListener('pointermove', function (e) {
    const p = state.pointer;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    const dt = clamp(e.timeStamp - p.time, 8, 48);
    p.vx = p.vx * 0.58 + (dx / dt) * 0.42;
    p.vy = p.vy * 0.58 + (dy / dt) * 0.42;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 5) {
      state.dragged = true;
      if (!stageEl.hasPointerCapture(e.pointerId)) stageEl.setPointerCapture(e.pointerId);
    }
    p.x = e.clientX; p.y = e.clientY; p.time = e.timeStamp;
    target.panX += dx * DRAG_X;
    target.scrollY -= dy * DRAG_Y;
    invalidate();
  });
  function endDrag(e) {
    const p = state.pointer;
    if (!p || p.id !== e.pointerId) return;
    state.suppressClick = state.dragged;
    if (state.dragged && e.type !== 'pointercancel' && !REDUCED) {
      const freshness = clamp(1 - (e.timeStamp - p.time) / 140, 0, 1);
      target.panX += clamp(p.vx * 150 * freshness, -innerWidth * 0.9, innerWidth * 0.9);
      target.scrollY -= clamp(p.vy * 150 * freshness, -innerHeight, innerHeight);
      invalidate();
    }
    setTimeout(() => { state.suppressClick = false; }, 120);
    state.pointer = null;
    stageEl.dataset.dragging = 'false';
    if (stageEl.hasPointerCapture(e.pointerId)) stageEl.releasePointerCapture(e.pointerId);
  }
  stageEl.addEventListener('pointerup', endDrag);
  stageEl.addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', function (e) {
    if (!state.enabled || H.isBlocked()) return;
    const step = e.shiftKey ? KEY_STEP_SHIFT : KEY_STEP;
    if (e.key === 'ArrowDown') { target.scrollY += step; e.preventDefault(); invalidate(); }
    else if (e.key === 'ArrowUp') { target.scrollY -= step; e.preventDefault(); invalidate(); }
    else if (e.key === 'ArrowRight') { target.panX += step; e.preventDefault(); invalidate(); }
    else if (e.key === 'ArrowLeft') { target.panX -= step; e.preventDefault(); invalidate(); }
  });

  window.addEventListener('resize', function () {
    m = metrics();
    sizeTiles();
    if (state.enabled) render();
  });

  function setFilter(filter) {
    state.filter = filter;
    applyContent(filter);
    const periodX = (m.cellWidth + m.columnGap) * COLS;
    const periodY = (m.cellHeight + m.rowGap) * ROWS;
    target.panX = Math.round(view.panX / periodX) * periodX;
    target.scrollY = Math.round(view.scrollY / periodY) * periodY;
    invalidate();
    if (REDUCED) render();
  }

  function setEnabled(on) {
    state.enabled = on;
    if (on) { m = metrics(); sizeTiles(); invalidate(); render(); }
  }

  render();
  window.ArchiveEngine = { setFilter, setEnabled };
}

boot();
