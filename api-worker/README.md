# Habitap daily puzzle API

A small Cloudflare Worker that serves one day's puzzle at a time and only reveals an answer after a guess. With it live, the game page no longer needs `species.json`, so the answer list and future puzzles stay off the public site.

| Endpoint | What it does |
|---|---|
| `GET /day?d=<day>` | The five species for a day: kind, region, name (place names masked), photo. No coordinates, places or facts. |
| `POST /guess` | `{d, i, lat, lon, hint}` → score, distance and the full answer for that one species. |
| `GET /practice` | A random day that's already over in every time zone. |
| `GET /img/<day>/<i>` | The species photo, proxied so the Wikimedia file name can't give the answer away. |

`<day>` is the player's local date as days since 1970-01-01, the same number the game already uses. Days after the newest date anywhere on Earth (UTC+14) are refused, so nobody can fetch tomorrow early. It uses the same picking and scoring code as the game, and the test checks the picks match for 3 years of days. Existing puzzle numbers and streaks therefore carry over.

Free tier: Workers allow 100,000 requests a day and KV 100,000 reads a day. Responses are cached at the edge, so that covers tens of thousands of daily players.

## Setup (about 10 minutes)

```sh
cd api-worker
npm install
npx wrangler login                          # opens Cloudflare in the browser
npx wrangler kv namespace create HABITAP    # paste the printed id into wrangler.toml

mkdir -p data && cp ../species.json data/species.json   # or your new private list (see below)
npm run upload-species                      # puts it in KV under the key "species"
npm run deploy                              # prints https://habitap-api.<you>.workers.dev
```

Then in `index.html`, set the API URL:

```html
<meta name="habitap-api" content="https://habitap-api.<you>.workers.dev">
```

When that's live and working, **delete `species.json` and `species_research.json` from the repo**. The game then only ever talks to the API.

## The species list is already public

`species.json` has been in this public repo since launch, so the current 275 species and their answers are out there, including in the git history and any forks. Deleting the file stops new casual peeking, but it doesn't un-publish them. For real protection over time:

- Write new species into `api-worker/data/species.json` only. That folder is git-ignored, so it never gets committed.
- Back that file up somewhere private, like a private repo, Drive or 1Password.
- Re-upload with `npm run upload-species` whenever it changes. The Worker picks up changes within 5 minutes.

Changing the list changes which species `pick()` chooses for every day, including past ones. If you want past dailies to stay the same, add new species at the end of the array and accept that future days reshuffle, or pin specific days in a separate schedule later.

## Optional hardening

- **Rate limit:** in the Cloudflare dashboard, go to Security, then WAF, then Rate limiting rules, and limit `/guess` to about 60 requests per minute per IP. A guess does reveal its answer, so this mainly slows bulk scraping of today's puzzle.
- **Lock CORS:** `ALLOW_ORIGIN` in `wrangler.toml` lists the sites allowed to call the API from a browser. Remove `localhost` and the github.io origin once the real domain is live.
- **Custom domain:** add a route like `api.playhabitap.com` under the Worker's Settings, then Domains & Routes.

## Develop and test

```sh
npm test        # offline unit tests (fake KV and Wikipedia)
npm run dev     # local Worker on http://localhost:8787 (needs data uploaded with --local, or use --remote)
```
