// t59_win.mjs — real-browser game-over flow test over CDP (Node >= 22, no deps)
// Scenario A: kill the player's depot -> winner=japan, DEFEAT screen, pause
//             overlay suppressed, defeat tag in res strip, Esc locked out.
// Enter:      restarts via location.reload() -> page reboots to menu.
// Scenario B: fresh match, kill the AI's depot -> winner=player -> VICTORY.
// Restart button: also reloads.
const { spawn } = await import("node:child_process");
const { once } = await import("node:events");
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9223;
const BASE = "http://localhost:8138/index.html";

const server = spawn("python", ["-m", "http.server", "8138", "--directory", "game"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

let fails = 0;
const ok = (m) => console.log("WIN:", m, "PASS");
const bad = (m) => { fails++; console.log("WIN:", m, "FAIL"); };

const chrome = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--mute-audio",
  "--window-size=1280,720", `--remote-debugging-port=${PORT}`,
  "--hide-scrollbars", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wote-cdp-win-"))}`, "about:blank",
], { stdio: "ignore" });

let ws = null;
for (let i = 0; i < 40 && !ws; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const page = (await r.json()).find((x) => x.type === "page");
    if (page) ws = page.webSocketDebuggerUrl;
  } catch (e) { /* not up yet */ }
}
if (!ws) { chrome.kill(); server.kill(); console.log("RESULT: CDP not reachable"); process.exit(1); }

const sock = new WebSocket(ws);
await once(sock, "open");
let nextId = 0;
const pending = new Map();
sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval");
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// wait for the page to reload and boot back to the menu.
// NOTE: location.reload() keeps the stale page alive until the new one lands,
// so a bare "menu present" check passes on the old page. The discriminator:
// ui.js injects #over only when a match is running, so a FRESH menu page has
// no #over (while the dead match page still does).
async function backToMenu(timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(500);
    try {
      const fresh = await evalJs("(window.__woetBooted === true && !document.getElementById('over'))");
      const kids = await evalJs("document.getElementById('ms-title') ? (!document.getElementById('ms-title').hidden && !!document.getElementById('mi-skmish')) : false");
      if (fresh && kids) return true;
    } catch (e) { /* mid-reload, JS context restarting */ }
  }
  return false;
}
async function startMatch() {
  // dispatch a real bubbling mouse event (a bare .click() misses delegated handlers)
  for (let i = 0; i < 10; i++) {
    await evalJs("(document.getElementById('mi-skmish')||{}).dispatchEvent && document.getElementById('mi-skmish').dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}))");
    await sleep(500);
    const btn = await evalJs("document.getElementById('sk-start')");
    if (btn) {
      await evalJs("document.getElementById('sk-start').dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}))");
      await sleep(2500);
      return;
    }
    if (i === 4) throw new Error("sk-start missing after 5 attempts; children=" + JSON.stringify(await evalJs("document.getElementById('ms-skirmish') ? 'dataset.built=' + document.getElementById('ms-skirmish').dataset.built + ' maps=' + (document.getElementById('sk-maps') ? document.getElementById('sk-maps').children.length : 'none') : 'no ms-skirmish'")));
  }
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: BASE });
await sleep(3500);

// ---------- Scenario A: player's depot falls -> DEFEAT ----------
await startMatch();
const playerFac = await evalJs("window.__dbg.game().player");
playerFac ? ok(`match running (player=${playerFac})`) : bad("match not running");

const a = await evalJs(`(() => { const g = window.__dbg.game();
  const d = g.buildings.find(b => b.fac === g.player && !b.dead && b.cfg?.id === 'depot'); if (!d) return 'nodot';
  g.kill(d, true); return g.winner; })()`);
a === (playerFac === "china" ? "japan" : "china") ? ok("player's depot falls -> winner is the AI faction") : bad(`depot kill: winner='${a}', player=${playerFac}`);
await sleep(500);
const over = await evalJs(`(() => { const o = document.getElementById('over'); if (!o) return 'noel'; if (o.classList.contains('hidden')) return 'hidden'; const s = getComputedStyle(o); return s.display === 'none' ? 'displaynone' : o.textContent.slice(0, 80); })()`);
String(over).toLowerCase().includes("defeat") ? ok("DEFEAT screen shown") : bad("over screen: " + over);
const pv = await evalJs(`(() => { const p = document.getElementById('pause'); return getComputedStyle(p).display === 'none' || p.classList.contains('hidden'); })()`);
pv ? ok("pause overlay suppressed while winner set") : bad("pause overlay visible during game over");
const ri = await evalJs(`(() => [...document.querySelectorAll('.ri.over')].map(e => e.textContent).join(','))()`);
String(ri).toLowerCase().includes("defeat") ? ok("res strip carries — DEFEAT — tag") : bad("no defeat tag in strip: " + JSON.stringify(ri));

// input lock: while winner set, Escape must NOT toggle pause
await evalJs("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
await sleep(200);
const p2 = await evalJs("window.__dbg.game().paused");
p2 === false ? ok("Esc locked out while game over (no pause)") : bad(`Esc paused game during winner state (paused=${p2})`);

// Enter -> location.reload() -> back at menu
await evalJs("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))");
(backToMenu()) ? ok("Enter reloads page back to menu") : bad("Enter did not reload to menu");

// ---------- Scenario B: fresh match, AI's depot falls -> VICTORY ----------
await startMatch();
const b = await evalJs(`(() => { const g = window.__dbg.game();
  const d = g.buildings.find(b => b.fac === g.aiFac && !b.dead && b.cfg?.id === 'depot'); if (!d) return 'nodot';
  g.kill(d, true); return g.winner; })()`);
b === playerFac ? ok(`AI's depot falls -> winner=player (${b})`) : bad(`AI depot kill: winner=${b}, player=${playerFac}`);
await sleep(500);
const over2 = await evalJs(`(() => { const o = document.getElementById('over'); if (o.classList.contains('hidden')) return 'hidden'; return o.textContent.slice(0, 80); })()`);
String(over2).toLowerCase().includes("victory") ? ok("VICTORY screen shown") : bad("over screen B: " + over2);
const ri2 = await evalJs(`(() => [...document.querySelectorAll('.ri.over')].map(e => e.textContent).join(','))()`);
String(ri2).toLowerCase().includes("victory") ? ok("res strip carries — VICTORY — tag") : bad("no victory tag: " + JSON.stringify(ri2));

// Restart button also reloads
await evalJs("document.getElementById('overRestart').click()");
(backToMenu()) ? ok("Restart button reloads page back to menu") : bad("Restart button did not reload to menu");

console.log(fails ? `RESULT: ${fails} FAIL` : "RESULT: ALL PASS");
sock.close(); chrome.kill(); server.kill();
process.exit(fails ? 1 : 0);
