// WAR OF THE EAST — menu.js
// Title screen (MAIN MENU: SKIRMISH / MISSION(greyed) / SETTINGS) + skirmish setup.
// The game does NOT auto-start: bootMenu() shows the title and waits for the
// player to press START BATTLE. MISSION stays disabled until campaign data ships.
// Ground truth: config.js (MAPS, FACTION_META, RES_TIERS, AI_DIFF, TUNE).
import { MAPS, FACTION_META, RES_TIERS, AI_DIFF, TUNE, VERSION, UPDATES,
         KEYBIND_DEFS, bindLabel, keyBinds, keyMatches, bumpBindsCache } from "./config.js";
import { generateMap, T } from "./rand.js";

const STORE = "woe-settings";

// Live settings — read by main.js / ui.js; persisted to localStorage.
export const MENU = {
  S: {
    musicMuted: false,
    sfxVol: 1,
    musicVol: 1,
    shake: TUNE.shake,
    showGrid: false,
    camX: null, camY: null,
  },
};
// Merged keybinds (defaults + saved) — exposed so input.js can read them live.
export const KEYS = keyBinds({});

let sfx = null;                 // set via setSfx() after the sound system is built
let handlers = null;            // { onStart(sel), onQuit(), saveCam(x, y) }
export function getHandlers() { return handlers; }
let started = false;            // true once the player chose START BATTLE
// Skirmish start-spot + team-color selections (module-scope so the summary and
// the START handler can share them).
let spotSel = "sw";             // player entry corner: nw|ne|se|sw (enemy is diagonal)
let colorSel = "default";       // null/"default" = faction palette; else team swatch id
const SPOT_LABELS = { nw: "1 · NW", ne: "2 · NE", se: "3 · SE", sw: "4 · SW" };
const SPOT_DIAG = { nw: "se", se: "nw", ne: "sw", sw: "ne" };
const beep = (f0, f1, d, type = "square", vol = 0.025) =>
  (sfx && sfx.beep ? sfx.beep(f0, f1, d, type, vol)
    : (typeof window.setGameAudio === "function" && window.setGameAudio.beep) ? window.setGameAudio.beep(f0, f1, d, type, vol)
    : undefined);

function loadSettings() {
  try {
    const j = JSON.parse(localStorage.getItem(STORE) || "{}");
    Object.assign(MENU.S, j);
    if (typeof MENU.S.camX !== "number") MENU.S.camX = null;
  } catch { /* first run */ }
}
export function saveSettings() {
  try { localStorage.setItem(STORE, JSON.stringify(MENU.S)); } catch { /* private mode */ }
  bumpBindsCache();
  const kb = (MENU.S.keybinds || {});
  for (const k of Object.keys(KEYS)) if (kb[k]) KEYS[k] = kb[k];   // live-reload binds
}

function segRow(container, values, selected, cb) {
  const r = document.createElement("div");
  r.className = "menu-seg";
  for (const v of values) {
    const b = document.createElement("button");
    if (v.html) b.innerHTML = v.html;   // rich content (e.g. flag + name)
    else b.textContent = v.label;
    b.dataset.v = v.id;
    if (v.id === selected) b.classList.add("on");
    b.addEventListener("click", () => {
      for (const x of r.children) x.classList.remove("on");
      b.classList.add("on");
      beep(360, 460, 0.03, "sine", 0.02);
      cb(v.id);
      syncSummary();
    });
    r.appendChild(b);
  }
  container.appendChild(r);
  return r;
}

const ThumbCol = { [T.GRASS]: "#24361c", [T.TREE]: "#1c3315", [T.ORE]: "#6b5a3a", [T.OIL]: "#2a2018", [T.ROCK]: "#3a3a3a" };
function mapThumb(cv, mapDef) {
  // Miniature preview rendered from the same seeded map — cheap (flat tiles).
  const m = generateMap({ w: mapDef.w, h: mapDef.h, seed: mapDef.seed });
  const ctx = cv.getContext("2d");
  const cw = cv.width, ch = cv.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#20301a"; ctx.fillRect(0, 0, cw, ch);
  const sx = cw / m.w, sy = ch / m.h;
  const step = m.w > 60 ? 2 : 1;
  for (let ty = 0; ty < m.h; ty += step)
    for (let tx = 0; tx < m.w; tx += step) {
      const t = m.tiles[ty * m.w + tx] || T.GRASS;
      ctx.fillStyle = ThumbCol[t] || "#24361c";
      ctx.fillRect(tx * sx, ty * sy, Math.ceil(sx * step), Math.ceil(sy * step));
    }
}

function toggleRow(parent, label, get, set) {
  const row = document.createElement("div");
  row.className = "menu-row";
  const lab = document.createElement("span");
  lab.textContent = label;
  row.appendChild(lab);
  const y = document.createElement("div");
  y.className = "menu-y menu-seg";
  for (const val of [true, false]) {
    const b = document.createElement("button");
    b.textContent = val ? "ON" : "OFF";
    if (get() === val) b.classList.add("on");
    b.addEventListener("click", () => {
      for (const x of y.children) x.classList.remove("on");
      b.classList.add("on");
      set(val);
      beep(360, 440, 0.03, "sine", 0.02);
    });
    y.appendChild(b);
  }
  row.appendChild(y);
  parent.appendChild(row);
}

const summary = () => document.querySelector("#sk-summary");
function syncSummary() {
  const el = summary();
  if (!el) return;
  const f = document.querySelector("#sk-fac .on")?.dataset.v || "china";
  const ai = document.querySelector("#sk-ai .on")?.dataset.v || "japan";
  const r = document.querySelector("#sk-res .on")?.dataset.v || "medium";
  const d = document.querySelector("#sk-diff .on")?.dataset.v || "medium";
  const map = document.querySelector("#sk-maps .on")?.dataset.v || MAPS[0].id;
  const m = MAPS.find((x) => x.id === map) || MAPS[0];
  const colorInfo = document.getElementById("sk-colorinfo");
  if (colorInfo) {
    const { playerPal, enemyPal } = deriveTeamPalettes(f, ai, colorSel);
    const pl = (playerPal && playerPal.base) || FACTION_META[f].color;
    const em = (enemyPal && enemyPal.base) || FACTION_META[ai].color;
    const custom = colorSel && colorSel !== "default";
    colorInfo.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px"><span class="swatch-dot" style="background:${pl}"></span>you</span>&nbsp;vs&nbsp;<span style="display:inline-flex;align-items:center;gap:4px"><span class="swatch-dot" style="background:${em}"></span>AI</span>${custom ? "" : "&nbsp;(faction defaults)"}`;
  }
  el.textContent =
    `${FACTION_META[f].nameEN} vs ${FACTION_META[ai].nameEN} — ${m.name} — ` +
    `start ${SPOT_LABELS[spotSel] || "4 · SW"} — funds ${r.toUpperCase()} — AI ${AI_DIFF[d].label}`;
}

function markAiWarning() {
  const mine = document.querySelector("#sk-fac .on")?.dataset.v;
  document.querySelector("#sk-ai .on")?.classList.toggle("warn", mine && mine === document.querySelector("#sk-ai .on").dataset.v);
}
// TEAM COLOR PALETTES — id -> full PAL-style palette (primary/dark/light/shade/
// accent) used to recolor a faction's units & buildings when a non-default team
// color is chosen. Each swatch yields a complete, readable 5-swatch palette.
const TEAM_PALETTES = {
  crimson: ["#e2483f", "#9c2b25", "#f38b83", "#5e1713", "#ffd9d6"],
  azure:   ["#3a86e0", "#25568f", "#79b3ff", "#123054", "#d6e8ff"],
  forest:  ["#3fa34d", "#276632", "#82d18f", "#14371b", "#d5f2da"],
  violet:  ["#9b5bd9", "#63368f", "#c592ef", "#3a1e57", "#ecd9ff"],
  amber:   ["#e0952f", "#98621a", "#f0c078", "#5c3a0d", "#fdeecb"],
  silver:  ["#c2cad2", "#7f8a94", "#e6ebf0", "#454e57", "#f4f7fa"],
  rose:    ["#d76b93", "#93395c", "#f0a0bb", "#571f33", "#fbdce7"],
};
// Build a sprite-baking palette (sprites.js PAL shape: base/dark/trim/armor/
// armorD/metal) from a 5-swatch team palette [primary, dark, light, shade,
// accent]. Team colors recolor units+buildings but keep the faction's trim/
// metal so each faction's design language still reads. trim/metal come from
// the faction's OWN config colors so both sides keep their national look.
function teamPaletteFor(colorId, fac) {
  if (!colorId || colorId === "default") return null;   // use the faction's own PAL
  const t = TEAM_PALETTES[colorId];
  if (!t) return null;
  const fm = FACTION_META[fac] || {};
  return {
    base: t[0], dark: t[1], trim: fm.accent || t[4],
    armor: t[3], armorD: t[1], metal: darken(t[0], 0.85),
  };
}
// Derive BOTH sides' team palettes (PAL shape, or null = keep faction default).
// If the player picked a custom team color, the enemy auto-derives its OWN
// faction default shifted ~150° in hue so both sides always read clearly.
// Returns { playerPal, enemyPal } where each is null or a PAL-shaped object.
export function deriveTeamPalettes(playerFac, aiFac, playerColorId) {
  const playerPal = teamPaletteFor(playerColorId, playerFac);
  if (playerPal) {
    return { playerPal, enemyPal: shiftPals({ base: FACTION_META[aiFac].color, dark: FACTION_META[aiFac].dark, trim: FACTION_META[aiFac].accent, armor: FACTION_META[aiFac].color, armorD: FACTION_META[aiFac].dark, metal: darken(FACTION_META[aiFac].color, 0.85) }, 150) };
  }
  return { playerPal: null, enemyPal: null };
}
// Rotate EVERY color in a PAL-shaped object by deg (keeps the same 6 keys).
function shiftPals(pal, deg) {
  return Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, (v && v[0] === "#") ? (rotateHue(v, deg) || v) : v]));
}
// Rotate every hsl() color in a palette by `deg` (and nudge lightness down a
// touch for darker variants) so the derived enemy is visually distinct but
// still reads as a full team palette.
function shiftPalette(pal, deg) {
  return pal.map((c, i) => {
    const m = c.match(/hsl\((\d+(?:\.\d+)?)[ ,]+(\d+)%[ ,]+(\d+)%\)/);
    if (m) return `hsl(${((+m[1] + deg) % 360)}, ${m[2]}%, ${m[3]}%)`;
    if (c[0] === "#" && c.length === 7) {
      const slot = i === 1 ? -0.35 : i === 3 ? -0.5 : i === 2 ? 0.3 : i === 4 ? 0.45 : 0;
      return mixColor(rotateHue(c, deg) || c, slot);
    }
    return c;
  });
}
function darken(c, f) { const t = hexToRgb(c); return t ? `rgb(${t[0] * f | 0},${t[1] * f | 0},${t[2] * f | 0})` : c; }
function lighten(c, f) { const t = hexToRgb(c); return t ? `rgb(${Math.min(255, t[0] + (255 - t[0]) * f) | 0},${Math.min(255, t[1] + (255 - t[1]) * f) | 0},${Math.min(255, t[2] + (255 - t[2]) * f) | 0})` : c; }
function hexToRgb(c) { const m = c.match(/^#?([\da-f]{6})$/i); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// hex -> rotate hue by deg -> hex ("" if unparseable).
function rotateHue(hex, deg) {
  const r = hexToRgb(hex); if (!r) return "";
  let [R, G, B] = r.map((v) => v / 255);
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx != mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60;
  }
  h = (h + deg) % 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
  const H = h / 360, out = [f(H + 1/3), f(H), f(H - 1/3)].map((v) => (v * 255) | 0);
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}
// amt > 0 → toward white, amt < 0 → toward black (used for light/dark/accent slots).
function mixColor(hex, amt) {
  const rgb = hexToRgb(hex); if (!rgb) return hex;
  const t = Math.min(0.9, Math.abs(amt)), tgt = amt > 0 ? 255 : 0;
  return "#" + rgb.map((v) => (v + (tgt - v) * t) | 0).map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ---- era-appropriate national flags (WW2 / 1937-1945) ----
function factionFlagSVG(id) {
  if (id === "china") {
    // Republic of China national flag (1928–1949): red field, five-pointed
    // star in the canton + four small stars in a vertical row on the fly,
    // each rotated so one point faces the big star's center (official spec).
    const star = (cx, cy, r, rot) => {
      let d = "";
      for (let i = 0; i < 5; i++) {
        const a = rot - Math.PI / 2 + i * (2 * Math.PI / 5);
        const a2 = a + Math.PI / 5;
        d += (i ? "L" : "M") + (cx + Math.cos(a) * r).toFixed(2) + " " + (cy + Math.sin(a) * r).toFixed(2) +
             "L" + (cx + Math.cos(a2) * r * 0.42).toFixed(2) + " " + (cy + Math.sin(a2) * r * 0.42).toFixed(2);
      }
      return `<path fill="#ffde00" d="${d}Z"/>`;
    };
    const bx = 8, by = 6, sx = (2 * 32) / 3, sr = 1.9;
    let small = "";
    for (let i = 0; i < 4; i++) {
      const y = 3 + i * 3;                    // vertical row, h/8 spacing
      small += star(sx, y, sr, Math.atan2(by - y, bx - sx) + Math.PI / 2);
    }
    return `<svg viewBox="0 0 32 24" class="flag" aria-hidden="true"><rect width="32" height="24" fill="#de2910"/>${star(bx, by, 5.4, 0)}${small}</svg>`;
  }
  if (id === "japan") {
    // 1905 Empire of Japan "Rising Sun" war flag: red disc + 16 rays.
    let rays = "";
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const x1 = 16, y1 = 12;
      const x2 = 16 + Math.cos(a) * 14.5, y2 = 12 + Math.sin(a) * 14.5;
      rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#bc002d" stroke-width="1.4"/>`;
    }
    return `<svg viewBox="0 0 32 24" class="flag" aria-hidden="true"><rect width="32" height="24" fill="#f4f5f7"/>${rays}<circle cx="16" cy="12" r="6.4" fill="#bc002d"/></svg>`;
  }
  return "";
}

function factionButtonHTML(f) {
  const m = FACTION_META[f];
  return `${factionFlagSVG(f)}<span class="fcol">${m.nameEN}<small>${m.label}</small></span>`;
}

// ---- selectable team (troop) colors — rendered via hue-rotate in the renderer ----
export const TEAM_COLORS = [
  { hex: "#3f7a3f", name: "Green",       sub: "standard" },
  { hex: "#b03a2e", name: "Crimson",     sub: "signal red" },
  { hex: "#8a929e", name: "Steel",       sub: "grey" },
  { hex: "#c8a042", name: "Gold",        sub: "ochre" },
  { hex: "#2f5fb0", name: "Blue",        sub: "cobalt" },
  { hex: "#246a3a", name: "Olive",       sub: "forest" },
  { hex: "#c2b04a", name: "Sand",        sub: "khaki" },
];

// ================================================================
export function bootMenu(h) {
  handlers = h;
  loadSettings();
  TUNE.shake = MENU.S.shake;          // apply saved preferences
  sfx && applySfx();

  if (!document.querySelector("#menu h1")) {
    const root = document.querySelector("#menu");
    root.innerHTML = `
      <div class="menu-screen" id="ms-title">
        <div class="title-top">
          <div id="title-deco"></div>
          <h1 class="title-main">WAR OF THE EAST</h1>
          <div class="title-sub">東洋戦争 · 1937–1945</div>
          <div class="title-tag">A Command &amp; Conquer-style browser RTS</div>
        </div>
        <div id="title-menu">
          <button class="menu-item on" id="mi-skmish">SKIRMISH</button>
          <button class="menu-item" id="mi-mission" disabled title="Mission mode arrives with a campaign data pack — greyed out for now.">
            MISSION <span class="soon">SOON</span></button>
          <button class="menu-item" id="mi-settings">SETTINGS</button>
          <button class="menu-item" id="mi-updates">UPDATES</button>
        </div>
        <div class="title-foot">v${VERSION} · skirmish · in-game: F1–F3 speed · Esc menu · Enter restart</div>
      </div>
      <div class="menu-screen" id="ms-skirmish" hidden></div>
      <div class="menu-screen" id="ms-settings" hidden></div>
      <div class="menu-screen" id="ms-updates" hidden></div>`;
    document.querySelector("#mi-skmish").addEventListener("click", () => { beep(340, 520, 0.04, "triangle"); show(1); });
    document.querySelector("#mi-settings").addEventListener("click", () => { beep(340, 520, 0.04, "triangle"); show(2); });
    document.querySelector("#mi-updates").addEventListener("click", () => { beep(340, 520, 0.04, "triangle"); show(3); });
  }
  window.addEventListener("keydown", onMenuKey);
}

function show(i) {
  const scr = (id) => document.getElementById(id);
  scr("ms-title").hidden = i !== 0;
  if (i === 1) buildSkirmish();
  if (i === 2) buildSettings();
  if (i === 3) buildUpdates();
  scr("ms-skirmish").hidden = i !== 1;
  scr("ms-settings").hidden = i !== 2;
  scr("ms-updates").hidden = i !== 3;
  if (i === 1) { syncSummary(); markAiWarning(); }
  if (i === 2) refreshCamLabel();
  window.scrollTo(0, 0);
}

// ---------- UPDATES log screen (#7) ----------
function buildUpdates() {
  const el = document.getElementById("ms-updates");
  el.innerHTML = `
    <div class="menu-head">
      <button class="menu-back" id="up-back">&larr; MAIN MENU</button>
      <h2>UPDATES <span class="menu-hint">v${VERSION} · ${UPDATES[0].date}</span></h2>
      <div class="menu-spacer"></div>
    </div>
    <div class="menu-box updates-log">
      ${UPDATES.map((u) => `
        <div class="update-entry${u.v === VERSION ? " current" : ""}">
          <div class="update-head"><b>v${u.v}</b><span class="update-date">${u.date}</span></div>
          <div class="update-text">${u.text}</div>
        </div>`).join("")}
    </div>`;
  el.querySelector("#up-back").addEventListener("click", () => { beep(500, 320, 0.05, "triangle"); show(0); });
}

function onMenuKey(e) {
  if (started) return;
  if (e.key === "Escape" &&
      (!document.getElementById("ms-skirmish").hidden || !document.getElementById("ms-settings").hidden ||
       !document.getElementById("ms-updates").hidden)) {
    beep(500, 320, 0.05, "triangle");
    show(0);
  }
}
// while the title menu has not been started into a game, game hotkeys are gated
export function menuUp() { return !started; }

// main.js calls this once the sound system exists (or after settings edits)
export function setSfx(ref) {
  sfx = ref;
  applySfx();
}
function applySfx() {
  if (!sfx) return;
  if (sfx.applySettings) sfx.applySettings(MENU.S);
  else if (sfx.musicMuted !== undefined) sfx.musicMuted = MENU.S.musicMuted;
}

// main.js saves the camera when the game ends so SETTINGS can report it
export function saveCam(x, y) {
  MENU.S.camX = x;
  MENU.S.camY = y;
  saveSettings();
  refreshCamLabel();
}
function refreshCamLabel() {
  const el = document.getElementById("st-cam");
  if (!el) return;
  el.textContent = MENU.S.camX != null
    ? `saved at tile (${Math.floor(MENU.S.camX / 32)}, ${Math.floor((MENU.S.camY || 0) / 32)})`
    : "not yet saved";
}

export function isStarted() { return started; }

// ================================================================
function buildSkirmish() {
  const el = document.getElementById("ms-skirmish");
  if (el.dataset.built) return;
  el.dataset.built = "1";
  el.innerHTML = `
    <div class="menu-head">
      <button class="menu-back" id="sk-back">&larr; MAIN MENU</button>
      <h2>SKIRMISH</h2>
      <div class="menu-spacer"></div>
    </div>
    <div class="menu-grid">
      <div class="menu-box">
        <h3>BATTLEFIELD</h3>
        <div class="menu-hint">seeded — the same map always looks the same</div>
        <div id="sk-maps" class="menu-maplist"></div>
      </div>
      <div class="menu-box">
        <h3>YOUR FACTION</h3>
        <div id="sk-fac" class="menu-facs"></div>
        <h3 class="mt2">ENEMY AI FACTION</h3>
        <div class="menu-hint">one computer opponent controls this faction</div>
        <div id="sk-ai" class="menu-facs"></div>
      </div>
      <div class="menu-box">
        <h3>START SPOT</h3>
        <div class="menu-hint">your entry corner — the AI spawns diagonally across the field</div>
        <div id="sk-spot"></div>
        <h3 class="mt2">TEAM COLOR</h3>
        <div class="menu-hint">recolors your troops · the enemy auto-gets a matching but distinct color</div>
        <div id="sk-color"></div>
        <div id="sk-colorinfo" class="menu-info"></div>
      </div>
      <div class="menu-box">
        <h3>STARTING FUNDS</h3>
        <div id="sk-res"></div>
        <div id="sk-resinfo" class="menu-info"></div>
        <h3 class="mt2">AI DIFFICULTY</h3>
        <div id="sk-diff"></div>
        <div id="sk-diffinfo" class="menu-info"></div>
      </div>
    </div>
    <div id="sk-summary" class="menu-summary"></div>
    <div class="menu-foot">
      <button class="menu-start" id="sk-start">&#9654; START BATTLE</button>
    </div>`;

  // --- map picker ---
  const mapsEl = document.getElementById("sk-maps");
  MAPS.forEach((m, i) => {
    const c = document.createElement("div");
    c.className = "menu-map" + (i === 0 ? " on" : "");
    c.dataset.v = m.id;
    const cv = document.createElement("canvas");
    cv.width = 120; cv.height = 90;
    c.appendChild(cv);
    const d = document.createElement("div");
    d.className = "menu-mapd";
    d.innerHTML = `<b>${m.name}</b><span>${m.w}×${m.h} · seed ${m.seed}</span>`;
    c.appendChild(d);
    c.addEventListener("click", () => {
      beep(430, 430, 0.03, "sine", 0.02);
      for (const x of mapsEl.children) x.classList.remove("on");
      c.classList.add("on");
      syncSummary();
    });
    mapsEl.appendChild(c);
    mapThumb(cv, m);
  });

  // --- faction pickers (with era flags + nation labels) ---
  const facValues = Object.keys(FACTION_META).map((k) => ({ id: k, label: FACTION_META[k].nameEN, html: factionButtonHTML(k) }));
  segRow(document.getElementById("sk-fac"), facValues, "china", markAiWarning);
  segRow(document.getElementById("sk-ai"), facValues, "japan", null);
  // make the (now-stale) ai click handler also re-warn — segRow bound cb=null;
  for (const b of document.getElementById("sk-ai").children) {
    b.addEventListener("click", markAiWarning);
  }

  // --- start spot (entry corner; enemy spawns the diagonal corner) ---
  const SPOTS = [
    { id: "nw", label: "1 · NW" }, { id: "ne", label: "2 · NE" },
    { id: "se", label: "3 · SE" }, { id: "sw", label: "4 · SW" },
  ];
  const spotDiag = { nw: "se", se: "nw", ne: "sw", sw: "ne" };
  segRow(document.getElementById("sk-spot"), SPOTS, "sw", (id) => {
    spotSel = id; syncSummary();
  });

  // --- team color (player swatch; enemy auto-derives a distinct palette) ---
  const TEAM_COLORS = [
    { id: "default", label: "Faction", hex: null },
    { id: "crimson", label: "Crimson", hex: "#e2483f" },
    { id: "azure", label: "Azure", hex: "#3a86e0" },
    { id: "forest", label: "Forest", hex: "#3fa34d" },
    { id: "violet", label: "Violet", hex: "#9b59d9" },
    { id: "amber", label: "Amber", hex: "#e0952f" },
    { id: "silver", label: "Silver", hex: "#c2cad2" },
    { id: "rose", label: "Rose", hex: "#d76b93" },
  ];
  const colorSelEl = document.getElementById("sk-color");
  for (const c of TEAM_COLORS) {
    const b = document.createElement("button");
    b.className = "team-swatch" + (c.id === "default" ? " on" : "");
    b.dataset.v = c.id;
    b.innerHTML = c.hex
      ? `<span class="swatch-dot" style="background:${c.hex}"></span>${c.label}`
      : `<span class="swatch-dot" style="background:linear-gradient(135deg,#8f6b1e,#5e3aa8)"></span>${c.label}`;
    b.addEventListener("click", () => {
      beep(430, 430, 0.03, "sine", 0.02);
      for (const x of colorSelEl.children) x.classList.remove("on");
      b.classList.add("on");
      colorSel = c.id; syncSummary();
    });
    colorSelEl.appendChild(b);
  }

  // --- resource tiers ---
  const resInfo = {
    low: "Lean start — expand fast or die trying.",
    medium: "The intended opening balance.",
    high: "Comfortable economy — production early.",
    max: "Maxed treasury — full war economy immediately.",
  };
  segRow(document.getElementById("sk-res"),
    Object.keys(RES_TIERS).map((k) => ({ id: k, label: k[0].toUpperCase() + k.slice(1) })),
    "medium", (id) => {
      const t = RES_TIERS[id];
      document.getElementById("sk-resinfo").textContent =
        `tin ${t.tin.toLocaleString()} · steel ${t.steel.toLocaleString()} · fuel ${t.fuel.toLocaleString()} — ${resInfo[id]}`;
    });
  document.getElementById("sk-res .on")?.dispatchEvent(new Event("click"));

  // --- difficulty ---
  const diffInfo = {
    easy: "Slow waves, cheaper economy — a gentle introduction.",
    medium: "Balanced pace — the intended experience.",
    hard: "Fast, well-funded waves; the AI rushes heavy units.",
  };
  segRow(document.getElementById("sk-diff"),
    ["easy", "medium", "hard"].map((k) => ({ id: k, label: k.toUpperCase() })),
    "medium", (id) => {
      const d = AI_DIFF[id];
      document.getElementById("sk-diffinfo").textContent =
        `waves every ${d.waveGap}s · AI funds ×${d.resourceMult} · AI economy ×${d.incomeMult} — ${diffInfo[id]}`;
    });
  document.getElementById("sk-diff .on")?.dispatchEvent(new Event("click"));

  document.getElementById("sk-back").addEventListener("click", () => {
    beep(500, 320, 0.05, "triangle");
    show(0);
  });
  document.getElementById("sk-start").addEventListener("click", () => {
    const playerFac = document.querySelector("#sk-fac .on")?.dataset.v || "china";
    const aiFac = document.querySelector("#sk-ai .on")?.dataset.v || "japan";
    const { playerPal, enemyPal } = deriveTeamPalettes(playerFac, aiFac, colorSel);
    const sel = {
      player: playerFac,
      aiFac,
      res: document.querySelector("#sk-res .on")?.dataset.v || "medium",
      diff: document.querySelector("#sk-diff .on")?.dataset.v || "medium",
      map: MAPS.find((m) => m.id === (document.querySelector("#sk-maps .on")?.dataset.v || MAPS[0].id)) || MAPS[0],
      spot: spotSel,                       // player entry corner id (nw|ne|se|sw)
      enemySpot: SPOT_DIAG[spotSel] || "ne",   // enemy gets the diagonal corner
      playerPal,                           // 5-swatch palette (faction default or team color)
      enemyPal,
    };
    started = true;
    beep(620, 920, 0.12, "triangle", 0.03);
    handlers.onPlay(sel);
  });
}

// ================================================================
function buildSettings() {
  const el = document.getElementById("ms-settings");
  if (el.dataset.built) { refreshCamLabel(); return; }
  el.dataset.built = "1";
  el.innerHTML = `
    <div class="menu-head">
      <button class="menu-back" id="st-back">&larr; MAIN MENU</button>
      <h2>SETTINGS</h2>
      <div class="menu-spacer"></div>
    </div>
    <div class="menu-grid">
      <div class="menu-box">
        <h3>AUDIO</h3>
        <div id="st-audio"></div>
        <div class="menu-hint">applies live while a game is running</div>
      </div>
      <div class="menu-box">
        <h3>GAMEPLAY</h3>
        <div id="st-game"></div>
      </div>
      <div class="menu-box">
        <h3>KEY BINDINGS <button class="menu-reset" id="kb-reset">RESET ALL</button></h3>
        <div id="st-keys"></div>
        <div class="menu-hint">click a key, then press the new one</div>
      </div>
      <div class="menu-box">
        <h3>LAST CAMERA</h3>
        <p id="st-cam" class="menu-info">not yet saved</p>
        <div class="menu-hint">the view position is saved when a game ends</div>
      </div>
    </div>
    <div class="menu-foot"><button class="menu-start" id="st-close">DONE</button></div>`;

  sliderRow(document.getElementById("st-audio"), "SFX volume", "sfxVol");
  sliderRow(document.getElementById("st-audio"), "Music volume", "musicVol");
  toggleRow(document.getElementById("st-audio"), "Music muted", () => MENU.S.musicMuted, (v) => {
    MENU.S.musicMuted = v; applySfx(); saveSettings();
  });

  toggleRow(document.getElementById("st-game"), "Screen shake", () => MENU.S.shake, (v) => {
    MENU.S.shake = v; TUNE.shake = v; saveSettings();
  });
  toggleRow(document.getElementById("st-game"), "Show grid (debug)", () => MENU.S.showGrid, (v) => {
    MENU.S.showGrid = v; saveSettings();
  });

  buildKeybinds(document.getElementById("st-keys"));
  document.getElementById("kb-reset").addEventListener("click", resetKeybinds);

  document.getElementById("st-back").addEventListener("click", () => { beep(500, 320, 0.05, "triangle"); show(0); });
  document.getElementById("st-close").addEventListener("click", () => { beep(500, 322, 0.05, "triangle"); show(0); });
  refreshCamLabel();
}

// 0–100 volume slider that applies live + persists (#6)
function sliderRow(parent, label, key) {
  const row = document.createElement("div");
  row.className = "menu-row";
  const lab = document.createElement("span");
  lab.textContent = label;
  row.appendChild(lab);
  const s = document.createElement("input");
  s.type = "range"; s.min = 0; s.max = 100; s.step = 5;
  s.value = Math.round((MENU.S[key] ?? 1) * 100);
  s.className = "menu-vol";
  const val = document.createElement("span");
  val.className = "menu-volv";
  val.textContent = s.value + "%";
  s.addEventListener("input", () => {
    val.textContent = s.value + "%";
    MENU.S[key] = Number(s.value) / 100;
    applySfx();
  });
  s.addEventListener("change", () => saveSettings());
  row.appendChild(s);
  row.appendChild(val);
  parent.appendChild(row);
}

// ---------- reassignable hotkeys (#10) ----------
function buildKeybinds(parent) {
  parent.innerHTML = "";
  MENU.S.keybinds = MENU.S.keybinds || {};
  for (const def of KEYBIND_DEFS) {
    const row = document.createElement("div");
    row.className = "menu-row kb-row";
    row.appendChild(el("span", "kb-label", def.label));
    const cur = el("span", "kb-cur", KEYBIND_DEFS.indexOf(def) >= 0 ? "" : "");
    cur.textContent = bindLabel(KEYS[def.key]);
    row.appendChild(cur);
    const btn = el("button", "menu-btn kb-btn", bindLabel(KEYS[def.key]));
    btn.dataset.action = def.key;
    btn.addEventListener("click", (e) => {
      const b = e.currentTarget;
      b.classList.add("listen");
      b.textContent = "press…";
      const onKey = (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        window.removeEventListener("keydown", onKey, true);
        b.classList.remove("listen");
        const code = ev.code === "Unidentified" ? "" : ev.code;
        if (!code || code === "Escape") return;
        KEYS[def.key] = code;
        MENU.S.keybinds[def.key] = code;
        b.textContent = bindLabel(code);
        saveSettings();
        beep(440, 660, 0.03, "sine", 0.02);
      };
      window.addEventListener("keydown", onKey, true);
    });
    row.appendChild(btn);
    parent.appendChild(row);
  }
}
function resetKeybinds() {
  MENU.S.keybinds = {};
  for (const k of Object.keys(KEYS)) KEYS[k] = keyBinds({})[k];
  buildKeybinds(document.getElementById("st-keys"));
  saveSettings();
  beep(500, 320, 0.05, "triangle");
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}
