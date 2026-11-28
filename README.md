# HabiTap

A daily geography game: you see a photo of a plant or animal that lives in only one small corner of the world, then you tap that spot on a 3D globe. Five species a day, the same for everyone.

**Play:** https://garrettarch.github.io/habitap/

## How it works
- `species.json`: 275 strict endemics (whole wild range within about 200 miles (320 km) of one point), each with an exact point, place, "why only here", and a fun fact.
- `species_research.json`: the full research list with confidence notes.
- Photos load at play time from Wikipedia's API (free-licensed lead images only) and are credited from Wikimedia Commons metadata.
- Coastlines: Natural Earth (public domain) via [world-atlas](https://github.com/topojson/world-atlas). Rendering: [d3](https://d3js.org) (ISC).
- `regions.json`: the region ladder (this branch). Each species has a home area (simplified RESOLVE ecoregions, or a 25 km circle) and a tier from its size. A daily plays one species per tier, huge to tiny. Built by `tools/regions/build.mjs`.
- Scoring (region ladder): 100 anywhere inside the area, otherwise `100·e^(−d/s)` where d is the distance to the area's nearest edge and s is 5150 km × 0.35 / 0.5 / 0.7 / 0.85 / 1 for rounds 1–5. The hint costs 20.

Species facts and points were compiled from Wikipedia and other sources; some points are approximate.

## Launch setup
- `LAUNCH.md`: what's done and the remaining account steps (domain, Search Console, API deploy, analytics, ads).
- `api-worker/`: optional Cloudflare Worker that serves one day at a time so answers aren't in the page. Turn it on with the `habitap-api` meta tag in `index.html`.
- `manifest.webmanifest`, `sw.js`, `icons/`: add-to-home-screen and offline support.
- `robots.txt`, `sitemap.xml`, `privacy.html`, `og.png`: search, sharing and privacy basics.
