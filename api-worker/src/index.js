/* Habitap daily puzzle API (Cloudflare Worker)

   Keeps the species list and every answer on the server:
   GET  /day?d=<dayNumber>  today's five species, with place names masked and no coordinates
   GET  /practice           five species from a random day that's already over everywhere
   POST /guess              {d, i, lat, lon, hint} → score, distance and the full answer
   GET  /img/<d>/<i>        the species photo, proxied so its file name can't give the answer away

   A "day number" is days since 1970-01-01 for the player's local date, the same number the game
   already uses. The server accepts any day from launch up to the latest date anywhere on Earth
   (UTC+14), so future puzzles can't be fetched early.

   Data: the species list lives in the KV namespace bound as HABITAP, under the key "species"
   (same format as species.json). See README.md for setup. */

const DAY = 864e5;
export const EPOCH = Math.floor(Date.UTC(2026, 10, 26) / DAY); // puzzle #1
const PHOTO_TTL = 7 * 86400;
const UA = 'HabitapGame/1.0 (daily geography game; photo credits via Wikimedia Commons)';

/* ---------- same picking and scoring as the game ---------- */
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const RAD = Math.PI / 180;
/* identical maths to d3.geoDistance, so picks match the browser version exactly */
export function km(a, b) {
  const l0 = a[1] * RAD, p0 = a[0] * RAD, l1 = b[1] * RAD, p1 = b[0] * RAD;
  const sp0 = Math.sin(p0), cp0 = Math.cos(p0), sp1 = Math.sin(p1), cp1 = Math.cos(p1);
  const dl = Math.abs(l1 - l0), cd = Math.cos(dl), sd = Math.sin(dl);
  const x = cp1 * sd, y = cp0 * sp1 - sp0 * cp1 * cd, z = sp0 * sp1 + cp0 * cp1 * cd;
  return Math.atan2(Math.sqrt(x * x + y * y), z) * 6371;
}
export function pick(SP, seed) {
  const r = rng(seed), idx = SP.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const out = [], reg = {};
  for (const i of idx) {
    const s = SP[i];
    if ((reg[s.region] || 0) >= 2) continue;
    if (out.some(j => km([SP[j].lat, SP[j].lon], [s.lat, s.lon]) < 500)) continue;
    out.push(i); reg[s.region] = (reg[s.region] || 0) + 1;
    if (out.length === 5) break;
  }
  return out;
}
export const scoreFor = d => d <= 10 ? 100 : Math.round(100 * Math.exp(-(d - 10) / 5150));
/* keep the blurred words' shape but not their letters */
export const mask = t => String(t || '').replace(/\[\[(.+?)\]\]/g, (_, w) => '[[' + w.replace(/\S/g, 'x') + ']]');

/* ---------- day window ---------- */
export const latestDay = (now = Date.now()) => Math.floor((now + 14 * 3600e3) / DAY);     // newest local date on Earth
export const finishedBefore = (now = Date.now()) => Math.floor((now - 12 * 3600e3) / DAY); // days below this are over everywhere
const dayOk = (d, now) => Number.isInteger(d) && d >= EPOCH && d <= latestDay(now);

/* ---------- data ---------- */
let memo = null, memoAt = 0;
async function species(env) {
  if (memo && Date.now() - memoAt < 300e3) return memo;
  const raw = await env.HABITAP.get('species', 'json');
  if (!Array.isArray(raw) || !raw.length) throw new Error('species list missing from KV');
  memo = raw; memoAt = Date.now(); return memo;
}

async function photoInfo(wiki, ctx) {
  const key = new Request('https://habitap.internal/photo/' + encodeURIComponent(wiki));
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) { const hit = await cache.match(key); if (hit) return hit.json(); }
  let info = null;
  try {
    const title = decodeURIComponent(wiki).replace(/_/g, ' ');
    const u = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=900&pilicense=free&titles=' + encodeURIComponent(title);
    const j = await fetch(u, { headers: { 'user-agent': UA } }).then(r => r.json());
    const pg = j.query && j.query.pages && j.query.pages[0];
    if (pg && pg.thumbnail) {
      info = { thumb: pg.thumbnail.source, page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(pg.pageimage), artist: '', license: '', licUrl: '' };
      try {
        const c = await fetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata&titles=' + encodeURIComponent('File:' + pg.pageimage), { headers: { 'user-agent': UA } }).then(r => r.json());
        const m = c.query.pages[0].imageinfo[0].extmetadata;
        info.artist = strip(m.Artist && m.Artist.value).slice(0, 120);
        info.license = (m.LicenseShortName && m.LicenseShortName.value) || '';
        info.licUrl = (m.LicenseUrl && m.LicenseUrl.value) || '';
      } catch (e) { /* credit falls back to "Unknown author" */ }
    }
  } catch (e) { return null; } // don't cache failures
  if (cache) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(info), { headers: { 'cache-control': `max-age=${PHOTO_TTL}` } })));
  return info;
}
const strip = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

async function dayPack(env, ctx, d, origin) {
  const SP = await species(env);
  const items = await Promise.all(pick(SP, d).map(async (i, n) => {
    const s = SP[i], ph = await photoInfo(s.wiki, ctx);
    return {
      kind: s.kind, region: s.region, display: mask(s.display), sci_display: mask(s.sci_display),
      photo: ph ? { src: `${origin}/img/${d}/${n}`, artist: ph.artist, license: ph.license, licUrl: ph.licUrl } : null,
    };
  }));
  return { day: d, items };
}

/* ---------- http ---------- */
function cors(req, env) {
  const allow = (env.ALLOW_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const ok = allow.includes('*') ? '*' : allow.includes(origin) ? origin : allow[0];
  return { 'access-control-allow-origin': ok, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' };
}
const json = (body, status, h, cacheSecs = 0) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheSecs ? `public, max-age=${cacheSecs}` : 'no-store', ...h },
});

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), h = cors(req, env), now = Date.now();
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    try {
      if (req.method === 'GET' && url.pathname === '/') return json({ ok: true, utcDay: Math.floor(now / DAY) }, 200, h);

      if (req.method === 'GET' && url.pathname === '/day') {
        const d = Number(url.searchParams.get('d'));
        if (!dayOk(d, now)) return json({ error: 'That day isn’t available.' }, 404, h);
        const over = d < finishedBefore(now);
        const cache = typeof caches !== 'undefined' ? caches.default : null;
        const key = new Request(`${url.origin}/day?d=${d}`);
        if (cache) { const hit = await cache.match(key); if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...h } }); }
        const res = json(await dayPack(env, ctx, d, url.origin), 200, h, over ? 86400 : 600);
        if (cache) ctx.waitUntil(cache.put(key, res.clone()));
        return res;
      }

      if (req.method === 'GET' && url.pathname === '/practice') {
        const last = finishedBefore(now) - 1;
        if (last < EPOCH) return json({ error: 'No finished dailies to practise on yet.' }, 404, h);
        const d = EPOCH + Math.floor(Math.random() * (last - EPOCH + 1));
        return json(await dayPack(env, ctx, d, url.origin), 200, h);
      }

      if (req.method === 'POST' && url.pathname === '/guess') {
        let b; try { b = await req.json(); } catch (e) { return json({ error: 'Bad request' }, 400, h); }
        const d = Number(b.d), i = Number(b.i), lat = Number(b.lat), lon = Number(b.lon);
        if (!dayOk(d, now) || !Number.isInteger(i) || i < 0 || i > 4 || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return json({ error: 'Bad guess' }, 400, h);
        const SP = await species(env), s = SP[pick(SP, d)[i]];
        const dist = km([lat, lon], [s.lat, s.lon]);
        let score = scoreFor(dist); if (b.hint) score = Math.max(0, score - 20);
        const ph = await photoInfo(s.wiki, ctx);
        return json({
          sp: { common_name: s.common_name, scientific_name: s.scientific_name, place: s.place, lat: s.lat, lon: s.lon, why_here: s.why_here, fun_fact: s.fun_fact, wiki: s.wiki, photoPage: ph ? ph.page : null },
          km: dist, score,
        }, 200, h);
      }

      const m = req.method === 'GET' && url.pathname.match(/^\/img\/(\d+)\/([0-4])$/);
      if (m) {
        const d = Number(m[1]), i = Number(m[2]);
        if (!dayOk(d, now)) return new Response('Not found', { status: 404, headers: h });
        const SP = await species(env), ph = await photoInfo(SP[pick(SP, d)[i]].wiki, ctx);
        if (!ph) return new Response('Not found', { status: 404, headers: h });
        const img = await fetch(ph.thumb, { headers: { 'user-agent': UA }, cf: { cacheTtl: PHOTO_TTL, cacheEverything: true } });
        if (!img.ok) return new Response('Photo unavailable', { status: 502, headers: h });
        return new Response(img.body, { headers: { 'content-type': img.headers.get('content-type') || 'image/jpeg', 'cache-control': `public, max-age=${d < finishedBefore(now) ? PHOTO_TTL : 3600}`, ...h } });
      }

      return json({ error: 'Not found' }, 404, h);
    } catch (e) {
      return json({ error: 'Server error' }, 500, h);
    }
  },
};
