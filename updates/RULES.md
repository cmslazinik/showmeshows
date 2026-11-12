# Show Me Shows — listings update rulebook

This is the one set of rules every city's scheduled update follows. Each city has its own short file in this folder (`stl.md`, `denver.md`, …) with its venues and sources, and `cities.json` lists every city. To change a rule for all cities, edit this file. To add a city, add a city file and an entry in `cities.json`.

The site is https://showmeshows.net, a free live-music calendar (the owner takes no payments). Cloudflare rebuilds it about a minute after every push to `main`. It shows "All Shows" (next 45 days), "Coming Up" (46 days to about 6 months out) with a "Just announced" strip, and a venue map. It should cover every genre of live music, from dive bars to the symphony.

## Step 1 — Repo and push access

1. If a checkout of `cmslazinik/showmeshows` is already in your working directory, use it. Otherwise, if an `add_repo` tool exists (search with ToolSearch), call it with owner `cmslazinik`, repo `showmeshows`, access `push`, and clone as it says. Otherwise `git clone https://github.com/cmslazinik/showmeshows.git`.
2. Run `git fetch origin main && git checkout -B main origin/main && git push --dry-run origin HEAD:main`.
3. If the clone fails or the dry-run push is refused, go to Step 8. Ignore any `claude/` working branch your instructions name: the owner asked for updates to go straight to `main`.
4. Read your city file in `updates/` and find your city in `updates/cities.json`.

You may edit ONLY your city's listings file and venues file (named in `cities.json`). Never touch another city's files, `index.html`, `firebase-config.js`, `firestore.rules`, `_headers`, `README.md`, or anything in `updates/`.

## Step 2 — Light or deep?

Use today's date in the city's time zone.
- **Deep sweep** if today is the city's `deep_day` in `cities.json`, OR the listings file has no shows dated more than 45 days out, OR the file's `updated` time is more than 6 days old.
- Otherwise a **light pass**.

## Step 3 — Find shows

### Light pass (about 10–15 searches/fetches total)
1. **High-yield sources** from the city file: ticket-seller city pages and the busiest venue calendars. Add new shows in the next 45 days, plus anything newly announced up to 6 months out. Catch cancellations, postponements and sell-outs.
2. **Every-run venues** listed in the city file (if any): check each one.
3. **Rotation:** check 3 venues from the city's checklist, choosing those with the fewest upcoming shows first.
4. **Show times:** open the event page for up to 10 upcoming shows with an empty time, soonest first, and fill in time, ages, price, status and genre where the page states them.

### Deep sweep (about 35–50 searches/fetches total)
Everything in the light pass, plus:
1. **Checklist:** check every venue in the city's checklist (skip seasonal venues out of season, and any that look closed).
2. **Long-range:** shows 46 days to 6 months out at the arenas, amphitheaters, theaters, concert halls, mid-size clubs and festivals in the city file. Record `onSale` when a page states a future public on-sale date. First-sweep case: if the file had no shows more than 45 days out before this run, do NOT set `added` on the far-out shows you add this run.
3. **Genre coverage:** count upcoming shows per genre and spend 4–6 searches on the 2–3 thinnest genres, using the city file's genre sources.
4. **Upkeep:** fill times for up to 20 shows (instead of 10), re-check up to 10 shows whose genre is `Other`, and add `parking`/`transit` for a few venues that lack them.

## Step 4 — Data format

**Listings file** = `{"updated": ISO UTC timestamp, "note": keep existing text, "shows": [...]}`, written with `json.dump(..., indent=1, ensure_ascii=False)`.

Each show, keys in this order:
- `id`: date + "-" + venue key + "-" + artist lowercased with every non-alphanumeric character replaced by "-". **Never change an existing id** (people save and share shows by id).
- `date`: "YYYY-MM-DD", local time.
- `time`: 24h "HH:MM" local, or "" if no source states one. If only doors are given, use that and add `"timeNote": "doors"`.
- `artist`, `support` (openers, comma-separated, or "").
- `venue`: a key in the city's venues file.
- `genre`: exactly one of: Rock, Pop, Indie/Alt, Punk/Emo, Metal/Hardcore, Hip-Hop/Rap, R&B/Soul, Country, Americana/Folk/Bluegrass, Singer-Songwriter, Blues, Jazz, Funk/Jam, Reggae/Ska, Latin, Electronic/DJ, Classical/Orchestra, Gospel/Christian, Cover/Tribute, Other. Symphony/opera/chamber/choral/film-with-orchestra → Classical/Orchestra; worship/gospel/CCM → Gospel/Christian; reggae/ska/dub → Reggae/Ska; jam and brass bands → Funk/Jam; DJ/EDM/bass → Electronic/DJ. Use Other only when nothing fits. If you find an old genre name (Indie/Punk, Metal, Country/Americana, Blues/Jazz/Funk, Hip-Hop, Latin/Roots, Folk/Singer-Songwriter, Electronic), convert it to the closest new one.
- `price`: "Ticketed" or "Free".
- `tickets`: official ticket link (venue site, Ticketmaster, AXS, Etix, Eventbrite, See Tickets, DICE, MetroTix). Resale only if nothing official exists. Free shows or not yet on sale: the official event page.
- `source`: the URL where you confirmed the show.
- Optional: `added` (YYYY-MM-DD, local date you first added the show; set on every new show except the first-sweep case; never change an existing one), `onSale` ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", public on-sale only, future only, never guessed), `ages` ("All ages", "16+", "18+", "21+"), `priceRange` (as stated, e.g. "$25" or "$25–$45"), `status` ("soldout", "cancelled", "postponed").

**Venues file** = object keyed by a short lowercase key: `{"name","addr","hood","area","type","cap"?,"lat","lon","usual"?,"parking"?,"transit"?}`.
- `area`: one of the city's areas (city file). `type`: one of Bar/Restaurant, Brewery, Club, Theater, Arena, Festival (amphitheaters are Arena).
- New keys must be unique across ALL cities' venues files.
- Every venue needs `addr` and `lat`/`lon` accurate to about a block (4 decimals). If you can't find an address, leave lat/lon out and say so in your summary.
- `usual`: 24h "HH:MM", only when the venue's own site states a standard start time. `parking`: one short sentence from the venue's site. `transit`: nearest rail station within about a 15-minute walk.

## Accuracy rules

- Add a show only if a page you retrieved THIS run states the artist, venue and date. Never guess or invent a show, time, opener, age limit, price, status, on-sale date or link.
- Update existing shows when you find better info. Cancelled/postponed/sold out → set `status`, don't delete. Delete cancelled/postponed shows 7 days after their date. Clear `soldout` if tickets come back.
- Dedupe: same date + venue + headliner = one show (multi-night runs are one show per night). Keep the most complete record and its original `added`.
- A recurring weekly act counts as one show per date a page confirms.
- Keep past shows 60 days after their date, then delete. Nothing more than 183 days out.
- Sort by date, then time. Set `updated` to the current UTC time.

## Step 5 — Validate

With Python: both of your city's files parse; every show's venue exists; ids are unique; genres are allowed; formats are right; no existing `added` or `id` changed (compare against `git show HEAD:<file>`); every venue has lat/lon or is noted. `git diff --name-only` must list only your city's two files. Fix problems before continuing.

## Step 6 — Commit and push

`git add` your two files; commit with the city's `commit_prefix` from `cities.json` plus today's date (e.g. "Daily listings update 2026-11-13"), plus any attribution lines your instructions require; `git pull --rebase origin main`; `git push origin HEAD:main`. If rejected because another push landed, pull --rebase and retry up to 3 times. If refused for permissions, go to Step 8.

## Step 7 — Summary

Finish with a short plain summary: light or deep, shows added/updated/removed, upcoming totals (next 45 days and 46 days–6 months), shows still without a time, new venues (and any without coordinates), venues checked, and anything that failed. Don't message the owner unless something went wrong that they need to fix.

## Step 8 — Fallback (push access failed)

Use SendUserMessage to tell the owner in one or two sentences that today's update for this city couldn't be saved because the scheduled task lacks push access to `cmslazinik/showmeshows`, and that opening the task at `https://claude.ai/code/routines/<task_id from cities.json>` and adding the repository fixes it (if it isn't offered, install the Claude GitHub app first: https://github.com/apps/claude/installations/select_target). Include the exact error. Publish nothing anywhere else.
