# Drop-in art pipeline

The game ships with **procedural placeholder art** (generated at boot from
`config.js`). To swap in real sprites without touching any code:

1. Put PNGs in this folder under one of:
   - `units/<unit-id>.png`      e.g. `units/c_inf.png`
   - `buildings/<id>.png`       e.g. `buildings/depot.png`
   - `tiles/<tile>.png`         e.g. `tiles/grass.png` (32x32)
2. List the ids you added in `manifest.json`:

   {"units": ["c_inf"], "buildings": ["depot"], "tiles": ["grass"]}

3. Refresh the page. Anything not listed keeps the procedural look, so you
   can replace art gradually.

Rules:
- A bare `buildings/depot.png` serves BOTH factions (shared footprint).
  Use `buildings/china_depot.png` / `buildings/japan_depot.png` to override
  only one faction.
- Unit ids come from `config.js` `UNITS` (e.g. `c_inf`, `jp_zero`, `c_m3`,
  `jp_ike`, `c_t99`).
- Building ids come from `config.js` `BUILDINGS` (depot, power, ore, steel,
  fuel, barrack, tankf, airf, arsenal, lab, watch, bunker, concb, wire).
- Tiles: grass, ore, oil, rock, tree (must be 32x32 px).
- If the folder or manifest is missing (e.g. playing over `file://`), the
  game silently falls back to 100% procedural art.
