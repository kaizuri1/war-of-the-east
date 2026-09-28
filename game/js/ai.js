// WAR OF THE EAST — ai.js
// Japan (or China if the player is Japan) bot.
// Ground truth: config.js (UNITS/BUILDINGS/UPGRADES — units have .class
// infantry|tank|gun|air and optional .needsTier), engine.js Game (res,
// canAfford, queueUnit, unitAvailable, canBuild, startBuild, canResearch,
// research, fac[f].power, tierNum), entities.js Building fields.
import { UNITS, BUILDINGS, UPGRADES, TILE, TUNE, AI_DIFF } from "./config.js";

const enemyOf = (f) => (f === "japan" ? "china" : "japan");

export class AI {
  constructor(game, fac) {
    this.g = game;
    this.fac = fac;
    this.acc = 0;
    this.diff = (game.diff && AI_DIFF[game.diff]) || AI_DIFF.medium;
    this.nextWave = this.diff.nextWave;   // t at which the first wave may launch
    this.waveGap = this.diff.waveGap;
    this.researched = new Set();
    this.home = null;        // home depot building
    // type -> game.time when one of MY buildings of that type was destroyed.
    // Rebuilding the same type right after a kill is what made the AI "instantly
    // build it back" — the player's attack was met with a replacement seconds
    // later, in an endless loop. A per-difficulty pause after a kill breaks it.
    this._diedAt = {};
  }

  // a building (not a player-demolition) was destroyed: mark its type as
  // "recently killed" so economy() won't instantly re-queue a twin.
  markBuildingKilled(id) {
    if (!id) return;
    this._diedAt[id] = this.g.time;
  }
  // should a NEW build of this type wait? production only — pure income (ore/fuel)
  // and a just-queued building are NOT gated on kills.
  _rebuildPaused(id) {
    const t0 = this._diedAt[id];
    if (!Number.isFinite(t0)) return false;
    const delay = this.diff?.rebuildDelay;
    if (!delay) return false;
    return (this.g.time - t0) < delay;
  }

  tick(dt) {
    this.acc += dt;
    if (this.acc < 0.5) return; // 2 decisions/second is plenty
    this.acc = 0;
    const g = this.g;
    if (g.winner) return;
    if (!this.home || this.home.dead || !this.home.isAlive()) {
      this.home = g.buildings.find((b) => b.fac === this.fac && !b.dead && b.isAlive() && b.cfg?.id === "depot")
        || g.buildings.find((b) => b.fac === this.fac && !b.dead && b.isAlive());
      if (!this.home) return;
    }
    this.research();
    this.economy();
    this.selfRepair();
    this.production();
    this.offense();
  }

  // #5: keep own base topped up — mark damaged buildings so the engine's
  // repairContinuous() heals them each frame until full or out of tin.
  selfRepair() {
    for (const b of this.myBuildings()) {
      if (b.hp < b.maxHp) b._repairing = true;
    }
  }

  myBuildings() {
    return this.g.buildings.filter((b) => b.fac === this.fac && !b.dead && b.isAlive());
  }

  // ---------- research ----------
  research() {
    const g = this.g, f = this.fac;
    const ordered = [...UPGRADES].sort((a, b) => (a.tier || 0) - (b.tier || 0));
    // HARD pre-researches heavies first — sort those to the front
    ordered.sort((a, b) =>
      (this.diff.preResearch.includes(b.id) ? 1 : 0) - (this.diff.preResearch.includes(a.id) ? 1 : 0));
    for (const u of ordered) {
      if (this.researched.has(u.id)) continue;
      if (f === "japan" && u.id === "superheavy" && g.fac.japan.needsLock205) continue;
      if (g.canResearch(f, u.id) && g.research(f, u.id)) this.researched.add(u.id);
    }
  }

  // ---------- economy ----------
  // Connectivity guard: ground units emerge from the depot's SOUTH edge tile
  // (b.y + h*TILE/2 + 8). findPath() walks on 8 dirs with corner-cut and treats
  // EVERY occupied tile (the map.occupied Set = solid terrain + every building)
  // as a wall, so the ONLY 1-wide gap out of the spawn pocket is passable if —
  // and only if — that tile stays free. If economy (ore/fuel) builds on a tile
  // in the pocket's cut-set, every new unit finds no path out and the whole
  // army stacks at the door ("locked in the corner, units can't move").
  // We reject a spot iff blocking it DISCONNECTS the spawn pocket from the
  // open field — i.e. the reachable area after blocking is smaller than
  // "natural minus the tile itself" (a redundant interior/open tile only
  // costs its own cell; an exit costs the whole outside).
  sealedCheck(tx, ty) {
    const g = this.g, m = g.map, w = m.w, h = m.h;
    const home = this.home;
    const cx = home.tx + (home.w >> 1);
    const sy = home.ty + home.h;                       // tile just south of depot
    const sx = Math.max(0, Math.min(w - 1, cx));
    if (sy < 0 || sy >= h) return true;               // depot flush to map edge: leave it
    if (m.solid(sx, sy) || (g.occupied?.has(sx + "," + sy))) return true; // spawn already walled: degenerate
    if (Math.abs(tx - sx) > 3 || Math.abs(ty - sy) > 3) return true;      // far — can't seal the pocket
    const wall = (x, y) => (m.solid(x, y) || (g.occupied?.has(x + "," + y)));
    const area = (extraBlocked, markTo) => {
      const visited = new Uint8Array(w * h);
      visited[sy * w + sx] = 1;
      const qx = [sx], qy = [sy]; let n = 0;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (let head = 0; head < qx.length; head++) {
        const x = qx[head], y = qy[head]; n++;
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (visited[k]) continue;
          if (wall(nx, ny)) continue;
          if (extraBlocked && nx === tx && ny === ty) continue;
          if (dx && dy && (wall(x + dx, y) || wall(x, y + dy))) continue; // no corner cut (mirror of findPath)
          visited[k] = 1; qx.push(nx); qy.push(ny);
        }
      }
      if (markTo) markTo.set(visited);
      return n;
    };
    const openReach = new Uint8Array(w * h);
    const natural = area(false, openReach);
    if (!natural || natural === 1) return true;       // spawn isolated: let the build happen
    if (!openReach[ty * w + tx]) return true;         // tile unreachable from spawn: blocking it changes nothing
    const shrunk = area(true, null);
    // Losing more than the tile's own cell → the exit was cut off → reject.
    return shrunk > natural - 2;
  }
  placeNear(id, anchor, maxRange = 6) {
    const g = this.g, cfg = BUILDINGS[id];
    if (!cfg || !g.canAfford(this.fac, cfg.cost)) return false;
    const cx = anchor.tx + (anchor.w >> 1), cy = anchor.ty + (anchor.h >> 1);
    const anchorNearSpawn = this.home &&
      Math.abs(cx - (this.home.tx + (this.home.w >> 1))) <= 4 &&
      Math.abs(cy - (this.home.ty + (this.home.h >> 1))) <= 4;
    // Any build near the home spawn can close the pocket a ground unit emerges
    // from — the BFS below mirrors findPath's pass rules (occupied walls +
    // corner-cut), so it's exact for every building id, not just ore/fuel.
    const guard = anchorNearSpawn ? (x, y) => this.sealedCheck(x, y) : () => true;
    for (let range = 1; range <= maxRange; range++)
      for (let dy = -range; dy <= range; dy++)
        for (let dx = -range; dx <= range; dx++) {
          const x = cx + dx, y = cy + dy;
          if (guard(x, y) && g.canBuild(id, this.fac, x, y) && g.startBuild(id, this.fac, x, y)) return true;
        }
    return false;
  }
  // Build order ladder: [id, target count]. Tin gates are implicit — the AI
  // saves for each building's cost and production() holds back while it does.
  // Multiple ORE PLANTS first: 1 plant = only 6 tin/s, far too slow for the
  // rest of the ladder (steel 800, tank f 700, airfield 900…).
  static LADDER = [
    ["ore", 6], ["fuel", 3], ["steel", 1], ["barracks", 1], ["tankf", 1],
    ["barracks", 2], ["airf", 1], ["arsenal", 1], ["tankf", 2],
  ];
  // Next building the ladder is saving up for (null = nothing pending).
  nextEcoTarget(mine) {
    const count = (id) => mine.filter((b) => b.cfg?.id === id).length;
    for (const [id, n] of AI.LADDER)
      if (count(id) < n) return { id, cost: BUILDINGS[id].cost.tin };
    return null;
  }
  economy() {
    const g = this.g, f = this.fac;
    const mine = this.myBuildings();
    if (!mine.length) return;
    const depot = this.home;
    const count = (id) => mine.filter((b) => b.cfg?.id === id).length;
    // built + queued count so we don't re-queue a building already in the depot queue
    const pending = (id) =>
      count(id) + mine.reduce((s, b) => s + (b.queue || []).filter((q) => q.id === id).length, 0);
    const power = g.fac[f].power;
    const tin = g.res(f).tin;

    // Affordability gates: queueBld CHARGES tin on queue (engine.js), so the
    // old code drained the stock to 25 every tick and never saved up 350
    // again — the economy froze forever.
    // 1. income expansion: ore / fuel. Only if affordable + nothing pending.
    //    First a local scan (cheap), then a full-map sweep over the known
    //    ore/oil tiles so a corner-based map never plateaus on income just
    //    because the nearest vein is far away. spots are Sets of "x,y" STRING
    //    keys (see rand.js) — the old code destructured entries as [x, y]
    //    and compared tiles as strings, so canBuild was always false.
    if (tin >= BUILDINGS.ore.cost.tin && pending("ore") < 7 && !this.placeNear("ore", depot, 24)) {
      for (const key of g.map.oreSpots) {
        const [sx, sy] = key.split(",").map(Number);
        if (this.placeNear("ore", { tx: sx, ty: sy, w: 1, h: 1 }, 1)) break;
      }
    }
    if (tin >= BUILDINGS.fuel.cost.tin && pending("fuel") < 4 && !this.placeNear("fuel", depot, 24)) {
      for (const key of g.map.oilSpots) {
        const [sx, sy] = key.split(",").map(Number);
        if (this.placeNear("fuel", { tx: sx, ty: sy, w: 1, h: 1 }, 1)) break;
      }
    }
    // 2. power while underpowered
    if (power && !power.ok && this.placeNear("power", depot)) return true;
    // 3. steel mill (needed for armor production economy)
    if (count("steel") === 0 && tin > 800 && this.placeNear("steel", depot)) return true;
    // 4. ladder: production capacity (barracks, armor, air, guns) — save the
    //    full cost (no *2 multiplier: production() already reserves while
    //    saving, so the *2 was pointless extra waiting).
    for (const [id, n] of AI.LADDER) {
      if (id === "ore" || id === "fuel") continue; // handled in step 1
      if (pending(id) < n && tin >= BUILDINGS[id].cost.tin && !this._rebuildPaused(id) && this.placeNear(id, depot)) return true;
    }
    // 5. lab
    if (count("lab") === 0 && tin > 700 && this.placeNear("lab", depot)) return true;
    // 6. power headroom
    if (power && power.draw < power.gen && count("power") < 6 && tin > 500 && this.placeNear("power", depot)) return true;
    // 7. defenses: watchtower if enemy is near-ish, then bunkers/wire
    const near = g.units.some((u) => u.fac !== f && !u.dead &&
      Math.hypot(u.x - depot.center().x, u.y - depot.center().y) < TILE * 10);
    if (count("watch") < 2 && near && this.placeNear("watch", depot)) return true;
    if (near && (count("concb") + count("bunker")) < 2 && this.placeNear("concb", depot)) return true;
    if (count("wire") < 3 && near && this.placeNear("wire", depot)) return true;
    return false;
  }

  // ---------- production ----------
  // building produces -> unit class (config uses "armor"/"guns" but units use
  // "tank"/"gun"). This mapping is what pickUnit must apply — WITHOUT it the
  // AI could never select armor or guns and so only ever produced infantry.
  static CLASS_FOR = { infantry: "infantry", armor: "tank", guns: "gun", air: "air" };
  pickUnit(kind) {
    const g = this.g, f = this.fac, tier = g.tierNum(f);
    const want = AI.CLASS_FOR[kind] || kind;
    const pool = Object.keys(UNITS).map((id) => UNITS[id]).filter((u) =>
      u.fac === f && u.class === want &&
      (!u.needsTier || tier >= u.needsTier) &&
      !(f === "japan" && u.id === "j_205" && g.fac.japan.needsLock205) &&
      g.unitAvailable(f, u.id));            // affordable
    if (!pool.length) return null;
    // VARIETY: rotate the pick so a producer cycles through affordable units
    // instead of always rebuilding the cheapest one (=> "infinite infantry").
    // Weight higher-tier (rarer/stronger) slightly so the mix scales as the
    // economy grows; the rotation index is per-class, so it persists across
    // ticks and yields a stable, varied mix.
    pool.sort((a, b) => ((a.tier || 0) - (b.tier || 0)) || a.id.localeCompare(b.id));
    this._pickIdx = this._pickIdx || {};
    const i = (this._pickIdx[want] || 0) % pool.length;
    this._pickIdx[want] = (this._pickIdx[want] || 0) + 1;
    // if the rotation lands a tier we can't yet afford at that position, fall
    // back to the cheapest affordable so we still build something
    return pool[i].id || pool[0].id;
  }
  production() {
    const g = this.g, f = this.fac;
    const engId = f === "japan" ? "j_eng" : "c_eng";
    const engs = g.units.filter((u) => !u.dead && u.isAlive() && u.cfg?.id === engId).length;
    const producers = g.buildings.filter((b) =>
      b.fac === f && !b.dead && b.isAlive() &&
      b.queue.length === 0 && !b.underConstruction() && !b.underpowered &&
      b.cfg?.slots > 0);
    for (const b of producers) {
      let id = this.pickUnit(b.cfg.produces);
      // barracks: cheap infantry for the garrison; keep engineer count capped
      if (b.cfg.produces === "infantry") {
        if (id === engId && engs >= TUNE.maxEngineersPerSide) id = this.pickCheapInfantry();
      }
      // Affordability check + SAVING: hold a FULL reserve for the next ladder
      // building (economy() queues it once tin >= its cost). Capping the
      // reserve at (cost - tin) created a self-consistent equilibrium at
      // tin=(unit+cost)/2 — always below cost — so production could never
      // save up for its own reserve and the economy froze at the first
      // unaffordable building.
      const target = this.nextEcoTarget(g.buildings.filter((b) => b.fac === f && !b.dead && b.isAlive()));
      const reserve = target ? target.cost : 0;
      if (!id || (g.res(f).tin || 0) < (UNITS[id].cost.tin || 0) + reserve) continue;
      g.queueUnit(b, id);
    }
  }
  pickCheapInfantry() {
    const g = this.g, f = this.fac;
    const list = Object.values(UNITS)
      .filter((u) => u.fac === f && u.class === "infantry" && !u.needsTier)
      .sort((a, b) => (a.cost.tin || 0) - (b.cost.tin || 0));
    for (const u of list) if (g.unitAvailable(f, u.id) && u.id !== (f === "japan" ? "j_eng" : "c_eng")) return u.id;
    return list[0] && g.unitAvailable(f, list[0].id) ? list[0].id : null;
  }

  // ---------- offense ----------
  // CONTINUOUS pressure: the AI never has to "wait for the wave threshold" —
  // every idle ground unit in its own half keeps marching toward the enemy
  // depot, so units never sit around the factory "doing nothing". Only real
  // garrison (units inside the defensive ring) hold the line, and only when
  // the enemy is actually close; otherwise the garrison marches out too.
  offense() {
    const g = this.g, f = this.fac, e = enemyOf(f);
    const ede = g.buildings.find((b) => b.fac === e && !b.dead && b.isAlive() && b.cfg?.id === "depot");
    const dest = ede?.center() || { x: g.map.w * TILE / 2, y: g.map.h * TILE / 2 };
    const home = this.home.center();
    const dirX = dest.x - home.x, dirY = dest.y - home.y;
    const dist = Math.max(1, Math.hypot(dirX, dirY));
    // NORMALIZED perpendicular — used below for a small lateral spread.
    // (Pre-fix: px/py were raw pixels, so px*spread reached ±90,000 px and the
    // clamp snapped every order into a map corner instead of the enemy depot.)
    const nx = dirX / dist, ny = dirY / dist;
    const px = -ny, py = nx;
    const enemyNear = Math.hypot(dest.x - home.x, dest.y - home.y) < TILE * 14 ||
      g.units.some((u) => u.fac !== f && !u.dead && u.isAlive() &&
        Math.hypot(u.x - home.x, u.y - home.y) < TILE * 10);
    const mid = { x: home.x + dirX * 0.55, y: home.y + dirY * 0.55 };
    // --- planes: launch them explicitly (no grid orders — they fly straight).
    // Parked planes get an attack-move to the nearest enemy structure near the
    // front; the in-flight auto-mission keeps them hunting after that.
    for (const u of g.units) {
      if (u.fac !== f || u.dead || !u.isAlive() || !u.isAir()) continue;
      if (u.parked) {
        let best = null, bd = Infinity;
        for (const e of [...g.units, ...g.buildings]) {
          if (e === u || e.fac === f || e.dead || !e.isAlive()) continue;
          const ec = e.center ? e.center() : e;
          const dmid = (ec.x - mid.x) ** 2 + (ec.y - mid.y) ** 2;
          const d2 = (ec.x - u.x) ** 2 + (ec.y - u.y) ** 2 + dmid * 0.25;
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (best) u.launch(g); // launch() auto-aims at the nearest enemy
      } else if (!u.moveOrder && !u.target && !u.returning && (u.life || 0) < TUNE.airMissionTime) {
        // in flight but unaimed (e.g. target died en route): re-aim
        let best = null, bd = Infinity;
        const all = [...g.units, ...g.buildings];
        for (const e of all) {
          if (e === u || e.fac === f || e.dead || !e.isAlive()) continue;
          const ec = e.center ? e.center() : e;
          const d2 = (ec.x - u.x) ** 2 + (ec.y - u.y) ** 2;
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (best) {
          const ec = best.center ? best.center() : best;
          u.moveOrder = { x: ec.x, y: ec.y };
          u.attackMove = true;
          u.homing = 1;
        }
      }
    }
    const myUnits = g.units.filter((u) =>
      u.fac === f && !u.dead && u.isAlive() && !u.isStatic() && u.class() !== "gun" &&
      u.cfg?.targets?.includes("inf") !== false && !u.cfg?.engineer); // guns stay as defense
    for (const u of myUnits) {
      const dHome = Math.hypot(u.x - home.x, u.y - home.y);
      // garrison: only if the enemy is genuinely close, AND the unit is
      // uncommanded AND deep in the defensive ring.
      const garrisonHold = enemyNear && dHome < TILE * 7 &&
        (!u.target || !u.target.isAlive()) && (!u.path || !u.path.length) && !u.moveOrder;
      if (garrisonHold) continue;
      // already commanded with a live order — respect it
      if ((u.path && u.path.length) || u.moveOrder || u.target?.isAlive?.()) continue;
      if (g.time < (u.spawnTimer || 0) + 1.2) continue; // give it a sec at the door
      // stagger + spread: forward wave marches toward the enemy depot; anything
      // near the midpoint gets pushed out toward the front so it meets enemies.
      const spread = (Math.random() - 0.5) * TILE * 6;
      const useFront = dHome < TILE * 3 || Math.hypot(u.x - mid.x, u.y - mid.y) < TILE * 4;
      const base = useFront ? mid : dest;
      const tx = Math.max(TILE * 2, Math.min(g.map.w * TILE - TILE * 2, base.x + px * spread));
      const ty = Math.max(TILE * 2, Math.min(g.map.h * TILE - TILE * 2, base.y + py * spread));
      u.fx = Math.floor(tx / TILE); u.fy = Math.floor(ty / TILE);
      u.moveOrder = { x: tx, y: ty };
      u.attackMove = true; // engage anything on the route
      this.pushed = (this.pushed || 0) + 1;
    }
  }
}
