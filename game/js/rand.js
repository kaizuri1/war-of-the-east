// WAR OF THE EAST — rand.js
// Seeded RNG + procedural map generation.

// mulberry32
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// terrain codes
export const T = {
  GRASS: 0, ORE: 1, OIL: 2, ROCK: 3, TREE: 4, ROAD: 5,
};

export function generateMap({ w, h, seed }) {
  const rng = makeRng(seed);
  const tiles = new Uint8Array(w * h);       // terrain
  const rocks = new Set();                   // solid tile coords "x,y"
  const trees = new Set();
  const oreSpots = new Set();
  const oilSpots = new Set();
  const key = (x, y) => x + "," + y;

  // value-noise-ish clumps
  const blobs = [];
  const nBlobs = 14;
  for (let i = 0; i < nBlobs; i++) {
    blobs.push({
      x: 4 + rng() * (w - 8),
      y: 4 + rng() * (h - 8),
      r: 2.5 + rng() * 5.5,
      kind: ["rock", "tree", "ore", "ore", "oil"][Math.floor(rng() * 5)],
    });
  }
  // force ore + oil near each corner (bases need them adjacent)
  const corners = [
    { x: 3, y: 3, tag: "NW" }, { x: w - 4, y: h - 4, tag: "SE" },
    { x: w - 4, y: 3, tag: "NE" }, { x: 3, y: h - 4, tag: "SW" },
  ];
  for (const c of corners) {
    for (let k = 0; k < 3; k++) {
      const dx = Math.round((rng() - 0.5) * 6), dy = Math.round((rng() - 0.5) * 6);
      const x = Math.min(w - 2, Math.max(1, c.x + dx));
      const y = Math.min(h - 2, Math.max(1, c.y + dy));
      oreSpots.add(key(x, y));
    }
    for (let k = 0; k < 2; k++) {
      const dx = Math.round((rng() - 0.5) * 6), dy = Math.round((rng() - 0.5) * 6);
      const x = Math.min(w - 2, Math.max(1, c.x + dx));
      const y = Math.min(h - 2, Math.max(1, c.y + dy));
      oilSpots.add(key(x, y));
    }
  }
  // blobs scatter
  for (const b of blobs) {
    const n = Math.floor(b.r * b.r * 0.8);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * b.r;
      const x = Math.round(b.x + Math.cos(a) * rr);
      const y = Math.round(b.y + Math.sin(a) * rr);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const k = key(x, y);
      if (b.kind === "rock") { rocks.add(k); tiles[y * w + x] = T.ROCK; }
      else if (b.kind === "tree") { trees.add(k); tiles[y * w + x] = T.TREE; }
      else if (b.kind === "ore") { oreSpots.add(k); tiles[y * w + x] = T.ORE; }
      else if (b.kind === "oil") { oilSpots.add(k); tiles[y * w + x] = T.OIL; }
    }
  }
  // scatter a few lone rocks/trees
  for (let i = 0; i < 60; i++) {
    const x = 1 + Math.floor(rng() * (w - 2));
    const y = 1 + Math.floor(rng() * (h - 2));
    const k = key(x, y);
    if (rocks.has(k) || trees.has(k) || oreSpots.has(k) || oilSpots.has(k)) continue;
    if (rng() < 0.5) { trees.add(k); tiles[y * w + x] = T.TREE; }
    else { rocks.add(k); tiles[y * w + x] = T.ROCK; }
  }
  // clear base corners (2x2 + margin)
  for (const c of corners) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = key(x, y);
      if (dx === 0 && dy === 0) continue;
      if (rocks.has(k)) { rocks.delete(k); tiles[y * w + x] = T.GRASS; }
      if (trees.has(k)) { trees.delete(k); tiles[y * w + x] = T.GRASS; }
    }
  }

  return {
    w, h, tiles, rocks, trees, oreSpots, oilSpots, key,
    solid(x, y) { return (x < 0 || y < 0 || x >= w || y >= h) || rocks.has(x + "," + y); },
    buildable(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const k = x + "," + y;
      return !rocks.has(k) && !trees.has(k);
    },
    hasOre(x, y) { return oreSpots.has(x + "," + y); },
    hasOil(x, y) { return oilSpots.has(x + "," + y); },
    clearTile(x, y) {
      // player demolishing trees/rocks (cheap utility for build flow)
      const k = x + "," + y;
      if (rocks.has(k)) { rocks.delete(k); tiles[y * w + x] = T.GRASS; return true; }
      if (trees.has(k)) { trees.delete(k); tiles[y * w + x] = T.GRASS; return true; }
      return false;
    },
  };
}
