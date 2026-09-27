# WAR OF THE EAST — Game Design & Production Plan

A browser-based, tile-grid RTS in the style of **Command & Conquer** (Red Alert era),
set in the **Sino-Japanese War / WWII Asian theater (1937–1945)**.

**Factions:**
- **CHINA** — Republic of China (Nationalist forces; green field uniform, brown gear)
- **JAPAN** — Empire of Japan (Imperial forces; dark olive/khaki uniform, Type 3 1923 helmet look)

---

## 1. Core Loop (C&C style)

1. You own a **Construction Depot / 建造厂 (NCO factory)**. Everything is built from it.
2. **POWER** — power plants feed a grid; every building consumes power. Going
   short makes all factories produce at 50% speed ("underpowered").
3. **THREE RESOURCE TYPES:**
   - **TIN (metal)** — mined by *Ore Processors* built on ore veins. Base currency.
   - **STEEL** — *Steel Mills* consume TIN (~1/s) and output STEEL. Advanced vehicles
     and heavy defenses also cost steel (two-stage refinement, as requested).
   - **FUEL** — *Fuel Depots / Oil Refineries* built on oil fields output FUEL.
     Tanks have fuel tanks; when empty, speed drops to 40%. Refill free at your
     own oil refinery/fuel depot (park there) or at the tank factory.
4. **PRODUCTION:** barracks → infantry, tank factory → armor, airfield → aircraft,
   arsenal → buildable anti-air/anti-tank guns. Queues are per-building,
   sell for ~50%.
5. **WIN:** destroy the enemy Construction Depot (and everything else). Engineer
   can **capture** unoccupied enemy buildings (C&C style: repair + flag change).

## 2. Map & Camera

- Grid world, **60×60 tiles @ 32 px** (1920×1920), one canvas, zoomable (wheel),
  camera free-moves with edge-scroll + click/drag + minimap.
- Procedural terrain: grass, ore veins (orange speckle), oil fields (dark patches),
  rocks/trees as obstacles, two base corners. Seeded RNG so the same seed = same map.
- Fog of war: **no** (C&C 95 had none) — full visibility, enemy units visible.

## 3. Controls (C&C conventions)

| Input | Action |
|---|---|
| Left click / drag | Select units (shift adds) |
| Right click | Move / Attack-move |
| Right click on enemy | Attack |
| 1–8 | Control groups (shift+1–8 add) |
| Middle-drag / edge | Camera |
| Wheel | Zoom |
| S | Sell selected (50%) |
| G | Stop |
| R | Refuel (tanks) |
| Esc | Deselect / cancel build |
| F2 | Pause (spacebar also) |

## 4. Building Roster (mirrored per faction, real names)

| Building | Role | Notes |
|---|---|---|
| Construction Depot 建造厂 / 工兵営 | HQ + build queue | Win condition |
| Power Plant 発電廠 | Power source | |
| Ore Processor 鉱場加工 | MINE, tin income | Must sit on/adjacent to ore vein |
| Steel Mill 鋼鉄廠 | TIN→STEEL | Consumes 1 tin/s, outputs 1 steel/s |
| Fuel Depot / Oil Refinery 煉油廠 | FUEL income | Must sit on oil field; refills tanks |
| Barracks 兵営 / 駐屯地 | Infantry | |
| Tank Factory 戦車廠 | Armor | |
| Airfield 飛行場 | Aircraft | |
| Arsenal / Weapons Plant 軍械廠 | Buildable AA/AT guns | |
| Watchtower 警備塔 | Cheap static defense | |
| MG Bunker / 機槍堡 | Strong infantry defense | |
| Concrete Bunker 地下掩体 | Elite static, big HP | |
| Barbed Wire / 鉄条網 | Cheap blocker | |
| Upgrades Lab 研究所 | 3 tiers of unit upgrades | |

## 5. Unit Rosters — see spreadsheet for full stats

**China infantry:** Nationalist Rifleman, Heavy MG (M1910 Maxims), Grenadier
(M2/Australian grenades), 60 mm Mortar crew (the "RPG guy" equivalent of the era),
Engineer, Elite Rifleman (88th Division style).
**Japan infantry:** Imperial Rifleman (Type 3 38 rifle), Heavy Infantry
(Type 92 7.7 MG), Mortar crew (Type 92 70 mm), Scout/Soldier (fast, cheap), Engineer,
Elite (IJA Guards "Bushido" heavy soldiers).

**China armor:** VT-43 (1934 Vickers light — starter), Type 24 Heavy-ish light,
T-34/76 (Soviet aid), M3 Lee (Lend-Lease), M4 Sherman (Lend-Lease advanced),
T-28 (Soviet heavy, rare).
**Japan armor:** Type 95 Ha-Go (starter light), Type 97 Shinhoto (light),
Type 89 Chi-Ha (medium, the workhorse), Type 1 Chi-He (1943 medium),
Type 100 (93 Heavy, rare), 205 "Super Heavy" (1945 experimental, super-rare).

**Aircraft:**
China: I-16 (Fighting Yak), P-40 Tomahawk (Lend-Lease, iconic Flying Tigers),
P-38 Lightning (Lend-Lease, advanced).
Japan: Ki-27 (basic), **Mitsubishi A6M Zero** (iconic scout/fighter),
Ki-43 Hayabusa, Ki-84 Hayate (1944 advanced), Ki-61 Hiyori (rare heavy fighter).

**Buildable guns (via Arsenal):** 37 mm AT gun (both sides, different variants),
advanced 57 mm AT gun (China M2 caliber / Japan Type 1), 75 mm AA twin / 20mm flak
AA guns. Slow towed guns (speed 26, repositionable — not self-propelled),
strong vs their target class. The AI holds them in place as defensive
emplacements and does not attack-march them with the ground wave.

## 6. Tech Tree / Upgrades (lab, 3 tiers per side)

- T1: Infantry damage +15%, Armor HP +10%
- T2: Vehicle speed +10%, AA/AT damage +20%
- T3: Unlock elite units, all +10%

No per-unit research — global tiers (keeps UI C&C-like and easy to balance).

## 7. AI Opponent

State machine, escalating: maintain base defense → expand economy → train waves
weighted by its base composition and player strength (unit HP-sum comparison).
Aggression ramps with time: after ~4 min it mass-produces armor + air.

## 8. Art & Audio

- **V1 art: procedural placeholder sprites** drawn on offscreen canvases at boot
  (top-down, consistent style, faction-colored; health bars, names on select).
  Every sprite is generated from a data table, so swapping in real pixel art later
  is a one-file change: put PNGs in `art/sprites/<id>.png` (or one spritesheet
  `art/sprites.json`) and the loader auto-uses them instead of the generated art.
  Candidate sources for real art: OpenGameArt.org, Kenney (CC0), free "top down
  war" packs — to be sourced after the game is playable.
- **Audio:** WebAudio-generated SFX (build, fire, explosion, cash, error beep),
  mute key `M`.

## 9. Tech Architecture

Vanilla JS (no framework — must run by opening `index.html` or any static server),
ES modules, one canvas + DOM for UI.

```
war-of-the-east/
├── plan/GAME_PLAN.md, unit-economy spreadsheet.xlsx
└── game/
    ├── index.html
    ├── css/style.css
    ├── art/                  # drop-in real sprites (optional)
    └── js/
        ├── config.js         # ALL stats: units, buildings, economy (single source of truth)
        ├── rand.js           # seeded RNG + map gen
        ├── sprites.js        # procedural art generator + PNG override loader
        ├── engine.js         # game state, loop, command routing
        ├── entities.js       # Unit + Building classes, combat, capture, fuel
        ├── ai.js             # enemy state machine
        ├── ui.js             # top bar, build panels, minimap, selection, control groups
        ├── sfx.js            # WebAudio beeps
        └── main.js           # boot (faction select → game)
```

**Debug hooks** (for testing): `window.WOTE` — `startChinavJ()`, `give(res,n)`,
`autoBase()`, `unitCount()`, `stats` counters.

## 10. Production Phases

| Phase | Deliverable | Status |
|---|---|---|
| P0 | Game plan + full unit/economy spreadsheet | done (this dir) |
| P1 | Core engine: map, camera, select, move/attack, build, power, 3-resource economy, queues, sell | |
| P2 | Full content: all units/buildings, upgrades, lab, capture, fuel, AI | |
| P3 | Playtest, balance pass, SFX polish, README | |

## 11. Balance Baseline (see spreadsheet)

- Starting: 1000 tin, 250 steel, 200 fuel, 1 NCO, 1 power plant, 2 infantry.
- Power: NCO −10, power plant +80, ore processor −15, barracks −15,
  tank factory −25, airfield −40, steel mill −20, fuel depot −15, lab −20,
  defenses 0. Target: comfortable at 2 plants, "tight" with 1.
- Costs/times tuned so a basic infantry arrives in ~20 s, basic tank in ~60 s,
  aircraft in ~75 s; full base ~6–8 min; game length 12–20 min.
