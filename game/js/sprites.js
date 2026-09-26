// WAR OF THE EAST — sprites.js
// Procedural placeholder top-down art, generated once at boot from the config
// tables. Every unit/building id gets a Canvas. Drop-in replacement: put a PNG
// at art/sprites/<id>.png (or point SPRITE_OVERRIDES[id] at an image) and it
// will be used instead — identical footprints, so nothing else changes.
export const SPRITE_OVERRIDES = {}; // id -> HTMLImageElement (external)

// Optional drop-in art: put PNGs in art/sprites/<class>/<id>.png (units/,
// buildings/, tiles/) and list the ids in art/sprites/manifest.json, e.g.
// {"units": ["c_inf"], "buildings": ["depot"], "tiles": ["grass"]}
// Anything not listed falls back to the procedural art below. A bare
// "buildings/depot.png" serves both factions; "china_depot.png" overrides one.
// Failures are silent (file:// or missing folder = pure procedural game).
import { UNITS, BUILDINGS, FACTION_META } from "./config.js";

export function loadArtOverrides(manifestUrl = "art/sprites/manifest.json") {
  return fetch(manifestUrl)
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      if (!m) return;
      const want = (ids, dir) => (ids || []).map((id) => {
        const img = new Image();
        img.src = `art/sprites/${dir}/${id}.png`;
        SPRITE_OVERRIDES[id] = img;
        return img;
      });
      const imgs = [...want(m.units, "units"), ...want(m.buildings, "buildings"), ...want(m.tiles, "tiles")];
      return Promise.allSettled(imgs.map((i) => i.decode ? i.decode() : Promise.resolve()));
    })
    .catch(() => {}); // network/file:// failure -> keep procedural sprites
}

const PAL = {
  china: { base: "#4a7a3a", dark: "#2f5426", trim: "#c9a227", armor: "#5d8a4a", armorD: "#3f5f33", metal: "#6b7a52" },
  japan: { base: "#5b6248", dark: "#39402d", trim: "#c0402a", armor: "#6a7355", armorD: "#49523a", metal: "#7a7466" },
};

const canvasCache = new Map();

function mkCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, g: c.getContext("2d") };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

// ---- infantry: small soldier with helmet ----
function gInfantry(id, fac) {
  const { c, g } = mkCanvas(28, 28);
  const p = PAL[fac];
  // shadow
  g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.ellipse(14, 16, 9, 10, 0, 0, 7); g.fill();
  // rifle (diagonal)
  if (id.endsWith("heavy") || id.endsWith("mort") || id.endsWith("gren")) {
    g.strokeStyle = "#3a2f22"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(20, 22); g.lineTo(8, 8); g.stroke();
  }
  // body (coat)
  g.fillStyle = p.base; g.beginPath(); g.ellipse(14, 15, 7.5, 8.5, 0, 0, 7); g.fill();
  g.fillStyle = p.dark; g.beginPath(); g.ellipse(14, 17, 7.5, 5, 0, 0, Math.PI); g.fill();
  // helmet
  g.fillStyle = p.trim; g.beginPath(); g.arc(14, 9, 5.5, 0, 7); g.fill();
  g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.arc(14, 8, 5.5, Math.PI, 2 * Math.PI); g.fill();
  // elite mark
  if (id.endsWith("elite")) { g.fillStyle = "#ffd54a"; g.beginPath(); g.arc(14, 9, 2, 0, 7); g.fill(); }
  // engineer
  if (id.endsWith("eng")) { g.strokeStyle = "#e0d090"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(9, 14); g.lineTo(19, 14); g.stroke(); }
  return c;
}

// ---- tank: hull + turret + barrel, size by tier ----
function gTank(id, fac) {
  const t = UNITS[id];
  const rare = t.rare, tier = t.tier;
  const size = tier >= 3 ? 44 : tier === 2 ? 40 : 36;
  const { c, g } = mkCanvas(size, size);
  const p = PAL[fac];
  const cx = size / 2, cy = size / 2;
  g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(cx, cy + 3, size * 0.42, size * 0.46, 0, 0, 7); g.fill();
  // tracks
  g.fillStyle = p.armorD;
  const tw = size * 0.16;
  g.fillRect(cx - size * 0.42, cy - size * 0.36, tw, size * 0.72);
  g.fillRect(cx + size * 0.42 - tw, cy - size * 0.36, tw, size * 0.72);
  // hull
  g.fillStyle = p.armor;
  roundRect(g, cx - size * 0.36, cy - size * 0.3, size * 0.72, size * 0.58, 4); g.fill();
  g.strokeStyle = p.armorD; g.lineWidth = 2; g.stroke();
  // turret
  g.fillStyle = shade(p.armor, -14);
  const tr = size * (rare ? 0.16 : 0.13);
  g.beginPath(); g.arc(cx, cy - 2, tr, 0, 7); g.fill();
  // barrel
  g.strokeStyle = p.armorD; g.lineWidth = size * 0.07; g.lineCap = "round";
  g.beginPath(); g.moveTo(cx, cy - 2); g.lineTo(cx, cy - size * 0.48); g.stroke();
  // faction marking
  g.fillStyle = p.trim; g.beginPath(); g.arc(cx, cy - 2, tr * 0.45, 0, 7); g.fill();
  if (rare) { g.strokeStyle = "#ffd54a"; g.lineWidth = 2; roundRect(g, cx - size * 0.36, cy - size * 0.3, size * 0.72, size * 0.58, 4); g.stroke(); }
  return c;
}

// ---- gun (static): base + big barrel ----
function gGun(id, fac) {
  const heavy = UNITS[id].dmg >= 50 || UNITS[id].at;
  const aa = !!UNITS[id].aa;
  const { c, g } = mkCanvas(36, 36);
  const p = PAL[fac];
  g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(18, 20, 13, 14, 0, 0, 7); g.fill();
  g.fillStyle = p.metal; g.fillRect(4, 16, 28, 14);
  g.fillStyle = shade(p.metal, -20); g.fillRect(4, 22, 28, 8);
  // barrel
  g.strokeStyle = "#2e2a24"; g.lineWidth = heavy ? 6 : 4; g.lineCap = "round";
  g.beginPath(); g.moveTo(18, 16); g.lineTo(18, aa ? 8 : 4); g.stroke();
  // turret box
  g.fillStyle = p.armor; roundRect(g, 10, 6, 16, aa ? 6 : 8, 2); g.fill();
  g.fillStyle = p.trim; g.beginPath(); g.arc(18, 10, 2.5, 0, 7); g.fill();
  return c;
}

// ---- aircraft: side-on plane (simple silhouette) ----
function gPlane(id, fac) {
  const t = UNITS[id];
  const size = t.rare || t.tier >= 2 ? 52 : 46;
  const { c, g } = mkCanvas(size, size);
  const p = PAL[fac];
  const cx = size / 2;
  g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(cx, size * 0.72, size * 0.4, size * 0.12, 0, 0, 7); g.fill();
  // wings (center-crossing, X shape like classic top-down plane)
  g.fillStyle = p.armor;
  g.beginPath();
  g.moveTo(cx, size * 0.42); g.lineTo(cx - size * 0.48, size * 0.5);
  g.lineTo(cx, size * 0.58); g.lineTo(cx + size * 0.48, size * 0.5);
  g.closePath(); g.fill();
  g.strokeStyle = p.armorD; g.lineWidth = 1.5; g.stroke();
  // fuselage
  g.fillStyle = shade(p.armor, -10);
  g.beginPath(); g.ellipse(cx, size * 0.5, size * 0.09, size * 0.34, 0, 0, 7); g.fill();
  // tail
  g.beginPath(); g.moveTo(cx, size * 0.8); g.lineTo(cx - size * 0.14, size * 0.92);
  g.lineTo(cx, size * 0.86); g.lineTo(cx + size * 0.14, size * 0.92); g.closePath(); g.fill();
  // nose
  g.fillStyle = p.metal; g.beginPath(); g.arc(cx, size * 0.18, size * 0.05, 0, 7); g.fill();
  // hinomaru / star marking
  g.fillStyle = fac === "japan" ? "#d04028" : "#ffd23e";
  if (fac === "japan") { g.beginPath(); g.arc(cx, size * 0.5, size * 0.07, 0, 7); g.fill(); }
  else { g.beginPath(); g.arc(cx, size * 0.5, size * 0.06, 0, 7); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(cx, size * 0.5, size * 0.025, 0, 7); g.fill(); }
  return c;
}

// ---- buildings: 1-tile or bigger, top-down with faction trim ----
function gBuilding(id, fac) {
  const b = BUILDINGS[id];
  const w = (b.w || 1) * 32 - 4, h = (b.h || 1) * 32 - 4;
  const { c, g } = mkCanvas(w, h);
  const p = PAL[fac];
  // base slab
  g.fillStyle = "#565147"; roundRect(g, 1, 1, w - 2, h - 2, 3); g.fill();
  g.fillStyle = p.base; roundRect(g, 3, 3, w - 6, h - 6, 2); g.fill();
  // roof detail by type
  const cx = w / 2, cy = h / 2;
  const roof = p.dark;
  if (id === "depot") {
    g.fillStyle = roof;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      roundRect(g, 7 + i * (w - 14) / 3, 8 + j * (h - 16) / 2, (w - 14) / 3 - 2, (h - 16) / 2 - 2, 2); g.fill();
    }
    g.fillStyle = p.trim; g.fillRect(4, 4, w - 8, 3);
  } else if (id === "power") {
    g.fillStyle = roof; g.beginPath(); g.arc(cx, cy, Math.min(w, h) * 0.32, 0, 7); g.fill();
    g.strokeStyle = p.trim; g.lineWidth = 3; g.beginPath();
    g.moveTo(cx, cy - Math.min(w, h) * 0.32); g.lineTo(cx, cy + Math.min(w, h) * 0.32); g.stroke();
    g.fillStyle = p.trim; g.beginPath(); g.arc(cx, cy, 3, 0, 7); g.fill();
  } else if (id === "ore") {
    g.fillStyle = roof; g.beginPath(); g.arc(cx, cy, Math.min(w, h) * 0.3, 0, 7); g.fill();
    g.fillStyle = "#d98c3f"; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 6, cy + 5); g.lineTo(cx - 6, cy + 5); g.closePath(); g.fill();
  } else if (id === "steel") {
    g.fillStyle = roof; roundRect(g, 6, 6, w - 12, h - 12, 2); g.fill();
    g.fillStyle = "#9aa3ad"; for (let i = 0; i < 3; i++) g.fillRect(8 + i * (w - 16) / 3, 8, 4, h - 16);
  } else if (id === "fuel") {
    g.fillStyle = roof;
    g.beginPath(); g.arc(cx - w * 0.18, cy, w * 0.16, 0, 7); g.fill();
    g.beginPath(); g.arc(cx + w * 0.18, cy, w * 0.16, 0, 7); g.fill();
    g.fillStyle = p.trim; g.fillRect(cx - w * 0.18, cy + w * 0.16, w * 0.36, 3);
  } else if (id === "barracks") {
    g.fillStyle = roof; roundRect(g, 5, 5, w - 10, h - 10, 2); g.fill();
    g.fillStyle = p.trim; g.fillRect(5, h / 2 - 1, w - 10, 2);
  } else if (id === "tankf") {
    g.fillStyle = roof; roundRect(g, 5, 5, w - 10, h - 10, 3); g.fill();
    g.strokeStyle = p.trim; g.lineWidth = 2; g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = p.armor; g.beginPath(); g.arc(cx, cy, Math.min(w, h) * 0.2, 0, 7); g.fill();
  } else if (id === "airf") {
    g.fillStyle = "#6e6a5f"; roundRect(g, 4, 4, w - 8, h - 8, 2); g.fill();
    g.strokeStyle = "#e8e2cf"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(6, cy); g.lineTo(w - 6, cy); g.stroke();
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(6 + i * (w - 12) / 5, cy - 6); g.lineTo(6 + i * (w - 12) / 5, cy + 6); g.stroke(); }
  } else if (id === "lab") {
    g.fillStyle = roof; roundRect(g, 5, 5, w - 10, h - 10, 2); g.fill();
    g.strokeStyle = p.trim; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, Math.min(w, h) * 0.24, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(cx, cy - Math.min(w, h) * 0.24); g.lineTo(cx, cy + Math.min(w, h) * 0.24); g.stroke();
  } else if (id === "watch" || id === "bunker" || id === "concb") {
    const big = id === "concb";
    g.fillStyle = big ? "#7d7466" : roof;
    roundRect(g, 5, 5, w - 10, h - 10, big ? 6 : 2); g.fill();
    g.fillStyle = "#2b261f"; g.beginPath(); g.arc(cx, big ? cy + 2 : cy, big ? w * 0.12 : w * 0.09, 0, 7); g.fill();
    g.strokeStyle = "#2b261f"; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + w * 0.2, cy - h * 0.24); g.stroke();
  } else if (id === "wire") {
    g.strokeStyle = "#8a8272"; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(4, 6 + i * (h - 12) / 3); g.lineTo(w - 4, 6 + i * (h - 12) / 3); g.stroke(); }
    g.fillStyle = "#5f584a"; for (let i = 0; i < 5; i++) g.fillRect(5 + i * (w - 10) / 4, 2, 3, 4);
    g.beginPath(); g.moveTo(4, 6); g.lineTo(w - 4, h - 6); g.moveTo(w - 4, 6); g.lineTo(4, h - 6); g.stroke();
  } else { // arsenal default
    g.fillStyle = roof; roundRect(g, 5, 5, w - 10, h - 10, 2); g.fill();
    g.fillStyle = p.trim; g.fillRect(6, 6, w - 12, 4);
  }
  // faction trim band at the bottom
  g.fillStyle = p.trim; g.globalAlpha = 0.85; g.fillRect(4, h - 5, w - 8, 3); g.globalAlpha = 1;
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export const SPRITES = {};
export const _unitKey = new Map(); // unit cfg object -> sprite id
export const _bId = new Map();     // building cfg object -> building id (sprite key = fac + "_" + id)
export function unitSpriteKey(cfg) { return _unitKey.get(cfg) || "u_unknown"; }
export function bSpriteKey(fac, cfg) { return fac + "_" + (_bId.get(cfg) || "depot"); }

export function buildSprites() {
  // units
  for (const [id, u] of Object.entries(UNITS)) {
    if (SPRITE_OVERRIDES[id]) { SPRITES[id] = SPRITE_OVERRIDES[id]; _unitKey.set(u, id); continue; }
    if (u.class === "infantry") { SPRITES[id] = gInfantry(id, u.fac); _unitKey.set(u, id); }
    else if (u.class === "tank") { SPRITES[id] = gTank(id, u.fac); _unitKey.set(u, id); }
    else if (u.class === "gun") { SPRITES[id] = gGun(id, u.fac); _unitKey.set(u, id); }
    else if (u.class === "air") { SPRITES[id] = gPlane(id, u.fac); _unitKey.set(u, id); }
  }
  // buildings (template objects are shared between factions — map cfg -> id only)
  for (const [id, b] of Object.entries(BUILDINGS)) {
    _bId.set(b, id);
    // a bare "depot.png" serves both factions; "china_depot.png"/"japan_depot.png" override one
    for (const fac of ["china", "japan"]) {
      const k = fac + "_" + id;
      const ov = SPRITE_OVERRIDES[k] || SPRITE_OVERRIDES[id];
      if (ov) SPRITES[k] = ov; else SPRITES[k] = gBuilding(id, fac);
    }
  }
  // tile overrides (manifest "tiles" entries)
  for (const t of Object.keys(TILES)) if (SPRITE_OVERRIDES[t]) TILES[t] = SPRITE_OVERRIDES[t];
  return SPRITES;
}

// terrain tile sprites
export const TILES = { grass: null, ore: null, oil: null, rock: null, tree: null };

export function buildTiles() {
  // grass
  let { c, g } = mkCanvas(32, 32);
  g.fillStyle = "#6b8a4a"; g.fillRect(0, 0, 32, 32);
  g.fillStyle = "rgba(90,120,60,.6)";
  for (let i = 0; i < 22; i++) g.fillRect(Math.random() * 30, Math.random() * 30, 2, 2);
  g.fillStyle = "rgba(60,86,40,.5)";
  for (let i = 0; i < 10; i++) g.fillRect(Math.random() * 30, Math.random() * 30, 3, 2);
  TILES.grass = c;
  // ore
  ({ c, g } = mkCanvas(32, 32));
  TILES.grass.getContext("2d").drawImage ? null : null;
  g.drawImage(TILES.grass, 0, 0);
  g.fillStyle = "#c77b32";
  g.beginPath(); g.moveTo(10, 24); g.lineTo(16, 8); g.lineTo(22, 24); g.closePath(); g.fill();
  g.fillStyle = "#8a5220";
  g.beginPath(); g.moveTo(20, 26); g.lineTo(25, 14); g.lineTo(29, 26); g.closePath(); g.fill();
  TILES.ore = c;
  // oil
  ({ c, g } = mkCanvas(32, 32));
  g.drawImage(TILES.grass, 0, 0);
  g.fillStyle = "#1c1a17";
  g.beginPath(); g.ellipse(16, 16, 12, 9, 0.3, 0, 7); g.fill();
  g.fillStyle = "rgba(90,70,40,.5)"; g.beginPath(); g.ellipse(13, 13, 3, 2, 0.3, 0, 7); g.fill();
  TILES.oil = c;
  // rock
  ({ c, g } = mkCanvas(32, 32));
  g.drawImage(TILES.grass, 0, 0);
  g.fillStyle = "#77746e";
  g.beginPath(); g.moveTo(6, 26); g.lineTo(13, 8); g.lineTo(24, 12); g.lineTo(27, 25); g.closePath(); g.fill();
  g.fillStyle = "#98948c";
  g.beginPath(); g.moveTo(13, 8); g.lineTo(20, 10); g.lineTo(16, 18); g.closePath(); g.fill();
  TILES.rock = c;
  // tree
  ({ c, g } = mkCanvas(32, 32));
  g.drawImage(TILES.grass, 0, 0);
  g.fillStyle = "#5a4632"; g.fillRect(14, 20, 4, 8);
  g.fillStyle = "#3a5c2a"; g.beginPath(); g.arc(16, 13, 11, 0, 7); g.fill();
  g.fillStyle = "#4a7033"; g.beginPath(); g.arc(12, 9, 6, 0, 7); g.arc(21, 10, 5, 0, 7); g.fill();
  TILES.tree = c;
  return TILES;
}
