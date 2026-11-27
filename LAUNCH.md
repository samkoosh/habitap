# Habitap launch checklist

What's already done in code, and the steps that need one of us at a keyboard with an account. Work top to bottom; each step takes 5 to 15 minutes.

## Already in the code

- **Search and AI answer engines:** a descriptive title and meta description, a canonical URL, Open Graph and Twitter share tags with a share image (`og.png`), and JSON-LD structured data (WebSite, VideoGame and FAQPage). There's also a visible "What is Habitap?", "How to play" and 10-question FAQ, in plain HTML that crawlers can read. `robots.txt`, `sitemap.xml` and `privacy.html` are in place.
- **Phones:**
  - While guessing, the photo sits beside the name, so the globe stays on screen. Tap the photo to enlarge it.
  - The Hint, Lock it in and Next buttons sit in a bar pinned to the bottom of the screen, within thumb reach.
  - After a guess, the globe stays in view with the score in the bar.
  - The layout handles the iPhone notch and home bar.
  - Share opens the phone's share sheet.
- **Home screen app:** a web app manifest, icons and a service worker, so the game opens fast, can be added to the home screen, and survives flaky connections.
- **Daily loop:**
  - a "Next daily in 5h 12m" countdown, with the reset at midnight local time
  - replay of any past daily from the results screen, which doesn't affect the streak
  - a Back to today button
- **Protected puzzles:** `api-worker/` is a Cloudflare Worker that serves one day at a time and reveals answers only after a guess. The game switches to it when you set one meta tag. It picks the same species per day as now, so streaks and puzzle numbers carry over.
- **Analytics hooks:** the game sends these events to Plausible, Umami or GA4, whichever is installed:
  - `play_start`, `guess` (score, km, hint), `hint`, `daily_complete` (total, streak)
  - `practice_complete`, `archive_complete`, `archive_open`
  - `share` (sheet or copy), `app_installed`

  Until a tool is installed, these do nothing.

## Steps that need you

### 1. Domain (Sam or Garrett, about $7)
- [ ] Buy `playhabitap.com`. It's about $6.99 for the first year on Vercel Domains, or anywhere else.
- [ ] Point it at GitHub Pages: in the repo, go to Settings, then Pages, then Custom domain, and enter `playhabitap.com`. Then add the DNS records GitHub shows: four `A` records for the apex and a `CNAME` for `www` → `garrettarch.github.io`. Tick **Enforce HTTPS** once it's offered.
- [ ] Replace `https://garrettarch.github.io/habitap/` with `https://playhabitap.com/` in `index.html`, `privacy.html`, `sitemap.xml` and `robots.txt` (search and replace). Once the domain is set, the old github.io address redirects automatically.

### 2. Search engines (15 min)
- [ ] [Google Search Console](https://search.google.com/search-console): add a Domain property for `playhabitap.com`, verify it with the DNS TXT record, and submit `https://playhabitap.com/sitemap.xml`. Then use URL Inspection and click Request indexing on the homepage.
- [ ] [Bing Webmaster Tools](https://www.bing.com/webmasters): import from Search Console. Bing also feeds ChatGPT search and Copilot.
- [ ] Check the share card in a link preview tool like opengraph.xyz, and the structured data in Google's Rich Results Test.
- Note: `robots.txt` and the sitemap only count at the root of a domain, so they start working once the custom domain is live.

### 3. Puzzle API (about 10 min, see `api-worker/README.md`)
- [ ] Make a free Cloudflare account, then run the setup commands in the README: login, create the KV namespace, upload the species, deploy.
- [ ] Put the Worker URL in `<meta name="habitap-api" content="…">` in `index.html`, and check that the game still plays.
- [ ] Delete `species.json` and `species_research.json` from the repo. Keep the master list private from now on, in the git-ignored `api-worker/data/` folder, with a backup somewhere private.
- [ ] Remember that the current 275 species are already public in git history. Add new species privately over time.
- [ ] Optional: a rate-limit rule on `/guess`, and an `api.playhabitap.com` custom domain.

### 4. Analytics (5 min)
Pick one and paste its snippet into `<head>`:
- **Plausible** (paid, about $9/mo, simplest, no cookie banner needed): `<script defer data-domain="playhabitap.com" src="https://plausible.io/js/script.js"></script>`
- **Umami Cloud** (free tier, no cookie banner needed): `<script defer src="https://cloud.umami.is/script.js" data-website-id="YOUR-ID"></script>`
- **GA4** (free, needs a consent banner in the EU and UK): the standard gtag snippet.

Then set up these views:
- **Dashboard:** daily visitors, new vs returning, and top sources. Look for AI referrers like chatgpt.com and perplexity.ai.
- **Funnel:** `play_start` → `daily_complete` → `share`.
- **Health:** the `daily_complete` streak values (are people coming back?) and average `guess` score per puzzle (difficulty).
- Split everything by device, and watch phone completion separately.
- Update the Analytics section of `privacy.html` to name the tool.

### 5. Launch
Follow the plan doc: soft-launch to friends for a week, then post to r/WebGames, r/geoguessr, r/geography, Show HN, iNaturalist and naturalist communities, and regional subs. Space the posts out.

### 6. Ads (later, once there's steady daily traffic)
- [ ] Apply to AdSense with the custom domain. It needs the privacy page, which is already there, and real traffic.
- [ ] Use one placement, on the results screen only. Never put ads over or near the globe or the bottom bar, because accidental taps can get the account flagged.
- [ ] Add a consent banner (Google's CMP or similar) and update the Ads section of `privacy.html`.
- [ ] Watch D7 retention. If it drops after ads go in, pull back.

## Testing locally

```sh
python3 -m http.server 8080        # then open http://localhost:8080
cd api-worker && npm test           # API unit tests
```
