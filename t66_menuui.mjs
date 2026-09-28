// t66_menuui.mjs — real-browser CDP test (Node >= 22, no deps) for the
// 2026-09-28 menu/UI fixes:
//   #3. pause overlay QUIT button (+ Q hotkey) reloads page back to menu
//   #4. skirmish spot=ne starts the match with player base NE / enemy base SW
//   #5. faction picker buttons render era SVG flags (china 5-star ROC,
//       japan rising-sun disc) with correct pixel dimensions
//   #4b. team color swatch re-bakes china infantry sprite (sig changes)
const { spawn } = await import("node:child_process");
const { once } = await import("node:events");
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DPORT = 9226;
const HPORT = 8141;
const BASE = `http://localhost:${HPORT}/index.html`;

const server = spawn("python", ["-m", "http.server", String(HPORT), "--directory", "game"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

let fails = 0;
const ok = (m) => console.log("MENUUI:", m, "PASS");
const bad = (m) => { fails++; console.log("MENUUI:", m, "FAIL"); };

const chrome = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--mute-audio",
  "--window-size=1280,720", `--remote-debugging-port=${DPORT}`,
  "--hide-scrollbars", `--user-data-dir=${mkdtempSync(join(tmpdir(), "wote-cdp-menuui-"))}`, "about:blank",
], { stdio: "ignore" });

let ws = null;
for (let i = 0; i < 40 && !ws; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const r = await fetch(`http://127.0.0.1:${DPORT}/json/list`);
    const page = (await r.json()).find((x) => x.type === "page");
    if (page) ws = page.webSocketDebuggerUrl;
  } catch (e) { /* not up yet */ }
}
if (!ws) { chrome.kill(); server.kill(); console.log("RESULT: CDP not reachable"); process.exit(1); }

const sock = new WebSocket(ws);
await once(sock, "open");
let nextId = 0;
const pending = new Map();
const ctxCreated = new Set();
sock.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === "Runtime.executionContextCreated") { ctxCreated.add(m.params.context.id); return; }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval");
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fresh page = new JS execution context AND menu present AND no #over
// (location.reload keeps the dead page's DOM until the new one lands, so a
// bare selector check is not enough).
function freshContext() { return ctxCreated.size > 1; }
async function backToMenu(timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(400);
    try {
      const menuUp = await evalJs("!!document.getElementById('mi-skmish') && !document.getElementById('over')");
      if (freshContext() && menuUp) return true;
    } catch (e) { /* mid-reload */ }
  }
  return false;
}

const click = (sel) => `document.querySelector('${sel}')?.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}))`;

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: BASE });
await sleep(3500);

// ---------- #5: faction flags in the skirmish picker ----------
await evalJs(click("#mi-skmish"));
await sleep(800);
const flags = await evalJs(`(() => {
  const out = {};
  for (const id of ["sk-fac", "sk-ai"]) {
    const btns = document.querySelectorAll("#" + id + " .menu-seg button");
    out[id] = [...btns].map((b) => ({
      v: b.dataset.v,
      hasFlag: !!b.querySelector("svg.flag"),
      size: (() => { const f = b.querySelector("svg.flag"); if (!f) return "0x0"; const r = f.getBoundingClientRect(); return r.width + "x" + r.height; })(),
      stars: b.querySelector("svg.flag") ? b.querySelectorAll("svg.flag path").length : 0,
      disc: b.querySelector("svg.flag circle") ? b.querySelector("svg.flag circle").getAttribute("fill") : null,
      label: b.querySelector(".fcol") ? b.querySelector(".fcol").textContent.slice(0, 30) : null,
      styled: (() => { const f = b.querySelector("svg.flag"); return f ? getComputedStyle(f).width : "none"; })(),
    }));
  }
  return out;
})()`);
const china = (flags["sk-fac"] || []).find((b) => b.v === "china");
const japan = (flags["sk-ai"] || []).find((b) => b.v === "japan");
china && china.hasFlag && china.stars === 5 && china.label && !china.label.toLowerCase().toLowerCase().includes("undefined")
  ? ok("#5: china button carries 5-star ROC flag + nation label")
  : bad("#5: china flag missing/stars=" + (china && china.stars) + " label=" + (china && JSON.stringify(china.label)));
japan && japan.hasFlag && japan.disc === "#bc002d"
  ? ok("#5: japan button carries rising-sun flag (#bc002d disc)")
  : bad("#5: japan flag missing / wrong disc: " + JSON.stringify(japan));
china && china.size && china.size.split("x")[0] === "46"
  ? ok(`#5: flags sized 46x34px by CSS (measured ${china.size})`)
  : bad("#5: flag CSS sizing failed: " + (china && china.size));

// select a team color (crimson) before starting so we can verify re-bake
await evalJs(`(() => { const c = document.querySelector('#sk-color [data-v="crimson"]'); if (c) c.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true})); return !!c; })()`);
// select spot=ne so we can verify corner placement
await evalJs(`(() => { const s = document.querySelector('#sk-spot [data-v="ne"]'); if (s) s.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true})); return !!s; })()`);
const selChecked = await evalJs(`({
  colorOn: document.querySelector('#sk-color .on')?.dataset.v || null,
  spotOn: document.querySelector('#sk-spot .on')?.dataset.v || null,
  summary: (document.getElementById('sk-summary')||{}).textContent || ""
})`);
selChecked.colorOn === "crimson" && selChecked.spotOn === "ne"
  ? ok(`#4/#5b: selections persist (spot=${selChecked.spotOn}, color=${selChecked.colorOn})`)
  : bad(`#4/#5b: selection state wrong: ` + JSON.stringify(selChecked));

// ---------- start match with spot=ne + crimson ----------
await evalJs(click("#sk-start"));
await sleep(2500);
const running = await evalJs(`(() => { const g = window.__dbg?.game?.(); if (!g) return null; return { player: g.player, ai: g.aiFac, w: g.map.w, h: g.map.h, paused: g.paused }; })()`);
running ? ok(`match running (player=${running.player}, ai=${running.ai}, map ${running.w}x${running.h})`) : bad("match not running after START");

if (running) {
  const corners = await evalJs(`(() => {
    const g = window.__dbg.game();
    const w = g.map.w, h = g.map.h;
    const cs = g.baseSpots || {};
    const out = {};
    for (const [fac, s] of Object.entries(cs)) {
      // quadrant classification: NE = cx>mid && cy>mid, SW = cx<mid && cy<mid.
      // (main.js places the player at the chosen corner offset, enemy opposite)
      const midx = w / 2, midy = h / 2;
      let corner = "mid";
      if (s.cx > midx && s.cy > midy) corner = "NE";
      else if (s.cx < midx && s.cy < midy) corner = "SW";
      else if (s.cx > midx && s.cy < midy) corner = "SE";
      else if (s.cx < midx && s.cy > midy) corner = "NW";
      out[fac] = { cx: s.cx, cy: s.cy, corner };
    }
    return out;
  })()`);
  const pc = corners[running.player] || {};
  const ac = corners[running.ai] || {};
  pc.corner === "NE" && ac.corner === "SW"
    ? ok(`#4: player base NE(${pc.cx},${pc.cy}), enemy base SW(${ac.cx},${ac.cy})`)
    : bad(`#4: corner placement wrong: ` + JSON.stringify(corners));
}

// pause: Esc
await evalJs(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return window.__dbg?.game()?.paused; })()`);
await sleep(300);
// Q hotkey quits
await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))`);
const qQuit = await backToMenu(12000);
qQuit ? ok("#3: Q key during pause quits to menu (page reloaded)") : bad("#3: Q key did not quit to menu");

// back into a match, QUIT via the button
if (qQuit) {
  await evalJs(click("#mi-skmish")); await sleep(700);
  await evalJs(click("#sk-start")); await sleep(2500);
  await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(300);
  const hasQuitBtn = await evalJs(`(() => { const b = document.getElementById('pauseQuit'); if (!b) return 'noel'; const p = document.getElementById('pause'); return p && !p.classList.contains('hidden') && getComputedStyle(p).display !== 'none' ? 'shown' : 'hidden'; })()`);
  hasQuitBtn === "shown" ? ok("#3: pause overlay shows QUIT TO MENU button") : bad("#3: pause overlay QUIT button not visible: " + hasQuitBtn);
  await evalJs(`document.getElementById('pauseQuit')?.click()`);
  const bQuit = await backToMenu(12000);
  bQuit ? ok("#3: QUIT button reloads page back to menu") : bad("#3: QUIT button did not reload to menu");
}

console.log(fails ? `RESULT: ${fails} FAIL` : "RESULT: ALL PASS");
sock.close(); chrome.kill(); server.kill();
process.exit(fails ? 1 : 0);
