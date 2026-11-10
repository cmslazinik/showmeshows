# Show Me Shows

Every live show in St. Louis & the Metro East, updated every morning.

## Files
- `index.html` – the whole site (listings, map, venues, reviews, submit form, admin).
- `listings.json` – all shows. Rewritten every morning by the daily update.
- `venues.json` – venue directory (name, address, area, map position).
- `firebase-config.js` – Firebase web settings (public by design).
- `firestore.rules` – who can read/write reviews, submissions and the email list. Paste into Firebase console → Firestore → Rules.
- `_headers` – hosting settings for Cloudflare Pages (always serve the latest listings).

## How it fits together
GitHub stores these files → Cloudflare Pages publishes them at your domain and republishes on every change → the daily update commits a fresh `listings.json` each morning → Firebase stores reviews, show submissions and email signups.

## Make yourself the admin
1. Open the live site, click **Admin sign in** (footer) and sign in with Google.
2. Firebase console → Authentication → Users: copy the User UID next to your Google account.
3. Firestore → Data → Start collection `admins` → Document ID = that UID → add any field (e.g. `role: "owner"`) → Save.
4. Refresh the site. The **Admin** tab appears.
