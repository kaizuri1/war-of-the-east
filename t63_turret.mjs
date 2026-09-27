// t63_turret.mjs — weapon-building turret tracking regression.
//
// Root cause: watchtower/bunker turrets were drawn static (no aiming), so
// defensive fire looked like a sprite shooting at nothing. Fix: Building
// tracks b.turretAng toward this.target with a 3.5 rad/s turn rate
// (entities.js), renderer draws the rotating turret overlay (renderer.js).
// This test exercises the engine-side tracking against the real Game stack.
import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { makeUnit } from "./game/js/entities.js";
import { TILE } from "./game/js/config.js";

globalThis.window = { addEventListener: () => {}, innerWidth: 1280, innerHeight: 720 };
globalThis.document = { getElementById: () => null, addEventListener: () => {} };

let fails = 0;
const err = (m) => { console.log("TURRET:", m, "FAIL"); fails++; };
const ok = (m) => console.log("TURRET:", m, "PASS");

const map = generateMap({ w: 45, h: 45, seed: 11 });
const g = new Game(map, { playerFac: "china", aiFac: "japan", diff: "easy", seed: 11 });
g.setupBases();

// place a china watchtower at the first buildable tile away from corners
let tower = null;
outer:
for (let x = 8; x <= 36; x++)
  for (let y = 8; y <= 36; y++) {
    if (g.buildable && false) continue;
    if (g.buildingAt(x, y)) continue;
    if (g.occupied.has(x + "," + y)) continue;
    tower = g.startBuild("watch", "china", x, y);
    if (tower) break outer;
  }
if (!tower) { err("could not place a watchtower"); process.exit(1); }
tower.buildT = tower.built; // construct instantly

// helper: drop a japan infantry 3 tiles right/below the tower
const drop = () => {
  const u = makeUnit("j_inf", "japan", tower.x + TILE * 3, tower.y + TILE * 1.5, g);
  return u;
};

const frames = (s) => { for (let i = 0; i < Math.round(s * 60); i++) g.update(1 / 60); };

// 1) no target -> turretAng stays put (0)
frames(1);
if (Math.abs(tower.turretAng) < 1e-9) ok("idle: no target, angle stays 0");
else err("idle: angle drifted without target (" + tower.turretAng.toFixed(3) + ")");

// 2) target ESE -> angle rotates toward it, clamped by 3.5 rad/s
const a1 = drop();
frames(0.4); // max turn over 0.4s = 1.4 rad
const want1 = Math.atan2(a1.y - tower.y, a1.x - tower.x);
const d1 = Math.abs(want1 - tower.turretAng);
if (tower.turretAng !== 0 && d1 < 1.5) ok("tracking: rotating toward target (ang=" + tower.turretAng.toFixed(2) + ")");
else err("tracking: not rotating (ang=" + tower.turretAng.toFixed(3) + ", want=" + want1.toFixed(2) + ")");

frames(2); // enough to converge at >=3.5 rad/s
const d2 = Math.abs(want1 - tower.turretAng);
if (d2 < 0.15) ok("tracking: converges to target bearing (err=" + d2.toFixed(3) + " rad)");
else err("tracking: did not converge (err=" + d2.toFixed(3) + " rad)");

// 3) new target NW -> re-aims (kills the stale-lock symptom)
a1.dead = true; g.units = g.units.filter((u) => u !== a1);
const a2 = makeUnit("j_inf", "japan", tower.x - TILE * 2.5, tower.y - TILE * 1.5, g);
frames(0.2); // should still be aiming ESE (target just died, not re-acquired yet)
const want0 = Math.atan2(a2.y - tower.y, a2.x - tower.x);
if (Math.abs(want0 - tower.turretAng) > 0.4) ok("re-acquire: keeps old bearing until new lock");
else err("re-acquire: snapped instantly to new lock");
frames(3);
const d3 = Math.abs(want0 - tower.turretAng);
if (d3 < 0.2) ok("re-acquire: re-aims at NW target (err=" + d3.toFixed(3) + " rad)");
else err("re-acquire: wrong final bearing (err=" + d3.toFixed(3) + " rad)");

process.exit(fails ? 1 : 0);
