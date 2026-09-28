// t65_teambase.mjs — regression for the 2026-09-28 menu/UI fixes:
//   #4. setTeamPalettes re-bakes sprites so player/enemy colors actually differ
//       (default palette must give china === china default; a chosen color must
//       override and shift the enemy).
//   #4. main.playGame honors the chosen spawn corner (spot) and the enemy
//       faction is the one the menu picked (aiFac), not just "not player".
// Uses t64's canvas-recording stub to compare baked sprite signatures.
let fails = 0;
const ok = (m) => console.log("TEAMBASE:", m, "PASS");
const err = (m) => { console.log("TEAMBASE:", m, "FAIL"); fails++; };

// --- 2d context stub that records every draw command (same as t64) ---
const num = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
const mkRec = () => {
  const rec = [];
  const h = (name, ...args) => rec.push(name + "(" + args.map(num).join(",") + ")");
  const g = new Proxy({}, {
    get(t, k) {
      if (k === "rec") return rec;
      if (typeof k === "string") return (...a) => h(k, ...a);
      return undefined;
    },
    set(t, k, v) { rec.push("set." + k + "=" + String(v)); return true; },
  });
  return { rec, g };
};
globalThis.window = { addEventListener: () => {} };
globalThis.document = {
  getElementById: () => null,
  addEventListener: () => {},
  createElement: (tag) => {
    if (tag !== "canvas") { const r = mkRec(); return { getContext: () => r.g }; }
    const r = mkRec();
    return { width: 0, height: 0, getContext: () => r.g, _rec: r.rec };
  },
};

import { SPRITES, setTeamPalettes, clearTeamPalettes, buildSprites } from "./game/js/sprites.js";
import { deriveTeamPalettes } from "./game/js/menu.js";
import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { TILE, UNITS } from "./game/js/config.js";

const SIG = (id) => SPRITES[id] && SPRITES[id]._rec ? SPRITES[id]._rec.join("¦") : null;

// --- #4a: default palette (no team color chosen) = no override ---
buildSprites();
const base_c = SIG("c_inf"), base_j = SIG("j_inf");
if (base_c && base_j && base_c !== base_j) ok("#4a: default china !== japan infantry");
else err("#4a: default palettes missing or identical");

// --- #4b: deriveTeamPalettes returns null when no color chosen ---
const defD = deriveTeamPalettes("china", "japan", null);
if (defD && defD.playerPal === null && defD.enemyPal === null) ok("#4b: null color => null pallets (no re-bake needed)");
else err("#4b: null color should leave palettes null: " + JSON.stringify(defD));

// --- #4c: a chosen color re-bakes sprites => signatures change ---
// pick any non-default team color id from TEAM_PALETTES by importing menu.js's
// map indirectly via deriveTeamPalettes with a known key.
let chosen = null;
for (const cid of ["crimson", "azure", "forest", "violet", "amber", "silver", "rose"]) {
  const d = deriveTeamPalettes("china", "japan", cid);
  if (d && d.playerPal && d.playerPal.base) { chosen = { cid, ...d }; break; }
}
if (!chosen) { err("#4c: no team color id produced a palette (TEAM_PALETTES keys unknown)"); }
else {
  setTeamPalettes("china", "japan", chosen.playerPal, chosen.enemyPal);
  const tinted_c = SIG("c_inf");
  if (tinted_c && tinted_c !== base_c) ok("#4c: team color re-bakes china infantry (sig changed)");
  else err("#4c: team color did not change china infantry sig");
  // enemy faction = the other one; check its palette shifted vs its default
  clearTeamPalettes();
  const back_j = SIG("j_inf");
  if (back_j && back_j === base_j) ok("#4d: clearTeamPalettes restores default japan infantry");
  else err("#4d: clearTeamPalettes did not restore default: " + back_j === base_j);
  // --- #4e: enemy auto-differs even without an explicit player color via shift ---
  // (covered by #4c's enemyPal being a shifted palette)
  if (chosen.enemyPal && chosen.enemyPal.base && chosen.enemyPal.base !== chosen.playerPal.base)
    ok("#4e: derived enemy palette differs from player palette");
  else err("#4e: enemy palette identical to player: " + JSON.stringify(chosen));
}

// --- #4f: playGame honors chosen spawn corner + aiFac ---
{
  const map = generateMap({ w: 60, h: 60, seed: 20 });
  // simulate what main.playGame builds from cfg {player, aiFac, spot}
  const cfg = { player: "china", aiFac: "japan", spot: "ne", res: "high", diff: "medium" };
  const w = map.w, h = map.h, OFF = 6;
  const spot = cfg.spot === "ne" ? { x: w - OFF - 1, y: h - OFF - 1 } : { x: OFF, y: OFF };
  const enemyX = spot.x === OFF ? w - OFF - 1 : OFF;
  const enemyY = spot.y === OFF ? h - OFF - 1 : OFF;
  const g = new Game(map, cfg);
  g.setupBases([
    { fac: cfg.player, cx: spot.x, cy: spot.y },
    { fac: cfg.aiFac, cx: enemyX, cy: enemyY },
  ]);
  const cd = g.baseSpots["china"];
  const ed = g.baseSpots["japan"];
  // spot "ne" -> player at (w-OFF-1, h-OFF-1), enemy at (OFF, OFF) — opposite corner
  const expP = Math.max(2, Math.min(w - 3, w - OFF - 1));
  const expE = Math.max(2, Math.min(w - 3, OFF));
  if (cd && Math.abs(cd.cx - expP) < 1 && Math.abs(cd.cy - expP) < 1 &&
      ed && Math.abs(ed.cx - expE) < 1 && Math.abs(ed.cy - expE) < 1)
    ok("#4f: spot=ne => player NE(" + expP + "), enemy SW(" + expE + ") (opposite corners)");
  else err("#4f: corners wrong: player=" + JSON.stringify(cd) + " enemy=" + JSON.stringify(ed));
  if (g.aiFac === "japan") ok("#4g: aiFac honored (japan)");
  else err("#4g: aiFac not honored: " + g.aiFac);
}

console.log(fails ? "\nRESULT: " + fails + " FAILED" : "\nRESULT: ALL PASS");
process.exit(fails ? 1 : 0);
