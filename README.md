# Habitap

A daily geography game: you see a photo of a plant or animal that lives in only one small corner of the world, then you tap that spot on a 3D globe. Five species a day, the same for everyone.

**Play:** https://garrettarch.github.io/habitap/

## How it works
- `species.json`: 275 strict endemics (whole wild range within about 150 km of one point), each with an exact point, place, "why only here", and a fun fact.
- `species_research.json`: the full research list with confidence notes.
- Photos load at play time from Wikipedia's API (free-licensed lead images only) and are credited from Wikimedia Commons metadata.
- Coastlines: Natural Earth (public domain) via [world-atlas](https://github.com/topojson/world-atlas). Rendering: [d3](https://d3js.org) (ISC).
- Scoring: 100 within 10 km, then `⌈100·(1 − d/20015)^7⌉` per species (20,015 km is the farthest two points can be apart), so a close guess pays off and almost any guess earns at least a point. The hint costs 20.

Species facts and points were compiled from Wikipedia and other sources; some points are approximate.

## Launch setup
- `LAUNCH.md`: what's done and the remaining account steps (domain, Search Console, API deploy, analytics, ads).
- `api-worker/`: optional Cloudflare Worker that serves one day at a time so answers aren't in the page. Turn it on with the `habitap-api` meta tag in `index.html`.
- `manifest.webmanifest`, `sw.js`, `icons/`: add-to-home-screen and offline support.
- `robots.txt`, `sitemap.xml`, `privacy.html`, `og.png`: search, sharing and privacy basics.
