/* Runs the Worker in Node with a fake KV store and a fake Wikipedia, and checks:
   - it picks the same five species per day as the browser game (which uses d3.geoDistance)
   - /day never leaks coordinates, places, facts or wiki titles, and shows names in full
   - future days are refused, /guess scores like the game, /practice only uses finished days
   Run: node test/api.test.mjs  (from api-worker/) */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import worker, { pick, km, scoreFor, EPOCH, latestDay, finishedBefore } from '../src/index.js';

const here = new URL('.', import.meta.url).pathname;
const SP = JSON.parse(readFileSync(here + '../../species.json', 'utf8'));
const d3 = createRequire(import.meta.url)(here + '../../d3.min.js');

// the browser's original picker, verbatim apart from using d3 directly
function rngB(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const kmB=(a,b)=>d3.geoDistance([a[1],a[0]],[b[1],b[0]])*6371;
function pickB(seed){const r=rngB(seed),idx=SP.map((_,i)=>i);for(let i=idx.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]]}
  const out=[],reg={};for(const i of idx){const s=SP[i];if((reg[s.region]||0)>=2)continue;if(out.some(j=>kmB([SP[j].lat,SP[j].lon],[s.lat,s.lon])<500))continue;out.push(i);reg[s.region]=(reg[s.region]||0)+1;if(out.length===5)break}return out}

let pass = 0; const ok = (name) => { pass++; console.log('  ✓ ' + name); };

// 1. identical picks for 3 years of days
for (let d = EPOCH - 30; d < EPOCH + 1100; d++) assert.deepEqual(pick(SP, d), pickB(d), 'day ' + d);
ok('same daily picks as the browser for 1,130 days');
for (let n = 0; n < 2000; n++) { const a = SP[n % SP.length], b = SP[(n * 7 + 3) % SP.length]; assert.ok(Math.abs(km([a.lat, a.lon], [b.lat, b.lon]) - kmB([a.lat, a.lon], [b.lat, b.lon])) < 1e-9); }
ok('distance maths matches d3.geoDistance');

// fake environment
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes('en.wikipedia.org')) return new Response(JSON.stringify({ query: { pages: [{ pageimage: 'Secret_place_photo.jpg', thumbnail: { source: 'https://upload.wikimedia.org/x/Secret_place_photo.jpg' } }] } }));
  if (u.includes('commons.wikimedia.org')) return new Response(JSON.stringify({ query: { pages: [{ imageinfo: [{ extmetadata: { Artist: { value: '<a href="#">Jane Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } } }] }] } }));
  if (u.includes('upload.wikimedia.org')) return new Response('JPEGDATA', { headers: { 'content-type': 'image/jpeg' } });
  throw new Error('unexpected fetch ' + u);
};
const env = { HABITAP: { get: async () => SP }, ALLOW_ORIGIN: 'https://playhabitap.com' };
const ctx = { waitUntil() {} };
const call = (path, init) => worker.fetch(new Request('https://api.test' + path, { headers: { origin: 'https://playhabitap.com' }, ...init }), env, ctx);
const today = Math.floor(Date.now() / 864e5);

// 2. /day hides answers
{
  const r = await call('/day?d=' + today); assert.equal(r.status, 200);
  const body = await r.json(), txt = JSON.stringify(body);
  assert.equal(body.items.length, 5);
  for (const i of pick(SP, today)) {
    const s = SP[i];
    const shown = (s.display + ' ' + s.sci_display).replace(/\[\[(.+?)\]\]/g, '$1').replace(/_/g, ' ');
    for (const secret of [s.place, s.why_here, s.fun_fact, s.wiki, String(s.lat), String(s.lon)]) if (!shown.includes(secret.replace(/_/g, ' '))) assert.ok(!txt.includes(secret), 'leaked: ' + secret);
    assert.ok(txt.includes(JSON.stringify(s.display.replace(/\[\[(.+?)\]\]/g, '$1'))), 'full name missing: ' + s.display);
  }
  assert.ok(!txt.includes('Secret_place_photo'), 'photo file name leaked');
  assert.equal(body.items[0].photo.src, `https://api.test/img/${today}/0`);
  assert.equal(body.items[0].photo.artist, 'Jane Doe');
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://playhabitap.com');
  ok('/day returns 5 species with full names and no coordinates, places, facts or file names');
}

// 3. future days refused, launch boundary respected
assert.equal((await call('/day?d=' + (latestDay() + 1))).status, 404);
assert.equal((await call('/day?d=' + (EPOCH - 1))).status, 404);
assert.equal((await call('/day?d=abc')).status, 404);
assert.equal((await call('/day?d=' + latestDay())).status, 200);
ok('future and pre-launch days are refused');

// 4. /guess scores exactly like the game
{
  const s = SP[pick(SP, today)[2]];
  let r = await call('/guess', { method: 'POST', body: JSON.stringify({ d: today, i: 2, lat: s.lat, lon: s.lon, hint: false }) });
  let b = await r.json(); assert.equal(b.score, 100); assert.equal(b.sp.place, s.place); assert.ok(b.sp.photoPage.includes('commons'));
  r = await call('/guess', { method: 'POST', body: JSON.stringify({ d: today, i: 2, lat: s.lat + 10, lon: s.lon, hint: true }) });
  b = await r.json(); assert.equal(b.score, Math.max(0, scoreFor(kmB([s.lat + 10, s.lon], [s.lat, s.lon])) - 20));
  assert.equal((await call('/guess', { method: 'POST', body: JSON.stringify({ d: latestDay() + 2, i: 0, lat: 0, lon: 0 }) })).status, 400);
  assert.equal((await call('/guess', { method: 'POST', body: JSON.stringify({ d: today, i: 7, lat: 0, lon: 0 }) })).status, 400);
  assert.equal((await call('/guess', { method: 'POST', body: '{nope' })).status, 400);
  ok('/guess scores like the game (hint penalty included) and rejects bad input');
}

// 5. /practice only uses days that are over everywhere
{
  const r = await call('/practice');
  if (finishedBefore() - 1 < EPOCH) assert.equal(r.status, 404);
  else for (let n = 0; n < 20; n++) { const b = await (await call('/practice')).json(); assert.ok(b.day >= EPOCH && b.day < finishedBefore()); }
  ok('/practice only serves finished days');
}

// 6. image proxy + CORS preflight
{
  const r = await call(`/img/${today}/1`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg'); assert.equal(await r.text(), 'JPEGDATA');
  assert.equal((await call(`/img/${latestDay() + 3}/1`)).status, 404);
  const p = await call('/day', { method: 'OPTIONS' }); assert.equal(p.status, 204);
  ok('photo proxy works and preflight answers');
}
console.log(`\n${pass} checks passed`);
