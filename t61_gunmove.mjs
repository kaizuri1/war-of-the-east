import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { TILE } from "./game/js/config.js";
import { makeUnit } from "./game/js/entities.js";

let fails = 0;
for (const [id, fac] of [["c_at1","china"],["j_aa","japan"]]) {
  const map = generateMap({ w: 45, h: 45, seed: 7 });
  const g = new Game(map, { playerFac: "china", aiFac: "japan", diff: "medium", seed: 7 });
  g.setupBases();
  const u = makeUnit(id, fac, 10 * TILE, 10 * TILE, g);
  u.spawnTimer = 0;
  // config must no longer mark the gun static
  if (u.isStatic()) { console.log(`${id}: isStatic()=true FAIL (speed ${u.cfg.speed})`); fails++; continue; }
  u.fx = 16; u.fy = 10; u.moveOrder = { x: 16 * TILE, y: 10 * TILE };
  const sx = u.x;
  let moved = 0;
  for (let i = 0; i < 600; i++) { g.update(1/60); moved = Math.hypot(u.x - sx, u.y - 10*TILE); if (moved > 6*TILE) break; }
  if (moved > 6 * TILE) console.log(`${id}: gun moves on order      PASS (moved ${Math.round(moved)}px)`);
  else { console.log(`${id}: gun moves on order      FAIL (moved ${Math.round(moved)}px)`); fails++; }
}
process.exit(fails ? 1 : 0);
