# War of the East

A browser-based, tile-grid RTS in the style of Command & Conquer (Red Alert era),
set in the Second Sino-Japanese War (1937–1945). Two playable factions — **China**
and **Japan** — each with real historical WWII units.

Pure vanilla JS + Canvas. No frameworks, no build step, no server required.

## Play

Just open the game in any modern browser (desktop, Chrome/Edge/Firefox):

- **Here on GitHub Pages:** https://kaizuri1.github.io/war-of-the-east/game/index.html
- **Local:** `python -m http.server` (or any static file server) in this folder,
  then open `http://localhost:8000/game/index.html`

> The game uses ES modules, so it needs to be served over `http://` —
> opening it via `file://` won't work.

## Controls

| Key / Mouse | Action |
|---|---|
| **W/A/S/D or arrow keys** | Pan camera (screen edges also pan) |
| **Left click** | Select / build / issue orders |
| **Right click** | Build / issue orders |
| **Esc** | Cancel build ghost, or pause when idle |
| **H** | Hide / show the command bar |
| **F1 / F2 / F3** | Game speed 1× / 2× / 3× |
| **F10 / F12 or Space** | Pause |
| **U** | Repair selected building |
| **Ctrl+1–5** | Assign / select control groups (Shift+ to assign) |
| **Enter** | Restart after a match ends |
| **Build menu** | Right-side panel with tabs: Infantry, Vehicles, Research, Building Production |
| **Sell / Repair** | Buttons appear when a building is selected |

Pick your faction and a resource/AI difficulty tier on the title screen.
The AI is playable: it builds up an economy and pushes units out to engage.

## Project layout

```
game/
  index.html      entry point
  js/
    config.js     single source of truth: units, upgrades, resource & AI tiers
    rand.js       seeded RNG (reproducible maps)
    engine.js     core game state: economy, projects, counters, win/loss
    entities.js   Unit / Building classes (targeting, movement, separation)
    ai.js         AI faction (economy + continuous offense)
    input.js      keyboard / mouse / edge-pan
    ui.js         build menu, minimap, HUD, sell/repair
    renderer.js   canvas rendering, camera, HP bars
    audio.js      sound
    main.js       bootstrap: menu → game → frame loop
plan/            design documents & unit spreadsheet
```

## Status

Work in progress — core loop (resources → production → combat → base
destruction) is playable and the bug fixes pass headless regression tests.
Expect occasional rough edges.
