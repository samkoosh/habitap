// Builds regions.json for the HabiTap region ladder.
// Source: RESOLVE Ecoregions 2017 (Dinerstein et al. 2017, BioScience, doi:10.1093/biosci/bix014), CC BY 4.0.
// Usage: node regions/build.mjs <species.json> <out.json>
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea, geoContains, geoCircle } from 'd3-geo';
const require = createRequire(import.meta.url);
const mapshaper = require('mapshaper');
const dir = new URL('.', import.meta.url).pathname;
const [, , spPath, outPath] = process.argv;
const R = 6371;
const eco = JSON.parse(fs.readFileSync(dir + 'ecoregions.json', 'utf8')).features.filter(f => f.properties && f.geometry);
const fresh = JSON.parse(fs.readFileSync(dir + 'new-species.json', 'utf8'))
  .concat(...fs.readdirSync(dir).filter(f => /^batch-.*\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(dir + f, 'utf8'))));
{ const seen = new Set(); for (const s of fresh) { const k = s.scientific_name.toLowerCase(); if (seen.has(k)) throw new Error('duplicate ' + s.scientific_name); seen.add(k); } }
const old = JSON.parse(fs.readFileSync(spPath, 'utf8'));

const km2 = g => Math.round(geoArea(g) * R * R);
const round = c => typeof c[0] === 'number' ? [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100] : c.map(round);
// d3 wants each polygon's outer ring wound so its area is the small side of the sphere.
function rewind(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out = polys.map(p => {
    const outer = { type: 'Polygon', coordinates: [p[0]] };
    const ring0 = geoArea(outer) > 2 * Math.PI ? p[0].slice().reverse() : p[0];
    const holes = p.slice(1).map(h => geoArea({ type: 'Polygon', coordinates: [h] }) > 2 * Math.PI ? h : h.slice().reverse());
    return [ring0, ...holes];
  });
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}
const centroidIn = (f, bb) => {
  // rough bbox test on the first ring's mean point
  const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
  const x = ring.reduce((a, c) => a + c[0], 0) / ring.length, y = ring.reduce((a, c) => a + c[1], 0) / ring.length;
  return x >= bb[0] && y >= bb[1] && x <= bb[2] && y <= bb[3];
};

const fixed = f => rewind(f.geometry);
async function shape(features, pct, rawKm2, loose) {
  const isl = Math.max(30, Math.round(rawKm2 * (loose ? 0.0008 : 0.004))), sliv = Math.max(10, Math.round(rawKm2 * 0.001));
  const input = { 'in.json': { type: 'FeatureCollection', features: features.map(f => ({ type: 'Feature', properties: {}, geometry: f.geometry })) } };
  const out = await mapshaper.applyCommands(
    `-i in.json -dissolve2 -simplify ${pct}% keep-shapes -filter-slivers min-area=${sliv}km2 -filter-islands min-area=${isl}km2 remove-empty -o out.json format=geojson precision=0.01`, input);
  const fc = JSON.parse(out['out.json']);
  const geoms = (fc.features ? fc.features.map(f => f.geometry) : fc.geometries || [fc]).filter(Boolean);
  const polys = geoms.flatMap(g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  return rewind({ type: 'MultiPolygon', coordinates: polys });
}
const size = g => JSON.stringify(g).length;
async function fit(feats, loose) {
  const raw = feats.reduce((a, f) => a + km2(fixed(f)), 0);
  const max = loose ? 7000 : 3500;
  let pct = 40, g = await shape(feats, pct, raw, loose);
  while (size(g) > max && pct > 0.3) { pct /= 1.5; g = await shape(feats, pct, raw, loose); }
  return g;
}
const pickFields = s => ({ common_name: s.common_name, scientific_name: s.scientific_name, kind: s.kind, wiki: s.wiki, place: s.place,
  why_here: s.why_here, fun_fact: s.fun_fact, clue: s.clue, ...(s.pic ? { pic: s.pic } : {}), ...(s.famous ? { famous: true } : {}) });

const rows = [];
for (const s of fresh) {
  const feats = s.eco.names ? eco.filter(f => s.eco.names.includes(f.properties.ECO_NAME))
    : eco.filter(f => f.properties.REALM === s.eco.realm && centroidIn(f, s.eco.bbox));
  const g = await fit(feats, s.famous && feats.length > 1);
  rows.push({ ...pickFields(s), shape: g, area_km2: km2(g), src: 'eco', eco: feats.map(f => f.properties.ECO_NAME) });
}

// Species from the main list. If the spot sits in a small, well-defined ecoregion (3k–40k km²) that
// honestly describes the range (islands, single ranges), use it; otherwise a 25 km circle around the spot.
const NOT_ECO = new Set([5, 168, 192, 202, 242, 246, 174, 186]); // marmot, creek salmon, lake trout, butterfly, wallaby, lake fish, langur, Komodo
const ecoFixed = eco.map(f => ({ f, g: fixed(f) })).map(x => ({ ...x, a: km2(x.g) }));
for (const [i, s] of old.entries()) {
  const pt = [s.lon, s.lat];
  const hit = NOT_ECO.has(i) ? null : ecoFixed.find(x => geoContains(x.g, pt));
  if (hit && hit.a >= 3000 && hit.a <= 40000) {
    const g = await fit([hit.f]);
    if (geoContains(g, pt)) { rows.push({ ...pickFields(s), shape: g, area_km2: km2(g), src: 'eco', eco: [hit.f.properties.ECO_NAME], idx: i, lat: s.lat, lon: s.lon }); continue; }
  }
  rows.push({ ...pickFields(s), circle: [s.lon, s.lat, 25], area_km2: Math.round(Math.PI * 25 * 25), src: 'point', idx: i, lat: s.lat, lon: s.lon });
}
// Tiers by area, biggest first.
const tierOf = a => a >= 1e6 ? 1 : a >= 1.1e5 ? 2 : a >= 2e4 ? 3 : a >= 2500 ? 4 : 5;
rows.forEach(r => r.tier = tierOf(r.area_km2));
// Household names that already sit in the pool; with the icons batch they make up the round 1 warm-up.
const FAMOUS = new Set(['Emu', 'Fennec fox', 'Koala', 'Meerkat', 'Red kangaroo', 'Laughing kookaburra', 'Indian peafowl', 'American bison',
  'American alligator', 'Greater roadrunner', 'Toco toucan', 'Canada lynx', 'Amazon river dolphin', 'Frilled lizard', 'Black-tailed prairie dog',
  'Sugar maple', 'Grey parrot', 'Springbok', 'Wild yak', 'Central bearded dragon']);
rows.forEach(r => { if (FAMOUS.has(r.common_name)) r.famous = true; });
// Rounds: 1 warm-up (famous, area ≥1M km²), 2 other huge and big areas, 3 medium, 4 small, 5 tiny.
rows.forEach(r => r.round = r.famous && r.area_km2 >= 1e6 ? 1 : r.tier <= 2 ? 2 : r.tier);
for (const r of rows) if (r.shape && geoArea(r.shape) > 2 * Math.PI) throw new Error('bad winding ' + r.common_name);
fs.writeFileSync(outPath, JSON.stringify(rows) + '\n');
const by = {}; rows.forEach(r => (by[r.round] = by[r.round] || []).push(r));
for (const t of Object.keys(by)) console.log('Round ' + t, by[t].length);
console.log('bytes', fs.statSync(outPath).size);
