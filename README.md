# HabitatTap

A daily geography game: you see a photo of a plant or animal that lives in only one small corner of the world, then you tap that spot on a 3D globe. Five species a day, the same for everyone.

**Play:** https://garrettarch.github.io/habitap/

## How it works
- `species.json`: 279 strict endemics (whole wild range within about 150 km of one point), each with an exact point, place, "why only here", and a fun fact. Place names inside species names are hidden until you guess.
- `species_research.json`: the full research list with confidence notes.
- Photos load at play time from Wikipedia's API (free-licensed lead images only) and are credited from Wikimedia Commons metadata.
- Coastlines: Natural Earth (public domain) via [world-atlas](https://github.com/topojson/world-atlas). Rendering: [d3](https://d3js.org) (ISC).
- Scoring: 100 within 10 km, then `100·e^(−(d−10)/900)` per species.

Species facts and points were compiled from Wikipedia and other sources; some points are approximate.
