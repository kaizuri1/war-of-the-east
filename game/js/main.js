// War of the East — bootstrap: menu first, then wires config → map → engine →
// renderer → input → UI → AI, and runs a clamped requestAnimationFrame loop.
import { TILE, RES_TIERS } from "./config.js";
import { generateMap, T } from "./rand.js";
import { Game } from "./engine.js";
import { Renderer } from "./renderer.js";
import { Input } from "./input.js";
import { UI } from "./ui.js";
import { AI } from "./ai.js";
import { buildTiles, buildSprites, loadArtOverrides, TILES, setTeamPalettes, clearTeamPalettes } from "./sprites.js";
import { bootMenu, setSfx, MENU } from "./menu.js";

let game, renderer, input, ui, ai, canvas, sfx;
// Dev debug hooks — set the instant modules load, before any await.
window.__dbg = { game: () => game, renderer: () => renderer, input: () => input, tiles: () => TILES };
// #6: in-game pause menu wants to tweak volume. We pass the sfx object
// into the UI through game.attach({ sfx }), so a simple helper here just
// forwards to the right gain without needing to touch engine or ui.
function setGameAudio({ sfxVol, musicVol, musicMuted } = {}) {
  if (sfxVol != null && sfx?._setVol) sfx._setVol(sfxVol);
  if (musicVol != null || musicMuted != null) sfx?._setMusic(musicVol, musicMuted);
}
window.setGameAudio = setGameAudio;

async function boot() {
  await loadArtOverrides(); // drop-in PNG art if present; silent no-op otherwise
  buildTiles();
  buildSprites();
  canvas = document.getElementById("view");
  renderer = new Renderer(canvas);
  renderer.resize();
  sfx = makeSfx();
  setSfx(sfx);                  // menu.js beep / volume sliders (live)
  // Apply the persisted settings the moment the audio graph builds, then
  // hand `applySettings` back to menu.js when it flips a toggle.
  if (sfx) {
    sfx.musicMuted = !!MENU.S.musicMuted;
    sfx._setVol(MENU.S.sfxVol);
    sfx._setMusic(MENU.S.musicVol, MENU.S.musicMuted);
    sfx.applySettings = applySettings;
  }
  bootMenu({ onPlay: playGame });
  window.__woetBooted = true; // clears the file:// watchdog in index.html
}

function applySettings(s) {
  // s = { sfxVol, musicVol, musicMuted, shake } — applied live from menu.js.
  if (!s || !sfx) return;
  if (s.sfxVol != null) sfx._setVol(s.sfxVol);
  if (s.musicVol != null || s.musicMuted !== undefined)
    sfx._setMusic(s.musicVol, s.musicMuted);
  if (s.shake !== undefined) window.WOE_SHAKE = s.shake === true;
}

// Build a full match from the skirmish setup chosen in the menu, then hand
// control to the game loop. The menu DOM is cleared by the UI constructor.
function playGame(cfg) {
  // Menu sends {player, aiFac, res, diff, map:{w,h,seed}} — normalize defensively.
  const m = cfg.map && typeof cfg.map === "object" ? cfg.map : cfg;
  // Spawn points offset ~4 tiles from the map edge so neither side starts
  // glued to a corner — gives the AI room to grow inward and makes the map
  // feel less like a box-puncher. Map gen receives the same points so it
  // clears terrain / seeds resources around the ACTUAL spawn, not the corner.
  const w = m.w, h = m.h;
  const OFF = 6;
  // Player entry corner (menu picks sw default or ne); enemy takes the opposite.
  const spot = cfg.spot === "ne" ? { x: w - OFF - 1, y: h - OFF - 1 } : { x: OFF, y: OFF };
  const enemyX = spot.x === OFF ? w - OFF - 1 : OFF;
  const enemyY = spot.y === OFF ? h - OFF - 1 : OFF;
  const spots = [
    { fac: cfg.player, cx: spot.x, cy: spot.y },
    { fac: cfg.aiFac || (cfg.player === "china" ? "japan" : "china"), cx: enemyX, cy: enemyY },
  ];
  // Team colors: re-bake sprites with the chosen palettes BEFORE the engine
  // (and first render) uses them. Null = keep that faction's default palette.
  if (cfg.playerPal || cfg.enemyPal) setTeamPalettes(cfg.player, cfg.aiFac || (cfg.player === "china" ? "japan" : "china"), cfg.playerPal, cfg.enemyPal);
  else clearTeamPalettes();
  const corners = spots.map((s) => ({ x: s.cx, y: s.cy, tag: "" }));
  const mapFinal = generateMap({ w, h, seed: m.seed, corners });
  const resTier = RES_TIERS[cfg.res] || null;
  game = new Game(mapFinal, { player: cfg.player, diff: cfg.diff, res: cfg.res, resTier });
  game.setupBases(spots);
  document.getElementById("menu").classList.add("hidden");
  const gameEl = document.getElementById("game");
  gameEl.classList.remove("hidden");
  renderer.resize(); // game was hidden at boot (canvas sized 0x0) — re-measure now visible

  renderer.cam.x = 3 * TILE - canvas.clientWidth / 2 / renderer.cam.zoom;
  renderer.cam.y = 3 * TILE - canvas.clientHeight / 2 / renderer.cam.zoom;

  input = new Input(canvas, game, renderer, null);   // ui backfilled below (circular ctor)
  input.clampCam();
  ui = new UI(document.getElementById("game"), game, canvas, input);
  input.ui = ui;
  ui.attachRenderer(renderer);
  game.attach({ sfx, onWin: (w) => ui.showOver(w) });
  ui.attachSfx();
  ui.root.setAttribute("tabindex", "0");
  ui.root.focus();
  game.onUiTick = (dt) => ui.uiTick(dt);
  ai = new AI(game, game.aiFac);
  // When a building dies in combat, tell the AI to pause rebuilding its type.
  game.onBuildingKilled = (b) => {
    if (ai && b.fac === game.aiFac) ai.markBuildingKilled(b.cfg?.id);
  };

  renderer.cam.x = (game.bases?.[cfg.player]?.x ?? 3 * TILE) - canvas.clientWidth / 2 / renderer.cam.zoom;
  renderer.cam.y = (game.bases?.[cfg.player]?.y ?? 3 * TILE) - canvas.clientHeight / 2 / renderer.cam.zoom;
  input.clampCam();
}

// Richer WebAudio SFX: layered oscillators + noise bursts + low drum,
// tuned per event. No audio assets.
function makeSfx() {
  let ctx = null, sfxGain = null, musicGain = null, noiseBuf = null;
  const ensure = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Two master buses: SFX and music, each with its own gain so the
        // in-game pause menu and menu settings can mute/duck them separately.
        sfxGain = ctx.createGain();  sfxGain.gain.value = MENU_S.sfxVol;
        musicGain = ctx.createGain(); musicGain.gain.value = MENU_S.musicVol;
        if (MENU_S.musicMuted) musicGain.gain.value = 0;
        sfxGain.connect(ctx.destination);
        musicGain.connect(ctx.destination);
        // simple feedback delay for a bit of space (SFX only)
        const dl = ctx.createDelay(0.5); dl.delayTime.value = 0.11;
        const fb = ctx.createGain(); fb.gain.value = 0.18;
        const dlp = ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 2400;
        sfxGain.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(ctx.destination);
        // pre-baked 1s white noise
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { return null; }
      if (ctx.state === "suspended") ctx.resume();
    }
    return ctx;
  };
  const env = (g, t, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const osc = (type, f0, f1, a, d, vol, t0 = 0) => {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + t0, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + a + d);
    env(g, t, a, d); g.gain.setValueAtTime(0.0001, t + a + d + 0.0001);
    g.connect(sfxGain); o.connect(g); o.start(t); o.stop(t + a + d + 0.05);
  };
  const noise = (f, a, d, vol, type = "bandpass", t0 = 0) => {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + t0, s = c.createBufferSource(); s.buffer = noiseBuf;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f;
    const g = c.createGain(); env(g, t, a, d); g.gain.setValueAtTime(0.001, t);
    g.gain.setValueAtTime(vol, t + a);
    s.connect(flt); flt.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + a + d + 0.05);
  };
  const play = (name) => {
    const t = ensure(); if (!t) return;
    switch (name) {
      case "shot":      // soft muzzle crack: filtered noise + low thump
        noise(1600, 0.002, 0.06, 0.35, "highpass"); osc("sine", 180, 60, 0.002, 0.08, 0.4); break;
      case "impact":    // metal impact: short noise + mid click
        noise(500, 0.002, 0.12, 0.4, "bandpass"); osc("square", 220, 140, 0.002, 0.07, 0.22); break;
      case "build":     // construction: hammer taps (two low thumps) + wood noise
        osc("sine", 90, 55, 0.003, 0.09, 0.5); osc("sine", 90, 55, 0.003, 0.09, 0.5, 0.11);
        noise(300, 0.005, 0.1, 0.2, "bandpass"); break;
      case "demolish":  // explosion: low boom + long noise tail + sub rumble
        noise(900, 0.003, 0.35, 0.6, "lowpass"); osc("sine", 70, 30, 0.004, 0.3, 0.7);
        osc("sawtooth", 55, 25, 0.005, 0.22, 0.3); noise(400, 0.01, 0.25, 0.35, "bandpass", 0.03); break;
      case "die":       // unit death: quick pitch-drop
        osc("sawtooth", 300, 70, 0.004, 0.18, 0.35); noise(700, 0.003, 0.1, 0.2, "bandpass"); break;
      case "research":  // research complete: bright rising two-note sine
        osc("sine", 520, 780, 0.01, 0.12, 0.4); osc("sine", 780, 1170, 0.01, 0.14, 0.4, 0.09);
        osc("triangle", 1040, 1560, 0.01, 0.1, 0.25, 0.18); break;
      case "spawn":     // unit deployed: soft two-note
        osc("triangle", 330, 440, 0.008, 0.09, 0.3); osc("sine", 440, 660, 0.008, 0.08, 0.2, 0.07); break;
      case "win":       // victory: rising triad
        [523, 659, 784, 1046].forEach((f, i) => { osc("sine", f, f, 0.01, 0.4, 0.35, i * 0.11); osc("triangle", f * 2, f * 2, 0.01, 0.3, 0.12, i * 0.11); });
        noise(3000, 0.01, 0.5, 0.15, "highpass", 0.4); break;
      case "click":     // subtle UI tick
        osc("triangle", 620, 480, 0.002, 0.04, 0.18); break;
      case "error":     // UI error: short descending buzz
        osc("square", 200, 120, 0.004, 0.12, 0.3, 0); osc("square", 150, 90, 0.004, 0.12, 0.25, 0.05); break;
      default: osc("sine", 500, 400, 0.003, 0.05, 0.2);
    }
  };
  // --- Live volume controls (#6 in-game settings) ---------------------------
  // menu.js calls applySettings on the sfx object; it reads MENU.S on demand
  // so we don't have to re-wire anything after a settings change.
  let musicStarted = false;
  const _setVol = (v) => { const c = ensure(); if (c && sfxGain) sfxGain.gain.value = v; };
  const _setMusic = (v, muted) => {
    const c = ensure(); if (!c || !musicGain) return;
    musicGain.gain.value = muted ? 0 : (v ?? 0);
    if (!muted && !musicStarted) { musicStarted = true; startMusicLoop(); }
  };
  // A very light procedural "field drone" (two detuned low sines + slow
  // LFO on the gain) so the in-game settings have something audibly real
  // to modulate. Kept at low volume; can be fully silenced via mute.
  const startMusicLoop = () => {
    const c = ctx; if (!c) return;
    const g = c.createGain(); g.gain.value = 0.18; g.connect(musicGain);
    const f0 = 92, f1 = 92 * 1.007, f2 = 184;   // A2 + slight detune + A3
    for (const f of [f0, f1, f2]) {
      const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = f === f2 ? 0.12 : 0.5;
      o.connect(og); og.connect(g); o.start();
    }
    const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.08;
    const lg = c.createGain(); lg.gain.value = 0.08;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
  };
  // Generic menu beep (short two-tone). Used by menu.js buttons.
  const beep = (f0, f1, d = 0.04, type = "square", vol = 0.025) => {
    const c = ensure(); if (!c) return;
    osc(type, f0, f1, 0.003, d, vol);
  };
  // The sfx object is handed around as this shape (main.js → game.attach
  // → engine.sound(name) → ui.beep(name) AND menu.js's beep helper).
  return { play, beep, _setVol, _setMusic, musicMuted: false };
}

let last = 0;
function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000 || 0);
  last = ts;
  if (game && !game.winner) {
    const spd = game.speed || 1;
    try {
      for (let i = 0; i < spd; i++) game.update(dt);
      if (ai) ai.tick(dt * spd);
      if (input) input.update(dt);
    } catch (e) {
      // A throw inside the tick MUST NOT kill the rAF chain — that freezes the game.
      if (!e.__warned) { console.error("[game tick]", e); e.__warned = true; }
    }
  }
  // UI tick + render run OUTSIDE the tick try/catch above. A throw in either
  // (e.g. a plane-specific renderer path) used to escape to here before
  // requestAnimationFrame, so the rAF chain died and the game froze hard.
  // Guard them so the frame is ALWAYS rescheduled no matter what.
  try {
    if (game && game.onUiTick) game.onUiTick(dt);
    if (renderer && game) {
      renderer.dragSel = input ? input.dragSel : null;   // sync live box-select rect
      renderer.draw(game);
    }
  } catch (e) {
    if (!e.__warned) { console.error("[render]", e); e.__warned = true; }
  }
  requestAnimationFrame(frame);
}

window.addEventListener("resize", () => renderer && renderer.resize());

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
requestAnimationFrame(frame);
