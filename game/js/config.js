// WAR OF THE EAST — config.js
// SINGLE SOURCE OF TRUTH: all unit, building, economy and tuning stats.
// Edit here (and mirror in plan/workbook) before touching code.

export const TILE = 32;
export const MAP_W = 60;   // tiles
export const MAP_H = 60;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const RES = {
  TIN: "tin", STEEL: "steel", FUEL: "fuel"
};

export const START = {
  tin: 2200, steel: 250, fuel: 250,
  seed: 20260924
};

// Resource spawn tiers — SKIRMISH "starting funds", applied to BOTH factions.
export const RES_TIERS = {
  low:    { label: "LOW",    tin: 1100, steel: 125, fuel: 125 },
  medium: { label: "MEDIUM", tin: 2200, steel: 250, fuel: 250 },
  high:   { label: "HIGH",   tin: 3600, steel: 400, fuel: 400 },
  max:    { label: "MAX",    tin: 5000, steel: 600, fuel: 600 },
};

// AI difficulty (applied to every AI-faction in the match).
export const AI_DIFF = {
  easy:   { label: "EASY",   waveGap: 150, nextWave: 110, strength: 1.5,  resourceMult: 0.8,  incomeMult: 0.85, preResearch: [] },
  medium: { label: "MEDIUM", waveGap: 90,  nextWave: 60,  strength: 1.0,  resourceMult: 1.0,  incomeMult: 1.0,  preResearch: [] },
  hard:   { label: "HARD",   waveGap: 55,  nextWave: 40,  strength: 0.75, resourceMult: 1.6,  incomeMult: 1.25, preResearch: ["up1a", "up2a"] },
};

// Skirmish maps (seeded + reproducible).
export const MAPS = [
  { id: "m1937", name: "Marco Polo Bridge '37", w: 45, h: 45, seed: 20260924 },
  { id: "m1938", name: "Shandong Front '38",    w: 60, h: 60, seed: 19381115 },
  { id: "m1940", name: "Yangtze Delta '40",      w: 80, h: 60, seed: 19400720 },
  { id: "m1944", name: "Burma Road '44",         w: 70, h: 40, seed: 19440201 },
];

export const FACS = ["china", "japan"];

export const TUNE = {
  underpowerMult: 0.5,          // production speed when short on power
  sellRefund: 0.5,
  captureRate: 0.06,            // fraction of building max HP captured per second by 1 eng
  captureBuildingRate: 0.15,    // fraction of building max HP REPAIRED per second by 1 eng on own building
  repairRate: 15,               // hp/s per engineer on a friendly unit
  maxEngineersPerSide: 12,      // cap so AI can't flood the field with walking field hospitals
  fuelBurn: 0.15,               // fuel/s for a moving, loaded tank (scaled by fuel/max)
  fuelFullSpeedMult: 1.0,
  fuelEmptySpeedMult: 0.4,
  refuelRate: 25,               // fuel/s at own refinery / tank factory
  refuelRadius: 64,             // px — how close a tank must be to refill
  aiWaveInterval: 45,
  aiAggroMin: 4,
  maxUnitsPerSide: 120,
  zoomMin: 0.5, zoomMax: 2.0,
  basePower: 80,
  baseIncomeTin: 2,            // tin/s trickle so a bare base can keep expanding
};

// ---------- shared building templates (mirrored per faction) ----------
// placement: any | ore | oil | any_clear
export const BUILDINGS = {
  depot:    { name: "Construction Depot", jp: "工兵营", zh: "建造厂", cost: { tin: 400 }, time: 0,  hp: 2200, power: -10,
              slots: 3, produces: "building", w: 2, h: 2, desc: "HQ. Win condition — protect it / destroy theirs." },
  power:    { name: "Power Plant",        jp: "発電所", zh: "发电厂", cost: { tin: 300 }, time: 6,  hp: 400,  power: 80,
              slots: 0, produces: null, w: 1, h: 1, desc: "+80 power to the grid." },
  ore:      { name: "Ore Processor",      jp: "鉱石加工所", zh: "矿场", cost: { tin: 350 }, time: 6,  hp: 350,  power: -15,
              slots: 0, produces: null, w: 1, h: 1, income: { tin: 6 }, placement: "ore", desc: "+6 tin/s. Must sit on an ore vein." },
  steel:    { name: "Steel Mill",         jp: "製鉄所", zh: "钢厂", cost: { tin: 500 }, time: 8,  hp: 400,  power: -20,
              slots: 0, produces: null, w: 1, h: 1, steelMill: true, placement: "any_clear", desc: "Consumes 1 tin/s, outputs 1 steel/s." },
  fuel:     { name: "Fuel Depot",         jp: "油槽所", zh: "炼油厂", cost: { tin: 400 }, time: 7,  hp: 350,  power: -15,
              slots: 0, produces: null, w: 1, h: 1, income: { fuel: 2 }, placement: "oil", refuel: true, desc: "+2 fuel/s; tanks refill here. Must sit on an oil field." },
  barracks: { name: "Barracks",           jp: "駐屯地", zh: "兵营", cost: { tin: 450 }, time: 10, hp: 500,  power: -15,
              slots: 2, produces: "infantry", w: 2, h: 1, placement: "any_clear" },
  tankf:    { name: "Tank Factory",       jp: "戦車工場", zh: "战车厂", cost: { tin: 700 }, time: 15, hp: 650,  power: -25,
              slots: 1, produces: "armor", w: 2, h: 2, placement: "any_clear", refuel: true },
  airf:     { name: "Airfield",           jp: "飛行場",  zh: "机场", cost: { tin: 900 }, time: 20, hp: 700,  power: -40,
              slots: 1, produces: "air", w: 3, h: 2, placement: "any_clear" },
  arsenal:  { name: "Arsenal",            jp: "兵器廠",  zh: "军械厂", cost: { tin: 600 }, time: 14, hp: 600,  power: -20,
              slots: 1, produces: "guns", w: 1, h: 2, placement: "any_clear", desc: "Builds placeable AT/AA guns onto empty tiles." },
  lab:      { name: "Upgrades Lab",       jp: "研究施設", zh: "研究所", cost: { tin: 800 }, time: 20, hp: 550,  power: -20,
              slots: 0, produces: null, w: 2, h: 1, placement: "any_clear", desc: "Researches global upgrades." },
  watch:    { name: "Watchtower",         jp: "哨戒塔",  zh: "警备塔", cost: { tin: 150 }, time: 5,  hp: 300,  power: 0,
              slots: 0, produces: null, w: 1, h: 1, placement: "any_clear",
              weapon: { dmg: 8, rof: 1.2, range: 6, target: ["inf", "veh"] } },
  bunker:   { name: "MG Bunker",          jp: "機槍堡",  zh: "机枪堡", cost: { tin: 300 }, time: 8,  hp: 450,  power: 0,
              slots: 0, produces: null, w: 1, h: 1, placement: "any_clear",
              weapon: { dmg: 9, rof: 0.5, range: 6, target: ["inf", "veh"] } },
  concb:    { name: "Concrete Bunker",    jp: "混凝土掩体", zh: "地下掩体", cost: { tin: 600 }, time: 12, hp: 900, power: 0,
              slots: 0, produces: null, w: 2, h: 1, placement: "any_clear",
              weapon: { dmg: 11, rof: 0.8, range: 6.5, target: ["inf", "veh"] } },
  wire:     { name: "Barbed Wire",        jp: "鉄条網",  zh: "铁丝网", cost: { tin: 50 }, time: 3,  hp: 200,  power: 0,
              slots: 0, produces: null, w: 1, h: 1, placement: "any_clear", blocker: true, desc: "Slow, blocks movement." },
};

// ---------- China units ----------
const C = "china", J = "japan";
export const UNITS = {
  // ===== CHINA infantry =====
  c_inf:   { fac: C, class: "infantry", name: "Rifleman", jp: "步枪兵", cost: { tin: 90 },  hp: 55,  dmg: 9,   rof: 1.0, range: 5,   speed: 40, targets: ["inf","veh"], w: 0, h: 0 },
  c_heavy: { fac: C, class: "infantry", name: "Heavy MG (M1910)", jp: "重机枪手", cost: { tin: 160 }, hp: 45, dmg: 4,   rof: 0.35, range: 6, speed: 30, targets: ["inf","veh"] },
  c_gren:  { fac: C, class: "infantry", name: "Grenadier", jp: "掷弹兵", cost: { tin: 130 }, hp: 50,  dmg: 16,  rof: 1.4, range: 4,  speed: 40, targets: ["inf","veh"], splash: 1.2 },
  c_mort:  { fac: C, class: "infantry", name: "60mm Mortar Crew", jp: "迫击炮组", cost: { tin: 240, steel: 40 }, hp: 45, dmg: 30, rof: 2.0, range: 7, speed: 28, targets: ["inf","veh"], splash: 2.0 },
  c_eng:   { fac: C, class: "infantry", name: "Engineer", jp: "工兵", cost: { tin: 120 }, hp: 60,  dmg: 5,   rof: 1.6, range: 1,  speed: 45, targets: ["inf"], engineer: true },
  c_elite: { fac: C, class: "infantry", name: "Elite Rifleman (88th Div.)", jp: "精锐步兵", cost: { tin: 180 }, hp: 75, dmg: 13, rof: 0.8, range: 5, speed: 42, targets: ["inf","veh"], needsTier: 1 },
  // ===== CHINA armor =====
  c_vt43:  { fac: C, class: "tank", name: "VT-43 (Vickers 1934)", jp: "BT-43軽戦車", cost: { tin: 420, steel: 60 }, hp: 220, dmg: 16, rof: 1.2, range: 6,  speed: 55, fuel: 100, targets: ["inf","veh"], aa: 0.5, tier: 1 },
  c_t34:   { fac: C, class: "tank", name: "T-34/76 (Soviet aid)", jp: "T-34/76中戦車", cost: { tin: 650, steel: 120 }, hp: 320, dmg: 34, rof: 1.6, range: 6, speed: 62, fuel: 120, targets: ["inf","veh"], tier: 1 },
  c_m3lee: { fac: C, class: "tank", name: "M3 Lee (Lend-Lease)", jp: "M3リー中戦車", cost: { tin: 700, steel: 130 }, hp: 340, dmg: 30, rof: 1.4, range: 6.5, speed: 62, fuel: 130, targets: ["inf","veh"], aa: 1.0, tier: 2 },
  c_sherm: { fac: C, class: "tank", name: "M4 Sherman (Lend-Lease)", jp: "M4シャーマン", cost: { tin: 900, steel: 180 }, hp: 420, dmg: 44, rof: 1.5, range: 7,  speed: 60, fuel: 150, targets: ["inf","veh"], aa: 1.0, tier: 2 },
  c_t28:   { fac: C, class: "tank", name: "T-28 Heavy (Soviet)", jp: "T-28重戦車", cost: { tin: 1250, steel: 280 }, hp: 560, dmg: 62, rof: 2.0, range: 7, speed: 45, fuel: 170, targets: ["inf","veh"], tier: 3, rare: true },
  // CHINA guns (built by arsenal, static)
  c_at1:   { fac: C, class: "gun", name: "37mm AT Gun", jp: "37mm対戦車砲", cost: { tin: 300, steel: 40 }, hp: 120, dmg: 26, rof: 1.2, range: 7, speed: 0, targets: ["veh"], at: true, tier: 1, w: 1, h: 1 },
  c_at2:   { fac: C, class: "gun", name: "57mm AT Gun (M2 cal.)", jp: "57mm対戦車砲", cost: { tin: 550, steel: 100 }, hp: 150, dmg: 52, rof: 2.0, range: 8, speed: 0, targets: ["veh"], at: true, tier: 2, w: 1, h: 1 },
  c_aa:    { fac: C, class: "gun", name: "20mm AA (M2 cal.)", jp: "20mm高射砲", cost: { tin: 350, steel: 50 }, hp: 130, dmg: 18, rof: 0.5, range: 8, speed: 0, targets: ["air"], aa: 1.0, tier: 1, w: 1, h: 1 },
  // ===== CHINA air =====
  c_i16:   { fac: C, class: "air", name: "I-16 'Fighting Yak'", jp: "I-16", cost: { tin: 450 }, hp: 120, dmg: 16, rof: 1.0, range: 5, speed: 90, targets: ["inf","veh","air"], tier: 1 },
  c_p40:   { fac: C, class: "air", name: "P-40 Tomahawk (Tigers)", jp: "P-40 トマホーク", cost: { tin: 650 }, hp: 160, dmg: 26, rof: 1.1, range: 5, speed: 95, targets: ["inf","veh","air"], tier: 2 },
  c_p38:   { fac: C, class: "air", name: "P-38 Lightning", jp: "P-38 ライトニング", cost: { tin: 950 }, hp: 200, dmg: 34, rof: 1.2, range: 6, speed: 105, targets: ["inf","veh","air"], tier: 2, rare: true },
  // ===== JAPAN infantry =====
  j_inf:   { fac: J, class: "infantry", name: "Imperial Rifleman (Type 3 38)", jp: "歩兵(三年式)", cost: { tin: 85 }, hp: 52, dmg: 8.5, rof: 1.0, range: 5, speed: 40, targets: ["inf","veh"] },
  j_heavy: { fac: J, class: "infantry", name: "Heavy Infantry (Type 92)", jp: "重歩兵(九二式)", cost: { tin: 155 }, hp: 45, dmg: 4,  rof: 0.33, range: 6, speed: 30, targets: ["inf","veh"] },
  j_scout: { fac: J, class: "infantry", name: "Imperial Scout", jp: "偵察兵", cost: { tin: 70 }, hp: 30, dmg: 6, rof: 1.2, range: 5, speed: 60, targets: ["inf","veh"] },
  j_mort:  { fac: J, class: "infantry", name: "70mm Mortar Crew (Type 92)", jp: "迫撃砲班(九二式)", cost: { tin: 235, steel: 40 }, hp: 45, dmg: 29, rof: 2.0, range: 7, speed: 28, targets: ["inf","veh"], splash: 2.0 },
  j_eng:   { fac: J, class: "infantry", name: "Engineer", jp: "工兵", cost: { tin: 115 }, hp: 60, dmg: 5, rof: 1.6, range: 1, speed: 45, targets: ["inf"], engineer: true },
  j_elite: { fac: J, class: "infantry", name: "'Bushido' Heavy Infantry", jp: "武士重歩兵", cost: { tin: 185 }, hp: 90, dmg: 12, rof: 0.9, range: 5, speed: 40, targets: ["inf","veh"], needsTier: 1 },
  // ===== JAPAN armor =====
  j_hago:  { fac: J, class: "tank", name: "Type 95 Ha-Go", jp: "九五式軽戦車", cost: { tin: 380, steel: 60 }, hp: 190, dmg: 14, rof: 1.1, range: 6, speed: 58, fuel: 100, targets: ["inf","veh"], aa: 0.5, tier: 1 },
  j_shin:  { fac: J, class: "tank", name: "Type 97 Shinhoto", jp: "九七式中戦車", cost: { tin: 480, steel: 90 }, hp: 250, dmg: 20, rof: 1.3, range: 5.5, speed: 52, fuel: 110, targets: ["inf","veh"], tier: 1 },
  j_chiha: { fac: J, class: "tank", name: "Type 89 Chi-Ha", jp: "八九式中戦車", cost: { tin: 720, steel: 130 }, hp: 330, dmg: 33, rof: 1.5, range: 6.5, speed: 58, fuel: 130, targets: ["inf","veh"], aa: 1.0, tier: 2 },
  j_chihe: { fac: J, class: "tank", name: "Type 1 Chi-He", jp: "一号中戦車", cost: { tin: 880, steel: 170 }, hp: 400, dmg: 42, rof: 1.4, range: 7, speed: 56, fuel: 140, targets: ["inf","veh"], aa: 1.0, tier: 2 },
  j_hv100: { fac: J, class: "tank", name: "Type 100 (93) Heavy", jp: "九三式重戦車", cost: { tin: 1250, steel: 280 }, hp: 560, dmg: 60, rof: 2.0, range: 7, speed: 44, fuel: 170, targets: ["inf","veh"], tier: 3, rare: true },
  j_205:   { fac: J, class: "tank", name: "Type 205 'Super Heavy'", jp: "二号百式超重戦車", cost: { tin: 1800, steel: 450 }, hp: 900, dmg: 85, rof: 2.4, range: 7.5, speed: 30, fuel: 220, targets: ["inf","veh"], tier: 3, rare: true },
  // JAPAN guns
  j_at1:   { fac: J, class: "gun", name: "37mm AT Gun", jp: "一式37mm対戦車砲", cost: { tin: 300, steel: 40 }, hp: 120, dmg: 26, rof: 1.2, range: 7, speed: 0, targets: ["veh"], at: true, tier: 1, w: 1, h: 1 },
  j_at2:   { fac: J, class: "gun", name: "75mm AT Gun (Type 1)", jp: "一式75mm対戦車砲", cost: { tin: 550, steel: 100 }, hp: 150, dmg: 52, rof: 2.0, range: 8, speed: 0, targets: ["veh"], at: true, tier: 2, w: 1, h: 1 },
  j_aa:    { fac: J, class: "gun", name: "20mm AA (Type 98)", jp: "九八式20mm高射砲", cost: { tin: 350, steel: 50 }, hp: 130, dmg: 18, rof: 0.5, range: 8, speed: 0, targets: ["air"], aa: 1.0, tier: 1, w: 1, h: 1 },
  // ===== JAPAN air =====
  j_ki27:  { fac: J, class: "air", name: "Ki-27 'Nate'", jp: "キ27", cost: { tin: 430 }, hp: 110, dmg: 15, rof: 1.0, range: 5, speed: 92, targets: ["inf","veh","air"], tier: 1 },
  j_zero:  { fac: J, class: "air", name: "Mitsubishi A6M 'Zero'", jp: "零式艦上戦闘機", cost: { tin: 680 }, hp: 150, dmg: 24, rof: 1.0, range: 5, speed: 105, targets: ["inf","veh","air"], tier: 2 },
  j_ki43:  { fac: J, class: "air", name: "Ki-43 'Hayabusa'", jp: "キ43 疾風", cost: { tin: 750 }, hp: 175, dmg: 28, rof: 1.1, range: 5, speed: 100, targets: ["inf","veh","air"], tier: 2 },
  j_ki84:  { fac: J, class: "air", name: "Ki-84 'Hayate'", jp: "キ84 疾風", cost: { tin: 980 }, hp: 210, dmg: 36, rof: 1.2, range: 6, speed: 102, targets: ["inf","veh","air"], tier: 2, rare: true },
  j_ki61:  { fac: J, class: "air", name: "Ki-61 'Hiyori' (rare)", jp: "キ61 日向", cost: { tin: 1250 }, hp: 240, dmg: 46, rof: 1.3, range: 6, speed: 110, targets: ["inf","veh","air"], tier: 3, rare: true },
};

export const U = UNITS; // alias

// which unit ids a given producer can build (class match + faction)
export function producible(fac, produceClass) {
  return Object.values(UNITS).filter(u => u.fac === fac &&
    ((produceClass === "infantry"  && u.class === "infantry") ||
     (produceClass === "armor"     && u.class === "tank") ||
     (produceClass === "guns"      && u.class === "gun") ||
     (produceClass === "air"       && u.class === "air")));
}
export function buildingProducible(fac) {
  return Object.values(BUILDINGS).map(b => b);
}

// Global upgrades (per side, tiered)
export const UPGRADES = [
  { tier: 1, id: "up1a", name: "Infantry Training",   effect: { infDmg: 1.15 },            cost: 600, time: 60 },
  { tier: 1, id: "up1b", name: "Hull Hardening",      effect: { armorHp: 1.10 },           cost: 600, time: 60 },
  { tier: 2, id: "up2a", name: "Engine Upgrades",     effect: { speed: 1.10 },             cost: 650, time: 75 },
  { tier: 2, id: "up2b", name: "AT/AA Calibration",   effect: { atDmg: 1.20 },             cost: 650, time: 75 },
  { tier: 3, id: "up3a", name: "Elite Offensive",     effect: { dmg: 1.10 },               cost: 750, time: 90 },
  { tier: 3, id: "up3b", name: "Super-Heavy Program", effect: { unlock205: true },         cost: 750, time: 90 },
];

// inject stable ids onto every object entry (so code can compare by id)
(function attachIds() {
  for (const [key, o] of Object.entries(BUILDINGS)) o.id = key;
  for (const [key, o] of Object.entries(UNITS)) o.id = key;
})();

export const FACTION_META = {
  china: { nameEN: "CHINA", label: "CHINA — Republic of China", color: "#3f7a3f", dark: "#2c5a2c", accent: "#c9a227" },
  japan: { nameEN: "JAPAN", label: "JAPAN — Empire of Japan",  color: "#5a5f4a", dark: "#3c4032", accent: "#b8452f" },
};
