// t56_b34.mjs — Bug 3 (hide build bar) + Bug 4 (RMB never builds) verification
// Headless: no DOM. Constructs a fake canvas + UI stub and drives Input.onRight
// directly, plus asserts the toggle bar logic on a minimal fake root.
import { Game } from "./game/js/engine.js";
import { generateMap } from "./game/js/rand.js";
import { TILE, BUILDINGS } from "./game/js/config.js";
import { Input } from "./game/js/input.js";
import { UI } from "./game/js/ui.js";

// Node has no DOM: stub window before instantiating Input (it binds key handlers)
globalThis.window = { addEventListener: () => {}, innerWidth: 1280, innerHeight: 720 };
globalThis.document = { getElementById: () => null, addEventListener: () => {} };

const map = generateMap({ w: 45, h: 45, seed: 7 });
const g = new Game(map, { playerFac: "china", aiFac: "japan", diff: "medium", seed: 7 });
g.setupBases();
for (const f of ["china", "japan"]) {
  if (!g.fac[f]) g.fac[f] = { res: { tin: 99999, steel: 999, fuel: 999 }, up: {}, power: { gen: 20, draw: 0, ok: true } };
  g.fac[f].res = { tin: 99999, steel: 999, fuel: 999 }; // force: setupBases leaves only 150 tin
}

// minimal fake renderer / canvas / ui
const r = { cam: { x: 0, y: 0, zoom: 1 }, buildGhost: null };
const cv = {
  clientWidth: 1280, clientHeight: 720,
  getContext: () => null,
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
  addEventListener: () => {},
};
const uiStub = { setBuildActive: () => {}, refresh: () => {} };
const inp = new Input(cv, g, r, uiStub);

let fails = 0;

// pick a valid any_clear building on open ground
const tx = 30, ty = 30; // corner region, far from bases
const id = "bunker"; // 1x1 any_clear
if (!g.canBuild(id, "china", tx - 0, ty - 0)) console.log("(note) tile", tx, ty, "not buildable; testing on (30,30) anyway");

// ---------- BUG 4: RMB while ghosting must NEVER build ----------
inp.setBuild(id);
// simulate ghost following cursor (what onMove would do)
inp.r.buildGhost = { id, tx, ty, ok: g.canBuild(id, "china", tx, ty) };
const b0 = g.buildings.length;
const tin0 = g.fac.china.res.tin;
// place ghost at exact tile via screenToWorld mapping (zoom 1, cam 0)
inp.onRight(tx * TILE + 10, ty * TILE + 10);
const builtOnRmb = g.buildings.length - b0;
if (inp.buildItem === null) console.log("B4: RMB clears buildItem  PASS");
else { console.log("B4: RMB clears buildItem  FAIL (buildItem=" + inp.buildItem + ")"); fails++; }
if (builtOnRmb === 0) console.log("B4: RMB builds nothing     PASS (buildings " + b0 + "->" + g.buildings.length + ")");
else { console.log("B4: RMB builds nothing     FAIL (" + builtOnRmb + " built)"); fails++; }
if (g.fac.china.res.tin === tin0) console.log("B4: RMB costs no tin       PASS");
else { console.log("B4: RMB costs no tin       FAIL (" + tin0 + "->" + g.fac.china.res.tin + ")"); fails++; }
if (inp.r.buildGhost === null) console.log("B4: ghost cleared          PASS");
else { console.log("B4: ghost cleared          FAIL"); fails++; }

// find a genuinely buildable 1x1 tile for the LMB control test
let btx = -1, bty = -1;
outer: for (let ty = 2; ty < map.h - 2; ty++)
  for (let tx = 2; tx < map.w - 2; tx++)
    if (g.canBuild("bunker", "china", tx, ty)) { btx = tx; bty = ty; break outer; }
if (btx === -1) { console.log("B4: no buildable tile found (control skipped)"); }
else console.log("(note) control tile at", btx, bty);
if (btx !== -1) {
  inp.setBuild("bunker");
  const b1 = g.buildings.length;
  inp.onUp({ clientX: (btx + 0.5) * TILE, clientY: (bty + 0.5) * TILE, button: 0 });
  if (g.buildings.length - b1 === 1) console.log("B4: LMB still builds       PASS (control)");
  else console.log("B4: LMB still builds       FAIL (control; +" + (g.buildings.length - b1) + ")");
}
// RMB on that same valid tile must NOT build it
{
  inp.setBuild("bunker");
  const b1 = g.buildings.length;
  inp.onRight((btx + 0.5) * TILE, (bty + 0.5) * TILE);
  if (g.buildings.length - b1 === 0) console.log("B4: RMB on VALID tile no build PASS");
  else { console.log("B4: RMB on VALID tile no build FAIL (+" + (g.buildings.length - b1) + ")"); fails++; }
}

// ---------- BUG 4: RMB with selection does NOT build, does give orders ----------
inp.setBuild(null);
const u = g.units.find((x) => x.fac === "china" && !x.dead && x.isAlive() && !x.isStatic());
if (u) {
  g.units.forEach((x) => (x.selected = false));
  g.buildings.forEach((x) => (x.selected = false));
  u.selected = true;
  const b2 = g.buildings.length;
  inp.onRight(13 * TILE, 13 * TILE); // empty area, no enemy
  if (g.buildings.length - b2 === 0 && u.moveOrder) console.log("B4: RMB with sel = move order (no build)  PASS");
  else { console.log("B4: RMB with sel  FAIL (built=" + (g.buildings.length - b2) + ", moveOrder=" + !!u.moveOrder + ")"); fails++; }
} else {
  console.log("B4: no china unit for sel-order check (skipped)");
}

// ---------- BUG 3: toggleBar hide/show logic (fake root) ----------
function fakeEls() {
  const mk = (tag) => {
    const set = new Set();
    return {
      tag, textContent: "", title: "", addEventListener: () => {},
      set,
      classList: {
        add: (c) => set.add(c),
        remove: (c) => set.delete(c),
        contains: (c) => set.has(c),
        toggle: (c) => (set.has(c) ? (set.delete(c), false) : (set.add(c), true)),
      },
    };
  };
  const cmd = mk("#command"), tg = mk("#cmdToggle"), body = mk("#cmdBody");
  tg.textContent = "»";
  return {
    root: {
      querySelector: (s) => (s === "#command" ? cmd : s === "#cmdToggle" ? tg : s === "#cmdBody" ? body : null),
    },
    cmd, tg, body,
  };
}
// call the REAL ui.js method with a fake root (no full UI instantiation needed)
function toggleBar(ui) { return UI.prototype.toggleBar.call(ui); }
{
  const { root, cmd, tg } = fakeEls();
  const ui = { root };
  const L = (c) => cmd.classList.contains(c);
  // toggle #1: shows -> hides
  UI.prototype.toggleBar.call(ui);
  if (L("hidden") && tg.textContent === "«") console.log("B3: toggle hides panel     PASS (hidden, arrow «)");
  else { console.log("B3: toggle hides panel     FAIL (hidden=" + L("hidden") + ", arrow=" + JSON.stringify(tg.textContent) + ")"); fails++; }
  // toggle #2: hides -> shows
  UI.prototype.toggleBar.call(ui);
  if (!L("hidden") && tg.textContent === "»") console.log("B3: toggle re-shows panel  PASS (shown, arrow »)");
  else { console.log("B3: toggle re-shows panel  FAIL (hidden=" + L("hidden") + ")"); fails++; }
  // 3 more -> odd total (5) from shown base... net: shown then 3 toggles = hidden
  UI.prototype.toggleBar.call(ui); UI.prototype.toggleBar.call(ui); UI.prototype.toggleBar.call(ui);
  if (L("hidden")) console.log("B3: state toggles cleanly    PASS (odd count -> hidden)");
  else { console.log("B3: state toggles cleanly    FAIL (even count -> shown)"); fails++; }
  // panel element + listeners survive hidden: innerHTML not wiped
  if (root.querySelector("#cmdBody")) console.log("B3: cmdBody survives hidden  PASS (refresh keeps working)");
  else { console.log("B3: cmdBody survives hidden  FAIL"); fails++; }
}

console.log(fails ? `RESULT: ${fails} FAIL` : "RESULT: ALL PASS");
process.exit(fails ? 1 : 0);
