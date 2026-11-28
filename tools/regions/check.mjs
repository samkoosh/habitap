// Checks a batch of region-ladder candidates.  node regions/check.mjs regions/batch-X.json
// Prints one line per species: OK/FAIL, tier, area, share of the area in its biggest piece, and problems.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea } from 'd3-geo';
const require = createRequire(import.meta.url);
const mapshaper = require('mapshaper');
const dir = new URL('.', import.meta.url).pathname;
const R = 6371;
const eco = JSON.parse(fs.readFileSync(dir + 'ecoregions.json', 'utf8')).features.filter(f => f.properties && f.geometry);
const byName = new Map(eco.map(f => [f.properties.ECO_NAME, f]));
const taken = fs.readFileSync(dir + 'taken.txt', 'utf8').split('\n').filter(Boolean).map(l => l.split(' | ').map(x => x.trim().toLowerCase()));
const others = fs.readdirSync(dir).filter(f => /^batch-.*\.json$/.test(f) && dir + f !== process.argv[2] && !process.argv[2].endsWith('/' + f))
  .flatMap(f => { try { return JSON.parse(fs.readFileSync(dir + f, 'utf8')).map(s => [String(s.common_name).toLowerCase(), String(s.scientific_name).toLowerCase(), f]) } catch { return [] } });
const PLACE = /\b(africa|african|asia|asian|europe|european|america|american|australia|australian|amazon|andes|andean|himalaya|sahara|arctic|antarctic|siberia|china|chinese|india|indian|japan|madagascar|congo|borneo|mexico|brazil|canada|alaska|island|islands|continent|tropic(al)?|equator|savanna|savannah|desert|rainforest|steppe|tundra|pacific|atlantic|mediterranean)\b/i;
const tierOf = a => a >= 1e6 ? 1 : a >= 1.1e5 ? 2 : a >= 2e4 ? 3 : a >= 2500 ? 4 : 5;
const rewind = g => { const ps = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return { type: 'MultiPolygon', coordinates: ps.map(p => geoArea({ type: 'Polygon', coordinates: [p[0]] }) > 2 * Math.PI ? p.map(r => r.slice().reverse()) : p) } };
const batch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ICONS = process.argv.includes('--icons'); // warm-up icons: looser split rule, must be big
let ok = 0; const tiers = {};
for (const s of batch) {
  const probs = [];
  for (const k of ['common_name', 'scientific_name', 'kind', 'wiki', 'place', 'why_here', 'fun_fact', 'clue']) if (!s[k]) probs.push('missing ' + k);
  const names = (s.eco && s.eco.names) || [];
  const missing = names.filter(n => !byName.has(n)); if (missing.length) probs.push('unknown ecoregion: ' + missing.join('; '));
  if (!names.length) probs.push('no eco.names');
  const cn = String(s.common_name).toLowerCase(), sn = String(s.scientific_name).toLowerCase();
  if (taken.some(([c, x]) => c === cn || x === sn)) probs.push('already in the game');
  const dup = others.find(([c, x]) => c === cn || x === sn); if (dup) probs.push('also in ' + dup[2]);
  if (s.clue && s.clue.length > 95) probs.push(`clue ${s.clue.length} chars (max 95)`);
  if (s.clue && PLACE.test(s.clue)) probs.push('clue names a place/biome: ' + s.clue.match(PLACE)[0]);
  if (s.clue && s.common_name && s.clue.toLowerCase().includes(String(s.common_name).toLowerCase())) probs.push('clue contains the name');
  let area = 0, share = 0;
  const feats = names.filter(n => byName.has(n)).map(n => byName.get(n));
  if (feats.length) {
    const out = await mapshaper.applyCommands('-i in.json -dissolve2 -o out.json format=geojson',
      { 'in.json': { type: 'FeatureCollection', features: feats.map(f => ({ type: 'Feature', properties: {}, geometry: f.geometry })) } });
    const fc = JSON.parse(out['out.json']); const gs = (fc.features ? fc.features.map(f => f.geometry) : fc.geometries || [fc]).filter(Boolean);
    const polys = gs.flatMap(g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => geoArea(rewind({ type: 'Polygon', coordinates: p })) * R * R);
    area = polys.reduce((a, b) => a + b, 0); share = area ? Math.max(...polys) / area : 0;
    const need = ICONS ? 0.6 : 0.85; if (share < need) probs.push(`split area: biggest piece is only ${Math.round(share * 100)}% (needs ≥${need * 100}%)`);
  }
  const t = tierOf(area); if (ICONS && area < 1e6) probs.push('icons need ≥1,000,000 km²'); if (t === 5) probs.push('too small for tiers 1–4 (<2,500 km²)');
  if (s.target_tier && s.target_tier !== t) probs.push(`note: lands in tier ${t}, not target ${s.target_tier}`);
  const hard = probs.filter(p => !p.startsWith('note:'));
  if (!hard.length) { ok++; tiers[t] = (tiers[t] || 0) + 1 }
  console.log(`${hard.length ? 'FAIL' : 'OK  '} T${t} ${String(Math.round(area / 1000) + 'k').padStart(6)} ${String(Math.round(share * 100) + '%').padStart(4)}  ${s.common_name}${probs.length ? '  — ' + probs.join(' | ') : ''}`);
}
console.log(`\n${ok}/${batch.length} pass. By tier: ${JSON.stringify(tiers)}`);
