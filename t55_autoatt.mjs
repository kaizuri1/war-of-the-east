import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { TILE } from "./game/js/config.js";
import { makeUnit, makeBuilding } from "./game/js/entities.js";

const map = generateMap({ w: 45, h: 45, seed: 7 });
const g = new Game(map, { playerFac: "china", aiFac: "japan", diff: "medium", seed: 7 });
g.setupBases();
for (const f of ["china", "japan"]) if (!g.fac[f]) g.fac[f] = { res: { tin: 9999, oil: 0 }, up: {}, power: { gen: 20, draw: 0, ok: true } };
const dt = 1 / 60;
let fails = 0;

// --- A: idle china unit vs enemy in range -> auto-lock first tick ---
const a = makeUnit("c_inf", "china", 10 * TILE, 10 * TILE, g);
a.spawnTimer = 0;
const b = makeUnit("j_inf", "japan", 13 * TILE, 10 * TILE, g); // 96px < 160px range
b.spawnTimer = 0;
g.update(dt);
if (a.target === b) console.log("A: idle auto-acquire  PASS");
else { console.log("A: idle auto-acquire  FAIL (target=" + (a.target && a.target.cfg.id) + ")"); fails++; }
let shots = 0;
for (let i = 0; i < 180; i++) { const n0 = g.projectiles.length; g.update(dt); shots += g.projectiles.length - n0; }
if (shots > 0) console.log("A: fires within 3s     PASS (shots=" + shots + ")");
else { console.log("A: fires within 3s     FAIL"); fails++; }

// --- B: unit following a walk order engages enemy in its path ---
const c1 = makeUnit("c_inf", "china", 5 * TILE, 20 * TILE, g);
c1.spawnTimer = 0;
const c2 = makeUnit("j_inf", "japan", 8 * TILE, 20 * TILE, g);
c2.spawnTimer = 0;
c1.fx = 15; c1.fy = 20;
c1.moveOrder = { x: 15 * TILE, y: 20 * TILE };
let tAcq = -1;
for (let i = 0; i < 180 && !c1.target; i++) { g.update(dt); if (c1.target) tAcq = i / 60; }
if (c1.target) {
  console.log("B: walking auto-acquire PASS (target=" + c1.target.cfg.id + ", t=" + tAcq.toFixed(1) + "s)");
  const hp0 = c2.hp;
  for (let i = 0; i < 300; i++) g.update(dt);
  if (c2.hp < hp0 || !c2.isAlive()) console.log("B: engaged & damaged PASS (hp " + Math.round(hp0) + "->" + Math.round(c2.hp) + ", alive=" + c2.isAlive() + ")");
  else { console.log("B: engaged but no damage FAIL (hp " + Math.round(c2.hp) + ")"); fails++; }
} else { console.log("B: walking auto-acquire FAIL (no target after 3s)"); fails++; }

// --- C: enemy BUILDING in range auto-engaged ---
const d1 = makeUnit("c_inf", "china", 30 * TILE, 30 * TILE, g);
d1.spawnTimer = 0;
const bld = makeBuilding("bunker", "japan", 33, 30);
console.log("(debug) bunker building cfg exists:", !!bld);
g.buildings.push(bld);
g.update(dt);
if (d1.target === bld) console.log("C: building auto-engagement PASS");
else { console.log("C: building auto-engagement FAIL (target=" + (d1.target && d1.target.cfg.id) + ")"); fails++; }
for (let i = 0; i < 180; i++) g.update(dt);
if (bld.hp < bld.maxHp) console.log("C: building takes damage PASS (hp " + Math.round(bld.hp) + "/" + bld.maxHp + ")");
else { console.log("C: building takes damage FAIL"); fails++; }

// --- D: free walk with no enemy around still works ---
const e1 = makeUnit("c_inf", "china", 20 * TILE, 35 * TILE, g);
e1.spawnTimer = 0;
const sx = e1.x;
e1.fx = 26; e1.fy = 35; e1.moveOrder = { x: 26 * TILE, y: 35 * TILE };
for (let i = 0; i < 120; i++) g.update(dt);
const moved = Math.abs(e1.x - sx);
if (moved > 40) console.log("D: free walk still works PASS (moved " + Math.round(moved) + "px)");
else { console.log("D: free walk FAIL (moved " + Math.round(moved) + "px)"); fails++; }

console.log(fails ? `RESULT: ${fails} FAIL` : "RESULT: ALL PASS");
process.exit(fails ? 1 : 0);
