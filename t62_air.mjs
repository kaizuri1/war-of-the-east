import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { TILE } from "./game/js/config.js";
import { makeUnit, nearestAirfield } from "./game/js/entities.js";

let fails = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) fails++;
};

// ---- setup: map + game, one fully-built airfield for china ----
const map = generateMap({ w: 45, h: 45, seed: 7 });
const g = new Game(map, {
  playerFac: "china", aiFac: "japan", diff: "medium", seed: 7,
});
g.setupBases();

let af = null;
// tiles adjacent to the base are occupied, so place the airfield on an open field
g.fac.china.res.tin += 1500; // cover the 900 airfield cost
for (const [tx, ty] of [[6, 0], [0, 6], [15, 8], [6, 12], [12, 0]]) {
  if (g.canBuild("airf", "china", tx, ty)) {
    af = g.startBuild("airf", "china", tx, ty);
    if (af) af.buildT = af.built; // fully constructed
    break;
  }
}
check("airfield placed", !!af, af ? `(${af.tx},${af.ty})` : "no free spot");
if (!af) process.exit(1);

// airfield spawn point (where the engine spawns production planes)
const px = af.x + 0;
const py = af.y + (af.h * TILE) / 2 + 8;

// ---- 1. plane spawns PARKED (visible on the field, not auto-attacking) ----
const u = makeUnit("c_i16", "china", px, py, g);
u.spawnTimer = 0;
check("plane parked at spawn", u.parked === true, "parked=" + String(u.parked));
check(
  "plane positioned on airfield",
  Math.hypot(u.x - af.x, u.y - af.y) < TILE * 2,
  `dist=${Math.round(Math.hypot(u.x - af.x, u.y - af.y))}px`
);

// parked plane stays parked ~3s, then auto-launches
const sx = u.x, sy = u.y;
const t0 = g.time;
let lastParked = -1;
for (let i = 0; i < 240; i++) {
  g.update(1 / 60);
  if (u.parked) lastParked = g.time - t0;
}
check(
  "stays parked ~3s then auto-launches",
  u.parked === false && lastParked > 2.5 && lastParked < 3.5,
  `parked until ${lastParked.toFixed(2)}s`
);
check(
  "plane moved after auto-launch",
  Math.hypot(u.x - sx, u.y - sy) > TILE,
  `moved ${Math.round(Math.hypot(u.x - sx, u.y - sy))}px in ~1s flight`
);

// ---- 2. a NEW parked plane with a player order takes off IMMEDIATELY ----
const u2 = makeUnit("c_p40", "china", px, py, g);
u2.spawnTimer = 0;
const enemy = g.buildings.find((b) => b.fac === "japan" && !b.dead);
const tw = enemy || g.buildings[0];
u2.moveOrder = { x: tw.x, y: tw.y };
g.update(1 / 60);
check("order clears parked instantly", u2.parked === false, "1 frame after order");

// ---- 3. flight window ends → returns home and parks again (reusable) ----
const u3 = makeUnit("c_p40", "china", px, py, g);
u3.spawnTimer = 0;
u3.parked = false; // simulate already launched
u3.life = 50;      // past the 45s window
g.update(1 / 60);
g.update(1 / 60);
check(
  "mission time triggers return/home",
  u3.returning === 1 || u3.parked === true,
  `returning=${String(u3.returning)} parked=${String(u3.parked)}`
);
for (let i = 0; i < 600 && !u3.parked; i++) g.update(1 / 60);
check(
  "plane parks at home airfield",
  u3.parked === true,
  `dist=${Math.round(Math.hypot(u3.x - af.x, u3.y - af.y))}px`
);

// ---- 4. nearestAirfield finds the right building ----
check(
  "nearestAirfield works",
  nearestAirfield(g, { fac: "china", x: px, y: py }) === af
);

console.log(fails ? `\n${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
