// Finds band pictures for upcoming shows and saves them to images-<city>.json.
// Runs on GitHub (see .github/workflows/band-pictures.yml). Uses no AI.
//
// Order a card uses (the site picks): band's own upload > Ticketmaster > venue promo photo > Spotify > Apple Music > no picture.
// Ticketmaster and Spotify only run when their keys are set as repo secrets:
//   TM_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
// When unsure a picture is the right band, it saves nothing and the card has no picture.

import fs from "node:fs";

const TODAY = new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
const HORIZON = addDays(TODAY, 183);
const RECHECK_NONE_DAYS = 30;     // look again for bands we found nothing for after this long
const MAX_LOOKUPS = Number(process.env.MAX_LOOKUPS || 70);
const MAX_PAGES = Number(process.env.MAX_PAGES || 400); // event pages read per city per run
const RECHECK_PAGE_DAYS = 10; // new bands looked up per city per run; the rest wait for the next run
const FIREBASE_PROJECT = "showmeshows-1d87d";
const FIREBASE_KEY = "AIzaSyBidytEHkkVgfcDJ9K0O7_DjisE_zxlJaA"; // public web key, same one the site uses

const TM_KEY = process.env.TM_KEY || "";
const SP_ID = process.env.SPOTIFY_CLIENT_ID || "", SP_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";

const GENRE_WORDS = {"Rock":"rock","Pop":"pop","Indie/Alt":"indie alternative alt","Punk/Emo":"punk emo","Metal/Hardcore":"metal hardcore heavy",
  "Hip-Hop/Rap":"hip hop rap","R&B/Soul":"rnb r b soul motown","Country":"country","Americana/Folk/Bluegrass":"americana folk bluegrass roots acoustic country",
  "Singer-Songwriter":"singer songwriter acoustic folk pop","Blues":"blues","Jazz":"jazz","Funk/Jam":"funk jam brass","Reggae/Ska":"reggae ska dub",
  "Latin":"latin salsa cumbia reggaeton bachata tejano mariachi regional mexican","Electronic/DJ":"electronic dj edm techno house dance bass dubstep",
  "Classical/Orchestra":"classical orchestra symphony opera chamber choir choral","Gospel/Christian":"gospel christian worship praise ccm",
  "Cover/Tribute":"", "Other":""};
// Genres close enough that a mismatch shouldn't block a match.
const ROCKISH = "rock indie alternative alt punk emo metal hardcore pop grunge garage";

export function norm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); }
export function artistKey(name) { return norm(String(name).replace(/\s*[:(\[].*$/, "")); }

// Listings that are events, not a band: no picture search.
const NOT_A_BAND = /\b(open mic|open jam|jam session|karaoke|trivia|bingo|dj night|dance party|drag|comedy|brunch|happy hour|showcase|songwriters? night|live music|music night|tribute night|residency|various artists|tba|tbd|festival|fest|series|presents|night of|celebration|party|vs\.?|@)\b/i;

export function genreFits(showGenre, theirGenres) {
  const theirs = norm((theirGenres || []).join(" "));
  if (!theirs) return true;                       // nothing to compare
  const ours = GENRE_WORDS[showGenre];
  if (ours === undefined || ours === "") return true; // Other / Cover / unknown
  const words = new Set(theirs.split(" "));
  const hit = s => s.split(" ").some(w => w && words.has(w));
  if (hit(ours)) return true;
  if ((ROCKISH.split(" ").some(w => ours.includes(w)) && hit(ROCKISH))) return true;
  return false;
}

// Short one-word names ("Ghost", "Live") match too many artists: only accept when the genre actually lines up.
function riskyName(key) { return !key.includes(" ") && key.length <= 5; }

async function getJSON(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(15000) }, opts));
      if (r.status === 429 || (r.status === 403 && url.includes("itunes.apple.com"))) { await sleep(20000 * (i + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { await sleep(800); }
  }
  return null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function imageLoads(url) {
  try {
    const u = new URL(url); if (u.protocol !== "https:") return false;
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-2047", "User-Agent": "Mozilla/5.0 (ShowMeShows picture check)" }, signal: AbortSignal.timeout(12000), redirect: "follow" });
    const ct = r.headers.get("content-type") || "";
    return (r.status === 200 || r.status === 206) && ct.startsWith("image/") && !/svg/.test(ct);
  } catch (e) { return false; }
}

/* ---------- Event page photo (the picture that shows when you share the link) ---------- */
const lastHit = new Map();
async function pagePhoto(url) {
  let u; try { u = new URL(url); } catch (e) { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const wait = (lastHit.get(u.host) || 0) + 1200 - Date.now(); if (wait > 0) await sleep(wait); // one page a second per site
  lastHit.set(u.host, Date.now());
  try {
    const r = await fetch(u.href, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ShowMeShowsBot/1.0; +https://showmeshows.net)", Accept: "text/html" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("html")) return null;
    const html = (await r.text()).slice(0, 600000);
    const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
    const attr = (t, n) => { const m = t.match(new RegExp(n + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i")); return m ? (m[2] ?? m[3]) : null; };
    for (const want of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
      const t = metas.find(t => (attr(t, "property") || attr(t, "name") || "").toLowerCase() === want);
      const c = t && attr(t, "content");
      if (!c) continue;
      const img = new URL(c.replace(/&amp;/g, "&"), r.url).href.replace(/^http:/, "https:");
      if (/\/venues?\/|logo|favicon|placeholder|default[-_]?(image|og|share)|share[-_]?image|site[-_]?image/i.test(img)) return null;
      return img;
    }
  } catch (e) {}
  return null;
}

/* ---------- Sources ---------- */
async function fromTicketmaster(name, key, genre) {
  if (!TM_KEY) return null;
  const j = await getJSON("https://app.ticketmaster.com/discovery/v2/attractions.json?size=5&classificationName=music&keyword=" + encodeURIComponent(name) + "&apikey=" + TM_KEY);
  const list = (j && j._embedded && j._embedded.attractions) || [];
  const exact = list.filter(a => norm(a.name) === key);
  if (exact.length !== 1) return null;
  const a = exact[0];
  const g = (a.classifications || []).flatMap(c => [c.genre && c.genre.name, c.subGenre && c.subGenre.name]).filter(x => x && x !== "Undefined" && x !== "Other");
  if (!genreFits(genre, g) || (riskyName(key) && !g.length)) return null;
  const imgs = (a.images || []).filter(i => !i.fallback && i.width >= 300);
  const pick = imgs.find(i => i.ratio === "3_2" && i.width <= 1100) || imgs.find(i => i.ratio === "16_9" && i.width <= 1100) || imgs[0];
  return pick ? { img: pick.url, src: "tm" } : null;
}

let spToken = null;
async function spotifyToken() {
  if (!SP_ID || !SP_SECRET) return null;
  if (spToken) return spToken;
  const j = await getJSON("https://accounts.spotify.com/api/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(SP_ID + ":" + SP_SECRET).toString("base64") },
    body: "grant_type=client_credentials" });
  spToken = j && j.access_token ? j.access_token : false;
  if (!spToken) console.log("Spotify keys didn't work; skipping Spotify this run.");
  return spToken;
}
function spPick(images) { const ok = (images || []).filter(i => i.width >= 250).sort((a, b) => a.width - b.width); return ok[0] || (images || [])[0]; }
async function fromSpotify(name, key, genre, spotifyUrl) {
  const tok = await spotifyToken(); if (!tok) return null;
  const H = { headers: { Authorization: "Bearer " + tok } };
  const m = spotifyUrl && String(spotifyUrl).match(/open\.spotify\.com\/artist\/([A-Za-z0-9]{22})/);
  if (m) { // band gave us their own Spotify page: use exactly that
    const a = await getJSON("https://api.spotify.com/v1/artists/" + m[1], H);
    const p = a && spPick(a.images); return p ? { img: p.url, src: "spotify", link: "https://open.spotify.com/artist/" + m[1] } : null;
  }
  const j = await getJSON("https://api.spotify.com/v1/search?type=artist&limit=10&q=" + encodeURIComponent(name), H);
  const exact = ((j && j.artists && j.artists.items) || []).filter(a => norm(a.name) === key && a.images && a.images.length);
  if (exact.length !== 1) return null;
  const a = exact[0];
  if (!genreFits(genre, a.genres) || (riskyName(key) && !(a.genres || []).length)) return null;
  const p = spPick(a.images);
  return p ? { img: p.url, src: "spotify", link: "https://open.spotify.com/artist/" + a.id } : null;
}

// "Mushroomhead & Fear Factory" -> also try "Mushroomhead" (the first band on a co-bill).
function nameTries(artist) {
  const full = String(artist).replace(/\s*[:(\[].*$/, "").trim();
  const first = full.split(/\s+(?:&|\+|x|w\/|with|featuring|feat\.?|ft\.?|and friends)\s+|\s*[,\/|]\s+/i)[0].trim();
  return first && norm(first) !== norm(full) && norm(first).length > 2 ? [full, first] : [full];
}

// Apple allows about 20 requests a minute. A failed request means "try this band again next run", not "no picture".
class Retry extends Error {}
let appleDown = 0;
async function fromApple(name, key, genre) {
  if (appleDown >= 3) throw new Retry();
  const j = await getJSON("https://itunes.apple.com/search?media=music&entity=musicArtist&limit=10&term=" + encodeURIComponent(name));
  if (!j) { appleDown++; throw new Retry(); }
  appleDown = 0;
  let exact = (j.results || []).filter(a => norm(a.artistName) === key);
  if (exact.length > 1) exact = exact.filter(a => a.primaryGenreName && genreFits(genre, [a.primaryGenreName]) && GENRE_WORDS[genre]);
  if (exact.length !== 1) return null;
  const a = exact[0];
  const distinctive = key.split(" ").length >= 3 || key.length >= 14; // long names are rarely shared by two acts
  if ((!genreFits(genre, [a.primaryGenreName]) && !distinctive) || (riskyName(key) && !a.primaryGenreName)) return null;
  await sleep(3100);
  const al = await getJSON("https://itunes.apple.com/lookup?entity=album&limit=5&id=" + a.artistId);
  if (!al) { appleDown++; throw new Retry(); }
  const album = ((al && al.results) || []).find(r => r.wrapperType === "collection" && r.artworkUrl100);
  if (!album) return null;
  return { img: album.artworkUrl100.replace(/\/\d+x\d+bb\./, "/400x400bb."), src: "apple", link: a.artistLinkUrl ? a.artistLinkUrl.split("?")[0] : undefined };
}

/* ---------- Firestore (public read: approved submissions + your block list) ---------- */
async function firestoreShows() {
  const j = await getJSON(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/shows?pageSize=300&key=${FIREBASE_KEY}`);
  const out = []; let blocked = [];
  for (const d of (j && j.documents) || []) {
    const id = d.name.split("/").pop(), f = d.fields || {};
    const s = k => f[k] && f[k].stringValue;
    if (id === "zz-config-imageblocks") { blocked = ((f.blocked && f.blocked.arrayValue && f.blocked.arrayValue.values) || []).map(v => v.stringValue); continue; }
    if (s("artist") && s("date")) out.push({ id, artist: s("artist"), date: s("date"), genre: s("genre") || "", spotify: s("spotify") || "", venue: s("venue") || "", area: s("area") || "", hasPhoto: !!s("photo") });
  }
  return { approved: out, blocked: new Set(blocked) };
}

/* ---------- Main ---------- */
export async function main() {
  const cities = JSON.parse(fs.readFileSync("updates/cities.json", "utf8")).cities;
  const { approved, blocked } = await firestoreShows();
  console.log(`Sources: Ticketmaster ${TM_KEY ? "on" : "off (no key)"}, Spotify ${SP_ID ? "on" : "off (no key)"}, Apple on. Blocked pictures: ${blocked.size}.`);
  let lookups = 0, found = 0, retried = 0;

  for (const c of cities) {
    let cityLookups = 0;
    const lf = c.listings, out = c.key === "stl" ? "images.json" : `images-${c.key}.json`;
    let listings; try { listings = JSON.parse(fs.readFileSync(lf, "utf8")); } catch (e) { continue; }
    let cache; try { cache = JSON.parse(fs.readFileSync(out, "utf8")); } catch (e) { cache = {}; }
    cache.artists = cache.artists || {}; cache.shows = cache.shows || {};
    const before = JSON.stringify(cache);

    const venueKeys = new Set(Object.keys(JSON.parse(fs.readFileSync(c.venues, "utf8"))));
    const upcoming = (listings.shows || []).filter(s => s && s.date >= TODAY && s.date <= HORIZON);
    // Approved submissions for this city (their area belongs to one of this city's venues' areas or is the city's own).
    const mine = approved.filter(a => a.date >= TODAY && (venueKeys.has(a.venue) || cityAreas(c.key).includes(a.area)));
    const all = upcoming.concat(mine);

    // 1) The show's own promo photo: saved by the update task ("img"), or read from its event page.
    let pages = 0;
    const soon = [...upcoming].sort((a, b) => a.date.localeCompare(b.date));
    for (const s of soon) {
      const have = cache.shows[s.id];
      if (have && (have.img || addDays(have.checked, RECHECK_PAGE_DAYS) > TODAY)) continue;
      let img = null;
      if (s.img && await imageLoads(s.img)) img = s.img;
      else {
        if (pages >= MAX_PAGES) continue;
        for (const u of [...new Set([s.tickets, s.source].filter(Boolean))]) {
          pages++;
          const c = await pagePhoto(u);
          if (c && !(cache.generic || []).includes(c) && await imageLoads(c)) { img = c; break; }
        }
      }
      cache.shows[s.id] = img ? { img, src: "venue" } : { none: true, checked: TODAY };
    }
    // A picture used for 3+ different bands is the venue's or seller's generic image, not the band: drop it.
    const users = new Map();
    for (const s of upcoming) { const e = cache.shows[s.id]; if (e && e.img) { if (!users.has(e.img)) users.set(e.img, new Set()); users.get(e.img).add(artistKey(s.artist)); } }
    cache.generic = [...new Set([...(cache.generic || []), ...[...users].filter(([, a]) => a.size >= 3).map(([i]) => i)])].slice(-300);
    for (const [id, e] of Object.entries(cache.shows)) if (e.img && cache.generic.includes(e.img)) cache.shows[id] = { none: true, checked: TODAY };
    // Tidy: drop show entries for shows that are gone.
    const ids = new Set(upcoming.map(s => s.id));
    for (const id of Object.keys(cache.shows)) if (!ids.has(id)) delete cache.shows[id];

    // 2) Artist pictures, once per band.
    const seen = new Set();
    for (const s of all) {
      const key = artistKey(s.artist);
      if (!key || seen.has(key)) continue; seen.add(key);
      if (blocked.has("a:" + key)) { cache.artists[key] = { none: true, blocked: true, checked: TODAY }; continue; }
      const have = cache.artists[key];
      if (have && (have.img || have.blocked)) { have.last = s.date > (have.last || "") ? s.date : have.last; continue; }
      if (have && have.none && addDays(have.checked, RECHECK_NONE_DAYS) > TODAY) continue;
      if (NOT_A_BAND.test(s.artist) || key.length < 2) { cache.artists[key] = { none: true, checked: TODAY, skip: "event" }; continue; }
      if (cityLookups >= MAX_LOOKUPS) continue;
      cityLookups++; lookups++;
      let hit;
      try {
        const tries = nameTries(s.artist);
        for (const n of tries) {
          const k2 = norm(n);
          hit = await fromTicketmaster(n, k2, s.genre)
            || await fromSpotify(n, k2, s.genre, n === tries[0] ? s.spotify : "")
            || await fromApple(n, k2, s.genre);
          if (hit) break;
          if (tries.length > 1) await sleep(3100);
        }
      } catch (e) { if (e instanceof Retry) { retried++; await sleep(3100); continue; } throw e; }
      if (hit && !(await imageLoads(hit.img))) hit = null;
      cache.artists[key] = hit ? Object.assign(hit, { checked: TODAY, last: s.date }) : { none: true, checked: TODAY };
      if (hit) found++;
      await sleep(3100); // Apple's free search allows ~20 requests a minute
    }
    // Forget bands with no show in the next 6 months (keeps the file small).
    for (const [k, v] of Object.entries(cache.artists)) if (!seen.has(k) && !v.blocked && (!v.last || v.last < TODAY)) delete cache.artists[k];

    cache.note = "Band pictures for " + c.name + ". Filled in automatically by scripts/find-images.mjs; don't edit by hand.";
    if (JSON.stringify(cache) !== before) { cache.updated = new Date().toISOString(); fs.writeFileSync(out, JSON.stringify(sortKeys(cache), null, 1) + "\n"); console.log(`${c.name}: saved ${out}`); }
    else console.log(`${c.name}: no changes`);
  }
  console.log(`Looked up ${lookups} bands, found pictures for ${found}. ${retried} will be retried next run.`);
}
function cityAreas(key) {
  return { stl: ["City", "County", "St. Charles", "Metro East"], denver: ["Denver", "Boulder", "Suburbs", "Foothills"], kc: ["KCMO", "Northland", "Kansas Side", "Lawrence"], phx: ["Phoenix", "East Valley", "Scottsdale", "West Valley"] }[key] || [];
}
function sortKeys(o) { const r = { note: o.note, updated: o.updated, artists: {}, shows: {}, generic: o.generic || [] };
  for (const k of Object.keys(o.artists).sort()) r.artists[k] = o.artists[k];
  for (const k of Object.keys(o.shows).sort()) r.shows[k] = o.shows[k];
  return r; }

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
