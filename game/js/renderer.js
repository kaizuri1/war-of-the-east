// WAR OF THE EAST — renderer.js
// Canvas 2D: terrain, buildings, units, projectiles, selection, build ghost.
// Camera: cam.x/y (world px at canvas top-left), cam.zoom.
import { TILE, FACTION_META, BUILDINGS } from "./config.js";
import { T } from "./rand.js";
import { SPRITES, TILES, unitSpriteKey, bSpriteKey } from "./sprites.js";
import { UNITS } from "./config.js";

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext("2d");
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.buildGhost = null;   // {id, tx, ty, ok}
    this.dragSel = null;      // {x,y,w,h} in CSS px — synced from input
    this.hover = { tx: -1, ty: -1 };
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.cv.width = this.cv.clientWidth * dpr;
    this.cv.height = this.cv.clientHeight * dpr;
    this.dpr = dpr;
  }
  screenToWorld(sx, sy) {
    const r = this.cv.getBoundingClientRect();
    return {
      x: (sx - r.left) / this.cam.zoom + this.cam.x,
      y: (sy - r.top) / this.cam.zoom + this.cam.y,
    };
  }
  clampCam(game) {
    const vw = this.cv.clientWidth / this.cam.zoom;
    const vh = this.cv.clientHeight / this.cam.zoom;
    const M = game.map || this._m;
    this._m = M;
    const ww = M.w * TILE, wh = M.h * TILE;
    this.cam.x = Math.max(0, Math.min(ww - vw, this.cam.x));
    this.cam.y = Math.max(0, Math.min(wh - vh, this.cam.y));
  }
  draw(game) {
    const g = this.g, c = this.cam, z = c.zoom;
    // clear last frame, then apply camera transform
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#10150d";
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(this.dpr * z, 0, 0, this.dpr * z, -c.x * z * this.dpr, -c.y * z * this.dpr);
    // visible tile range
    const x0 = Math.max(0, Math.floor(c.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(c.y / TILE) - 1);
    const x1 = Math.min(game.map.w - 1, Math.ceil((c.x + this.cv.clientWidth / z) / TILE) + 1);
    const y1 = Math.min(game.map.h - 1, Math.ceil((c.y + this.cv.clientHeight / z) / TILE) + 1);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        this.drawTile(game, tx, ty);
    // build ghost
    if (this.buildGhost) this.drawGhost(game);
    // selection rings under units
    for (const e of game.units) if (e.selected) this.ring(e, "#ffe873");
    for (const b of game.buildings) if (!b.dead && b.selected) this.bRing(b, "#ffe873");
    // buildings
    for (const b of game.buildings) if (!b.dead) this.drawBuilding(game, b);
    // units
    for (const u of game.units) if (!u.dead) { this.drawTrail(u); this.drawUnit(game, u); }
    // projectiles on top
    for (const p of game.projectiles) this.drawProjectile(p);
    // rubber-band selection box (screen space)
    if (this.dragSel) {
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.strokeStyle = "#ffe873"; g.lineWidth = 1;
      g.fillStyle = "rgba(255,232,115,0.12)";
      const s = this.dragSel;
      g.fillRect(s.x, s.y, s.w, s.h);
      g.strokeRect(s.x + 0.5, s.y + 0.5, s.w, s.h);
    }
    this.ox = null;
  }
  drawTile(game, tx, ty) {
    const g = this.g;
    const t = game.map.tiles[ty * game.map.w + tx] || 0;
    let img = t === T.ORE ? TILES.ore : t === T.OIL ? TILES.oil : t === T.ROCK ? TILES.rock : t === T.TREE ? TILES.tree : TILES.grass;
    g.drawImage(img, tx * TILE, ty * TILE, TILE, TILE);
  }
  drawBuilding(game, b) {
    const g = this.g;
    const img = SPRITES[bSpriteKey(b.fac, b.cfg)];
    const W = b.w * TILE, H = b.h * TILE;
    const ex = b.tx * TILE, ey = b.ty * TILE;
    if (img) g.drawImage(img, ex, ey, W, H);
    else { g.fillStyle = FACTION_META[b.fac].color; g.fillRect(ex + 2, ey + 2, W - 4, H - 4); }
    // weapon turret: small rotating platform facing the tracked target
    if (b.cfg.weapon) {
      const tx = b.x, ty = b.y - Math.min(H, W) * 0.18;
      g.save();
      g.translate(tx, ty);
      g.rotate(b.turretAng || 0);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath(); g.ellipse(0, 1, 7, 5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(35,30,24,0.9)";
      g.beginPath(); g.arc(0, 0, 5.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#221e18"; g.lineWidth = 3; g.lineCap = "round";
      g.beginPath(); g.moveTo(0, 0); g.lineTo(9, 0); g.stroke();
      g.restore();
    }
    // under-construction overlay + progress
    if (b.underConstruction()) {
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(ex, ey, W, H);
      const pct = Math.min(1, b.buildT / (b.built || 1));
      g.fillStyle = "#222"; g.fillRect(ex, ey - 7, W, 5);
      g.fillStyle = "#e8c840"; g.fillRect(ex + 1, ey - 6, (W - 2) * pct, 3);
    }
    // underpowered flash
    if (b.underpowered && Math.floor(game.time * 2) % 2 === 0) {
      g.fillStyle = "rgba(255,80,40,0.25)"; g.fillRect(ex, ey, W, H);
    }
    // production bar + ghost of the queued unit at the exit spot
    if (b.queue.length) {
      const cur = b.queue[0];
      const curCfg = cur._cfg || UNITS[cur.id] || {};
      const pct = Math.min(1, b.queueTimer / (curCfg.time || 1));
      g.fillStyle = "#222"; g.fillRect(ex, ey - 7, W, 5);
      g.fillStyle = "#8fd463"; g.fillRect(ex + 1, ey - 6, (W - 2) * pct, 3);
      // ghost preview so "what is being built" is visible, not just a bar
      const c = UNITS[cur.id] || curCfg;
      if (c && c.class) {
        const uimg = SPRITES[unitSpriteKey(c)];
        if (uimg) {
          const gi = Math.max(0, Math.min(b.queue.length - 1, b.queue.indexOf(cur)));
          const gx = b.x + ((gi % 3) - 1) * 18;
          const gy = b.y + (b.h * TILE) / 2 + 8;
          const pulse = 0.55 + 0.25 * Math.sin(game.time * 6);
          g.save(); g.globalAlpha = Math.max(0, Math.min(1, pulse)) * 0.9;
          g.fillStyle = "rgba(0,0,0,0.25)";
          g.beginPath(); g.ellipse(gx, gy + 2, 8, 3, 0, 0, Math.PI * 2); g.fill();
          g.drawImage(uimg, gx - 10, gy - 14, 20, 16);
          g.restore(); g.globalAlpha = 1;
        }
      }
    }
    // capture bar
    if (b.capByFac && b.capByFac !== b.fac && b.capHp < b.maxHp) {
      const cp = Math.min(1, (b.maxHp - b.capHp) / Math.max(1, b.maxHp));
      g.fillStyle = "#222"; g.fillRect(ex, ey - 13, W, 5);
      g.fillStyle = FACTION_META[b.capByFac].accent; g.fillRect(ex + 1, ey - 12, (W - 2) * cp, 3);
    }
    // hp bar when damaged
    if (b.hp < b.maxHp) {
      g.fillStyle = "#111"; g.fillRect(ex + 3, ey + H - 5, W - 6, 3);
      g.fillStyle = hpCol(b.hp / b.maxHp); g.fillRect(ex + 3, ey + H - 5, (W - 6) * (b.hp / b.maxHp), 3);
    }
  }
  // fading flight trail behind in-flight planes (visibility: a plane 2 tiles
  // away reads as a streak, not a 9px sprite)
  drawTrail(u) {
    if (!u.isAir() || u.parked || !u.trail || u.trail.length < 2) return;
    const g = this.g;
    for (let i = 1; i < u.trail.length; i++) {
      const a = u.trail[i - 1], b = u.trail[i];
      const k = i / u.trail.length;
      g.strokeStyle = u.fac === "japan" ? `rgba(160,216,255,${0.35 * k})` : `rgba(255,224,150,${0.35 * k})`;
      g.lineWidth = 0.5 + 2 * k;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
  }
  drawUnit(game, u) {
    const g = this.g;
    const img = SPRITES[unitSpriteKey(u.cfg)];
    let fp = u.footprint() * 2;
    if (u.isAir() && !u.parked) fp += 8;   // in-flight planes are drawn bigger
    if (u.isAir() && u.parked) fp += 16;   // parked: draw the full plane, not a stub
    // spawn blink: alpha must be set BEFORE drawing, and drawn once below
    const spawnBlink = u.spawnTimer > 0 ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(game.time * 20)) : 1;
    if (img) {
      // face movement direction
      g.save();
      g.globalAlpha = spawnBlink;
      g.translate(u.x, u.y);
      // Ground/sea units use the smooth swivel angle computed in Entities.js
      // (u.aim) so their turrets visibly rotate to track targets (#4).
      // Air units keep their instant snap (+PI so the sprite's nose leads).
      const t = u.target && !u.target.dead ? u.target : null;
      const mo = u.moveOrder && !u.parked ? u.moveOrder : null;
      let ang;
      if (!u.isAir() && u.aim != null) {
        ang = u.aim;
      } else {
        ang = t || mo
          ? Math.atan2((t ? t.y : mo.y) - u.y, (t ? t.x : mo.x) - u.x)
          : (u._dir || 0);
      }
      if (u.isAir()) ang += Math.PI;
      g.rotate(ang);
      // parked planes get a ground shadow so they read as sitting on the field
      if (u.isAir() && u.parked) {
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath(); g.ellipse(2, 4, fp * 0.42, fp * 0.16, 0, 0, Math.PI * 2); g.fill();
      }
      g.drawImage(img, -fp / 2 - 2, -fp / 2 - 2, fp + 4, fp + 4);
      g.restore();
      g.globalAlpha = 1;
    }
    // hp bar
    if (u.hp < u.maxHp || u.selected) {
      g.fillStyle = "#111"; g.fillRect(u.x - 10, u.y - fp / 2 - 6, 20, 3);
      g.fillStyle = hpCol(u.hp / u.maxHp); g.fillRect(u.x - 10, u.y - fp / 2 - 6, 20 * (u.hp / u.maxHp), 3);
    }
    // fuel bar
    if (u.maxT > 0 && u.t < u.maxT - 1) {
      g.fillStyle = "#333"; g.fillRect(u.x - 10, u.y + fp / 2 + 2, 20, 2);
      g.fillStyle = "#e8c840"; g.fillRect(u.x - 10, u.y + fp / 2 + 2, 20 * (u.t / u.maxT), 2);
    }
    g.globalAlpha = 1;
  }
  drawProjectile(p) {
    const g = this.g;
    const t = Math.hypot(p.tx - p.x, p.ty - p.y) || 1;
    g.strokeStyle = p.cls === "air" ? "#9fd8ff" : p.cls === "def" ? "#ffd9a0" : "#ffe9a8";
    g.lineWidth = p.cls === "tank" ? 2.4 : 1.6;
    g.beginPath();
    g.moveTo(p.x - (p.tx - p.x) / t * 6, p.y - (p.ty - p.y) / t * 6);
    g.lineTo(p.x, p.y);
    g.stroke();
    g.fillStyle = "#fff2c0";
    g.beginPath(); g.arc(p.x, p.y, 1.6, 0, 6.29); g.fill();
  }
  ring(e, col) {
    const g = this.g;
    g.strokeStyle = col; g.lineWidth = 1.4;
    g.beginPath(); g.arc(e.x, e.y, e.footprint() + 3 + Math.sin(e.anim) * 0.001, 0, 6.29); g.stroke();
  }
  bRing(b, col) {
    const g = this.g;
    g.strokeStyle = col; g.lineWidth = 2;
    g.strokeRect(b.tx * TILE + 1, b.ty * TILE + 1, b.w * TILE - 2, b.h * TILE - 2);
  }
  drawGhost(game) {
    const gh = this.buildGhost;
    if (!gh) return;
    const cfg = BUILDINGS[gh.id];
    if (!cfg) return;
    const g = this.g;
    const W = (cfg.w || 1) * TILE, H = (cfg.h || 1) * TILE;
    const ex = gh.tx * TILE, ey = gh.ty * TILE;
    // real sprite ghost
    const img = SPRITES[bSpriteKey(game.player, cfg)];
    g.globalAlpha = 0.55;
    if (img) g.drawImage(img, ex, ey, W, H);
    else { g.fillStyle = gh.ok ? "#7fd45f" : "#d45f5f"; g.fillRect(ex, ey, W, H); }
    // tint overlay so validity reads at a glance
    g.globalAlpha = 0.30;
    g.fillStyle = gh.ok ? "#7fd45f" : "#d45f5f";
    g.fillRect(ex, ey, W, H);
    g.globalAlpha = 1;
    g.strokeStyle = gh.ok ? "#bff5a0" : "#f5b0b0";
    g.lineWidth = 1.5;
    g.strokeRect(ex + 0.5, ey + 0.5, W - 1, H - 1);
    // cost + name label above the ghost
    const cost = cfg.cost;
    const label = `${cfg.name}${cost ? "  " + Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) =>
      v + (k === "tin" ? "◆" : k === "steel" ? "✚" : "⛽")).join(" ") : ""}`;
    g.font = "11px monospace";
    const tw = g.measureText(label).width;
    const lx = Math.max(0, Math.min(this.cv.clientWidth / this.cam.zoom - 8, ex + W / 2));
    const ly = Math.max(12, ey - 8);
    g.fillStyle = "rgba(0,0,0,0.65)";
    g.fillRect(lx - tw / 2 - 4, ly - 13, tw + 8, 15);
    g.fillStyle = gh.ok ? "#d8f0c0" : "#f0d0d0";
    g.textAlign = "center";
    g.fillText(label, lx, ly - 1);
    g.textAlign = "left";
  }
}
function hpCol(p) { return p > 0.5 ? "#7fd45f" : p > 0.25 ? "#e8c840" : "#d45f5f"; }
