// Builds the site into dist/ (Cloudflare's build command runs this).
// 1) Copies the app (index.html, data, fonts) as before.
// 2) Writes plain HTML pages Google can read: one per city and one per venue,
//    each listing upcoming shows with schema.org MusicEvent data, plus sitemap.xml and robots.txt.
// The interactive site at / is unchanged; these pages link into it.

import fs from "node:fs";
import path from "node:path";

const SITE = "https://showmeshows.net";
const OUT = "dist";
const ROOT = process.cwd();

const CITIES = [
  { key: "stl", slug: "st-louis", name: "St. Louis", long: "St. Louis & the Metro East", hash: "#stl", tz: "America/Chicago",
    listings: "listings.json", venues: "venues.json", images: "images.json",
    region: { "Metro East": "IL" }, defRegion: "MO",
    areaNames: { City: "St. Louis City", County: "St. Louis County", "St. Charles": "St. Charles", "Metro East": "Metro East (IL)" } },
  { key: "denver", slug: "denver", name: "Denver", long: "Denver, Boulder & Red Rocks", hash: "#denver", tz: "America/Denver",
    listings: "listings-denver.json", venues: "venues-denver.json", images: "images-denver.json", region: {}, defRegion: "CO", areaNames: {} },
  { key: "kc", slug: "kansas-city", name: "Kansas City", long: "Kansas City & Lawrence", hash: "#kc", tz: "America/Chicago",
    listings: "listings-kc.json", venues: "venues-kc.json", images: "images-kc.json",
    region: { "Kansas Side": "KS", Lawrence: "KS" }, defRegion: "MO", areaNames: { KCMO: "KC & Missouri side", "Kansas Side": "Kansas side" } },
  { key: "phx", slug: "phoenix", name: "Phoenix", long: "Phoenix, Tempe, Mesa & Scottsdale", hash: "#phx", tz: "America/Phoenix",
    listings: "listings-phx.json", venues: "venues-phx.json", images: "images-phx.json", region: {}, defRegion: "AZ",
    areaNames: { "East Valley": "East Valley (Tempe, Mesa)", "West Valley": "West Valley (Glendale)" } },
];

/* ---------- helpers ---------- */
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { return null; } };
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "venue";
const norm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const artistKey = n => norm(String(n).replace(/\s*[:(\[].*$/, ""));
const safeUrl = u => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch (e) { return ""; } };
function write(rel, content) { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }

function todayIn(tz) { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function offsetFor(tz, iso, time) { // e.g. "-06:00" for that local date/time
  const guess = new Date(`${iso}T${time || "12:00"}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess).map(p => [p.type, p.value]));
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const mins = Math.round((asLocal - guess.getTime()) / 60000), sign = mins < 0 ? "-" : "+", a = Math.abs(mins);
  return sign + String(Math.floor(a / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0");
}
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(iso) { const d = new Date(iso + "T12:00:00Z"); return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; }
function fmtTime(t) { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, "0")} ${ap}` : `${h} ${ap}`; }
function splitAddr(addr, fallbackCity) { const parts = String(addr || "").split(",").map(s => s.trim()).filter(Boolean); return parts.length >= 2 ? { street: parts.slice(0, -1).join(", "), locality: parts[parts.length - 1] } : { street: parts[0] || "", locality: fallbackCity }; }

/* ---------- 1) copy the app ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(ROOT)) {
  if (f === "index.html" || f === "firebase-config.js" || f === "_headers" || f.endsWith(".json")) fs.copyFileSync(f, path.join(OUT, f));
}
fs.cpSync("fonts", path.join(OUT, "fonts"), { recursive: true });

/* ---------- 2) pages ---------- */
const CSS = `
@font-face{font-family:Anton;src:url(/fonts/anton-400.woff2) format("woff2");font-display:swap}
@font-face{font-family:"Special Elite";src:url(/fonts/special-elite-400.woff2) format("woff2");font-display:swap}
@font-face{font-family:Archivo;src:url(/fonts/archivo-400.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:Archivo;src:url(/fonts/archivo-700.woff2) format("woff2");font-weight:700;font-display:swap}
:root{--paper:#0B0B0B;--card:#121211;--ink:#F2EFE6;--muted:#A9A497;--line:#3B3934;--pink:#FF3D8B;--tape:#D9D2B6}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 Archivo,system-ui,sans-serif}
a{color:var(--ink)} a:hover{color:var(--pink)}
.wrap{max-width:880px;margin:0 auto;padding:22px 18px 60px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:26px}
.logo{font-family:Anton,Impact,sans-serif;font-size:34px;text-transform:uppercase;text-decoration:none;line-height:1}
.logo b{background:var(--pink);color:#0B0B0B;padding:0 6px;font-weight:400}
.cta{font-family:Anton,Impact,sans-serif;text-transform:uppercase;background:var(--pink);color:#0B0B0B;text-decoration:none;padding:8px 14px;display:inline-block;transform:rotate(-1.5deg)}
.cta:hover{color:#0B0B0B;background:var(--ink)}
h1{font-family:Anton,Impact,sans-serif;text-transform:uppercase;font-size:clamp(34px,7vw,60px);line-height:.95;margin:0 0 10px;font-weight:400}
h2{font-family:Anton,Impact,sans-serif;text-transform:uppercase;font-size:26px;font-weight:400;margin:30px 0 10px;border-bottom:2px dashed var(--line);padding-bottom:6px}
.lede{color:var(--muted);font-family:"Special Elite",monospace;margin:0 0 14px}
.crumbs{font-family:"Special Elite",monospace;font-size:14px;color:var(--muted);margin-bottom:10px}
.crumbs a{color:var(--muted)}
ul.shows{list-style:none;margin:0;padding:0}
ul.shows li{border:2px solid var(--ink);background:var(--card);padding:12px 14px;margin:0 0 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center}
.a{font-weight:700;font-size:19px;line-height:1.2}
.m{font-family:"Special Elite",monospace;font-size:14px;color:var(--muted)}
.t{font-family:Anton,Impact,sans-serif;text-transform:uppercase;background:var(--pink);color:#0B0B0B;text-decoration:none;padding:5px 10px;white-space:nowrap;grid-row:span 2}
.t:hover{background:var(--ink);color:#0B0B0B}
.tag{display:inline-block;border:2px dashed var(--muted);padding:0 6px;font-size:12px;margin-left:6px}
.st{color:var(--pink);font-weight:700}
.vlist{columns:2;column-gap:28px;padding-left:18px;font-family:"Special Elite",monospace}
.vlist li{margin:0 0 6px;break-inside:avoid}
.cities{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
.cities a{border:2px dashed var(--ink);padding:4px 10px;text-decoration:none;font-family:Anton,Impact,sans-serif;text-transform:uppercase}
.vinfo{border:2px solid var(--ink);background:var(--card);padding:12px 14px;font-family:"Special Elite",monospace;font-size:15px}
footer{margin-top:40px;border-top:2px dashed var(--line);padding-top:14px;font-family:"Special Elite",monospace;font-size:13px;color:var(--muted)}
@media (max-width:560px){.vlist{columns:1}ul.shows li{grid-template-columns:1fr}.t{grid-row:auto;justify-self:start}}
`;

function page({ title, desc, canonical, body, jsonld = [] }) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Show Me Shows">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}">
<meta name="theme-color" content="#0B0B0B">
<link rel="preload" href="/fonts/anton-400.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head><body><div class="wrap">
<header class="top"><a class="logo" href="/">Show me <b>shows</b></a><a class="cta" href="/">Open the full calendar →</a></header>
${body}
<footer>
<div class="cities">${CITIES.map(c => `<a href="/${c.slug}/">${esc(c.name)}</a>`).join("")}</div>
<p>Show Me Shows lists every live show we can find, updated every week from venue calendars. Times and prices can change, so check the ticket link before you go. Is your show missing? <a href="/#submit">Add it free</a>.</p>
</footer>
</div></body></html>
`;
}

function eventLd(s, v, c, img) {
  const loc = splitAddr(v.addr, c.name);
  const start = s.time ? `${s.date}T${s.time}:00${offsetFor(c.tz, s.date, s.time)}` : s.date;
  const ev = {
    "@context": "https://schema.org", "@type": "MusicEvent",
    name: s.artist + (s.support ? " with " + s.support : ""),
    startDate: start,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: s.status === "cancelled" ? "https://schema.org/EventCancelled" : s.status === "postponed" ? "https://schema.org/EventPostponed" : "https://schema.org/EventScheduled",
    location: { "@type": "MusicVenue", name: v.name, address: { "@type": "PostalAddress", streetAddress: loc.street, addressLocality: loc.locality, addressRegion: c.region[v.area] || c.defRegion, addressCountry: "US" } },
    performer: [{ "@type": "MusicGroup", name: s.artist }].concat(s.support ? String(s.support).split(/\s*(?:,|&|\band\b)\s*/).filter(x => x && x.length < 60).slice(0, 3).map(n => ({ "@type": "MusicGroup", name: n })) : []),
    url: `${SITE}/${c.slug}/${v.slug}/`,
  };
  if (typeof v.lat === "number") ev.location.geo = { "@type": "GeoCoordinates", latitude: v.lat, longitude: v.lon };
  if (img) ev.image = [img];
  const tix = safeUrl(s.tickets);
  if (tix || s.price === "Free") ev.offers = { "@type": "Offer", url: tix || `${SITE}/${c.slug}/${v.slug}/`, availability: s.status === "soldout" ? "https://schema.org/SoldOut" : "https://schema.org/InStock", ...(s.price === "Free" ? { price: "0", priceCurrency: "USD" } : {}) };
  return ev;
}

function showLi(s, v, c, withVenue) {
  const tix = safeUrl(s.tickets) || safeUrl(s.source);
  const st = s.status === "soldout" ? "Sold out" : s.status === "cancelled" ? "Cancelled" : s.status === "postponed" ? "Postponed" : "";
  const meta = [withVenue ? `<a href="/${c.slug}/${v.slug}/">${esc(v.name)}</a>` : "", esc(fmtTime(s.time)), withVenue ? esc(v.hood || "") : ""].filter(Boolean).join(" · ");
  return `<li><div class="a">${esc(s.artist)}${s.support ? ` <span class="m">with ${esc(s.support)}</span>` : ""}${st ? ` <span class="st">${st}</span>` : ""}</div>${tix ? `<a class="t" href="${esc(tix)}" rel="noopener nofollow" target="_blank">${s.price === "Free" ? "Free · info" : "Tickets"}</a>` : ""}<div class="m">${meta}${s.genre && s.genre !== "Other" ? `<span class="tag">${esc(s.genre)}</span>` : ""}</div></li>`;
}

const urls = [{ loc: SITE + "/", pri: "1.0" }];
let pages = 0;
for (const c of CITIES) {
  const V = read(c.venues) || {}, L = read(c.listings) || { shows: [] }, IM = read(c.images) || { artists: {}, shows: {} };
  const today = todayIn(c.tz), horizon = addDays(today, 120);
  // venue slugs, unique per city
  const used = new Set();
  for (const [k, v] of Object.entries(V)) { let sl = slugify(v.name); while (used.has(sl)) sl += "-" + slugify(k).slice(0, 8); used.add(sl); v.slug = sl; v.key = k; }
  const shows = (L.shows || []).filter(s => s && s.date >= today && V[s.venue] && s.status !== "cancelled")
    .sort((a, b) => (a.date + (a.time || "99")).localeCompare(b.date + (b.time || "99")));
  const imgOf = s => { const a = IM.artists?.[artistKey(s.artist)], sh = IM.shows?.[s.id]; return (sh && sh.img) || (a && a.img) || ""; };

  // ---- city page ----
  const soon = shows.filter(s => s.date <= horizon);
  const byDate = new Map(); for (const s of soon) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); }
  const venueList = Object.values(V).filter(v => shows.some(s => s.venue === v.key)).sort((a, b) => a.name.localeCompare(b.name));
  const cityBody = `<p class="crumbs"><a href="/">Show Me Shows</a> › ${esc(c.name)}</p>
<h1>Live music in ${esc(c.name)}</h1>
<p class="lede">${soon.length} upcoming shows across ${venueList.length} venues in ${esc(c.long)}: clubs, bars, theaters, arenas and festivals. Updated every week.</p>
<p><a class="cta" href="/${c.hash}">Search, filter and map ${esc(c.name)} shows →</a></p>
${[...byDate].map(([d, list]) => `<h2>${esc(longDate(d))}</h2><ul class="shows">${list.map(s => showLi(s, V[s.venue], c, true)).join("")}</ul>`).join("\n")}
<h2>${esc(c.name)} venues</h2>
<ul class="vlist">${venueList.map(v => `<li><a href="/${c.slug}/${v.slug}/">${esc(v.name)}</a> <span class="m">${esc(v.hood || "")}</span></li>`).join("")}</ul>`;
  const cityLd = [{ "@context": "https://schema.org", "@type": "CollectionPage", name: `Live music in ${c.name}`, url: `${SITE}/${c.slug}/` }]
    .concat(soon.slice(0, 120).map(s => eventLd(s, V[s.venue], c, imgOf(s))));
  write(`${c.slug}/index.html`, page({
    title: `Live music in ${c.name} this week: concerts & shows tonight | Show Me Shows`,
    desc: `Every live music show in ${c.long}: ${soon.length} upcoming concerts at ${venueList.length} venues, with times and ticket links. Updated every week.`,
    canonical: `${SITE}/${c.slug}/`, body: cityBody, jsonld: cityLd }));
  urls.push({ loc: `${SITE}/${c.slug}/`, pri: "0.9" }); pages++;

  // ---- venue pages ----
  for (const v of Object.values(V)) {
    const vs = shows.filter(s => s.venue === v.key);
    const area = c.areaNames[v.area] || v.area;
    const body = `<p class="crumbs"><a href="/">Show Me Shows</a> › <a href="/${c.slug}/">${esc(c.name)}</a> › ${esc(v.name)}</p>
<h1>${esc(v.name)}</h1>
<p class="lede">Upcoming shows and concerts at ${esc(v.name)}${v.hood ? ` in ${esc(v.hood)}` : ""}, ${esc(c.name)}.</p>
<div class="vinfo">${esc(v.addr || "")}${v.type ? ` · ${esc(v.type)}` : ""}${v.cap ? ` · about ${esc(v.cap)} capacity` : ""}${area ? ` · ${esc(area)}` : ""}${v.transit ? `<br>Getting there: ${esc(v.transit)}` : ""}${typeof v.lat === "number" ? `<br><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name + " " + (v.addr || ""))}" rel="noopener nofollow" target="_blank">Directions ↗</a>` : ""}</div>
<h2>Upcoming shows${vs.length ? ` (${vs.length})` : ""}</h2>
${vs.length ? `<ul class="shows">${vs.map(s => showLi({ ...s, artist: s.artist }, v, c, false).replace('<div class="m">', `<div class="m">${esc(longDate(s.date))} · `)).join("")}</ul>` : `<p class="lede">No shows listed right now. Check back soon, or <a href="/${c.hash}">see everything on in ${esc(c.name)}</a>.</p>`}
<p style="margin-top:22px"><a class="cta" href="/${c.hash}">More ${esc(c.name)} shows →</a></p>`;
    const ld = [{ "@context": "https://schema.org", "@type": "MusicVenue", name: v.name, url: `${SITE}/${c.slug}/${v.slug}/`,
      address: { "@type": "PostalAddress", ...(() => { const a = splitAddr(v.addr, c.name); return { streetAddress: a.street, addressLocality: a.locality }; })(), addressRegion: c.region[v.area] || c.defRegion, addressCountry: "US" },
      ...(typeof v.lat === "number" ? { geo: { "@type": "GeoCoordinates", latitude: v.lat, longitude: v.lon } } : {}) }]
      .concat(vs.slice(0, 60).map(s => eventLd(s, v, c, imgOf(s))));
    write(`${c.slug}/${v.slug}/index.html`, page({
      title: `${v.name} shows & concerts${vs.length ? ` (${vs.length} upcoming)` : ""} | ${c.name} | Show Me Shows`,
      desc: `Upcoming concerts at ${v.name}${v.hood ? ` (${v.hood})` : ""} in ${c.name}${vs.length ? `: ${vs.slice(0, 3).map(s => s.artist).join(", ")}${vs.length > 3 ? " and more" : ""}` : ""}. Dates, times and ticket links.`,
      canonical: `${SITE}/${c.slug}/${v.slug}/`, body, jsonld: ld }));
    urls.push({ loc: `${SITE}/${c.slug}/${v.slug}/`, pri: vs.length ? "0.7" : "0.4" }); pages++;
  }
}

/* ---------- 3) sitemap + robots ---------- */
const now = new Date().toISOString().slice(0, 10);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>${u.pri}</priority></url>`).join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built ${pages} pages and a sitemap with ${urls.length} URLs.`);
