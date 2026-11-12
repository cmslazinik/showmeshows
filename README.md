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
