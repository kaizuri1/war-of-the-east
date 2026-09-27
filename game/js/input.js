// WAR OF THE EAST — input.js
// Mouse: LMB select/box, RMB move / attack-move / place building, MMB pan, wheel zoom.
// Keys: WASD/edge-pan, Space pause, Esc cancel build, Ctrl/Shift+1..5 control groups.
// Coordinates are CSS pixels relative to the canvas; renderer does dpr/zoom transform.
import { TILE, BUILDINGS } from "./config.js";
import { menuUp } from "./menu.js";

export class Input {
  constructor(canvas, game, renderer, ui) {
    this.cv = canvas; this.game = game; this.r = renderer; this.ui = ui;
    this.drag = null;          // box select in progress
    this.dragSel = null;       // box rect (screen px) for renderer
    this.panDrag = null;       // last mouse pos while panning
    this.edges = { l: false, r: false, t: false, b: false };
    this.buildItem = null;     // building id being placed
    this.mouse = { wx: 0, wy: 0, over: false };
    this._s = false;

    canvas.addEventListener("mousemove", (e) => this.onMove(e));
    canvas.addEventListener("mousedown", (e) => this.onDown(e));
    canvas.addEventListener("mouseup", (e) => this.onUp(e));
    canvas.addEventListener("mouseleave", () => { this.mouse.over = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      if (menuUp()) return;
      e.preventDefault();
      const rc = this.cv.getBoundingClientRect();
      const nz = Math.max(0.5, Math.min(2.5, this.r.cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
      this.zoomAt(e.clientX - rc.left, e.clientY - rc.top, nz);
    }, { passive: false });
    window.addEventListener("keydown", (e) => { this._s = e.shiftKey; this.onKey(e, true); });
    window.addEventListener("keyup", (e) => { this._s = e.shiftKey; this.onKey(e, false); });
  }

  screenToWorld(mx, my) {
    const c = this.r.cam;
    return { x: mx / c.zoom + c.x, y: my / c.zoom + c.y };
  }
  zoomAt(sx, sy, nz) {
    const c = this.r.cam;
    const wx = sx / c.zoom + c.x, wy = sy / c.zoom + c.y;
    c.zoom = nz;
    c.x = wx - sx / nz; c.y = wy - sy / nz;
    this.clampCam();
  }
  clampCam() {
    const c = this.r.cam;
    const vw = this.cv.clientWidth / c.zoom, vh = this.cv.clientHeight / c.zoom;
    const W = this.game.map.w * TILE, H = this.game.map.h * TILE;
    c.x = Math.max(0, Math.min(Math.max(0, W - vw), c.x));
    c.y = Math.max(0, Math.min(Math.max(0, H - vh), c.y));
  }
  setBuild(id) {
    this.buildItem = id;
    if (id) { this.drag = null; this.dragSel = null; }
    if (this.ui) this.ui.setBuildActive(id);
    this.r.buildGhost = id ? this.r.buildGhost : null;
  }
  togglePause() {
    if (this.game.winner) return;          // game over — pause key does nothing
    this.game.paused = !this.game.paused;
    if (this.ui) this.ui.refresh();
  }

  onMove(e) {
    const r = this.cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const w = this.screenToWorld(mx, my);
    const m = this.mouse;
    m.wx = w.x; m.wy = w.y; m.over = true; m._mx = mx; m._my = my;
    // build ghost follows cursor
    if (this.buildItem) this.r.buildGhost = this.ghostAt(mx, my);
    // edge pan is computed LIVE in update() from this.mouse — never sticky
    // (old code OR-ed the flags here and only cleared them on WASD keyup,
    // so the camera ran away for the rest of the match after one touch)
    // box select drag
    if (this.drag && !this.panDrag) {
      this.dragSel = {
        x: Math.min(this.drag.x0, mx), y: Math.min(this.drag.y0, my),
        w: Math.abs(mx - this.drag.x0), h: Math.abs(my - this.drag.y0),
      };
    }
    if (this.panDrag) {
      this.r.cam.x -= mx - this.panDrag.x;
      this.r.cam.y -= my - this.panDrag.y;
      this.panDrag = { x: mx, y: my };
      this.clampCam();
    }
  }
  ghostAt(mx, my) {
    const cfg = BUILDINGS[this.buildItem];
    if (!cfg) return null;
    const w = this.screenToWorld(mx, my);
    const tx = Math.floor(w.x / TILE) - Math.floor((cfg.w || 1) / 2);
    const ty = Math.floor(w.y / TILE) - Math.floor((cfg.h || 1) / 2);
    const ok = this.game.canBuild(this.buildItem, this.game.player, tx, ty);
    return { id: this.buildItem, tx, ty, ok };
  }
  onDown(e) {
    const r = this.cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (e.button === 1) { e.preventDefault(); this.panDrag = { x: mx, y: my }; return; }
    if (e.button === 2) { this.onRight(mx, my); return; }
    if (e.button === 0) {
      if (this.buildItem) return; // LMB re-click on bar cancels; map click ignored
      this.drag = { x0: mx, y0: my };
      this.dragSel = null;
    }
  }
  onUp(e) {
    if (e.button === 1) { this.panDrag = null; return; }
    const r = this.cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (e.button === 2) return;
    if (e.button !== 0) return;
    if (this.buildItem) { // single LMB while ghosting: try to place
      const gh = this.ghostAt(mx, my);
      if (gh && gh.ok) this.game.startBuild(this.buildItem, this.game.player, gh.tx, gh.ty);
      return;
    }
    const d = this.drag; this.drag = null;
    if (!d) return;
    const dx = Math.abs(mx - d.x0), dy = Math.abs(my - d.y0);
    if (dx < 4 && dy < 4) this.selectAt(mx, my, e.ctrlKey || e.shiftKey);
    else {
      this.dragSel = { x: Math.min(d.x0, mx), y: Math.min(d.y0, my), w: dx, h: dy };
      setTimeout(() => { if (this.dragSel && !this.drag) this.dragSel = null; }, 120);
      const a = this.screenToWorld(this.dragSel.x, this.dragSel.y);
      const b = this.screenToWorld(this.dragSel.x + this.dragSel.w, this.dragSel.y + this.dragSel.h);
      this.boxSelect(a, b, e.ctrlKey || e.shiftKey);
    }
  }
  selectAt(mx, my, add) {
    const g = this.game;
    const wp = this.screenToWorld(mx, my);
    let u = null, b = null;
    for (const un of g.units) {
      if (un.dead || !un.isAlive()) continue;
      if (Math.hypot(un.x - wp.x, un.y - wp.y) < un.footprint() + 4) { u = un; break; }
    }
    if (!u) {
      const tx = Math.floor(wp.x / TILE), ty = Math.floor(wp.y / TILE);
      for (const bd of g.buildings) {
        if (bd.dead || !bd.isAlive()) continue;
        if (tx >= bd.tx && tx < bd.tx + bd.w && ty >= bd.ty && ty < bd.ty + bd.h) { b = bd; break; }
      }
    }
    if (!add) { g.units.forEach((x) => x.selected = false); g.buildings.forEach((x) => x.selected = false); }
    if (u) u.selected = true;
    if (b) b.selected = true;
    if (this.ui) this.ui.refresh();
  }
  boxSelect(a, b, add) {
    const g = this.game;
    const minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x);
    const miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
    let anyUnit = false;
    for (const un of g.units) {
      if (un.dead || !un.isAlive()) continue;
      if (un.x > minx && un.x < maxx && un.y > miny && un.y < maxy) { un.selected = true; anyUnit = true; }
      else if (!add) un.selected = false;
    }
    g.buildings.forEach((x) => x.selected = false);
    if (anyUnit) { if (this.ui) this.ui.refresh(); return; }
    if (!add) g.units.forEach((x) => x.selected = false);
    for (const bd of g.buildings) {
      if (bd.dead || !bd.isAlive()) continue;
      const x0 = bd.tx * TILE, x1 = (bd.tx + bd.w) * TILE, y0 = bd.ty * TILE, y1 = (bd.ty + bd.h) * TILE;
      if (x1 > minx && x0 < maxx && y1 > miny && y0 < maxy) bd.selected = true;
    }
    if (this.ui) this.ui.refresh();
  }
  onRight(mx, my) {
    const g = this.game;
    const wp = this.screenToWorld(mx, my);
    if (this.buildItem) {
      // C&C behaviour: RMB while a build ghost is up ONLY cancels the ghost
      // (also the old bug: a "deselect" right-click actually built the unit).
      // LMB places, Esc also cancels. RMB must never call startBuild.
      this.setBuild(null);
      this.r.buildGhost = null;
      return;
    }
    const selU = g.units.filter((u) => u.selected && !u.dead && u.isAlive());
    const selB = g.buildings.filter((b) => b.selected && !b.dead && b.isAlive());
    if (!selU.length && !selB.length) {
      for (const un of g.units)
        if (!un.dead && un.isAlive() && un.fac !== g.player && Math.hypot(un.x - wp.x, un.y - wp.y) < un.footprint() + 4) {
          g.units.forEach((x) => x.selected = false);
          un.selected = true;
          if (this.ui) this.ui.refresh();
          return;
        }
      return;
    }
    let tgt = null;
    for (const un of g.units) {
      if (un.dead || !un.isAlive() || un.fac === g.player) continue;
      if (Math.hypot(un.x - wp.x, un.y - wp.y) < un.footprint() + 6) { tgt = un; break; }
    }
    if (!tgt) {
      const tx = Math.floor(wp.x / TILE), ty = Math.floor(wp.y / TILE);
      for (const bd of g.buildings) {
        if (bd.dead || !bd.isAlive() || bd.fac === g.player) continue;
        if (tx >= bd.tx && tx < bd.tx + bd.w && ty >= bd.ty && ty < bd.ty + bd.h) { tgt = bd; }
      }
    }
    for (const u of selU) {
      if (u.isStatic()) continue; // static guns don't move
      if (tgt) { u.target = tgt; u.fx = null; u.fy = null; u.moveOrder = null; u.attackMove = false; u._follow = false; }
      else {
        u.fx = Math.floor(wp.x / TILE); u.fy = Math.floor(wp.y / TILE);
        u.moveOrder = { x: wp.x, y: wp.y };
        u.path = null;
        // Plain walk: the unit holds its course and does NOT auto-lock onto
        // enemies along the way, so a fresh order always beats a stale
        // auto-attack (no more "stuck attacking a building that just rebuilt").
        // Units still fire at anything already latched, and attack-moves stay
        // available (see UI) to re-engage.
        u.attackMove = false;
        u._follow = true;
      }
    }
    if (this.ui) this.ui.refresh();
  }
  onKey(e, down) {
    if (menuUp()) return;
    const k = e.key.toLowerCase();
    if (e.code === "Space") {
      if (down && !e.repeat && !this.game.winner) { this.game.paused = !this.game.paused; if (this.ui) this.ui.refresh(); }
      e.preventDefault();
      return;
    }
    if (down && !e.ctrlKey && !e.repeat) {
      if (k === "u" && this.ui) { this.ui.doRepair(); e.preventDefault(); return; }
    }
    if (e.ctrlKey && /^Digit[1-5]$/.test(e.code) && down) {
      const n = parseInt(e.code.slice(6), 10);
      const sel = this.game.units.filter((u) => u.selected && !u.dead && u.isAlive());
      if (e.shiftKey) sel.forEach((u) => u.controlGroup = n);
      else {
        const grp = this.game.units.filter((u) => !u.dead && u.isAlive() && u.controlGroup === n);
        this.game.units.forEach((x) => x.selected = false);
        this.game.buildings.forEach((x) => x.selected = false);
        grp.forEach((x) => x.selected = true);
        if (this.ui) this.ui.refresh();
      }
      e.preventDefault();
      return;
    }
    const was = this.edges;
    if (down) {
      // F1/F2/F3 = game speed 1/2/3
      if (e.code === "F1" || e.code === "F2" || e.code === "F3") {
        this.game.speed = parseInt(e.code.slice(1), 10);
        if (this.ui) this.ui.refresh();
        e.preventDefault();
        return;
      }
      // F10 / F12 = pause-menu screen (always available, not gated by build mode)
      if (e.code === "F10" || e.code === "F12") { this.togglePause(); e.preventDefault(); return; }
      if (k === "w" || k === "arrowup") this.edges.t = true;
      else if (k === "s" || k === "arrowdown") this.edges.b = true;
      else if (k === "a" || k === "arrowleft") this.edges.l = true;
      else if (k === "d" || k === "arrowright") this.edges.r = true;
      // Esc: context-sensitive. If a build ghost is up → cancel it (restore
      // the normal cursor). Otherwise → open the pause screen.
      else if (k === "escape") {
        if (this.buildItem) this.setBuild(null);
        else this.togglePause();
      }
    } else {
      if (k === "w" || k === "arrowup" || e.code === "ArrowUp") this.edges.t = false;
      else if (k === "s" || k === "arrowdown" || e.code === "ArrowDown") this.edges.b = false;
      else if (k === "a" || k === "arrowleft" || e.code === "ArrowLeft") this.edges.l = false;
      else if (k === "d" || k === "arrowright" || e.code === "ArrowRight") this.edges.r = false;
    }
    void was;
  }
  update(dt) {
    const c = this.r.cam;
    const sp = 340 * dt / c.zoom;
    // live mouse edge-pan: sample cursor position every frame so the camera
    // only pans while the cursor is actually at the edge (never sticky)
    let mh = 0, mv = 0;
    if (this.mouse.over) {
      const rect = this.cv.getBoundingClientRect();
      const mx = this.mouse._mx ?? 0, my = this.mouse._my ?? 0;
      const E = 18;
      if (mx < E) mh = -1; else if (mx > this.cv.clientWidth - E) mh = 1;
      if (my < E) mv = -1; else if (my > this.cv.clientHeight - E) mv = 1;
    }
    const h = mh || (this.edges.l ? 1 : this.edges.r ? -1 : 0);
    // Camera y is "world top-edge": to raise the view (W / top edge) we DECREASE
    // cam.y. (Old code added, so W and S — and the top/bottom screen edges —
    // moved in the opposite of the intended direction.)
    const v = mv || (this.edges.t ? -1 : this.edges.b ? 1 : 0);
    if (h) c.x += h * sp;
    if (v) c.y += v * sp;
    if (h || v) this.clampCam();
  }
}
