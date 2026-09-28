// WAR OF THE EAST — ui.js
// C&C-style HUD:
//   • top resource strip (time / tin / steel / fuel / power / army)
//   • RIGHT-side vertical COMMAND PANEL with tabs:
//        INFANTRY · VEHICLES · RESEARCH · BUILDINGS
//   • bottom-left minimap + selection/status panel
// Talks to the real engine:
//   fac state  : game.fac[game.player] = { res{tin,steel,fuel}, power{gen,draw,ok},
//                upgrades:Set }
//   commands   : game.canBuild, game.startBuild, game.queueUnit,
//                game.canResearch, game.research, game.unitAvailable,
//                game.hasLab, game.tierNum, game.canAfford
//   selection  : game.units[].selected / game.buildings[].selected
//   camera     : r.cam {x,y,zoom}, canvas css size -> minimap viewport
/* global document, window */
import { TILE, MAP_W, MAP_H, UNITS, BUILDINGS, UPGRADES, FACTION_META, keyBinds, bindLabel } from "./config.js";
import { T } from "./rand.js";
import { unitSpriteKey, bSpriteKey, SPRITES } from "./sprites.js";

// unit class -> the factory `produces` value that can build it
const CLASS_PROD = { infantry: "infantry", tank: "armor", gun: "guns", air: "air" };

export class UI {
  constructor(root, game, canvas, input) {
    this.root = root;
    this.g = game;
    this.cv = canvas;
    this.r = canvas.__renderer || null; // renderer set from main.js
    this.in = input;
    this.input = input;          // alias for convenience
    this.tab = "BUILDINGS";
    this._th = new Map();       // id -> data-url thumbnail
    this._buildId = null;

    // NOTE: root hosts the main game canvas (#view). Wiping innerHTML removes
    // it, so the renderer would draw to a detached canvas -> black screen.
    // Re-append the canvas after the wipe.
    const keep = root.querySelector("#view") || this.cv;

    root.innerHTML = `
      <div id="res"></div>
      <div id="hud-match"></div>
      <div id="command">
        <div id="cmdTabs"></div>
        <div id="cmdBody" class="cmd-scroll"></div>
      </div>
      <div id="cmdToggle" title="Show/hide build panel (H)">»</div>
      <div id="hud-bottom">
        <div id="mmwrap">
          <canvas id="minimap" width="180" height="180"></canvas>
        </div>
        <div id="sel"></div>
      </div>
      <div id="over" class="hidden">
        <div class="over-card">
          <div class="over-title"></div>
          <div class="over-sub"></div>
          <button class="overbtn" id="overRestart">RESTART — ENTER</button>
        </div>
      </div>
      <div id="pause" class="hidden">
        <div class="over-card">
          <div class="over-title" style="color:#e8e4d8">⏸ PAUSED</div>
          <div class="over-sub" style="padding:6px 0">
            <b>Move:</b> RMB on map · <b>Build:</b> LMB card → LMB place · <b>Cancel build:</b> Esc / RMB<br>
            <b>Pause:</b> Space / Esc (no ghost) / F10 / F12 · <b>Hide command bar:</b> H (or the tab handle)<br>
            <b>Speed:</b> F1 / F2 / F3 · <b>Repair:</b> U on selected building · <b>Groups:</b> CTR+1..5 · <b>Pan:</b> WASD / edge / MMB
          </div>
          <div id="pauseVol" style="display:flex;flex-direction:column;gap:8px;margin:10px 0 4px">
            <div style="display:flex;align-items:center;gap:8px"><span style="min-width:84px;font-size:11px;letter-spacing:1px">SFX VOLUME</span><input id="pauseSfxVol" type="range" min="0" max="100" style="flex:1;accent-color:#c8a06a"><span id="pauseSfxVal" style="min-width:34px;text-align:right;font-size:11px">100%</span></div>
            <div style="display:flex;align-items:center;gap:8px"><span style="min-width:84px;font-size:11px;letter-spacing:1px">MUSIC VOLUME</span><input id="pauseMusVol" type="range" min="0" max="100" style="flex:1;accent-color:#c8a06a"><span id="pauseMusVal" style="min-width:34px;text-align:right;font-size:11px">50%</span></div>
          </div>
          <button class="overbtn" id="pauseResume">RESUME — ESC</button>
        </div>
      </div>`;

    if (keep) root.appendChild(keep); // restore the game canvas (was wiped above)

    const match = root.querySelector("#hud-match");
    if (match) match.textContent =
      `${game.playerName} vs ${game.aiName} · ${game.map.name || "field"}` +
      (game.diff ? ` · AI ${game.diff.label}` : "");

    this.mm = root.querySelector("#minimap");
    this.mctx = this.mm.getContext("2d");
    this.buildTabs();
    this.bindBody();
    this.refresh();
  }
  attachRenderer(r) { this.r = r; }
  attachSfx() { this._sfx = this.g._sfx; }
  // keep input.buildItem in sync with what the cards highlight
  setBuildActive(id) { this._buildId = id; if (this.input) this.input.buildItem = id; }
  // Bug 3: show/hide the right build bar so the whole map is visible.
  // H key or the tab handle (#cmdToggle) toggles it. The bar element + its
  // listeners survive (display:none), so refresh() keeps working while hidden.
  toggleBar() {
    const cmd = this.root.querySelector("#command");
    const tg = this.root.querySelector("#cmdToggle");
    if (!cmd || !tg) return;
    const nowHidden = cmd.classList.toggle("hidden");
    tg.textContent = nowHidden ? "«" : "»";
    tg.title = nowHidden ? "Show build panel (H)" : "Hide build panel (H)";
  }

  // ---- tabs -------------------------------------------------------------
  // Normalize a binding to a set of comparable tokens: code form, key form
  // lowercased, and label form lowercased (so "KeyB" matches e.key "b" and
  // e.code "KeyB"; "h" matches "h"; "F1" matches "F1").
  static bindTokens(bind, fallback) {
    const v = bind || fallback;
    const toks = new Set([String(v).toLowerCase(), String(v).replace(/^Key/, "").toLowerCase()]);
    return toks;
  }
  // tab id -> current keybind; live-reloads from MENU. NOTE keys are singular
  // in config (tab_build / tab_infantry / tab_vehicles / tab_research).
  tabBind(id) {
    const map = { "BUILDINGS": "tab_build", "INFANTRY": "tab_infantry", "VEHICLES": "tab_vehicles", "RESEARCH": "tab_research" };
    return keyBinds()[map[id]] || { BUILDINGS: "b", INFANTRY: "i", VEHICLES: "v", RESEARCH: "r" }[id];
  }
  buildTabs() {
    const tabs = [
      ["BUILDINGS", "B", "Building Production"],
      ["INFANTRY", "I", "Infantry & crews"],
      ["VEHICLES", "V", "Tanks, guns, aircraft"],
      ["RESEARCH", "R", "Upgrades (needs Lab)"],
    ];
    const el = this.root.querySelector("#cmdTabs");
    el.innerHTML = tabs.map(([id, k, tip]) =>
      `<div class="cmd-tab" data-tab="${id}" title="${tip}"><span class="ct-label">${id}</span><kbd>${bindLabel(this.tabBind(id))}</kbd></div>`
    ).join("");
    el.addEventListener("click", (e) => {
      const t = e.target.closest(".cmd-tab");
      if (!t) return;
      this.tab = t.dataset.tab;
      this.beep("click"); this.refresh();
    });
    // hotkeys B/I/V/R (reassignable via settings — read live)
    window.addEventListener("keydown", (e) => {
      if (this.g && !this.g.winner && !e.ctrlKey && !e.altKey && !e.metaKey && document.activeElement.tagName !== "INPUT") {
        const k = String(e.key).toLowerCase();
        const code = e.code || "";
        const binds = keyBinds();
        if (UI.bindTokens(binds.hide_bar, "h").has(k) || code === binds.hide_bar) { this.toggleBar(); return; }
        for (const id of ["BUILDINGS", "INFANTRY", "VEHICLES", "RESEARCH"]) {
          if (id === this.tab) continue;
          const toks = UI.bindTokens(this.tabBind(id), "");
          if (toks.has(k) || code === this.tabBind(id)) {
            // tab hotkey while the panel is hidden → reveal it, then switch tab
            if (this.root.querySelector("#command").classList.contains("hidden")) this.toggleBar();
            this.tab = id; this.beep("click"); this.refresh();
            break;
          }
        }
      }
    });
  }
  bindBody() {
    const body = this.root.querySelector("#cmdBody");
    body.addEventListener("click", (e) => {
      const it = e.target.closest(".card");
      if (!it) return;
      if (this._suppressNextCardClick) { this._suppressNextCardClick = false; return; }
      this.onCard(it.dataset.kind, it.dataset.id, 1);
    });
    // #1: hold CTRL or SHIFT while clicking a UNIT card to queue +5 at once.
    // We read the modifiers on mousedown (Windows drops the key before click),
    // then suppress the single click so the card isn't double-counted.
    body.addEventListener("mousedown", (e) => {
      if (!e.button) return;
      const it = e.target.closest(".card");
      if (!it || it.dataset.kind !== "unit") return;
      if (e.ctrlKey || e.shiftKey) {
        this.onCard(it.dataset.kind, it.dataset.id, 5);
        this._suppressNextCardClick = true;
      }
    });
    // Bug 3: panel hide/show tab handle (H key is handled in buildTabs)
    const tg = this.root.querySelector("#cmdToggle");
    if (tg) tg.addEventListener("click", () => this.toggleBar());
    // minimap: click/drag to center the camera
    const mm = this.mm;
    let mmDrag = false;
    const mmCenter = (e) => {
      const g = this.g, r = this.r;
      if (!g || !r) return;
      const M = g.map, rect = mm.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;   // 0..1
      const py = (e.clientY - rect.top) / rect.height;   // 0..1
      const vw = rect.width / r.cam.zoom, vh = rect.height / r.cam.zoom;
      r.cam.x = Math.max(0, Math.min(M.w * TILE - vw, px * M.w * TILE - vw / 2));
      r.cam.y = Math.max(0, Math.min(M.h * TILE - vh, py * M.h * TILE - vh / 2));
      r.clampCam(g);
    };
    mm.addEventListener("mousedown", (e) => { mmDrag = true; e.preventDefault(); mmCenter(e); });
    window.addEventListener("mousemove", (e) => { if (mmDrag) mmCenter(e); });
    window.addEventListener("mouseup", () => { mmDrag = false; });
    // selection panel: pop-queue / repair / sell buttons
    this.root.querySelector("#sel").addEventListener("click", (e) => {
      if (e.target.closest("[data-queue]")) this.popQueue();
      else if (e.target.closest("[data-repair]")) this.doRepair();
      else if (e.target.closest("[data-sell]")) this.doSell();
    });
    // pause overlay: resume button (Esc also works)
    const pr = this.root.querySelector("#pauseResume");
    if (pr) pr.addEventListener("click", () => { if (this.in) this.in.togglePause(); });
    // pause overlay: live volume sliders (#6 — settings during the game)
    this.bindPauseVol();
  }
  // SFX / Music sliders on the pause screen. Applies live via
  // window.setGameAudio and persists to the same localStorage store the
  // SETTINGS page uses (#6 — settings during the game).
  bindPauseVol() {
    const sv = this.root.querySelector("#pauseSfxVol"), svv = this.root.querySelector("#pauseSfxVal");
    const mv = this.root.querySelector("#pauseMusVol"), mvv = this.root.querySelector("#pauseMusVal");
    if (!sv || !mv) return;
    const STORE = "woe-settings";
    const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
    const save = (k, el) => {
      try {
        const s = load(); s[k] = Number(el.value) / 100;
        localStorage.setItem(STORE, JSON.stringify(s));
      } catch { /* private mode */ }
    };
    const apply = (k, el) => {
      const o = {}; o[k] = Number(el.value) / 100;
      if (window.setGameAudio) window.setGameAudio(o);
      save(k, el);
      svv.textContent = sv.value + "%"; mvv.textContent = mv.value + "%";
    };
    const s = load();
    sv.value = Math.round((s.sfxVol ?? 1) * 100);
    mv.value = Math.round((s.musicVol ?? 1) * 100);
    if (s.musicMuted) mv.value = 0;
    svv.textContent = sv.value + "%"; mvv.textContent = mv.value + "%";
    sv.addEventListener("input", () => apply("sfxVol", sv));
    mv.addEventListener("input", () => apply("musicVol", mv));
  }
  doSell() {
    const g = this.g;
    const sb = g.buildings.filter((b) => b.selected && !b.dead && b.isAlive() && b.fac === g.player);
    if (sb.length) {
      for (const b of sb) b.selected = false;
      this.beep("sell"); g.demolish(sb[0]); this.refreshSel();
    }
    else this.beep("error");
  }
  doRepair() {
    const g = this.g;
    const su = g.units.filter((u) => u.selected && !u.dead && u.isAlive() && u.fac === g.player);
    const sb = g.buildings.filter((b) => b.selected && !b.dead && b.isAlive() && b.fac === g.player);
    const targets = [...sb, ...su];
    // #5: REPAIR is a TOGGLE. Clicking starts continuous auto-repair (heals
    // every frame until full or out of tin); clicking again stops it. Only
    // toggle entities that can still use the mode (alive, not already full).
    const repairables = targets.filter((t) => t.isAlive() && t.hp < t.maxHp);
    if (!repairables.length) {
      if (!targets.length) { this.beep("error"); return; }
      // selection is full HP or just topped up: one-shot nothing, stop the mode
      for (const t of targets) t._repairing = false;
      this.beep("stop");
      this.refreshSel();
      return;
    }
    // any repairable already in repair mode? -> stop all (toggle off)
    const anyOn = repairables.some((t) => t._repairing);
    for (const t of repairables) t._repairing = !anyOn;
    for (const t of targets) if (!t.isAlive() || t.hp >= t.maxHp) t._repairing = false;
    this.beep(anyOn ? "stop" : "repair");
    this.refreshSel();
  }
  onCard(kind, id, count = 1) {
    const g = this.g;
    if (g.winner) return;
    if (kind === "building") {
      this.onBuild(id);
    } else if (kind === "unit") {
      this.onQueueUnit(id, count);
    } else if (kind === "research") {
      if (g.research(g.player, id)) this.beep("research");
      else this.beep("error");
    }
    this.refresh();
  }
  fac() { const f = this.g.fac[this.g.player]; return f; }
  owned(id) {
    const g = this.g;
    return g.buildings.some((b) => !b.dead && b.isAlive() && b.fac === g.player && b.cfg.id === id);
  }
  anyFactoryFor(produces) {
    // prefer the selected factory, then the one with the least queue
    const g = this.g;
    const cands = g.buildings.filter((b) =>
      !b.dead && b.isAlive() && !b.underConstruction() && b.fac === g.player &&
      b.cfg && b.cfg.slots > 0 && b.cfg.produces === produces);
    const sel = cands.find((b) => b.selected);
    const pool = sel ? cands.filter((b) => b === sel || b.queue.length === 0) : cands;
    if (!pool.length) return null;
    pool.sort((a, b) => a.queue.length - b.queue.length);
    return pool[0];
  }
  onBuild(id) {
    const g = this.g, b = BUILDINGS[id];
    if (!b || id === "depot") return;
    if (b.cost && !g.canAfford(g.player, b.cost)) { this.beep("error"); return; }
    if (this._buildId === id) { this._buildId = null; if (this.in) this.in.setBuild(null); this.refresh(); return; }
    this._buildId = id;
    if (this.in) this.in.setBuild(id);
    this.beep("click");
    this.refresh();
  }
  onQueueUnit(id, count = 1) {
    const g = this.g, u = UNITS[id];
    if (!u) return;
    const fac = g.player;
    if (u.needsTier && g.tierNum(fac) < u.needsTier) { this.beep("error"); return; }
    const f = g.fac[fac];
    if (!f.res.tin || g.fac[fac].res.tin < (u.cost.tin || 0)) { this.beep("error"); return; }
    const fab = this.anyFactoryFor(CLASS_PROD[u.class]);
    if (!fab) { this.beep("error"); setStatus("Need a completed factory (" + (CLASS_PROD[u.class]) + ").", 2.5); return; }
    // #1: multi-queue — up to `count` (5 for Ctrl/Shift). Each queueUnit call
    // re-checks affordability, factory slots and the global unit cap, so the
    // queue stops naturally the moment any of those run out. Re-picking a
    // factory each pass spreads the queue across whichever has room.
    let added = 0;
    for (let i = 0; i < count; i++) {
      const fab2 = this.anyFactoryFor(CLASS_PROD[u.class]) || fab;
      if (!g.queueUnit(fab2, id)) break;
      added++;
    }
    this.beep(added ? "spawn" : "error");
  }
  popQueue() {
    const g = this.g;
    const b = g.buildings.find((x) => x.selected && !x.dead && x.isAlive());
    if (b && b.queue.length) { b.queue.shift(); b.queueTimer = 0; }
  }

  // ---- thumbnails -------------------------------------------------------
  thumb(kind, id) {
    if (this._th.has(kind + ":" + id)) return this._th.get(kind + ":" + id);
    let url = "";
    try {
      const g = this.g;
      const src = kind === "building" ? SPRITES[bSpriteKey(g.player, BUILDINGS[id])] : SPRITES[unitSpriteKey(UNITS[id])];
      if (src) {
        const c = document.createElement("canvas"); c.width = 40; c.height = 40;
        c.getContext("2d").drawImage(src, 0, 0, 40, 40);
        url = c.toDataURL();
      }
    } catch (e) { url = ""; }
    this._th.set(kind + ":" + id, url);
    return url;
  }

  // ---- card builders ----------------------------------------------------
  costStr(cost) {
    if (!cost) return "";
    return [cost.tin, cost.steel, cost.fuel].filter((v) => v > 0)
      .map((v, i) => v + (i === 0 ? " ◆" : i === 1 ? " ✚" : " ⛽")).join(" ");
  }
  buildingCard(id) {
    const g = this.g, c = BUILDINGS[id], fac = g.player;
    if (id === "depot") return "";
    const affordable = g.canAfford(fac, c.cost);
    const active = this._buildId === id;
    const meta = [
      c.produces ? "produces " + c.produces : (c.power > 0 ? "+" + c.power + "⚡ power" : (c.power < 0 ? c.power + "⚡ draw" : "fortification")),
      c.slots ? c.slots + "-slot" : "",
    ].filter(Boolean).join(" · ");
    return `<div class="card ${affordable ? "" : "off"} ${active ? "active" : ""}" data-kind="building" data-id="${id}">
      <div class="thumb">${this.thumb("building", id) ? `<img src="${this.thumb("building", id)}">` : `<span>${initials(c.name)}</span>`}</div>
      <div class="cbody"><div class="nm">${c.name}</div>
        <div class="meta">${meta}</div></div>
      <div class="cost">${this.costStr(c.cost)}</div>
    </div>`;
  }
  unitCard(id) {
    const g = this.g, c = UNITS[id], fac = g.player, f = g.fac[fac];
    if (!c) return "";
    const locked = c.needsTier && g.tierNum(fac) < c.needsTier;
    const affordable = !locked && g.canAfford(fac, c.cost) && g.unitAvailable(fac, id);
    const cls = { infantry: "inf", tank: "veh", gun: "veh", air: "air" }[c.class];
    const fab = this.anyFactoryFor(CLASS_PROD[c.class]);
    return `<div class="card ${affordable ? "" : "off"}" data-kind="unit" data-id="${id}">
      <div class="thumb ${cls}">${this.thumb("unit", id) ? `<img src="${this.thumb("unit", id)}">` : `<span>${initials(c.name)}</span>`}</div>
      <div class="cbody"><div class="nm">${c.name}${locked ? `<span class="lock">T${c.needsTier}</span>` : ""}</div>
        <div class="meta">hp ${c.hp} · dmg ${c.dmg}${fab ? "" : `<em class="no">no factory</em>`}</div></div>
      <div class="cost">${this.costStr(c.cost)}</div>
    </div>`;
  }
  researchCard(up) {
    const g = this.g, fac = g.player, f = g.fac[fac];
    const done = f.upgrades.has(up.id);
    const hasLab = g.hasLab(fac);
    const affordable = !done && hasLab && f.res.tin >= (up.cost || 0);
    return `<div class="card ${done ? "done" : affordable ? "" : "off"}" data-kind="research" data-id="${up.id}">
      <div class="thumb rs"><span>T${up.tier}</span></div>
      <div class="cbody"><div class="nm">${up.name}</div>
        <div class="meta">${done ? "researched ✓" : hasLab ? "T" + up.tier + " upgrade" : "needs Upgrades Lab"}</div></div>
      <div class="cost">${up.cost ? up.cost + " ◆" : ""}</div>
    </div>`;
  }

  // ---- refresh ----------------------------------------------------------
  refresh() {
    this.refreshRes();
    const g = this.g;
    this.root.querySelectorAll(".cmd-tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === this.tab));
    const body = this.root.querySelector("#cmdBody");
    let html = "";
    if (this.tab === "BUILDINGS") html = Object.keys(BUILDINGS).filter((k) => k !== "depot").map((id) => this.buildingCard(id)).join("") || `<div class="dim">No buildings.</div>`;
    else if (this.tab === "INFANTRY") html = Object.values(UNITS).filter((u) => u.fac === g.player && u.class === "infantry").map((u) => this.unitCard(u.id)).join("") || `<div class="dim">No infantry.</div>`;
    else if (this.tab === "VEHICLES") html = Object.values(UNITS).filter((u) => u.fac === g.player && (u.class === "tank" || u.class === "gun" || u.class === "air")).map((u) => this.unitCard(u.id)).join("") || `<div class="dim">No vehicles.</div>`;
    else if (this.tab === "RESEARCH") html = UPGRADES.map((up) => this.researchCard(up)).join("") || `<div class="dim">No upgrades.</div>`;
    body.innerHTML = html;
  }
  refreshRes() {
    const g = this.g, f = g.fac[g.player];
    const r = f.res, p = f.power;
    const army = g.units.filter((u) => u.fac === g.player && !u.dead && u.isAlive()).length;
    const el = this.root.querySelector("#res");
    const pw = p.ok ? "ok" : "low";
    el.innerHTML =
      `<span class="ri">⏱ <b>${fmtTime(g.time)}</b></span>` +
      `<span class="ri" title="Tin / metal">◆ <b>${(r.tin | 0)}</b></span>` +
      `<span class="ri" title="Steel / ore">✚ <b>${(r.steel | 0)}</b></span>` +
      `<span class="ri" title="Fuel / oil">⛽ <b>${(r.fuel | 0)}</b></span>` +
      `<span class="ri ${pw}" title="Power used / generated">⚡ <b>${(p.draw | 0)}/${(p.gen | 0)}</b></span>` +
      `<span class="ri" title="Units on field">🪖 <b>${army}</b></span>` +
      (g.paused ? `<span class="ri paused">⏸ PAUSED</span>` : "") +
      (g.winner ? `<span class="ri over">— ${g.winner === g.player ? "VICTORY" : "DEFEAT"} —</span>` : "");
    // pause overlay follows the flag (toggled by Esc/Space/F10/F12)
    const pv = this.root.querySelector("#pause");
    if (pv) pv.classList.toggle("hidden", !(g.paused && !g.winner));
  }

  // Game-over banner: shown when the depot is lost/captured; Enter restarts.
  showOver(winner) {
    const g = this.g;
    const win = winner === g.player;
    const ov = this.root.querySelector("#over");
    ov.querySelector(".over-title").textContent = win ? "VICTORY — 大捷" : "DEFEAT — 敗北";
    ov.querySelector(".over-title").className = "over-title " + (win ? "win" : "lose");
    ov.querySelector(".over-sub").textContent = win
      ? `The enemy depot has fallen. ${g.playerName} holds the East.`
      : `Your depot has fallen. ${g.aiName} takes the East.`;
    ov.classList.remove("hidden");
    if (!this._overBound) {
      this._overBound = true;
      const restart = () => location.reload();
      ov.querySelector("#overRestart").addEventListener("click", restart);
      window.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && g.winner) restart();
      });
    }
  }  // engine already played "win" at the winning moment
  // Per-frame lightweight update (resources, selection, minimap, build grid)
  uiTick(dt) {
    const g = this.g;
    g._uiAcc = (g._uiAcc || 0) + dt;
    if (g._uiAcc < 0.15) return;      // throttle full DOM to ~6fps
    g._uiAcc = 0;
    this.refreshRes();
    this.refreshSel();
    this.drawMinimap();
    // keep card affordability / tier-unlocks / research state live (1s cadence)
    g._gridAcc = (g._gridAcc || 0) + 0.15;
    if (g._gridAcc >= 1) { g._gridAcc = 0; this.refresh(); }
  }
  refreshSel() {
    const g = this.g;
    const su = g.units.filter((u) => u.selected && !u.dead && u.isAlive());
    const sb = g.buildings.filter((b) => b.selected && !b.dead && b.isAlive());
    const el = this.root.querySelector("#sel");
    let h = "";
    if (su.length) {
      const c = su[0].cfg;
      const hp = Math.round(su.reduce((a, u) => a + u.hp, 0) / su.length);
      const hurt = su.some((u) => u.hp < u.maxHp);
      const repOn = su.some((u) => u._repairing);
      const repBtn = (hurt || repOn)
        ? `<button class="selbtn" data-repair>${repOn ? "⏹ STOP AUTO-REPAIR" : "🔧 AUTO-REPAIR (10 tin/s)"}</button>` : "";
      h = `<div class="selhead"><span>${c.name}${su.length > 1 ? " ×" + su.length : ""}</span><span class="tag">${c.class}</span></div>
          <div class="selrow">avg hp ${hp}/${c.hp}${repOn ? " · 🔧 repairing" : ""}</div>
          <div class="selrow dim">dmg ${c.dmg} · range ${Math.round(c.range)} · sp ${c.speed}</div>
          ${repBtn}
          <div class="selhint">RMB move · RMB+enemy attack · CTR+1..5 group · U auto-repair</div>`;
    } else if (sb.length) {
      const b = sb[0], q = b.queue || [];
      const refund = Math.round((b.cfg.cost.tin || 0) * 0.5 * 0.5);
      const repBtn = (b.hp < b.maxHp || b._repairing)
        ? `<button class="selbtn" data-repair>${b._repairing ? "⏹ STOP AUTO-REPAIR" : "🔧 AUTO-REPAIR (10 tin/s)"}</button>` : "";
      h = `<div class="selhead"><span>${b.cfg.name}</span><span class="tag">${b.cfg.produces || "building"}</span></div>
          <div class="selrow">hp ${Math.round(b.hp)}/${b.maxHp}${b.underConstruction() ? " · under construction" : ""}${b.underpowered ? " · ⚠ NO POWER" : ""}${b._repairing ? " · 🔧 repairing" : ""}</div>
          ${b.cfg.slots ? `<div class="selrow">queue ${q.length}/${b.cfg.slots}${q.length ? " · " + q.map((x) => UNITS[x]?.name || x).join(", ") : " · empty"}</div>
          <button class="selbtn" data-queue>✕ POP QUEUE</button>` : ""}
          ${repBtn}
          <button class="selbtn" data-sell>💰 SELL +${refund} tin</button>
          <div class="selhint">U auto-repair (toggles on/off) · SELL button below</div>`;
    } else {
      h = `<div class="selhint">Left drag = select · RMB = move/attack<br>Cmd bar: <b>B</b>uildings <b>I</b>nfantry <b>V</b>ehicles <b>R</b>esearch · <b>H</b>ide bar<br>Space = pause · Esc = cancel build / pause</div>`;
    }
    if (el._h !== h) { el.innerHTML = h; el._h = h; }
  }

  drawMinimap() {
    const g = this.g, m = this.mctx, W = g.map.w, H = g.map.h;
    const cw = this.mm.width, ch = this.mm.height;
    const sx = cw / W, sy = ch / H;
    // terrain (downsample 2 tiles per pixel-ish)
    m.fillStyle = "#20301a"; m.fillRect(0, 0, cw, ch);
    const ts = g.map.tiles || [];
    const step = 2;
    for (let ty = 0; ty < H; ty += step) for (let tx = 0; tx < W; tx += step) {
      const t = ts[ty * W + tx] || 0;
      if (t === T.ORE) m.fillStyle = "#6b5a3a";
      else if (t === T.OIL) m.fillStyle = "#2a2018";
      else if (t === T.ROCK) m.fillStyle = "#3a3a3a";
      else if (t === T.TREE) m.fillStyle = "#1c3315";
      else m.fillStyle = "#24361c";
      m.fillRect(tx * sx, ty * sy, sx * step, sy * step);
    }
    // buildings
    for (const b of g.buildings) { if (b.dead) continue; m.fillStyle = b.fac === g.player ? "#3fd66f" : "#f0603a"; m.fillRect(b.tx * sx, b.ty * sy, b.w * sx + 1, b.h * sy + 1); }
    // units (positions are pixels -> divide by TILE for tile space)
    for (const u of g.units) { if (u.dead || !u.isAlive()) continue; m.fillStyle = u.fac === g.player ? "#8dffae" : "#ffcf6a"; m.fillRect(u.x / TILE * sx - 1, u.y / TILE * sy - 1, 2, 2); }
    // planes: bigger dot + in-flight tick (they move across the map fast)
    for (const u of g.units) {
      if (u.dead || !u.isAlive() || !u.isAir()) continue;
      if (u.parked) { m.fillStyle = u.fac === g.player ? "#cfe3ff" : "#ffe0a0"; m.fillRect(u.x / TILE * sx - 2, u.y / TILE * sy - 2, 4, 4); }
      else { m.fillStyle = u.fac === g.player ? "#ffffff" : "#ffe680"; const px = u.x / TILE * sx, py = u.y / TILE * sy; m.fillRect(px - 1, py - 1, 3, 3); m.fillRect(px + (u.moving ? 2 : 0), py + (u.moving ? 1 : 0), 1, 1); }
    }
    // camera viewport rectangle
    if (this.r) {
      const vw = this.cv.clientWidth / this.r.cam.zoom, vh = this.cv.clientHeight / this.r.cam.zoom;
      const x = this.r.cam.x / TILE * sx, y = this.r.cam.y / TILE * sy;
      m.strokeStyle = "#ffffff"; m.lineWidth = 1;
      m.strokeRect(x, y, (vw / TILE) * sx, (vh / TILE) * sy);
    }
  }

  // legacy compat (input.js / main.js may call)
  selectInfo() {} 
  beep(t) { try { if (this._sfx) (typeof this._sfx === "function" ? this._sfx : this._sfx.play)(t); } catch (e) { /* audio must never break UI input */ } }
}

export function fmtTime(t) {
  t = Math.max(0, Math.floor(t));
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
function initials(name) { return name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase(); }
function setStatus(msg, s) { /* status surfaced via selection panel is enough */ void s; void msg; }
