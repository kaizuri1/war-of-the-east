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

// ---- infantry (static top-down): silhouette per role ----
// roles: inf (rifle), heavy (fat auto-rifle + bulky coat), gren (grenade belt),
//        mort (mortar tube, crouched), eng (cross on helmet), scout (cap, slim),
//        elite (gold star)
function gInfantry(id, fac) {
  const { c, g } = mkCanvas(28, 28);
  const p = PAL[fac];
  const role =
    id.endsWith("heavy") ? "heavy" :
    id.endsWith("gren") ? "gren" :
    id.endsWith("mort") ? "mort" :
    id.endsWith("eng") ? "eng" :
    id.endsWith("scout") ? "scout" :
    id.endsWith("elite") ? "elite" : "inf";
  const heavy = role === "heavy";
  // shadow
  g.fillStyle = "rgba(0,0,0,.25)";
  g.beginPath(); g.ellipse(14, 16, heavy ? 10 : 9, 10, 0, 0, 7); g.fill();

  // --- back-mounted gear (drawn under the coat) ---
  if (role === "heavy") {
    // fat auto-rifle slung across the back, two parallel tubes
    g.strokeStyle = "#3a2f22"; g.lineWidth = 3.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(21, 23); g.lineTo(7, 9); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(19, 20); g.lineTo(6, 8); g.stroke();
  } else if (role === "mort") {
    // mortar tube (long, thick) + baseplate
    g.fillStyle = "#6f6553"; g.beginPath(); g.arc(19, 21, 2.2, 0, 7); g.fill();
    g.strokeStyle = "#4a4133"; g.lineWidth = 4.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(17, 24); g.lineTo(7, 9); g.stroke();
    g.strokeStyle = "#2c261c"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(7, 9); g.lineTo(5.5, 7); g.stroke();
  } else if (role !== "scout") {
    // standard rifle (diagonal)
    g.strokeStyle = "#3a2f22"; g.lineWidth = heavy ? 3 : 2.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(20, 22); g.lineTo(8, 8); g.stroke();
  }

  // --- body (coat) ---
  const bw = heavy ? 8.5 : role === "scout" ? 6.5 : 7.5;
  const bh = heavy ? 9.5 : 8.5;
  g.fillStyle = role === "scout" ? shade(p.base, 14) : p.base;
  g.beginPath(); g.ellipse(14, 15, bw, bh, 0, 0, 7); g.fill();
  g.fillStyle = p.dark;
  g.beginPath(); g.ellipse(14, 16.5, bw, bh * 0.58, 0, 0, Math.PI); g.fill();
  // heavy: shoulder pads
  if (heavy) {
    g.fillStyle = p.trim;
    g.beginPath(); g.arc(14 - bw + 1, 10, 2.6, 0, 7); g.fill();
    g.beginPath(); g.arc(14 + bw - 1, 10, 2.6, 0, 7); g.fill();
  }
  // grenadier: grenade band across the waist
  if (role === "gren") {
    g.strokeStyle = "#6b5a34"; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(14, 17, bw - 1.5, 3.4, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = "#8a713c";
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(10 + i * 4, 19.6, 1.3, 0, 7); g.fill(); }
  }
  // engineer: tool on the belt
  if (role === "eng") {
    g.strokeStyle = "#b0a070"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(8, 20); g.lineTo(13, 18.5); g.stroke();
    g.fillStyle = "#b0a070"; g.beginPath(); g.arc(8, 20, 1.2, 0, 7); g.fill();
  }

  // --- head ---
  if (role === "scout") {
    // soft field cap, no steel helmet
    g.fillStyle = shade(p.trim, 10); g.beginPath(); g.arc(14, 9.5, 4.6, 0, 7); g.fill();
    g.fillStyle = p.trim; g.fillRect(9.5, 9, 9, 2.4); // brim/peaked cap
    g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.arc(14, 10, 4.6, 0, Math.PI); g.fill();
  } else {
    // helmet (mort: slightly lower/crouched)
    const hy = role === "mort" ? 10 : 9;
    const hr = heavy ? 6 : 5.5;
    g.fillStyle = p.trim; g.beginPath(); g.arc(14, hy, hr, 0, 7); g.fill();
    g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.arc(14, hy - 0.7, hr, Math.PI, 2 * Math.PI); g.fill();
    // rim
    g.strokeStyle = shade(p.trim, -25); g.lineWidth = 1.2;
    g.beginPath(); g.arc(14, hy, hr, 0, 7); g.stroke();
    // engineer cross
    if (role === "eng") {
      g.strokeStyle = "#f2ede0"; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(11.5, hy); g.lineTo(16.5, hy); g.stroke();
      g.beginPath(); g.moveTo(14, hy - 2.5); g.lineTo(14, hy + 2.5); g.stroke();
    }
    // elite gold star
    if (role === "elite") {
      g.fillStyle = "#ffd54a";
      // simple 5-point star
      const px = 14, py = hy, R = 2.6, r2 = 1.1;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? R : r2;
        const sx = px + Math.cos(a) * rr, sy = py + Math.sin(a) * rr;
        i === 0 ? g.moveTo(sx, sy) : g.lineTo(sx, sy);
      }
      g.closePath(); g.fill();
    }
  }
  return c;
}

// ---- tank: hull + turret + barrel, silhouette per tank id (light/medium/heavy) ----
function gTank(id, fac) {
  const t = UNITS[id];
  const rare = t.rare, tier = t.tier;
  const size = tier >= 3 ? 46 : tier === 2 ? 42 : 36;
  // per-id silhouette: hull ratio, turret shape, barrel length/width
  const S = {
    // china
    c_vt43:  { h: 0.58, r: 0.11, bl: 0.36, bw: 0.05 },          // light, stubby
    c_t34:   { h: 0.62, r: 0.13, bl: 0.46, bw: 0.06, slope: true },
    c_m3lee: { h: 0.68, r: 0.12, bl: 0.50, bw: 0.05, box: true }, // fixed box turret
    c_sherm: { h: 0.68, r: 0.14, bl: 0.54, bw: 0.06 },
    c_t28:   { h: 0.76, r: 0.17, bl: 0.58, bw: 0.09, twin: true },
    // japan
    j_hago:  { h: 0.54, r: 0.10, bl: 0.30, bw: 0.05 },          // open-topped light
    j_shin:  { h: 0.62, r: 0.13, bl: 0.42, bw: 0.06 },
    j_chiha: { h: 0.68, r: 0.13, bl: 0.52, bw: 0.06 },
    j_chihe: { h: 0.70, r: 0.14, bl: 0.55, bw: 0.07 },
    j_hv100: { h: 0.78, r: 0.17, bl: 0.56, bw: 0.08 },
    j_205:   { h: 0.84, r: 0.18, bl: 0.62, bw: 0.10, twin: true },
  }[id] || { h: 0.66, r: 0.13, bl: 0.48, bw: 0.06 };
  const { c, g } = mkCanvas(size, size);
  const p = PAL[fac];
  const cx = size / 2, cy = size / 2;
  const hw = size * (0.30 + S.h * 0.14), hh = size * (S.h / 2); // hull dims from silhouette size
  g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(cx, cy + 3, hw, size * 0.46, 0, 0, 7); g.fill();
  // tracks
  g.fillStyle = p.armorD;
  const tw = size * 0.16;
  g.fillRect(cx - hw, cy - size * 0.36, tw, size * 0.72);
  g.fillRect(cx + hw - tw, cy - size * 0.36, tw, size * 0.72);
  // track slats
  g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    const y = cy - size * 0.36 + i * (size * 0.72 / 6);
    g.beginPath(); g.moveTo(cx - hw, y); g.lineTo(cx - hw + tw, y); g.stroke();
    g.beginPath(); g.moveTo(cx + hw - tw, y); g.lineTo(cx + hw, y); g.stroke();
  }
  // hull (length = S.h)
  g.fillStyle = p.armor;
  roundRect(g, cx - hw * 0.92, cy - hh, hw * 1.84, hh * 2, 4); g.fill();
  g.strokeStyle = p.armorD; g.lineWidth = 2; g.stroke();
  if (S.slope) { // sloped plate hint
    g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - hw * 0.75, cy - hh + 4); g.lineTo(cx - hw * 0.4, cy - hh + 4); g.stroke();
  }
  // turret: box (M3 Lee fixed mount) or round
  g.fillStyle = shade(p.armor, -14);
  const tr = size * S.r;
  const ty = cy - hh * 0.1;
  if (S.box) {
    roundRect(g, cx - tr * 0.8, ty - tr * 0.7, tr * 1.6, tr * 1.4, 2); g.fill();
    g.strokeStyle = p.armorD; g.lineWidth = 1.5; g.stroke();
  } else {
    g.beginPath(); g.arc(cx, ty, tr, 0, 7); g.fill();
  }
  // barrel (front = up on the canvas)
  g.strokeStyle = p.armorD; g.lineWidth = size * S.bw; g.lineCap = "round";
  if (S.twin) { // twin barrels (heavies)
    g.beginPath(); g.moveTo(cx - 3, ty); g.lineTo(cx - 3, ty - size * S.bl); g.stroke();
    g.beginPath(); g.moveTo(cx + 3, ty); g.lineTo(cx + 3, ty - size * S.bl); g.stroke();
  } else {
    g.beginPath(); g.moveTo(cx, ty); g.lineTo(cx, ty - size * S.bl); g.stroke();
  }
  // gun mantlet
  if (!S.box) { g.fillStyle = p.armorD; g.beginPath(); g.arc(cx, ty, tr * 0.4, 0, 7); g.fill(); }
  // faction marking
  g.fillStyle = p.trim; g.beginPath(); g.arc(cx, ty, tr * 0.45, 0, 7); g.fill();
  if (rare) { g.strokeStyle = "#ffd54a"; g.lineWidth = 2; roundRect(g, cx - hw * 0.92, cy - hh, hw * 1.84, hh * 2, 4); g.stroke(); }
  return c;
}

// ---- gun (static field): per-role silhouettes ----
// AT gun: low shielded emplacement + long thick barrel (tier 2 = heavier shield)
// AA gun: raised pedestal + 4-barrel flak turret, barrel angled skyward
function gGun(id, fac) {
  const u = UNITS[id];
  const aa = !!u.aa;
  const at2 = !!u.at && u.dmg >= 40;      // tier-2 AT (bigger, heavier)
  const { c, g } = mkCanvas(36, 36);
  const p = PAL[fac];
  g.fillStyle = "rgba(0,0,0,.28)";
  g.beginPath(); g.ellipse(18, 20, aa ? 12 : 13, aa ? 13 : 14, 0, 0, 7); g.fill();

  if (aa) {
    // --- AA / flak gun: pedestal + 4-barrel turret, aimed at the sky (up) ---
    // pedestal
    g.fillStyle = p.metal; g.fillRect(8, 18, 20, 12);
    g.fillStyle = shade(p.metal, -20); g.fillRect(8, 25, 20, 5);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1;
    g.strokeRect(8, 18, 20, 12);
    // turntable
    g.fillStyle = shade(p.metal, 8); g.beginPath(); g.arc(18, 16, 9, 0, 7); g.fill();
    g.strokeStyle = p.armorD; g.lineWidth = 1.5; g.stroke();
    // 4 flak barrels (2x2 cluster), angled slightly upward
    g.strokeStyle = "#2e2a24"; g.lineWidth = 2.4; g.lineCap = "round";
    for (const [ox, oy] of [[-3.5, -1.5], [3.5, -1.5], [-3.5, 3], [3.5, 3]]) {
      g.beginPath(); g.moveTo(18 + ox, 15 + oy * 0.6); g.lineTo(18 + ox * 2.2, 1 + oy); g.stroke();
    }
    // muzzle brakes (small ticks at barrel tips)
    g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = 1;
    for (const [ox, oy] of [[-7.7, -1.5 + 1], [7.7, -1.5 + 1], [-7.7, 3 + 1], [7.7, 3 + 1]]) {
      g.beginPath(); g.moveTo(18 + ox - 1.5, 1 + oy); g.lineTo(18 + ox + 1.5, 1 + oy); g.stroke();
    }
    // turret dome
    g.fillStyle = p.armor;
    g.beginPath(); g.arc(18, 16, 5, 0, 7); g.fill();
    g.strokeStyle = p.armorD; g.lineWidth = 1; g.stroke();
    g.fillStyle = p.trim; g.beginPath(); g.arc(18, 16, 1.8, 0, 7); g.fill();
  } else {
    // --- AT gun: shielded wheeled emplacement + long barrel ---
    // shield wall (front = up)
    const sw = at2 ? 14 : 11, sx = 18 - sw / 2;
    g.fillStyle = p.armor;
    g.beginPath();
    g.moveTo(sx, 16); g.lineTo(sx + 3, 8); g.lineTo(sx + sw - 3, 8); g.lineTo(sx + sw, 16);
    g.closePath(); g.fill();
    g.strokeStyle = p.armorD; g.lineWidth = 1.5; g.stroke();
    // shield ribs
    g.strokeStyle = "rgba(0,0,0,.3)"; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      g.beginPath();
      g.moveTo(sx + t * sw, 16); g.lineTo(sx + 3 + t * (sw - 6), 8);
      g.stroke();
    }
    // body (chassis under the shield)
    g.fillStyle = p.metal; g.fillRect(7, 16, 22, 12);
    g.fillStyle = shade(p.metal, -20); g.fillRect(7, 23, 22, 5);
    // wheels
    g.fillStyle = "#221f1c";
    for (const wx of [10, 18, 26]) { g.beginPath(); g.arc(wx, 20, 3, 0, 7); g.fill(); }
    g.fillStyle = "#4d463c";
    for (const wx of [10, 18, 26]) { g.beginPath(); g.arc(wx, 20, 1.2, 0, 7); g.fill(); }
    // long barrel (at2: longer + thicker)
    const bl = at2 ? 13 : 11;
    g.strokeStyle = "#2e2a24"; g.lineWidth = at2 ? 4 : 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(18, 12); g.lineTo(18, 12 - bl); g.stroke();
    // muzzle brake
    g.strokeStyle = at2 ? "#4d463c" : "#2e2a24"; g.lineWidth = at2 ? 6 : 4;
    g.beginPath(); g.moveTo(18, 4 - (at2 ? 1 : 0)); g.lineTo(18, 1 - (at2 ? 1 : 0)); g.stroke();
    // gun mark
    g.fillStyle = p.trim; g.beginPath(); g.arc(18, 12, 1.8, 0, 7); g.fill();
  }
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
