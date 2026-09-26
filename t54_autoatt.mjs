import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { TILE, UNITS } from "./game/js/config.js";
import { makeUnit } from "./game/js/entities.js";

const map = generateMap({ w: 45, h: 45, seed: 7 });
const g = new Game(map, { playerFac: "china", aiFac: "japan", diff: "medium", seed: 7 });
g.setupBases();
for (const f of ["china", "japan"]) if (!g.fac[f]) g.fac[f] = { res: { tin: 9999, oil: 0 }, up: {}, power: { gen: 20, draw: 0, ok: true } };
const dt = 1 / 60;

// --- A: idle unit, enemy within range -> should auto-acquire & fire ---
const a = makeUnit("c_bat", "china", 10 * TILE, 10 * TILE, g);
a.spawnTimer = 0;
const b = makeUnit("j_inf", "japan", (10 + 3) * TILE, 10 * TILE, g); // 3 tiles = 96px < 5-tile range
b.spawnTimer = 0;
g.update(dt);
console.log("A: idle acquire:", a.target === b ? "PASS (locked)" : `FAIL target=${a.target && a.target.cfg.id}`);
// fire check
let fired = g.projectiles.length;
if (a.target === b) { g.update(dt); }
console.log("A: projectile spawned:", fired > 0 ? "PASS" : (a.cooldown <= 0 && a.target === b ? "FAIL no shot" : "wait next tick (cooldown)"));

// --- B: walking unit (move order) passes enemy in path -> should auto-fire ---
const c1 = makeUnit("c_bat", "china", 5 * TILE, 20 * TILE, g);
c1.spawnTimer = 0;
const c2 = makeUnit("j_inf", "japan", 8 * TILE, 20 * TILE, g); // in the path, 3 tiles away
c2.spawnTimer = 0;
const far = makeUnit("j_scout", "japan", 15 * TILE, 20 * TILE, g);
far.spawnTimer = 0;
c1.fx = 15; c1.fy = 20; // order: walk east
c1.moveOrder = { x: 15 * TILE, y: 20 * TILE };
for (let i = 0; i < 60 * 3 && !c1.target; i++) g.update(dt);
console.log("B: walking auto-acquire:", c1.target ? `${c1.target === c2 ? "PASS (locked mid-walk)" : "acquired " + c1.target.cfg.id}` : "FAIL still walking, no target");
if (c1.target === c2) {
  // should eventually shoot or approach
  let shots = 0;
  for (let i = 0; i < 60 * 6; i++) {
    const before = g.projectiles.length;
    g.update(dt);
    shots += Math.max(0, g.projectiles.length - before + (g.projectiles.filter(p => p.dead).length));
  }
  console.log("B: engaged (approaching/firing), alive c2:", c2.isAlive(), "c2 hp:", Math.round(c2.hp));
}

// --- C: enemy BUILDING in range -> auto-engage ---
const { makeBuilding } = await import("./game/js/entities.js");
const d1 = makeUnit("c_bat", "china", 30 * TILE, 30 * TILE, g);
d1.spawnTimer = 0;
const bld = makeBuilding("j_barracks", "japan", 33, 30);
bld.built = 0; // fully built
g.buildings.push(bld);
g.update(dt);
console.log("C: building auto-engagement:", d1.target === bld ? "PASS (locked building)" : "FAIL — buildings not auto-targeted");
