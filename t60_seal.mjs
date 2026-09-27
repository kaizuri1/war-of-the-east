// t60_seal.mjs — "AI locked in the corner / units can't move" regression.
//
// Root cause: ground units emerge from the depot's SOUTH edge tile. findPath()
// (8-dir, no corner-cut) can only leave that spawn pocket through tiles that
// stay free; when AI economy builds a building on the pocket's sole exit,
// every new unit gets findPath() === null and the whole army stacks at the
// door. The fix lives in ai.js sealedCheck() (placement guard) + entities.js
// pathFail counter (stuck-unit rescue). This test exercises BOTH against the
// real Game/AI stack across seeds.
import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { AI } from "./game/js/ai.js";
import { Unit } from "./game/js/entities.js";
import { TILE } from "./game/js/config.js";

globalThis.window = { addEventListener: () => {}, innerWidth: 1280, innerHeight: 720 };
globalThis.document = { getElementById: () => null, addEventListener: () => {} };

let fails = 0;
const err = (m) => { console.log("SEAL:", m, "FAIL"); fails++; };
const ok = (m) => console.log("SEAL:", m, "PASS");

function spawnTile(g) {
  // mirror of engine onUnitComplete spawn: b.y + h*TILE/2 + 8 south of depot
  const b = g.buildings.find((b) => b.fac === "japan" && b.cfg?.id === "depot");
  if (!b) return null;
  const x = Math.floor((b.x + (b.w * TILE) / 2 - 0.0001) / TILE);
  const y = Math.floor((b.y + (b.h * TILE) / 2 + 8) / TILE);
  // spawn pixels are +8 south of the depot's bottom edge → floor lands one
  // tile south of the depot footprint
  return { x, y };
}

// findPath from the spawn tile toward the map far corner, the same way a unit
// following the AI march order would compute it
function spawnPathable(g) {
  const s = spawnTile(g);
  if (!s) return null;
  const probe = new Unit({ class: "tank", speed: 60, hp: 10, rof: 1, fuel: 10 }, "japan",
    (s.x + 0.5) * TILE, (s.y + 0.5) * TILE);
  return probe.findPath(
    Math.floor((g.map.w * TILE - TILE * 3) / TILE),
    Math.floor((g.map.h * TILE - TILE * 3) / TILE),
    g.map, g.occupied);
}

// ---- Part A: sealedCheck unit test with a synthetic pocket ----
// 45x45 open map, fake depot 2x2 at (20,20); spawn tile = (21,22) (south of depot).
// Pocket cells (x 20..22, y 22..23) are open; a rock ring surrounds them EXCEPT a
// 1-wide vertical tunnel at x=22: wall (22,23) and (22,24) are both OPEN, so the
// pocket escapes to the open field via that single cell (22,23).
// Contract: sealedCheck === true → build ALLOWED, false → REJECTED.
// An exit tile (the tunnel wall (22,23)) must be rejected; a redundant interior
// tile and a distant field tile must be allowed.
{
  const W = 45, H = 45;
  const rocks = new Set();
  // ring around pocket (rows 21..24, cols 19..23) — carve the tunnel at x=22
  const ring = [];
  for (let x = 19; x <= 23; x++) ring.push([x, 21]);          // north wall
  for (let y = 21; y <= 24; y++) ring.push([19, y]);          // west wall
  for (let y = 21; y <= 24; y++) ring.push([23, y]);          // east wall
  for (let x = 19; x <= 23; x++) ring.push([x, 24]);          // south wall
  for (const [x, y] of ring) {
    if (y === 23 && x === 22) continue;                       // tunnel wall (22,23) OPEN
    if (y === 24 && x === 22) continue;                       // tunnel mouth (22,24) OPEN
    rocks.add(x + "," + y);
  }
  // tunnel at x=22 — the ONLY vertical shot from pocket interior to open field
  const map = {
    w: W, h: H,
    solid: (x, y) => (x < 0 || y < 0 || x >= W || y >= H) || rocks.has(x + "," + y),
    buildable: (x, y) => map.solid(x, y) === false && true,
    oreSpots: new Set(), oilSpots: new Set(),
  };
  const fakeDepot = { tx: 20, ty: 20, w: 2, h: 2 };
  const g = { map, fac: "japan", occupied: new Set(["20,20","21,20","20,21","21,21"]) };
  g.occupied = new Set(["20,20", "21,20", "20,21", "21,21"]); // depot tiles
  const ai = new AI({}, "japan");
  ai.g = g;
  ai.home = fakeDepot;
  const gapTile = { x: 22, y: 23 };
  const interior = { x: 21, y: 22 }; // redundant open tile inside the pocket
  const gapRejected = ai.sealedCheck(gapTile.x, gapTile.y) === false;   // false = build rejected
  const interiorAllowed = ai.sealedCheck(interior.x, interior.y) === true; // true = build allowed
  const farAllowed = ai.sealedCheck(0, 23) === true;                    // far away: allowed
  if (gapRejected) ok("Part A: exit-gap tile rejected by sealedCheck");
  else err(`Part A: exit gap (${gapTile.x},${gapTile.y}) not rejected`);
  if (interiorAllowed) ok("Part A: interior spawn tile allowed");
  else err(`Part A: interior tile (${interior.x},${interior.y}) wrongly rejected`);
  if (farAllowed) ok("Part A: distant tile allowed (no over-blocking)");
  else err("Part A: distant tile wrongly rejected");
}

// ---- Part B: multi-seed real-AI run: spawn pocket stays pathable ----
const SEEDS = [1, 3, 5, 7, 11, 13, 17, 19];
for (const seed of SEEDS) {
  const map = generateMap({ w: 45, h: 45, seed });
  const g = new Game(map, { playerFac: "china", aiFac: "japan", diff: "easy", seed });
  g.setupBases();
  for (const f of ["china", "japan"])
    if (!g.fac[f]) g.fac[f] = { res: { tin: 4000, steel: 500, fuel: 500 }, upgrades: new Set(), power: { gen: 200, draw: 0, ok: true } };
  const ai = new AI(g, "japan");
  const dt = 1 / 30;
  let pathBad = 0, samples = 0, maxBad = 0;
  for (let t = 0; t < 240; t += dt) {
    g.update(dt);
    ai.tick(dt);
    if (g.winner) break;
    if (Math.floor(t * 10) % 5 === 0) { // every ~0.5s
      samples++;
      const p = spawnPathable(g);
      if (p === null && g.occupied && g.units.filter(u=>u.fac==="japan"&&!u.dead).length > 0) {
        // only a problem once units exist AND no army-sized escape exists
        pathBad++;
      } else if (p === null && t > 60) {
        pathBad++;
      }
    }
    const ja = g.units.filter((u) => u.fac === "japan" && !u.dead && !u.isStatic()).length;
    if (ja > maxBad) maxBad = ja;
  }
  const jB = g.buildings.filter((b) => b.fac === "japan" && !b.dead).length;
  const jArmy = g.units.filter((u) => u.fac === "japan" && !u.dead).length;
  if (jB < 5) err(`seed ${seed}: AI economy stalled (buildings ${jB}) — guard over-blocking?`);
  if (pathBad > samples * 0.25)
    err(`seed ${seed}: spawn pocket sealed in ${pathBad}/${samples} samples (army=${jArmy})`);
  else
    ok(`seed ${seed}: spawn reachable ${samples - pathBad}/${samples}, japan buildings=${jB}, army=${jArmy}`);
}

// ---- Part C: stuck-unit rescue — an order with no path drops after ~6s ----
{
  const map = generateMap({ w: 30, h: 30, seed: 99 });
  const g = new Game(map, { playerFac: "china", aiFac: "japan", diff: "easy", seed: 99 });
  g.setupBases();
  for (const f of ["china", "japan"])
    if (!g.fac[f]) g.fac[f] = { res: { tin: 400, steel: 0, fuel: 0 }, upgrades: new Set(), power: { gen: 200, draw: 0, ok: true } };
  // box a unit in a 3x3 pocket and order it to a far tile → never reachable
  const cx = 5, cy = 5;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if (!(dx === 0 && dy === 0)) g.map.rocks.add((cx + dx) + "," + (cy + dy));
  g.rebuildOccupied();
  const u = new Unit({ class: "infantry", speed: 50, hp: 10, rof: 1, fuel: 10 }, "japan",
    (cx + 0.5) * TILE, (cy + 0.5) * TILE);
  g.units.push(u);
  u.fx = 25; u.fy = 25;
  u.moveOrder = { x: 25 * TILE, y: 25 * TILE };
  u.attackMove = true;
  u.path = [];
  u.repath = 0;
  u.spawnTimer = 0;
  let orderHeld = 0, cleared = false;
  for (let t = 0; t < 12; t += 1 / 30) {
    u.update(1 / 30, g);
    if (u.fx === null && u.moveOrder === null) { cleared = true; break; }
    orderHeld = t;
  }
  if (cleared) ok(`Part C: stuck order dropped after ${orderHeld.toFixed(1)}s (was re-trying forever)`);
  else err(`Part C: unreachable order still held at t=${orderHeld.toFixed(1)}s — no rescue`);
}

console.log(fails ? `RESULT: ${fails} FAIL` : "RESULT: ALL PASS");
process.exit(fails ? 1 : 0);
