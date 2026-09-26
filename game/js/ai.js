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
    this.production();
    this.offense();
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
  placeNear(id, anchor, maxRange = 6) {
    const g = this.g, cfg = BUILDINGS[id];
    if (!cfg || !g.canAfford(this.fac, cfg.cost)) return false;
    const cx = anchor.tx + (anchor.w >> 1), cy = anchor.ty + (anchor.h >> 1);
    for (let range = 1; range <= maxRange; range++)
      for (let dy = -range; dy <= range; dy++)
        for (let dx = -range; dx <= range; dx++) {
          const x = cx + dx, y = cy + dy;
          if (g.canBuild(id, this.fac, x, y) && g.startBuild(id, this.fac, x, y)) return true;
        }
    return false;
  }
  economy() {
    const g = this.g, f = this.fac;
    const mine = this.myBuildings();
    if (!mine.length) return;
    const depot = this.home;
    const count = (id) => mine.filter((b) => b.cfg?.id === id).length;
    const power = g.fac[f].power;
    const tin = g.res(f).tin;

    // 1. income expansion: ore / fuel (scan from depot outward, any distance)
    if (this.placeNear("ore", depot, 24)) return true;
    if (this.placeNear("fuel", depot, 24)) return true;
    // 2. power while underpowered
    if (power && !power.ok && this.placeNear("power", depot)) return true;
    // 3. steel mill (needed for armor production economy)
    if (count("steel") === 0 && tin > 800 && this.placeNear("steel", depot)) return true;
    // 4. production capacity (barracks first, then armor, air, guns)
    for (const [id, n] of [["barracks", 1], ["tankf", 1], ["barracks", 2], ["airf", 1], ["arsenal", 1], ["tankf", 2]])
      if (count(id) < n && tin > BUILDINGS[id].cost.tin * 2 && this.placeNear(id, depot)) return true;
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
  pickUnit(kind) {
    const g = this.g, f = this.fac, tier = g.tierNum(f);
    for (const id of Object.keys(UNITS)) {
      const u = UNITS[id];
      if (u.fac !== f || u.class !== kind) continue;
      if (u.needsTier && tier < u.needsTier) continue;
      if (f === "japan" && id === "j_205" && g.fac.japan.needsLock205) continue;
      if (g.unitAvailable(f, id)) return id; // affordable
    }
    return null;
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
      if (id) g.queueUnit(b, id);
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
  offense() {
    const g = this.g, f = this.fac, e = enemyOf(f);
    const ede = g.buildings.find((b) => b.fac === e && !b.dead && b.isAlive() && b.cfg?.id === "depot");
    const eb = g.buildings.find((b) => b.fac === e && !b.dead && b.isAlive() && b.cfg?.id === "depot");
    const dest = (ede || eb)?.center() || { x: g.map.w * TILE / 2, y: g.map.h * TILE / 2 };

    // ---- continuous pressure: any idle unit standing in our own spawn area
    //    is sent forward (staggered), instead of sitting around the factory
    //    "doing nothing" until a full wave has assembled
    const dirX = (dest.x - this.home.center().x), dirY = (dest.y - this.home.center().y);
    const home = this.home.center();
    for (const u of g.units) {
      if (u.fac !== f || u.dead || !u.isAlive() || u.isStatic() || u.cfg?.engineer) continue;
      if (u.attackMove || (u.path && u.path.length) || u.moveOrder) continue;   // already commanded
      if (g.time < (u.spawnTimer || 0) + 1.2) continue;                        // give it a sec at the door
      if (Math.hypot(u.x - home.x, u.y - home.y) > TILE * 9) continue;         // already pushed out
      const tx = Math.max(TILE * 2, Math.min(g.map.w * TILE - TILE * 2, home.x + dirX * 0.5 + (Math.random() - 0.5) * TILE * 6));
      const ty = Math.max(TILE * 2, Math.min(g.map.h * TILE - TILE * 2, home.y + dirY * 0.5 + (Math.random() - 0.5) * TILE * 6));
      u.fx = Math.floor(tx / TILE); u.fy = Math.floor(ty / TILE);
      u.moveOrder = { x: tx, y: ty };
      u.attackMove = true;
    }

    // hold back a garrison if the enemy is closing on our depot
    const hc = home;
    const garrison = g.units.filter((u) => u.fac === f && !u.dead && u.isAlive() &&
      Math.hypot(u.x - hc.x, u.y - hc.y) < TILE * 7);
    const army = g.units.filter((u) =>
      u.fac === f && !u.dead && u.isAlive() &&
      (!u.target || !u.target.isAlive()) && (!u.path || !u.path.length) && !u.moveOrder &&
      Math.hypot(u.x - dest.x, u.y - dest.y) > TILE * 3);
    const strength = army.reduce((s, u) => s + (u.cfg?.hp || 10), 0);
    if (g.time >= this.nextWave && strength >= (garrison.length ? 420 : 260) * (1.25 - 0.25 * this.diff.strength)) {
      // cap the wave — big blobs clog the map and the targeting scan
      const wave = army.sort((a, b) => (b.cfg?.hp || 0) - (a.cfg?.hp || 0)).slice(0, 24);
      for (const u of wave) {
        u.fx = Math.floor(dest.x / TILE);
        u.fy = Math.floor(dest.y / TILE);
        u.moveOrder = { x: dest.x, y: dest.y };
        u.attackMove = true;
      }
      g.log(f === "japan" ? "日本攻勢 — Japan launches an attack!" : "中国反攻 — China counterattacks!", "info");
      this.nextWave = g.time + this.waveGap;
    }
  }
}
