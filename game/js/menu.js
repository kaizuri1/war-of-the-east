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
    b.textContent = v.label;
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
  el.textContent =
    `${FACTION_META[f].nameEN} vs ${FACTION_META[ai].nameEN} — ${m.name} — ` +
    `funds ${r.toUpperCase()} — AI ${AI_DIFF[d].label}`;
}

function markAiWarning() {
  const mine = document.querySelector("#sk-fac .on")?.dataset.v;
  document.querySelector("#sk-ai .on")?.classList.toggle("warn", mine && mine === document.querySelector("#sk-ai .on").dataset.v);
}

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

  // --- faction pickers ---
  const facValues = Object.keys(FACTION_META).map((k) => ({ id: k, label: FACTION_META[k].nameEN }));
  segRow(document.getElementById("sk-fac"), facValues, "china", markAiWarning);
  segRow(document.getElementById("sk-ai"), facValues, "japan", null);
  // make the (now-stale) ai click handler also re-warn — segRow bound cb=null;
  for (const b of document.getElementById("sk-ai").children) {
    b.addEventListener("click", markAiWarning);
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
    const sel = {
      player: document.querySelector("#sk-fac .on")?.dataset.v || "china",
      aiFac: document.querySelector("#sk-ai .on")?.dataset.v || "japan",
      res: document.querySelector("#sk-res .on")?.dataset.v || "medium",
      diff: document.querySelector("#sk-diff .on")?.dataset.v || "medium",
      map: MAPS.find((m) => m.id === (document.querySelector("#sk-maps .on")?.dataset.v || MAPS[0].id)) || MAPS[0],
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
