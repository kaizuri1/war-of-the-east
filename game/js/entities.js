// WAR OF THE EAST — entities.js
// Unit, Building classes; movement/pathing, targeting, combat, capture, fuel,
// construction, production queues. All logic the engine & AI drive every tick.
import { UNITS, BUILDINGS, UPGRADES, TUNE, TILE } from "./config.js";

let _id = 1;
const uid = () => _id++;

export class Entity {
  constructor(fac) { this.fac = fac; this.id = uid(); this.hp = 0; this.selected = false; }
  isAlive() { return this.hp > 0; }
  center() { return { x: this.x, y: this.y }; }
}

// ---------------- Unit ----------------
export class Unit extends Entity {
  constructor(cfg, fac, x, y) {
    super(fac);
    this.cfg = cfg;
    this.x = x; this.y = y;            // pixels
    this.hp = cfg.hp; this.maxHp = cfg.hp;
    this.fx = null; this.fy = null;    // path (tile coords)
    this.t = cfg.fuel ?? 0; this.maxT = cfg.fuel ?? 0;
    this.target = null;                // entity to attack
    this.moveOrder = null;             // {x,y} px, or attack-move state
    this.attackMove = false;
    this.cooldown = 0;
    this.repath = 0;
    this.dead = false;
    this.controlGroup = 0;
    this.anim = Math.random() * 6.28;
    this.moving = 0;                   // 0..1 speed factor this frame
    this.spawnTimer = 0.4;             // grace after emerging from factory
    this.applyUpgrades();
  }
  applyUpgrades() { /* engine re-applies after tier changes */ }
  class() { return this.cfg.class; }
  footprint() { return this.cfg.class === "tank" ? 11 : this.cfg.class === "air" ? 9 : 7; }
  isAir() { return this.cfg.class === "air"; }
  isStatic() { return this.cfg.speed === 0; }
  speedNow() {
    let s = this.cfg.speed;
    return s;
  }
  damageNow() { return this.cfg.dmg; }
  // fuel multiplier: tanks with empty tank crawl
  fuelMult() {
    if (!this.maxT) return 1;
    if (this.t <= 0) return TUNE.fuelEmptySpeedMult;
    return Math.max(TUNE.fuelEmptySpeedMult, Math.min(1, 0.4 + 0.6 * (this.t / this.maxT)));
  }
  findPath(tileX, tileY, map, occupied) {
    // BFS over tiles (8-dir, no corner-cutting); air ignores solids
    const w = map.w, h = map.h;
    const sx = Math.max(0, Math.min(w - 1, Math.floor(this.x / TILE)));
    const sy = Math.max(0, Math.min(h - 1, Math.floor(this.y / TILE)));
    const tx = Math.max(0, Math.min(w - 1, tileX)), ty = Math.max(0, Math.min(h - 1, tileY));
    if (sx === tx && sy === ty) return [];
    const pass = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      if (this.isAir()) return true;
      if (map.solid(x, y)) return false;
      if (x === tx && y === ty) return true;
      // a unit may always re-enter its OWN current tile (otherwise the BFS
      // can never step out and every move order deadlocks on the first tile)
      if (x === sx && y === sy) return true;
      if (occupied.has(x + "," + y)) return false;
      return true;
    };
    // reachable goal = the target tile itself if it's free, else the ring of
    // free neighbors — clicking on a solid (tree/water) moves you next to it,
    // and a target blocked by another unit lands on a free adjacent tile
    let goalRing = null;
    if (pass(tx, ty)) {
      goalRing = new Set([ty * w + tx]);
    } else {
      goalRing = new Set();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!map.solid(nx, ny) && pass(nx, ny)) goalRing.add(ny * w + nx);
      }
    }
    if (!goalRing.size) return null;
    const visited = new Uint8Array(w * h);
    const px = new Int32Array(w * h);   // parent tile x (y = (k - px)/w)
    const py = new Int32Array(w * h);
    visited[sy * w + sx] = 1;
    const q = [sx, sy]; let head = 0;   // index pointer — Array.shift() is O(n²)
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    let found = false, gx = tx, gy = ty;
    let guard = 0;
    while (head + 1 < q.length && !found && guard++ < w * h * 8) {
      const cx = q[head], cy = q[head + 1]; head += 2;
      const ck = cy * w + cx;
      if (goalRing.has(ck)) { found = true; gx = cx; gy = cy; break; }
      for (let d = 0; d < 8; d++) {
        const dx = dirs[d][0], dy = dirs[d][1];
        const nx = cx + dx, ny = cy + dy;
        const k = ny * w + nx;
        if (visited[k]) continue;
        if (!pass(nx, ny)) continue;
        // 8-dir: no cutting corners diagonally between two solids
        if (dx && dy && !this.isAir() && (map.solid(cx + dx, cy) || map.solid(cx, cy + dy))) continue;
        visited[k] = 1;
        px[k] = cx; py[k] = cy;
        q.push(nx, ny);
      }
    }
    if (!found) return null;
    if (gx === sx && gy === sy) return [];
    const path = [];
    let k = gy * w + gx;
    while (k !== sy * w + sx && path.length < 512) {
      path.push({ x: (k % w) * TILE + TILE / 2, y: Math.floor(k / w) * TILE + TILE / 2 });
      const kk = py[k] * w + px[k];
      k = kk;
    }
    path.reverse();
    return path;
  }
  update(dt, game) {
    if (this.dead) return;
    this.anim += dt * 6;
    // spawn grace: no combat while emerging
    if (this.spawnTimer > 0) { this.spawnTimer -= dt; }
    const map = game.map, fac = this.fac;
    // --- fuel burn ---
    if (this.maxT) {
      if (this.moveOrder && this.hp > 0) this.t = Math.max(0, this.t - TUNE.fuelBurn * dt * (this.moving ? 1 : 0.3));
      // refill at own refuel buildings (fuel depot or tank factory)
      if (this.t < this.maxT) {
        for (const b of game.buildings) {
          if (!b.isRefuel() || b.fac !== fac || !b.isAlive()) continue;
          const d = Math.hypot(b.center().x - this.x, b.center().y - this.y);
          if (d < TUNE.refuelRadius) {
            this.t = Math.min(this.maxT, this.t + TUNE.refuelRate * dt);
            break;
          }
        }
      }
    }
    // --- targeting ---
    if (this.cooldown > 0) this.cooldown -= dt;
    this.repath -= dt;
    const vrange = this.rangePx() * 1.5;
    // acquire: attack-move (chase), idle hunting (hold fire), or re-acquire a lost lock
    if (!this.target) {
      let t = null;
      if (this.attackMove) t = game.nearestEnemy(this, this.rangePx(), game);
      else if (this.isStatic()) {
        // idle ground unit: see an enemy in view → stop and fire (C&C hold-fire)
        if (!this.moving) {
          for (const e of game.units) {
            if (e === this || e.fac === fac || e.dead || !e.isAlive()) continue;
            if (Math.abs(e.x - this.x) > vrange || Math.abs(e.y - this.y) > vrange) continue;
            if (!targetable(this, e)) continue;
            t = e; break;
          }
        }
      } else if (!this.moving && !this.moveOrder) {
        for (const e of game.units) {
          if (e === this || e.fac === fac || e.dead || !e.isAlive()) continue;
          if (Math.abs(e.x - this.x) > vrange || Math.abs(e.y - this.y) > vrange) continue;
          if (!targetable(this, e)) continue;
          t = e; break;
        }
      }
      if (!t && this.moveOrder && game.time - this.lastHit > 6 && !this.moving) {
        // long idle at a finished order: look around for anything still in view
        for (const e of game.units) {
          if (e === this || e.fac === fac || e.dead || !e.isAlive()) continue;
          if (Math.abs(e.x - this.x) > vrange || Math.abs(e.y - this.y) > vrange) continue;
          if (!targetable(this, e)) continue;
          t = e; break;
        }
      }
      if (t) { this.target = t; this.attackMove = false; }
    }
    if (this.target && (!this.target.isAlive() || this.target.dead)) this.target = null;
    // target wandered far beyond range: drop it and re-acquire (previously a
    // stale lock left units idle on the map, "stop shooting")
    if (this.target) {
      const tc = this.target.center();
      if (Math.hypot(tc.x - this.x, tc.y - this.y) > this.rangePx() * 1.5) this.target = null;
    }
    // --- movement ---
    let moving = 0;
    if (this.target) {
      const tc = this.target.center();
      const d = Math.hypot(tc.x - this.x, tc.y - this.y);
      if (d > this.rangePx()) {
        // chase
        const dx = (tc.x - this.x) / (d || 1), dy = (tc.y - this.y) / (d || 1);
        const sp = this.speedNow() * this.fuelMult() * this.speedMult * dt;
        this.moveStep(dx * sp, dy * sp, game);
        moving = 1;
      } else {
        // in range: fire
        if (this.cooldown <= 0 && this.spawnTimer <= 0) {
          this.fire(game);
          this.cooldown = this.cfg.rof;
        }
      }
    } else if (this.fx !== null || this.path) {
      // follow path
      if (this.fx !== null && this.repath <= 0) {
        this.fx2 = this.findPath(this.fx, this.fy, map, game.occupied);
        this.repath = 0.6;
        if (this.fx2 === null) {
          // path temporarily blocked (unit in the way / building appearing):
          // keep the order and retry on the next repath — never give up early
          this.path = null;
        }
        else this.path = this.fx2;
      }
      if (this.path && this.path.length) {
        const next = this.path[0];
        const dx = next.x - this.x, dy = next.y - this.y;
        const d = Math.hypot(dx, dy);
        const sp = this.speedNow() * this.fuelMult() * this.speedMult * dt;
        if (d <= sp || d < 1) {
          this.x = next.x; this.y = next.y; this.path.shift();
          if (!this.path.length) { this.fx = null; this.fy = null; this.moveOrder = null; }
        } else {
          this.moveStep(dx / d * sp, dy / d * sp, game);
          moving = 1;
        }
      } else if (!this.attackMove) { this.moveOrder = null; }
      // --- friendly separation: push out of stacked same-side units so a
      // group moved to one point fans into a formation instead of a blob
      if (!this.isAir() && !this.isStatic()) {
        for (const o of game.units) {
          if (o === this || o.fac !== fac || o.dead || !o.isAlive()) continue;
          if (o.isAir() && !o.isStatic()) continue;
          if (o.isStatic()) continue;   // guns / buildings stay put
          const ox = this.x - o.x, oy = this.y - o.y;
          const od = Math.hypot(ox, oy);
          const min = this.footprint() + 6;
          if (od < min && od > 0.01) {
            const push = ((min - od) / od) * 0.6;
            this.x += ox * push; this.y += oy * push;
          }
        }
        this.clampToMap(game);
      }
    }
    this.moving = moving;
    // engineer: capture / repair while stationary
    if (this.cfg.engineer && this.spawnTimer <= 0) {
      for (const b of game.buildings) {
        if (!b.isAlive()) continue;
        const d = Math.hypot(b.center().x - this.x, b.center().y - this.y);
        if (d >= TILE * 1.8) continue;
        if (b.fac !== fac && b.hp > 0) {
          // enemy building: capture it
          if (!b.capByFac) { b.capByFac = fac; b.capHp = b.maxHp; }
          b.capHp -= TUNE.captureRate * b.maxHp * dt;
          if (b.capHp <= 0 && b.hp > 0) b.capture(fac, game);
        } else if (b.fac === fac && b.hp < b.maxHp) {
          // friendly building: repair it
          b.hp = Math.min(b.maxHp, b.hp + TUNE.captureBuildingRate * b.maxHp * dt);
        }
        break;
      }
      for (const u of game.units) {
        // u.isAir is a METHOD on units — call it (reading it is always truthy)
        if (u.isAir() || u.fac !== this.fac) continue; // only repair friendly ground units
        if (!u.isAlive() || u.cfg.engineer || u === this || !u.canBeRepaired()) continue;
        const d = Math.hypot(u.x - this.x, u.y - this.y);
        if (d < TILE * 1.6) { u.hp = Math.min(u.maxHp, u.hp + TUNE.repairRate * dt); break; }
      }
    }
  }
  canBeRepaired() { return this.hp < this.maxHp && !this.isAir(); }
  rangePx() { return this.cfg.range * TILE; }
  clampToMap(game) {
    if (this.isAir()) return;
    const w = game.map.w * TILE, h = game.map.h * TILE;
    if (this.x < TILE) this.x = TILE;
    if (this.y < TILE) this.y = TILE;
    if (this.x > w - TILE) this.x = w - TILE;
    if (this.y > h - TILE) this.y = h - TILE;
  }
  moveStep(dx, dy, game) {
    this.x += dx; this.y += dy;
    this.clampToMap(game);
  }
  fire(game) {
    if (!this.target || !this.target.isAlive()) return;
    let dmg = this.damageNow();
    // class counters
    dmg = game.applyCounters(this, this.target, dmg);
    game.addProjectile(this, this.target, dmg, this.cfg.splash || 0, this.cfg.class);
  }
  takeDamage(d, game) {
    this.hp -= d;
    this.lastHit = game.time;
    if (this.hp <= 0 && !this.dead) game.kill(this, false);
  }
}

// ---------------- Building ----------------
export class Building extends Entity {
  constructor(cfg, fac, tx, ty) {
    super(fac);
    this.cfg = cfg;
    this.tx = tx; this.ty = ty;
    this.x = tx * TILE + (cfg.w || 1) * TILE / 2;
    this.y = ty * TILE + (cfg.h || 1) * TILE / 2;
    this.hp = this.maxHp = cfg.hp;
    this.queue = []; // {id} waiting
    this.queueTimer = 0;
    this.cooldown = 0;
    this.target = null;
    this.capHp = 0;
    this.capByFac = null;
    this.dead = false;
    this.selected = false;
    this.buildT = 0;                 // construction progress (sec)
    this.built = 0;                  // done when buildT >= built
    this.w = cfg.w || 1; this.h = cfg.h || 1;
  }
  underConstruction() { return this.buildT < this.built; }
  canProduce() {
    return this.cfg.slots > 0 && this.queue && this.queue.length >= 1;
  }
  queueAdd(id) {
    if (this.queue.length >= this.cfg.slots) return false;
    let cfg = UNITS[id] || BUILDINGS[id];
    let time = cfg && cfg.time;
    if (cfg && !time) time = 3 + (cfg.cost ? (cfg.cost.tin || 0) : 0) / 100; // unit build time from cost
    if (!cfg) { const up = UPGRADES.find(u => u.id === id); cfg = up || { time: 10 }; }
    this.queue.push({ id, _cfg: cfg || { time: 10 } }); return true;
  }
  queueRemove(i) { if (i >= 0 && i < this.queue.length) this.queue.splice(i, 1); }
  powerDraw() { return this.cfg.power < 0 ? -this.cfg.power : 0; }
  powerGen() { return this.cfg.power > 0 ? this.cfg.power : 0; }
  update(dt, game) {
    if (this.dead) return;
    if (this.underConstruction()) {
      this.buildT += dt;
      if (this.buildT >= this.built) this.buildT = this.built;
      return; // no production/power while under construction
    }
    // production
    if (this.queue.length) {
      const speed = this.underpowered ? TUNE.underpowerMult : 1;
      this.queueTimer += dt * speed;
      const cur = this.queue[0];
      const cfg = cur._cfg;
      if (this.queueTimer >= (cfg.time || 1)) {
        this.queueTimer = 0;
        this.queue.shift();
        game.onUnitComplete(this, cur.id);
      }
    }
    // defensive fire
    if (this.cfg.weapon) {
      if (this.cooldown > 0) this.cooldown -= dt;
      if (!this.target || !this.target.isAlive()) {
        const t = game.nearestEnemy(this, cfgRange(this), game);
        if (t) this.target = t; else this.target = null;
      }
      if (this.target && !this.target.dead) {
        // stale target far away: drop it (previously could lock onto a
        // distant building forever and never re-acquire closer enemies)
        const far = Math.hypot(this.target.x - this.x, this.target.y - this.y) > cfgRange(this) * 1.6;
        if (!far) {
          const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
          if (d <= cfgRange(this) && this.cooldown <= 0) {
            let dmg = this.cfg.weapon.dmg;
            dmg = game.applyCounters(this, this.target, dmg);
            game.addProjectile(this, this.target, dmg, 0, "def");
            this.cooldown = this.cfg.weapon.rof;
          }
        } else this.target = null;
      }
    }
    // capture progress
    if (this.capByFac) this.capPct = 1 - Math.max(0, this.capHp) / this.maxHp;
  }
  takeDamage(d, game) {
    this.hp -= d;
    if (this.hp <= 0 && !this.dead) game.kill(this, true);
  }
  capture(fac, game) {
    this.fac = fac;
    this.capHp = 0;
    this.capByFac = null;
    this.capPct = 0;
    this.queue = [];
    game.log(`${this.cfg.name} captured by ${fac}`, "cap");
    game.events.push({ t: game.time, kind: "capture", id: this.id, fac });
    game.sound("capture");
    game.winCheck();
  }
  isStatic() { return true; }
  // which resources does this building generate per second?
  income() { return this.cfg.income || {}; }
  isRefuel() { return !!this.cfg.refuel; }
}

function cfgRange(b) { return (b.cfg.weapon ? b.cfg.weapon.range : 6) * TILE; }

// ---------- factory helpers ----------
export function makeUnit(cfgId, fac, x, y, game) {
  const cfg = UNITS[cfgId];
  const u = new Unit(cfg, fac, x, y);
  // upgrade multipliers
  const gt = game.getTier(fac);
  applyUnitUpgrades(u, gt.tier, gt.eff);
  game.units.push(u);
  return u;
}
export function makeBuilding(cfgId, fac, tx, ty) {
  return new Building(BUILDINGS[cfgId], fac, tx, ty);
}
// static gun built by arsenal becomes a "unit" with speed 0 (simpler lifecycle)
export function makeGunUnit(cfgId, fac, tx, ty, game) {
  const u = makeUnit(cfgId, fac, tx * TILE + TILE / 2, ty * TILE + TILE / 2, game);
  u.fx = null; u.fy = null;
  return u;
}
export function applyUnitUpgrades(u, tier, eff) {
  eff = eff || {};
  let hpMul = eff.armorHp || 1;
  let dmgMul = (eff.dmg || 1);
  if (u.cfg.class === "infantry") dmgMul *= (eff.infDmg || 1);
  if (u.cfg.at || u.cfg.aa) dmgMul *= (eff.atDmg || 1);
  u.speedMult = eff.speed || 1;
  u.dmgMult = dmgMul;
  if (u.maxHp) {
    const base = u.cfg.hp * hpMul;
    u.maxHp = base; 
    if (u.hp > base) u.hp = base;
  }
}
export function unitDamageWithUpgrades(u) { return u.cfg.dmg * (u.dmgMult || 1); }
// re-bind Unit methods that need overrides
Unit.prototype.damageNow = function() { return unitDamageWithUpgrades(this); };
Unit.prototype.speedNow = function() {
  let s = this.cfg.speed;
  // tank fuel handled in fuelMult; speed upgrade:
  s *= (this.speedMult || 1);
  return s;
};

// nearest enemy of `src` within px
const CLASS_TOKEN = { infantry: "inf", tank: "veh", gun: "veh", air: "air" };
export function targetable(src, e) {
  // `isAir` is a METHOD (units) or absent (buildings) — the old `e.isAir ? ...`
  // read it as a property, which is a truthy function ref on EVERY unit, so all
  // units were classed "air" and non-AA units could never auto-acquire them.
  const isAir = e.isAir && typeof e.isAir === "function" ? e.isAir() : false;
  let cls = isAir ? "air" : (typeof e.class === "function" ? e.class() : "veh");
  if (e.constructor && e.constructor.name === "Building") cls = "veh";
  const allowed = src.cfg && src.cfg.targets;
  if (!allowed) return true;
  return allowed.includes(CLASS_TOKEN[cls] || "veh");
}
export function nearestEnemy(src, px, game) {
  const fac = src.fac;
  let best = null, bd = px * px;
  for (const list of [game.units, game.buildings]) {
    for (const e of list) {
      if (e.fac === fac || !e.isAlive() || e.dead) continue;
      if (!targetable(src, e)) continue;
      const ec = e.center ? e.center() : e;
      const dx = ec.x - src.x, dy = ec.y - src.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bd) { bd = d2; best = e; }
    }
  }
  return best;
}
