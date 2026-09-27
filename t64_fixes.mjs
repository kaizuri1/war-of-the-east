// t64_fixes.mjs — regression for the three 2026-09-27 fixes:
//   A. AT guns / AA guns / infantry roles render DISTINCT sprites.
//   B. AI rebuild cooldown: killing a building pauses re-queueing its type
//      for rebuildDelay seconds (breaks the infinite re-attack-and-rebuild loop).
//   C. engine.kill() notifies the AI via onBuildingKilled, and
//      setupBases / generateMap corners honor offset spawns (no corner gluing).
import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { AI } from "./game/js/ai.js";
import { makeUnit, makeBuilding } from "./game/js/entities.js";
import { TILE, UNITS, AI_DIFF } from "./game/js/config.js";

let fails = 0;
const ok = (m) => console.log("FIXES:", m, "PASS");
const err = (m) => { console.log("FIXES:", m, "FAIL"); fails++; };

// --- 2d context stub that records every draw command for signature compare ---
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

// ================= A: distinct sprites =================
{
  const { buildSprites } = await import("./game/js/sprites.js");
  const S = buildSprites();
  const SIG = (id) => (S[id] && S[id]._rec ? S[id]._rec.join("¦") : null);

  // A1: every infantry+gun id renders non-trivially
  let rendered = 0; const bad = [];
  for (const [id, u] of Object.entries(UNITS)) {
    if (u.class !== "infantry" && u.class !== "gun") continue;
    if (SIG(id) && SIG(id).length > 20) rendered++; else bad.push(id);
  }
  if (bad.length) err("A1: non-trivial render for only " + rendered + " — missing: " + bad.join(","));
  else ok("A1: all " + rendered + " infantry/gun sprites render non-trivially");

  // A2: AT vs AA guns differ
  if (SIG("c_at1") !== SIG("c_aa") && SIG("c_at1").length > 20 && SIG("c_aa").length > 20) ok("A2: AT vs AA gun sprites differ");
  else err("A2: AT and AA sprites identical or empty");
  if (SIG("c_at1") !== SIG("c_at2")) ok("A2b: AT tier-1 vs tier-2 differ");
  else err("A2b: AT tier-1 and tier-2 identical");
  if (SIG("j_aa") && SIG("j_aa") !== SIG("c_aa")) ok("A2c: japan AA differs from china AA (palette)");
  else err("A2c: j_aa missing or same as c_aa");
  if (SIG("j_at1") && SIG("j_at1") !== SIG("c_at1")) ok("A2d: japan AT differs from china AT (palette)");
  else err("A2d: j_at1 missing or same as c_at1");

  // A3: infantry roles differ
  const roles = ["c_heavy", "c_gren", "c_mort", "c_eng", "c_elite"];
  let distinct = 0;
  for (const rid of roles) if (SIG(rid) !== SIG("c_inf") && SIG(rid).length > 20) distinct++;
  if (distinct >= 5) ok("A3: all 5 infantry roles distinct from rifleman");
  else err("A3: only " + distinct + "/5 roles distinct from rifleman");
  if (SIG("c_heavy") !== SIG("c_gren")) ok("A3b: heavy vs grenadier differ");
  else err("A3b: heavy and grenadier identical");
  if (SIG("c_mort") !== SIG("c_eng")) ok("A3c: mortar vs engineer differ");
  else err("A3c: mortar and engineer identical");
  if (SIG("j_inf") && SIG("j_inf") !== SIG("c_inf")) ok("A4: china vs japan infantry differ (palette applied)");
  else err("A4: c_inf and j_inf identical — palette not applied");
}

// ================= B: AI rebuild cooldown =================
{
  const map = generateMap({ w: 45, h: 45, seed: 11 });
  const g = new Game(map, { player: "china", diff: "medium" });
  g.setupBases();
  const ai = new AI(g, "japan");
  const delay = (g.diff && g.diff.rebuildDelay) || (AI_DIFF.medium && AI_DIFF.medium.rebuildDelay);
  if (!delay) err("B1: rebuildDelay missing in AI_DIFF");
  else {
    ai.markBuildingKilled("barracks");
    if (ai._rebuildPaused("barracks") === true) ok("B1: paused right after kill (rebuildDelay=" + delay + "s)");
    else err("B1: _rebuildPaused not set after markBuildingKilled");
    if (ai._rebuildPaused("never_built") === false) ok("B2: unknown building type never paused");
    else err("B2: unknown building type marked paused");
    g.time += delay + 1;
    if (ai._rebuildPaused("barracks") === false) ok("B3: pause expires after rebuildDelay elapses");
    else err("B3: still paused after delay elapsed");
  }
}

// ================= C: kill wiring + offset spawns =================
{
  const map = generateMap({ w: 45, h: 45, seed: 12 });
  const g = new Game(map, { player: "china", diff: "medium" });
  g.setupBases();
  const ai = new AI(g, "japan");
  let fired = null;
  g.onBuildingKilled = (b) => { fired = b; if (b.fac === g.aiFac) ai.markBuildingKilled(b.cfg ? b.cfg.id : null); };

  const fac = makeBuilding("barracks", "japan", 20, 20);
  fac.hp = 1;
  g.buildings.push(fac);
  g.kill(fac, true);
  if (fired === fac) ok("C1: kill(building) fires onBuildingKilled");
  else err("C1: onBuildingKilled not fired on building kill");
  if (ai._diedAt && Number.isFinite(ai._diedAt["barracks"])) ok("C2: AI notified of own-building kill (t=" + ai._diedAt["barracks"].toFixed(1) + ")");
  else err("C2: AI _diedAt not set for barracks");
  if (ai._rebuildPaused("barracks") === true) ok("C3: AI pauses barracks rebuild after wiring");
  else err("C3: no rebuild pause after kill wiring");

  fired = null;
  const u = makeUnit("j_inf", "japan", 10 * TILE, 10 * TILE, g);
  u.hp = 1;
  g.kill(u, false);
  if (fired === null) ok("C4: unit kill does NOT fire onBuildingKilled");
  else err("C4: unit kill fired onBuildingKilled");

  // C5+C6: setupBases honors offset spots
  const map2 = generateMap({ w: 60, h: 60, seed: 13 });
  const g2 = new Game(map2, { player: "china", diff: "medium" });
  g2.setupBases([
    { fac: "china", cx: 6, cy: 6 },
    { fac: "japan", cx: 53, cy: 53 },
  ]);
  const cd = g2.buildings.find((b) => b.fac === "china" && b.cfg && b.cfg.id === "depot");
  const jd = g2.buildings.find((b) => b.fac === "japan" && b.cfg && b.cfg.id === "depot");
  // depot is 2x2: center = tx*TILE + w*TILE/2 = (tx+1)*TILE
  const px = (t) => (t + 1) * TILE;
  if (cd && Math.abs(cd.x - px(6)) < 1 && Math.abs(cd.y - px(6)) < 1) ok("C5: china depot at offset spawn (6,6)");
  else err("C5: china depot at (" + (cd && cd.x) + "," + (cd && cd.y) + ")");
  if (jd && Math.abs(jd.x - px(53)) < 1 && Math.abs(jd.y - px(53)) < 1) ok("C6: japan depot at offset spawn (53,53)");
  else err("C6: japan depot at (" + (jd && jd.x) + "," + (jd && jd.y) + ")");

  // C7: map gen seeds resources near offset-spawn corners
  const map4 = generateMap({ w: 60, h: 60, seed: 15, corners: [{ x: 6, y: 6 }, { x: 53, y: 53 }] });
  const near = (cx, cy, m) => {
    let n = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= 60 || y >= 60) continue;
      if ((m.oreSpots && m.oreSpots.has(x + "," + y)) || (m.oilSpots && m.oilSpots.has(x + "," + y))) n++;
    }
    return n;
  };
  const n1 = near(6, 6, map4), n2 = near(53, 53, map4);
  if (n1 >= 2 && n2 >= 2) ok("C7: resources seeded near offset corners (nw=" + n1 + ", se=" + n2 + ")");
  else err("C7: no resources near offset corners (nw=" + n1 + ", se=" + n2 + ")");
}

console.log(fails ? "\nRESULT: " + fails + " FAILED" : "\nRESULT: ALL PASS");
process.exit(fails ? 1 : 0);
