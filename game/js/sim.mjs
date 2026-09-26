import { Game } from "./engine.js";
import { generateMap } from "./rand.js";
import { TILE } from "./config.js";
import { AI } from "./ai.js";

const dt = 1 / 60;
const map = generateMap({ w: 45, h: 45, seed: 20260924 });
const g = new Game(map, { player: "china", diff: "medium", res: "medium", resTier: { label: "MEDIUM", tin: 2200, steel: 250, fuel: 250 } });
g.setupBases();
const ai = new AI(g, g.aiFac);

// --- Test 1: how long does an AI building actually take to finish? ---
console.log("=== CONSTRUCTION TIMING ===");
let sawFirst = false;
for (let i = 0; i < 60 * 300; i++) {
  g.update(dt); ai.tick(dt);
  if (g.winner) { console.log(`game over at ${g.time.toFixed(0)}s winner=${g.winner}`); break; }
  const und = g.buildings.find(b => b.fac === "japan" && b.underConstruction > 0);
  if (!sawFirst && g.time > 2) { sawFirst = true; console.log(`t=2s japan buildings: ` + g.buildings.filter(b=>b.fac==="japan").map(b=>b.cfg.id).join(",")); }
  if (!und) continue;
  if (Math.floor(g.time / 10) !== Math.floor((g.time - dt) / 10))
    console.log(`t=${g.time.toFixed(0)}s  UNDER CONSTRUCTION: ${und.cfg.id} remaining=${und.underConstruction.toFixed(1)}s (total ${und.built}s)`);
}
if (!g.winner)
console.log(`first japan buildings done by g.time=${g.time.toFixed(0)}s; count=${g.buildings.filter(b=>b.fac==="japan").length}`);

// --- Test 2: movement via tryMove on open ground ---
console.log("\n=== MOVEMENT (tryMove) ===");
if (!g.winner) {
  const u2 = g.units.find(u => u.fac === "china" && u.cfg.speed > 0);
  if (u2) {
    const sx = u2.x, sy = u2.y;
    const tgtTile = Math.floor(u2.x / TILE) + 15;
    const tgtY = Math.floor(u2.y / TILE);
    const p = u2.tryMove({ x: tgtTile * TILE, y: tgtY * TILE });
    console.log(`cmd move to tile ${tgtTile},${tgtY}; path=${p ? p.length + " tiles" : "NULL (no path)"}`);
    for (let i = 0; i < 60 * 12 && !g.winner; i++) { g.update(dt); ai.tick(dt); }
    const dist = Math.hypot(u2.x - sx, u2.y - sy);
    console.log(`moved ${dist.toFixed(0)}px in 12s (speed=${u2.cfg.speed} → ~${u2.cfg.speed * 12} if free); at ${Math.floor(u2.x/TILE)},${Math.floor(u2.y/TILE)} target ${tgtTile},${tgtY}`);
  } else console.log("no china units to move");
}
