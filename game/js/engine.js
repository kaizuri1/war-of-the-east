// WAR OF THE EAST — engine.js
// Game object: state, fixed-dt tick, economy (tin/steel/fuel), power,
// production, research, projectiles, counters, win/lose.
// main.js drives it; input.js / ui.js / ai.js hook in.
import { UNITS, BUILDINGS, UPGRADES, TUNE, TILE, FACTION_META, START, producible, AI_DIFF } from "./config.js";
import * as E from "./entities.js";
import { nearestEnemy as nE } from "./entities.js";

class Projectile {
  constructor(x, y, target, fac, dmg, splash, cls) {
    this.x = x; this.y = y;
    this.target = target;
    this.tx = target.x; this.ty = target.y;
    this.fac = fac; this.dmg = dmg;
    this.splash = splash; this.cls = cls; // infantry|tank|gun|air|def
    this.alt = Math.random() * 10 + 8;    // visual arc
    this.speed = 380;
    this.dead = false;
    this.life = 2.0;
  }
}

export class Game {
  constructor(map, opts = {}) {
    this.map = map;
    this.time = 0;
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.events = [];
    this.occupied = new Set();      // "x,y" tiles blocked (units + buildings)
    this.player = opts.player || "china";
    this.aiFac = this.player === "china" ? "japan" : "china";
    this.winner = null;
    this.paused = false;
    this.speed = 1;                 // 1/2/3 game speed
    this.playerName = FACTION_META[this.player].nameEN;
    this.aiName = FACTION_META[this.aiFac].nameEN;
    this.diff = (opts.diff && AI_DIFF[opts.diff]) || null;
    this.fac = {};
    const aiMult = this.diff ? this.diff.resourceMult : 1.0;
    const tier = opts.resTier && typeof opts.resTier === "object" ? opts.resTier : null;
    const rMult = (k) => (tier && tier[k] ? tier[k] / START[k] : 1);
    for (const f of ["china", "japan"]) {
      this.fac[f] = {
        res: {
          tin: (f === this.aiFac ? START.tin * aiMult : START.tin) * rMult("tin"),
          steel: (f === this.aiFac ? START.steel * aiMult : START.steel) * rMult("steel"),
          fuel: (f === this.aiFac ? START.fuel * aiMult : START.fuel) * rMult("fuel"),
        },
        incomeMult: f === this.aiFac && this.diff ? this.diff.incomeMult : 1.0,
        power: { gen: TUNE.basePower, draw: 0, ok: true },
        upgrades: new Set(),
        needsLock205: f === "japan",  // Type 205 needs Super-Heavy Program
      };
    }
    this._sfx = null; this._onWin = null; this.onUiTick = null;
    this.baseSpots = {};   // fac -> {fac, cx, cy} — filled by setupBases()
  }
  attach(o = {}) { this._sfx = o.sfx || null; this._onWin = o.onWin; }
  setupBases(spots) {
    // Spawn points are passed in (main.js computes them, offset from the map
    // edge so bases are not glued to a corner). Falls back to the classic
    // corners for tests that don't pass anything.
    const w = this.map.w, h = this.map.h;
    const base = spots || [
      { fac: this.player, cx: 3, cy: 3 },
      { fac: this.aiFac, cx: w - 4, cy: h - 4 },
    ];
    const spotsFinal = base.map((s) => ({
      fac: s.fac,
      cx: Math.max(2, Math.min(w - 3, s.cx)),
      cy: Math.max(2, Math.min(h - 3, s.cy)),
    }));
    for (const s of spotsFinal) this.baseSpots[s.fac] ||= s;
    const inb = (x, y) => x >= 0 && y >= 0 && x < this.map.w && y < this.map.h;
    const freeTile = (x, y) => inb(x, y) && this.map.buildable(x, y) && !this.buildingAt(x, y) && !this.occupied.has(x + "," + y);
    const scan = (cx, cy, kind, maxD) => {
      for (let d = 0; d <= maxD; d++)
        for (let dy = -d; dy <= d; dy++)
          for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            const x = cx + dx, y = cy + dy;
            if (!inb(x, y)) continue;
            const has = kind === "ore" ? this.map.hasOre(x, y) : this.map.hasOil(x, y);
            if (!has || !freeTile(x, y)) continue;
            return [x, y];
          }
      return null;
    };
    for (const s of spotsFinal) {
      const fac = s.fac, { cx, cy } = s;
      const place = (id, x, y) => {
        const b = this.startBuild(id, fac, x, y);
        if (!b) return null;
        b.buildT = b.built;          // start pre-built (instant)
        this.rebuildOccupied();
        return b;
      };
      // clear the 2x2 depot footprint + margin tiles (map already did, belt & braces)
      for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!inb(x, y)) continue;
        this.map.rocks.delete(x + "," + y);
      }
      place("depot", cx, cy);
      // income first: ore plant, then fuel depot (scan from corner so distant ore is found)
      const ore = scan(cx, cy, "ore", 5);
      if (ore) place("ore", ore[0], ore[1]);
      const oil = scan(cx, cy, "oil", 5);
      if (oil) place("fuel", oil[0], oil[1]);
      let pspot = null;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 0], [0, 2]])
        if (freeTile(cx + dx, cy + dy) && (dx || dy)) { pspot = [cx + dx, cy + dy]; break; }
      if (pspot) place("power", pspot[0], pspot[1]);
      // barracks: first free non-resource tile within 4
      let bar = null;
      outer: for (let d = 1; d <= 4; d++)
        for (let dy = -d; dy <= d; dy++)
          for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            const x = cx + 1 + dx, y = cy + 1 + dy;
            if (!inb(x, y)) continue;
            if (!freeTile(x, y) || !freeTile(x + 1, y)) continue; // 2x1 footprint
            if (this.map.hasOre(x, y) || this.map.hasOil(x, y)) continue;
            bar = place("barracks", x, y); break outer;
          }
      place("watch", cx + 2, cy + 1);
      // queue a starter unit
      if (bar) bar.queueAdd(fac === "china" ? "c_inf" : "j_inf");
      // starter units
      const px = (dx) => (cx + dx) * TILE + TILE / 2, py = (dy) => (cy + dy) * TILE + TILE / 2;
      const mk = (id, dx, dy) => {
        const u = E.makeUnit(id, fac, px(dx), py(dy), this);
        if (u) u.spawnTimer = 0.4;
        return u;
      };
      mk(fac === "china" ? "c_inf" : "j_inf", 3, 3);
      mk(fac === "china" ? "c_eng" : "j_eng", 3, 4);
      const tankId = fac === "china" ? "c_vt43" : "j_hago";
      if (this.canAfford(fac, UNITS[tankId].cost)) mk(tankId, 4, 3);
    }
    this.rebuildOccupied();
    this.log("Bases deployed. Destroy the enemy depot!", "info");
  }
  sound(n) { try { if (this._sfx) this._sfx(n); } catch (e) { /* audio must never crash the tick */ } }
  nearestEnemy(src, range, game) { return nE(src, range, game); }
  log(msg, kind = "info") {
    this.events.push({ t: this.time, kind, msg });
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
  }

  // ---------- resources ----------
  res(fac) { return this.fac[fac].res; }
  canAfford(fac, cost) {
    const r = this.fac[fac].res;
    if (!cost) return true;
    return r.tin >= (cost.tin || 0) && r.steel >= (cost.steel || 0) && r.fuel >= (cost.fuel || 0);
  }
  pay(fac, cost) {
    const r = this.fac[fac].res;
    r.tin -= cost.tin || 0; r.steel -= cost.steel || 0; r.fuel -= cost.fuel || 0;
  }
  gain(fac, tin, steel, fuel) {
    const r = this.fac[fac].res;
    r.tin += tin || 0; r.steel += steel || 0; r.fuel += fuel || 0;
  }
  tierNum(fac) {
    let t = 0;
    for (const u of UPGRADES) if (u.tier > 0 && this.fac[fac].upgrades.has(u.id)) t = Math.max(t, u.tier);
    return t;
  }
  getTier(fac) {
    const fac2 = this.fac[fac];
    const eff = { dmg: 1, speed: 1, armorHp: 1, infDmg: 1, atDmg: 1 };
    for (const id of fac2.upgrades) {
      const u = UPGRADES.find((x) => x.id === id);
      if (!u || !u.effect) continue;
      if (u.effect.dmg) eff.dmg *= u.effect.dmg;
      if (u.effect.infDmg) eff.infDmg *= u.effect.infDmg;
      if (u.effect.armorHp) eff.armorHp *= u.effect.armorHp;
      if (u.effect.speed) eff.speed *= u.effect.speed;
      if (u.effect.atDmg) eff.atDmg *= u.effect.atDmg;
    }
    return { tier: this.tierNum(fac), eff };
  }

  // ---------- construction ----------
  buildingAt(tx, ty) {
    for (const b of this.buildings)
      if (!b.dead && b.isAlive() && tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h) return b;
    return null;
  }
  canBuild(id, fac, tx, ty) {
    const cfg = BUILDINGS[id];
    if (!cfg || !this.canAfford(fac, cfg.cost)) return false;
    const w = cfg.w || 1, h = cfg.h || 1;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!this.map.buildable(x, y)) return false;
      if (this.buildingAt(x, y)) return false;
      if (this.occupied.has(x + "," + y)) return false;
      if (cfg.placement === "ore" && !this.map.hasOre(x, y)) return false;
      if (cfg.placement === "oil" && !this.map.hasOil(x, y)) return false;
    }
    return true;
  }
  startBuild(id, fac, tx, ty) {
    const cfg = BUILDINGS[id];
    if (!this.canBuild(id, fac, tx, ty)) return null;
    this.pay(fac, cfg.cost);
    const b = new E.Building(cfg, fac, tx, ty);
    b.underpowered = false;
    b.built = cfg.time || Math.max(3, (cfg.cost.tin || 0) / 100); // construction duration (sec)
    this.buildings.push(b);
    this.sound("build");
    this.log((FACTION_META[fac].label.split(" — ")[0]) + " built " + cfg.name, "build");
    return b;
  }
  demolish(b) {
    if (!b || b.dead) return;
    this.gain(b.fac, b.cfg.cost.tin * TUNE.sellRefund * 0.5, b.cfg.cost.steel * 0.5 * TUNE.sellRefund, 0);
    b.hp = 0; b.dead = true;
    this.buildings = this.buildings.filter((x) => x !== b);
    b.selected = false;
    this.sound("demolish");
    this.log(b.cfg.name + " demolished (refund paid)", "econ");
    if (this.onUiTick) this.onUiTick("sell", b);
  }
  // pay 10 tin/sec to regenerate hp (buildings & units), stops at full
  repairB(e) {
    if (!e || e.dead || !e.isAlive()) return false;
    if (e.hp >= e.maxHp) return false;
    if ((this.fac[e.fac].res.tin || 0) < 10) return false;
    e.hp = Math.min(e.maxHp, e.hp + TUNE.repairRate);
    this.fac[e.fac].res.tin -= 10;
    e._repairFx = true;
    if (this.onUiTick) this.onUiTick("repair", e);
    return true;
  }

  // ---------- production ----------
  unitAvailable(fac, id) {
    const u = UNITS[id];
    if (!u || u.fac !== fac) return false;
    if (u.needsTier && this.tierNum(fac) < u.needsTier) return false;
    if (fac === "japan" && id === "j_205" && this.fac.japan.needsLock205) return false;
    return this.canAfford(fac, u.cost);
  }
  queueUnit(b, id) {
    const u = UNITS[id];
    if (!u || !this.unitAvailable(b.fac, id)) return false;
    // global unit cap: count alive + queued so the cap never overflows
    const mine = this.units.filter((x) => x.fac === b.fac && !x.dead).length +
      this.buildings.reduce((s, x) => x.fac === b.fac ? s + x.queue.length : s, 0);
    if (mine >= TUNE.maxUnitsPerSide) return false;
    if (!b.queueAdd(id)) return false;
    this.pay(b.fac, u.cost);
    return true;
  }
  _freeSpotNear(b, range) {
    // find a buildable, unoccupied tile adjacent-ish to building b (for guns/tanks)
    const cx = b.tx + (b.w >> 1), cy = b.ty + (b.h >> 1);
    const cands = [];
    for (let dy = -range; dy <= range; dy++)
      for (let dx = -range; dx <= range; dx++)
        cands.push([cx + dx, cy + dy, dx * dx + dy * dy]);
    cands.sort((p, q) => p[2] - q[2]);
    for (const [x, y] of cands) {
      if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) continue;
      if (!this.map.buildable(x, y)) continue;
      if (this.buildingAt(x, y)) continue;
      if (this.occupied.has(x + "," + y)) continue;
      return [x, y];
    }
    return null;
  }
  onUnitComplete(b, id) {
    if (b.dead) return;
    const u = UNITS[id] || BUILDINGS[id];
    if (!u) return;
    if (BUILDINGS[id]) {
      // depot-queued building: place on first clear footprint near the depot
      for (let range = 1; range <= 6; range++) {
        let placed = false;
        for (let dy = -range; dy <= range && !placed; dy++)
          for (let dx = -range; dx <= range && !placed; dx++) {
            if (this.canBuild(id, b.fac, b.tx + dx, b.ty + dy)) {
              this.startBuild(id, b.fac, b.tx + dx, b.ty + dy);
              placed = true;
            }
          }
        if (placed) return;
      }
      this.log("No room — " + u.name + " build cancelled", "warn");
      return;
    }
    if (u.speed === 0) {
      const spot = this._freeSpotNear(b, 3);
      if (!spot) { b.queue.unshift(id); return; } // retry next tick
      const g = E.makeUnit(id, b.fac, spot[0] * TILE + TILE / 2, spot[1] * TILE + TILE / 2, this);
      g.fx = null; g.fy = null;
      this.sound("spawn");
      return;
    }
    const bx = b.x + ((b.id % 3) - 1) * 18;
    const by = b.y + (b.h * TILE) / 2 + 8;
    const nu = E.makeUnit(id, b.fac, bx, by, this);
    nu.spawnTimer = 0.7;
    this.sound("spawn");
  }

  // ---------- research ----------
  hasLab(fac) { return this.buildings.some((b) => !b.dead && b.isAlive() && b.fac === fac && b.cfg.steelMill !== 1 && b.cfg.name === "Upgrades Lab"); }
  canResearch(fac, id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return false;
    if (this.fac[fac].upgrades.has(id)) return false;
    if (!this.hasLab(fac)) return false;
    const r = this.fac[fac].res;
    return r.tin >= (u.cost || 0);
  }
  research(fac, id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!this.canResearch(fac, id)) return false;
    this.fac[fac].res.tin -= u.cost || 0;
    this.fac[fac].upgrades.add(id);
    if (u.effect && u.effect.unlock205) this.fac.japan.needsLock205 = false;
    const gt = this.getTier(fac);
    for (const un of this.units) if (un.fac === fac && un.isAlive()) E.applyUnitUpgrades(un, gt.tier, gt.eff);
    this.log(FACTION_META[fac].label.split(" — ")[0] + " researched: " + u.name + " (" + (u.tier) + ")", "upg");
    this.sound("research");
    return true;
  }

  // ---------- combat ----------
  applyCounters(src, tgt, dmg) {
    let d = dmg;
    const scfg = src.cfg || {};
    // tgt.isAir is a METHOD on units (absent on buildings) — call it, don't read it.
    const tgtAir = tgt.isAir && typeof tgt.isAir === "function" ? tgt.isAir() : false;
    const tgtClass = typeof tgt.class === "function" ? tgt.class() : null;
    if (scfg.at && tgt.isAlive() && !tgtAir && tgtClass === "tank") d *= 1.5;
    if (scfg.aa && tgtAir) d *= 1.5 * (scfg.aa || 1);
    return d;
  }
  addProjectile(src, tgt, dmg, splash, cls) {
    const sc = src.center();
    this.projectiles.push(new Projectile(sc.x, sc.y, tgt, src.fac, dmg, splash, cls || (src.cfg ? src.cfg.class : "def")));
    this.sound("shot");
  }
  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      if (p.target && p.target.isAlive()) { p.tx = p.target.x; p.ty = p.target.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step + 5 || p.life <= 0) {
        p.dead = true;
        this.impact(p);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        p.life -= dt;
      }
    }
    if (this.projectiles.length) this.projectiles = this.projectiles.filter((p) => !p.dead);
  }
  impact(p) {
    if (p.target && p.target.isAlive()) p.target.takeDamage(p.dmg, this);
    if (p.splash > 0) {
      const r = p.splash * TILE;
      const both = p.target ? [p.target] : [];
      for (const list of [this.units, this.buildings])
        for (const e of list) {
          if (!e.isAlive() || e.dead || e.fac === p.fac) continue;
          if (e === p.target) continue;
          if (Math.hypot(e.x - p.tx, e.y - p.ty) < r) e.takeDamage(p.dmg * 0.5, this);
        }
    }
    this.sound("impact");
  }
  kill(e, isBuilding) {
    if (e.dead) return;
    e.dead = true;
    if (isBuilding) this.buildings = this.buildings.filter((x) => x !== e);
    else this.units = this.units.filter((x) => x !== e);
    this.sound(isBuilding ? "boom" : "unitdead");
    this.log((isBuilding ? e.cfg.name : e.cfg.name) + " destroyed", "kill");
    this.winCheck();
    if (this.onUiTick) this.onUiTick("kill", e);
    // Combat death of a building (demolish() skips this). Lets the AI know to
    // pause rebuilding the same type instead of instantly re-queueing it.
    if (isBuilding && this.onBuildingKilled) this.onBuildingKilled(e);
  }
  winCheck() {
    if (this.winner) return;
    for (const f of ["china", "japan"]) {
      // lose by losing your depot (destroyed or captured)
      const has = this.buildings.some((b) => b.fac === f && !b.dead && b.isAlive() && b.cfg?.id === "depot");
      if (!has) {
        this.winner = (f === "china") ? "japan" : "china";
        this.log(this.winner === "china" ? "CHINA VICTORIOUS 中国大捷" : "JAPAN VICTORIOUS 日本必勝", "win");
        this.sound("win");
        if (this._onWin) this._onWin(this.winner);
      }
    }
  }

  // ---------- main tick ----------
  rebuildOccupied() {
    const occ = new Set();
    for (const b of this.buildings)
      if (!b.dead && b.isAlive())
        for (let dy = 0; dy < b.h; dy++)
          for (let dx = 0; dx < b.w; dx++)
            occ.add((b.tx + dx) + "," + (b.ty + dy));
    for (const u of this.units)
      if (!u.dead && u.isAlive() && u.cfg.speed !== 0)
        occ.add(Math.floor(u.x / TILE) + "," + Math.floor(u.y / TILE));
    this.occupied = occ;
  }
  economy(dt) {
    for (const f of ["china", "japan"]) {
      let gen = TUNE.basePower, draw = 0;
      for (const b of this.buildings) {
        if (b.fac !== f || b.dead || !b.isAlive()) continue;
        gen += b.powerGen();
        draw += b.powerDraw();
      }
      const ok = draw <= gen;
      let tin = 0, fuel = 0;
      for (const b of this.buildings) {
        if (b.fac !== f || b.dead || !b.isAlive()) continue;
        const inc = b.income();
        tin += inc.tin || 0;
        fuel += inc.fuel || 0;
        // steel mill: consumes tin -> steel
        if (b.cfg.steelMill) {
          const r = this.fac[f].res;
          if (r.tin >= 1) { r.tin -= 1 * dt; this.fac[f].res.steel += 1 * dt; }
        }
      }
      if (!ok) { tin *= TUNE.underpowerMult; fuel *= TUNE.underpowerMult; }
      for (const b of this.buildings)
        if (b.fac === f && !b.dead && b.isAlive() && b.queue.length) b.underpowered = !ok;
      this.fac[f].power = { gen, draw, ok };
      this.gain(f, (tin + TUNE.baseIncomeTin * (this.fac[f].incomeMult ?? 1)) * dt, 0, fuel * dt);
    }
  }
  update(dt) {
    if (this.paused || this.winner) return;
    this.time += dt;
    this.rebuildOccupied();
    this.economy(dt);
    // per-entity try/catch: one bad entity must never halt the whole tick
    // (a single throw used to freeze all unit movement + construction)
    for (const u of this.units) {
      try { u.update(dt, this); } catch (e) {
        if (!u.__warned) { u.__warned = true; console.warn("[unit]", e && e.message, e); }
        u.dead = true;
      }
    }
    for (const b of this.buildings) {
      try { b.update(dt, this); } catch (e) {
        if (!b.__warned) { b.__warned = true; console.warn("[building]", e && e.message, e); }
        b.dead = true;
      }
    }
    this.updateProjectiles(dt);
    this.units = this.units.filter((u) => !u.dead && u.isAlive());
    this.buildings = this.buildings.filter((b) => !b.dead || b.isAlive());
  }
}
