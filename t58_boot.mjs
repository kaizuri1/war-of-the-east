// t58_boot.mjs — real-browser boot smoke test over CDP (Node >= 22, no deps)
// Launches headless Chrome, loads game/index.html, walks menu -> START BATTLE,
// runs the match a few seconds, and asserts: no JS errors, menu rendered,
// HUD injected, canvas has pixels drawn, sim is ticking, H-key + Esc work.
const { spawn } = await import("node:child_process");
const { once } = await import("node:events");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9222;
const BASE = "http://localhost:8137/index.html";

const chrome = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--mute-audio",
  "--window-size=1280,720", `--remote-debugging-port=${PORT}`,
  "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

let fails = 0;
const ok = (m) => console.log("BOOT:", m, "PASS");
const bad = (m) => { console.log("BOOT:", m, "FAIL"); fails++; };

// wait for the CDP endpoint
let ws = null;
for (let i = 0; i < 40 && !ws; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const items = await r.json();
    const page = items.find((x) => x.type === "page");
    if (page) ws = page.webSocketDebuggerUrl;
  } catch (e) { /* not up yet */ }
}
if (!ws) { chrome.kill(); console.log("RESULT: CDP not reachable"); process.exit(1); }
console.log("BOOT: CDP up");

const sock = new WebSocket(ws);
await once(sock, "open");
let nextId = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];
sock.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  else if (m.method === "Runtime.exceptionThrown")
    pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId; pending.set(id, resolve);
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval");
  return r.result?.result?.value;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: BASE });
await new Promise((r) => setTimeout(r, 3500)); // boot + menu paint

const booted = await evalJs("window.__woetBooted");
booted ? ok("module booted (__woetBooted)") : bad("module boot");
const menuKids = await evalJs("document.getElementById('menu').children.length");
menuKids > 0 ? ok(`menu rendered (${menuKids} children)`) : bad("menu empty");

// walk to skirmish + start
await evalJs("document.querySelector('#mi-skmish').click()");
await new Promise((r) => setTimeout(r, 400));
const startVisible = await evalJs("!!document.getElementById('sk-start')");
startVisible ? ok("skirmish screen reached") : bad("no skirmish screen");
await evalJs("document.getElementById('sk-start').click()");
await new Promise((r) => setTimeout(r, 2500));

const hud = await evalJs("!!(document.querySelector('#res') && document.querySelector('#command') && document.querySelector('#command .card') && document.querySelector('#cmdToggle'))");
hud ? ok("HUD injected (res strip + command cards + H toggle)") : bad("HUD missing");
const simT0 = await evalJs("window.__dbg.game().time");
const px = await evalJs("(() => { const c = document.getElementById('view'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let nz = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nz++; return nz; })()");
px > 1000 ? ok(`canvas has painted pixels (${px} non-transparent)`) : bad(`canvas nearly empty (${px} px)`);
await new Promise((r) => setTimeout(r, 1500));
const simT1 = await evalJs("window.__dbg.game().time");
simT1 > simT0 ? ok(`sim ticking (${simT0.toFixed(2)}s -> ${simT1.toFixed(2)}s)`) : bad(`sim frozen at ${simT0}`);

// H key: hide command bar (root has tabindex + focus per main.js)
const pre = await evalJs("document.querySelector('#command').classList.contains('hidden')");
await evalJs("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))");
await new Promise((r) => setTimeout(r, 200));
const post = await evalJs("document.querySelector('#command').classList.contains('hidden')");
post !== pre ? ok(`H key toggles command bar (${pre} -> ${post})`) : bad("H key no effect");
const arrow = await evalJs("document.querySelector('#cmdToggle').textContent");
arrow === (post ? "«" : "»") ? ok(`toggle arrow synced ('${arrow}')`) : bad(`toggle arrow '${arrow}' out of sync`);
await evalJs("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))"); // restore (ui listens on keydown)

// Esc with a build ghost: must cancel, must NOT pause or build
const esc = await evalJs(`(() => { const g = window.__dbg.game(); g.units.forEach(u=>u.selected=false); const r = window.__dbg.renderer();
  const b = g.buildings.find(b=>!b.dead && b.isAlive() && b.fac===g.player && b.cfg.id!=='depot' && !b.underConstruction());
  if (!b) return 'nobuilding';
  const cards = [...document.querySelectorAll('#cmdBody .card')]; const bc = cards.find(c=>c.dataset.kind==='building'); if (!bc) return 'nocards'; bc.click(); const before = g.buildings.length; window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); return JSON.stringify({ ghostCleared: r.buildGhost === null, paused: g.paused, built: g.buildings.length - before }); })()`);
{
  let d = {}; try { d = JSON.parse(esc); } catch (e) { if (esc && esc !== "nobuilding" && esc !== "nocards") bad("Esc probe threw: " + esc); }
  if (esc === "nobuilding" || esc === "nocards") console.log("(note) Esc probe skipped:", esc);
  else if (d) {
    d.ghostCleared ? ok("Esc clears build ghost") : bad("ghost survived Esc");
    !d.paused ? ok("Esc during build does NOT pause") : bad("Esc paused the game while placing");
    d.built === 0 ? ok("Esc builds nothing") : bad("Esc triggered a build");
  }
}

// RMB probe with a build ghost: must ONLY cancel (bug 3 regression)
const rmb = await evalJs(`(() => { const g = window.__dbg.game(); const r = window.__dbg.renderer();
  const cards = [...document.querySelectorAll('#cmdBody .card')]; const bc = cards.find(c=>c.dataset.kind==='building'); if (!bc) return 'nocards';
  bc.click(); const before = g.buildings.length; const unitsBefore = g.units.length;
  const cv = document.getElementById('view'); const rect = cv.getBoundingClientRect();
  cv.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: rect.left + 100, clientY: rect.top + 100, bubbles: true }));
  cv.dispatchEvent(new MouseEvent('mouseup', { button: 2, clientX: rect.left + 100, clientY: rect.top + 100, bubbles: true }));
  return JSON.stringify({ ghostCleared: r.buildGhost === null, built: g.buildings.length - before, unitBuilt: g.units.length - unitsBefore, paused: g.paused }); })()`);
{
  let d = {}; try { d = JSON.parse(rmb); } catch (e) { if (rmb && rmb !== "nocards") bad("RMB probe threw: " + rmb); }
  if (rmb === "nocards") console.log("(note) RMB probe skipped — no cards");
  else if (d) {
    d.ghostCleared ? ok("RMB cancels build ghost") : bad("ghost survived RMB");
    d.built === 0 ? ok("RMB never builds a building") : bad("RMB built a building");
    d.unitBuilt === 0 ? ok("RMB never builds a unit (old deselect-build bug)") : bad("RMB built a unit");
    !d.paused ? ok("RMB does not pause") : bad("RMB paused the game");
  }
}

// F10 pause screen: overlay visible + Resume button topmost (z-index 95 fix)
await evalJs("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', code: 'F10' }))"); // input checks e.code
await new Promise((r) => setTimeout(r, 200));
const pauseVis = await evalJs("(() => { const p = document.getElementById('pause'); if (!p) return 'none'; const style = getComputedStyle(p); return style.display !== 'none' && !p.classList.contains('hidden'); })()");
pauseVis === true ? ok("F10 opens pause overlay") : bad(`pause overlay not visible (${pauseVis})`);
const resumeOk = await evalJs("(() => { const btn = document.getElementById('pauseResume'); if (!btn) return 'nobtn'; const r = btn.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return el === btn || btn.contains(el) ? 'front' : 'covered:' + el.className; })()");
resumeOk === "front" ? ok("Resume button is topmost (z-index 95 above #over 90)") : bad(`Resume button ${resumeOk}`);
const wasPaused = await evalJs("window.__dbg.game().paused");
await evalJs("document.getElementById('pauseResume').click()");
await new Promise((r) => setTimeout(r, 200));
const pauseGone = await evalJs("(() => { const p = document.getElementById('pause'); const s = getComputedStyle(p); return s.display === 'none' || p.classList.contains('hidden'); })()");
pauseGone ? ok("clicking Resume closes the pause screen") : bad("pause screen stayed open after Resume click");
await evalJs(`window.__dbg.game().paused = ${wasPaused}`); // restore

consoleErrors.length === 0 ? ok("no console.error in page") : bad("console errors:\n  " + consoleErrors.join("\n  "));
pageErrors.length === 0 ? ok("no uncaught page exceptions") : bad("page exceptions:\n  " + pageErrors.join("\n  "));

console.log(fails ? `RESULT: ${fails} FAIL` : "RESULT: ALL PASS");
sock.close(); chrome.kill();
process.exit(fails ? 1 : 0);
