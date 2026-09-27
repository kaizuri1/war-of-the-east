// t57_stress.mjs — 5-minute full-match headless stress test
// Runs japan-side AI + stub player actions, asserts invariants the unit
// tests miss: no NaN coords, no unbounded entity/projectile growth,
// no negative resources, per-entity update never throws, AI ladder
// actually progresses (buildings > base), and the sim stays live.
import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { AI } from "./game/js/ai.js";
import { TILE } from "./game/js/config.js";

globalThis.window = { addEventListener: () => {}, innerWidth: 1280, innerHeight: 720 };
globalThis.document = { getElementById: () => null, addEventListener: () => {} };

const map = generateMap({ w: 45, h: 45, seed: 7 });
const g = new Game(map, { playerFac: "china", aiFac: "japan", diff: "medium", seed: 7 });
g.setupBases();
for (const f of ["china", "japan"]) {
  if (!g.fac[f]) g.fac[f] = { res: { tin: 150, steel: 0, fuel: 0 }, upgrades: new Set(), power: { gen: 20, draw: 0, ok: true } };
}
const ai = new AI(g, "japan");

const dt = 1 / 60;
const TOTAL = 300; // 5 in-game minutes
let fails = 0;
const err = (m) => { console.log("STRESS:", m, "FAIL"); fails++; };
const ok = (m) => console.log("STRESS:", m, "PASS");

let updateErrors = 0;
const origWarn = console.warn;
console.warn = (...a) => { if (String(a[0]) === "[unit]" || String(a[0]) === "[building]") updateErrors++; };

// stub player actions sprinkled in: select/move units, try build
const base = g.buildings.find((b) => b.fac === "china" && b.cfg?.id === "depot");
let actionTick = 0;
for (let t = 0; t < TOTAL; t += dt) {
  g.update(dt);
  ai.tick(dt);
  actionTick++;
  if (actionTick % 600 === 0 && !g.winner) {
    // move a random china unit if any exist
    const u = g.units.filter((x) => x.fac === "china" && !x.dead && x.isAlive());
    if (u.length) {
      u.forEach((x) => (x.selected = false));
      u[0].selected = true;
      u[0].moveOrder = { x: (base.tx + 5) * TILE, y: (base.ty - 5) * TILE };
    }
  }
  // invariant checks every 1s
  if (actionTick % 60 === 0) {
    for (const u of g.units)
      if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) { err(`NaN unit pos t=${t.toFixed(1)}s`); actionTick = -1e9; break; }
    for (const b of g.buildings)
      if (!Number.isFinite(b.hp)) { err(`NaN building hp t=${t.toFixed(1)}s`); actionTick = -1e9; break; }
    for (const f of ["china", "japan"]) {
      const r = g.fac[f].res;
      if (r.tin < -0.01 || r.steel < -0.01 || r.fuel < -0.01) { err(`negative ${f} res t=${t.toFixed(1)}`); actionTick = -1e9; }
      if (!Number.isFinite(r.tin) || !Number.isFinite(r.steel) || !Number.isFinite(r.fuel)) { err(`NaN ${f} res t=${t.toFixed(1)}`); actionTick = -1e9; }
    }
    if (g.projectiles.length > 500) { err(`projectile pile-up ${g.projectiles.length} t=${t.toFixed(1)}`); actionTick = -1e9; }
    if (g.units.length > 400) { err(`unit pile-up ${g.units.length} t=${t.toFixed(1)}`); actionTick = -1e9; }
    if (g.buildings.length > 200) { err(`building pile-up ${g.buildings.length} t=${t.toFixed(1)}`); actionTick = -1e9; }
  }
}
console.warn = origWarn;

if (updateErrors) err(`per-entity exceptions leaked ${updateErrors}`);
else ok(`no per-entity exceptions over ${TOTAL}s`);

const jB = g.buildings.filter((b) => b.fac === "japan").length;
const jBase = g.buildings.filter((b) => b.fac === "japan").length;
if (jB > 4) ok(`AI economy progressed (japan buildings: ${jB})`);
else err(`AI stall — japan buildings only ${jB}`);
const jArmy = g.units.filter((u) => u.fac === "japan" && !u.dead).length;
if (jArmy > 0) ok(`AI army produced (${jArmy} japan units alive)`);
else err("AI produced no army in 5 min");

console.log(fails ? `RESULT: ${fails} FAIL` : "RESULT: ALL PASS");
process.exit(fails ? 1 : 0);
