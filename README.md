# Show Me Shows

Every live show in St. Louis & the Metro East, updated every morning.

## Files
- `index.html` – the whole site (listings, map, venues, reviews, submit form, admin).
- `listings.json` – all shows. Rewritten every morning by the daily update (next 45 days every day; every Monday it also sweeps out to 6 months for the Coming Up tab). Optional show fields: `added` (date first listed, drives "Just announced") and `onSale` (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, local time).
- `venues.json` – venue directory (name, address, area, map position).
- `firebase-config.js` – Firebase web settings (public by design).
- `firestore.rules` – who can read/write reviews, submissions and the email list. Paste into Firebase console → Firestore → Rules.
- `_headers` – cache settings so visitors always get the latest listings.

## How it fits together
GitHub stores these files → Cloudflare (Workers project "showmeshows") publishes them at showmeshows.net and republishes on every change → the daily update commits a fresh `listings.json` each morning → Firebase stores reviews, show submissions and email signups.

## Make yourself the admin
1. Open the live site, click **Admin sign in** (footer) and sign in with Google.
2. Firebase console → Authentication → Users: copy the User UID next to your Google account.
3. Firestore → Data → Start collection `admins` → Document ID = that UID → add any field (e.g. `role: "owner"`) → Save.
4. Refresh the site. The **Admin** tab appears.


## Cities

The site covers more than one city. Each city has its own data files, refreshed every morning by its own scheduled task:

- St. Louis: `listings.json`, `venues.json`
- Denver: `listings-denver.json`, `venues-denver.json`

The Cloudflare build command copies every `*.json` file, so a new city's files deploy without changing the build.

## Listings updates

The scheduled updates follow `updates/RULES.md` (one rulebook for every city). Each city has a short file in `updates/` with its venues and sources, and `updates/cities.json` lists every city, its schedule and its weekly deep-sweep day. To add a city: add its data files and site config, a city file, an entry in `cities.json`, and a short scheduled task pointing at them.

## Band pictures

Each listing card shows a band picture, picked in this order: the band's own upload (submit form) > Ticketmaster > the venue's promo photo for that show (`img` on a show) > Spotify > Apple Music > no picture (the card looks like it always did).

`scripts/find-images.mjs` fills `images.json` (St. Louis) and `images-<city>.json`. It runs on GitHub Actions (`.github/workflows/band-pictures.yml`) after every listings change and on Sundays. It's free and uses no Claude usage. When it isn't sure a picture is the right band, it saves nothing and the card has no picture.

Optional repo secrets (GitHub → Settings → Secrets and variables → Actions): `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` turn on Spotify; `TM_KEY` turns on Ticketmaster. Without them those sources are skipped.

Visitors can tap "Wrong photo? Tell us" in a card's Listen menu. Reports show up in Admin → Photo reports, where Block removes that picture everywhere.

## Sound check and story flyers

The same script also saves a 30-second Apple Music preview (`pv`) for each matched band. Cards with a preview get a pink ▶ button next to the band name. "Wrong song? Tell us" in the Listen menu reports it, and blocking it in Admin removes the band's picture and clip together.

Share ▾ → "Instagram story flyer" draws a 1080×1920 flyer for the show in the visitor's browser (band photo when its host allows it, date, time, venue, showmeshows.net) and opens the phone's share sheet, or downloads it on a computer.

## Show passport

Tab "Passport" (#passport). On a show's card, from 3 hours before start until 6 hours after, an "I'm here · get stamped" button appears. It checks the phone's location is within about a quarter mile of the venue, then adds a stamp. Stamps, badges (14), ranks and the holder name live in the visitor's browser (localStorage key `sms-passport`), with no account. "Share my passport" makes a 1080×1920 story picture.

## Pages for Google

Cloudflare's build command is `node scripts/build-site.mjs`. It copies the app into dist/ and writes a page for each city (/st-louis/, /denver/, /kansas-city/, /phoenix/) and each venue (/st-louis/off-broadway/ …) with schema.org MusicEvent data, plus /sitemap.xml and /robots.txt. They rebuild on every push, so they stay current with the listings.
