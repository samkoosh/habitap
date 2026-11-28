# Region ladder data

`regions.json` (repo root) is built by `build.mjs` from:
- `new-species.json` and `batch-*.json` (one per realm): wide-ranging species, each listed with the RESOLVE ecoregions that make up its home area
- `species.json`: the original small-range species. Each one gets its ecoregion when it sits in a small (3k–40k km²) ecoregion that honestly matches its range, otherwise a 25 km circle

Tiers come from area: 1 huge (≥1M km²), 2 big (≥110k), 3 medium (≥20k), 4 small (≥2.5k), 5 tiny.
Rounds: 1 is a warm-up of household names (`famous`, area ≥1M; `batch-icons.json` plus a list in build.mjs), 2 is every other huge or big area, then 3 medium, 4 small, 5 tiny. Each daily plays one species per round.
Check a batch with `node tools/regions/check.mjs <batch.json>` (add `--icons` for the looser warm-up rules).

Ecoregion outlines: RESOLVE Ecoregions 2017, Dinerstein et al. 2017, BioScience 67(6):534–545, doi:10.1093/biosci/bix014, CC BY 4.0. Download `ecoregions.json` (openlayers/data, `docs/vector/ecoregions.json`) next to `build.mjs`, `npm i mapshaper d3-geo`, then run
`node tools/regions/build.mjs species.json regions.json`.
