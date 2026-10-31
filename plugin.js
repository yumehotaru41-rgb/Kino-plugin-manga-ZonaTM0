// Plugin de Kino para zonatmo.org
// Basado en Yuri Online 1.3.1 (posterCard + openSeries, Scaffold, TabBar bottom).
// Requiere Kino 0.9.74+ (apiVersion 14, capability "screen").

const BASE = "https://zonatmo.org";

// ---------------------------------------------------------------- red

async function getHtml(path) {
  const r = await kino.fetch(BASE + path, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9",
    },
  });
  if (!r.ok) throw kino.error("network", "HTTP " + r.status, {
    userMessage: "No se pudo conectar con ZonaTMO (HTTP " + r.status + ").",
  });
  return r.text();
}

// ------------------------------------------------------------- scraping

function clean(s) {
  return String(s)
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
}

function seriesCards(html, max) {
  const out = [];
  const seen = {};
  const re = /href=["'](?:https?:\/\/zonatmo\.org)?(\/library\/(manga|manhwa|manhua|comic|novel|webtoon)\/(\d+)\/([a-z0-9][a-z0-9-]*))\/?["']/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 48)) {
    const path = m[1], type = m[2].toLowerCase(), id = m[3], slugTail = m[4];
    const key = type + "/" + id;
    if (seen[key]) continue;
    seen[key] = true;
    const fullSlug = type + "/" + id + "/" + slugTail;
    const win = html.slice(Math.max(0, m.index - 500), m.index + 2500);
    let poster = "";
    const im = win.match(/(?:data-src|data-lazy-src|src)=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp|avif)[^"']*)["']/i)
            || win.match(/(?:data-src|data-lazy-src|src)=["'](\/[^"']+\.(?:jpe?g|png|webp|avif)[^"']*)["']/i);
    if (im) poster = im[1].startsWith("http") ? im[1] : BASE + im[1];
    let title = "";
    const tre = win.match(new RegExp(">([^<]{2,120})</a>", "i"))
             || win.match(/title=["']([^"']{2,120})["']/i)
             || win.match(/alt=["']([^"']{2,120})["']/i);
    if (tre) title = clean(tre[1]);
    title = title.replace(/^(MANGA|MANHWA|MANHUA|COMIC|NOVEL|WEBTOON)\s+/i, "").trim();
    if (!title || title.length < 2) title = slugTail.replace(/-/g, " ");
    out.push({ slug: fullSlug, id, type, path, url: BASE + path, poster, title });
  }
  return out;
}

function natCmp(a, b) {
  const A = String(a).match(/\d+|\D+/g) || [], B = String(b).match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] || "", y = B[i] || "";
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
      const d = parseInt(x, 10) - parseInt(y, 10);
      if (d) return d;
    } else {
      const c = x.localeCompare(y);
      if (c) return c;
    }
  }
  return 0;
}

// Capítulos: enlaces /view_uploads/{id} junto a "Capítulo N"
function chapterList(html) {
  const map = new Map();
  // "Capítulo 464" ... href="/view_uploads/1094485"
  const re1 = /Cap[ií]tulo\s+([0-9]+(?:\.[0-9]+)?)\s*[\s\S]{0,600}?href=["'](?:https?:\/\/zonatmo\.org)?(\/view_uploads\/(\d+))["']/gi;
  let m;
  while ((m = re1.exec(html)) !== null) {
    const num = m[1], path = m[2], uid = m[3];
    if (map.has(uid)) continue;
    map.set(uid, { url: BASE + path, path, id: uid, tail: num, title: "Capítulo " + num });
  }
  // href primero, luego texto Capítulo
  const re2 = /href=["'](?:https?:\/\/zonatmo\.org)?(\/view_uploads\/(\d+))["'][\s\S]{0,400}?Cap[ií]tulo\s+([0-9]+(?:\.[0-9]+)?)/gi;
  while ((m = re2.exec(html)) !== null) {
    const path = m[1], uid = m[2], num = m[3];
    if (map.has(uid)) continue;
    map.set(uid, { url: BASE + path, path, id: uid, tail: num, title: "Capítulo " + num });
  }
  // solo view_uploads (sin número de capítulo en texto cercano)
  if (map.size === 0) {
    const re3 = /href=["'](?:https?:\/\/zonatmo\.org)?(\/view_uploads\/(\d+))["']/gi;
    let n = 0;
    while ((m = re3.exec(html)) !== null) {
      const path = m[1], uid = m[2];
      if (map.has(uid)) continue;
      n++;
      map.set(uid, { url: BASE + path, path, id: uid, tail: String(n), title: "Capítulo " + n });
    }
  }
  const arr = [...map.values()];
  arr.sort((a, b) => natCmp(a.tail, b.tail));
  return arr;
}

function seriesMeta(html) {
  const pick = (re) => { const m = html.match(re); return m ? clean(m[1]) : ""; };
  let title = pick(/<h1[^>]*>([^<]{1,200})</i)
            || pick(/property="og:title"[^>]*content="([^"]+)"/i)
            || pick(/content="([^"]+)"[^>]*property="og:title"/i);
  title = title.replace(/\s*\|\s*ZonaTMO.*$/i, "").replace(/^Ver\s+/i, "").replace(/\s+Online\s+Gratis.*$/i, "").trim();
  let poster = pick(/property="og:image"[^>]*content="([^"]+)"/i)
            || pick(/content="(https?:\/\/[^"]+)"[^>]*property="og:image"/i);
  if (poster && !poster.startsWith("http")) poster = BASE + poster;
  const overview = pick(/property="og:description"[^>]*content="([^"]+)"/i)
                || pick(/Descripci[oó]n[\s\S]{0,120}?>([\s\S]{10,500}?)</i);
  const status = /Public[aá]ndose|En emisi[oó]n/i.test(html) ? "En emisión"
               : /Finalizado/i.test(html) ? "Finalizado" : "";
  const genres = [];
  const gre = /href=["']\/tag\/[^"']+["'][^>]*>([^<]+)</gi;
  let gm;
  while ((gm = gre.exec(html)) !== null && genres.length < 12) {
    const g = clean(gm[1]);
    if (g && genres.indexOf(g) < 0) genres.push(g);
  }
  return { title, poster, overview, status, genres: genres.join(", ") };
}

// Imágenes del lector: /view_uploads o /viewer/.../cascade
function readerImages(html) {
  const out = [];
  const seen = {};
  const collect = (srcRe) => {
    const re = new RegExp(srcRe, "gi");
    let m;
    while ((m = re.exec(html)) !== null) {
      let url = m[1];
      if (!url.startsWith("http")) url = BASE + url;
      if (/avatar|logo|icon|emoji|badge|favicon|thumb[_-]?sm|sprite|banner/i.test(url)) continue;
      if (seen[url]) continue;
      seen[url] = true;
      out.push({ url });
    }
  };
  // patrones típicos de páginas de manga
  collect('(?:data-src|data-lazy-src|data-original|src)=["\'](https?:\\/\\/[^"\']+\\.(?:jpe?g|png|webp|avif)[^"\']*)["\']');
  collect('(?:data-src|data-lazy-src|src)=["\'](\\/[^"\']+\\.(?:jpe?g|png|webp|avif)[^"\']*)["\']');
  // JSON embebido a veces tiene urls de imágenes
  collect('"(https?:\\/\\/[^"]+\\/(?:uploads|images|pages|media|storage)[^"]+\\.(?:jpe?g|png|webp|avif)[^"]*)"');
  out.sort((a, b) => {
    const na = (a.url.match(/(?:page|p|img|file)[_-]?(\d+)/i) || [])[1];
    const nb = (b.url.match(/(?:page|p|img|file)[_-]?(\d+)/i) || [])[1];
    if (na && nb) return parseInt(na, 10) - parseInt(nb, 10);
    return 0;
  });
  return out;
}

function findCascadePath(html) {
  const m = html.match(/href=["'](?:https?:\/\/zonatmo\.org)?(\/viewer\/[a-zA-Z0-9]+\/cascade)["']/i)
         || html.match(/["'](\/viewer\/[a-zA-Z0-9]+\/cascade)["']/i)
         || html.match(/["'](https?:\/\/zonatmo\.org\/viewer\/[a-zA-Z0-9]+\/cascade)["']/i);
  if (!m) return null;
  let p = m[1];
  if (p.startsWith("http")) p = p.replace(/^https?:\/\/zonatmo\.org/, "");
  return p;
}

const SIZE_SCALE = [16, 24, 32, 40, 48, 64, 80, 96, 120, 160, 200, 240, 320, 400, 480, 560, 640];

function pageBox(r, wCap, hCap) {
  if (!isFinite(r) || r <= 0) return null;
  for (const tol of [0.02, 0.05, 0.12, 0.25]) {
    let best = null;
    for (const w of SIZE_SCALE) {
      if (w > wCap || w < 80) continue;
      for (const h of SIZE_SCALE) {
        if (h > hCap || h < 96) continue;
        const err = Math.abs(h / w - r) / r;
        if (err <= tol) {
          const a = w * h;
          if (!best || a > best.a || (a === best.a && err < best.err)) best = { w, h, a, err };
        }
      }
    }
    if (best) return { width: best.w, height: best.h };
  }
  return null;
}

function pageBig(r) {
  if (!isFinite(r) || r <= 0) return null;
  let best = null;
  for (const w of SIZE_SCALE) {
    if (w < 240 || w > 640) continue;
    for (const h of SIZE_SCALE) {
      if (h < 320 || h > 640) continue;
      const err = Math.abs(h / w - r) / r;
      if (err > 0.12) continue;
      const a = w * h;
      if (!best || a > best.a) best = { w, h, a };
    }
  }
  return best ? { width: best.w, height: best.h } : null;
}

function pageNodes(p, i) {
  const img = {
    type: "Image", key: "p" + i, url: typeof p === "string" ? p : p.url,
    alt: "Página " + (i + 1), altEn: "Page " + (i + 1),
    fallback: { type: "Column", padding: 16, children: [
      { type: "Text", text: "Página " + (i + 1), textEn: "Page " + (i + 1), color: "muted" } ] },
  };
  const w = (p && p.w) || 0, h = (p && p.h) || 0;
  const ratio = w > 0 && h > 0 ? h / w : 0;
  const tall = ratio >= 1.05 && ratio <= 1.8;
  if (ratio > 0 && tall) {
    const small = pageBox(ratio, 400, 640) || { width: 400, height: 560 };
    const compact = Object.assign({}, img, { key: "pc" + i, sizes: ["compact"],
      width: small.width, height: small.height });
    const big = Object.assign({}, img, { key: "pe" + i, sizes: ["medium", "expanded"],
      width: 640, aspect: "2:3" });
    return [compact, big];
  }
  if (ratio > 0) {
    const small = pageBox(ratio, 400, 640), big = pageBig(ratio) || pageBox(ratio, 640, 640);
    if (small && big) {
      img.width = { compact: small.width, medium: big.width, expanded: big.width };
      img.height = { compact: small.height, medium: big.height, expanded: big.height };
      return [img];
    }
  }
  img.width = { compact: 400, medium: 400, expanded: 480 };
  img.height = { compact: 560, medium: 560, expanded: 640 };
  return [img];
}

async function loadSeries(slug) {
  // slug = "manga/30537/mairimashita-iruma-kun"
  const path = "/library/" + slug.replace(/^\/+|\/+$/g, "");
  try { kino.log("loadSeries " + path); } catch (e) {}
  const html = await getHtml(path + "/");
  const meta = seriesMeta(html);
  let chapters = chapterList(html);
  if (!chapters.length) {
    try {
      const html2 = await getHtml(path);
      chapters = chapterList(html2);
      if (!meta.title) Object.assign(meta, seriesMeta(html2));
    } catch (e) { /* */ }
  }
  try { kino.log("chapters " + chapters.length); } catch (e) {}
  return { slug, meta, chapters, path };
}

async function loadChapterImages(ch) {
  let path = ch.path || ch.url.replace(BASE, "");
  if (!path.startsWith("/")) path = "/" + path;
  let html = await getHtml(path);
  let images = readerImages(html);
  if (images.length >= 2) return images;
  // intentar vista cascade
  let cascade = findCascadePath(html);
  if (!cascade && /\/view_uploads\/(\d+)/.test(path)) {
    // a veces el viewer usa el mismo id numérico en otra ruta
    // no siempre existe; solo reintentamos si el HTML apunta a cascade
  }
  if (cascade) {
    try {
      html = await getHtml(cascade);
      const more = readerImages(html);
      if (more.length > images.length) images = more;
    } catch (e) { try { kino.log("cascade fail " + e.message); } catch (e2) {} }
  }
  // última carta: buscar /viewer/... en el HTML sin href
  if (images.length < 2) {
    const vm = html.match(/\/viewer\/([a-zA-Z0-9]+)(?:\/cascade)?/);
    if (vm) {
      try {
        html = await getHtml("/viewer/" + vm[1] + "/cascade");
        const more = readerImages(html);
        if (more.length > images.length) images = more;
      } catch (e) { /* */ }
    }
  }
  return images;
}

// ------------------------------------------------------------ almacen

function getJson(key, fallback) {
  try {
    const v = kino.storage.get(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}
function setJson(key, val) {
  try { kino.storage.set(key, JSON.stringify(val)); } catch (e) { try { kino.log("storage " + e.message); } catch (e2) {} }
}
function favs() { return getJson("favs", []); }
function isFav(slug) { return favs().some((f) => f.slug === slug); }
function progress() { return getJson("prog", {}); }

function markRead(slug, title, poster, chTitle, url) {
  const p = progress();
  p[slug] = { title, poster, chTitle, url, ts: Date.now() };
  setJson("prog", p);
  syncPush("prog", p);
}

function readerCache(url) { return getJson("rc:" + url, null); }
function readerCachePut(url, images) {
  try {
    const keys = kino.storage.keys().filter((k) => k.indexOf("rc:") === 0);
    if (keys.length > 4) for (const k of keys.slice(0, keys.length - 4)) kino.storage.remove(k);
  } catch (e) { /* */ }
  setJson("rc:" + url, images);
}

function syncPush(key, val) {
  try {
    if (typeof kino.shared === "object" && kino.shared !== null) kino.shared.set(key, val);
  } catch (e) { /* */ }
}

function syncPull() {
  try {
    if (typeof kino.shared !== "object" || kino.shared === null) return;
    const sf = kino.shared.get("favs");
    if (Array.isArray(sf)) {
      const local = favs();
      const have = {};
      for (const f of local) have[f.slug] = true;
      let changed = false;
      for (const f of sf.slice(0, 200)) {
        if (!f || typeof f !== "object" || typeof f.slug !== "string") continue;
        if (have[f.slug]) continue;
        local.push({
          slug: f.slug,
          title: String(f.title || f.slug).slice(0, 200),
          poster: typeof f.poster === "string" ? f.poster.slice(0, 500) : "",
        });
        have[f.slug] = true;
        changed = true;
      }
      if (changed) { setJson("favs", local); syncPush("favs", local); }
    }
    const sp = kino.shared.get("prog");
    if (sp && typeof sp === "object" && !Array.isArray(sp)) {
      const p = progress();
      let changed = false;
      for (const k of Object.keys(sp).slice(0, 200)) {
        const e = sp[k];
        if (!e || typeof e !== "object" || typeof e.ts !== "number") continue;
        if (p[k] && (p[k].ts || 0) >= e.ts) continue;
        p[k] = {
          title: String(e.title || k).slice(0, 200),
          poster: typeof e.poster === "string" ? e.poster.slice(0, 500) : "",
          chTitle: String(e.chTitle || "").slice(0, 200),
          url: typeof e.url === "string" ? e.url : "",
          ts: e.ts,
        };
        changed = true;
      }
      if (changed) setJson("prog", p);
    }
  } catch (e) { /* */ }
}

// ----------------------------------------------------------- interfaz

const TABS = [
  { value: "inicio", label: "Inicio", labelEn: "Home" },
  { value: "biblioteca", label: "Biblioteca", labelEn: "Library" },
  { value: "favoritos", label: "Favoritos", labelEn: "Favourites" },
  { value: "historial", label: "Historial", labelEn: "History" },
];

// Tarjeta propia (no titleGrid/KinoItem): el toque dispara openSeries
function posterCard(it, prefix, rail) {
  const img = {
    type: "Image", url: it.poster || "", aspect: "2:3",
    alt: it.title, altEn: it.title,
    fallback: { type: "Column", padding: 16, crossAxisAlignment: "center", children: [
      { type: "Icon", name: "list", color: "muted" } ] },
  };
  if (rail) img.width = 120;
  return {
    type: "Card", key: (prefix || "c-") + it.slug.replace(/\//g, "-"), flush: true,
    onTap: { event: "openSeries", arg: it.slug },
    children: [
      img,
      { type: "Text", text: it.title, textEn: it.title, style: "caption", maxLines: 2, padding: 8 },
    ],
  };
}

const EMPTY_LIB = { type: "emptyState", icon: "list", title: "Nada por aquí todavía.", titleEn: "Nothing here yet." };
const EMPTY_FAV = { type: "emptyState", icon: "heart", title: "Marca obras con el corazón para verlas aquí.", titleEn: "Mark works with the heart to see them here." };

function titleGridOf(items, eventMore, loading, done, emptyNode) {
  if (!items || !items.length) return emptyNode || EMPTY_LIB;
  const list = {
    type: "ListView", key: "grid",
    columns: { compact: 3, medium: 4, expanded: 6 },
    items: items.map((it) => posterCard(it, "c-")),
  };
  if (eventMore && !done) {
    list.onEndReached = { event: eventMore };
    list.loadingMore = loading === true;
  } else {
    list.done = true;
  }
  return list;
}

function historyList() {
  const p = progress();
  const rows = Object.keys(p).map((slug) => ({ slug, p: p[slug] }))
    .sort((a, b) => b.p.ts - a.p.ts).slice(0, 50);
  if (!rows.length) {
    return { type: "emptyState", icon: "schedule", title: "Todavía no has leído nada.", titleEn: "You have not read anything yet." };
  }
  return {
    type: "ListView", key: "hist",
    items: rows.map((r) => ({
      type: "ListTile", key: "h-" + r.slug.replace(/\//g, "-"),
      title: r.p.title || r.slug,
      subtitle: r.p.chTitle || "", subtitleEn: r.p.chTitle || "",
      leading: { type: "CircleAvatar", image: r.p.poster, icon: "list" },
      onTap: { event: "openSeries", arg: r.slug },
    })),
  };
}

async function fetchLibrary(page) {
  const path = page <= 1 ? "/biblioteca" : "/biblioteca?page=" + page;
  const html = await getHtml(path);
  return seriesCards(html, 40);
}

async function tabBody(state) {
  const tab = state.tab || "inicio";
  if (tab === "favoritos") return titleGridOf(favs(), null, false, true, EMPTY_FAV);
  if (tab === "historial") return historyList();
  if (tab === "biblioteca") {
    let items = Array.isArray(state.libItems) ? state.libItems : null;
    if (!items) {
      try { items = await fetchLibrary(1); }
      catch (e) {
        return {
          type: "Column", padding: 24, gap: 12, crossAxisAlignment: "center", children: [
            { type: "Icon", name: "error", color: "muted" },
            { type: "Text", text: "Error: " + ((e && e.userMessage) || (e && e.message) || "red"), color: "muted" },
            { type: "ElevatedButton", icon: "refresh", labelText: "Reintentar", labelTextEn: "Retry", onPressed: "retry" },
          ],
        };
      }
    }
    return titleGridOf(items, "libMore", state.libLoading === true, state.libDone === true);
  }
  return await homeBody(state);
}

async function homeBody(state) {
  let items = Array.isArray(state.inicioItems) ? state.inicioItems : null;
  if (!items) {
    try {
      const html = await getHtml("/");
      items = seriesCards(html, 36);
    } catch (e) {
      return {
        type: "Column", padding: 24, gap: 12, crossAxisAlignment: "center", children: [
          { type: "Icon", name: "error", color: "muted" },
          { type: "Text", text: "Error: " + ((e && e.userMessage) || (e && e.message) || "red"), color: "muted", textAlign: "center" },
          { type: "ElevatedButton", icon: "refresh", labelText: "Reintentar", labelTextEn: "Retry", onPressed: "retry" },
        ],
      };
    }
  }
  if (!items.length) return EMPTY_LIB;
  return {
    type: "SingleChildScrollView", key: "home", flex: 1,
    children: [{
      type: "Column", children: [
        { type: "ListTile", key: "searchTile", leading: { type: "Icon", name: "search" },
          title: "Buscar obra", titleEn: "Search a work",
          subtitle: "Por título, p. ej. Solo Leveling", subtitleEn: "By title, e.g. Solo Leveling",
          trailing: { type: "Icon", name: "arrow_forward" },
          onTap: { event: "goSearch" } },
        { type: "Text", text: "Últimas obras", textEn: "Latest works", style: "h3", padding: 16 },
        {
          type: "SingleChildScrollView", key: "latestRail", direction: "horizontal",
          children: [{
            type: "Row", gap: 8, padding: 8,
            children: items.slice(0, 24).map((it) => posterCard(it, "r-", true)),
          }],
        },
        favs().length ? { type: "Text", text: "Mis favoritos", textEn: "My favourites", style: "h3", padding: 16 } : null,
        favs().length ? {
          type: "SingleChildScrollView", key: "favRail", direction: "horizontal",
          children: [{
            type: "Row", gap: 8, padding: 8,
            children: favs().slice(0, 20).map((it) => posterCard(it, "f-", true)),
          }],
        } : null,
      ].filter(Boolean),
    }],
  };
}

function routeSlug(r) {
  if (!r) return "";
  return String((r.args && r.args.slug) || (r.params && r.params.slug) || r.slug || "");
}

function loadingTree(msg) {
  return {
    type: "Column", padding: 32, gap: 12, crossAxisAlignment: "center", children: [
      { type: "CircularProgressIndicator" },
      { type: "Text", text: msg || "Cargando…", textEn: "Loading…", color: "muted" },
    ],
  };
}

async function detailTree(state) {
  const d = state.detail;
  if (!d) return loadingTree();
  const fav = isFav(d.slug);
  const meta = d.meta || {};
  const chapters = d.chapters || [];
  const prog = progress()[d.slug];
  let continueIdx = -1;
  if (prog && prog.url) {
    continueIdx = chapters.findIndex((c) => c.url === prog.url || c.path === prog.url);
  }

  const headChildren = [];
  if (meta.poster) {
    headChildren.push({ type: "Image", url: meta.poster, width: 140, height: 200, key: "poster" });
  }
  headChildren.push({ type: "Text", text: meta.title || d.slug, style: "h2", key: "t" });
  if (meta.status) headChildren.push({ type: "Text", text: meta.status, color: "muted", key: "st" });
  if (meta.genres) headChildren.push({ type: "Text", text: meta.genres, color: "muted", key: "g" });
  if (meta.overview) {
    headChildren.push({
      type: "Text",
      text: meta.overview.slice(0, 400) + (meta.overview.length > 400 ? "…" : ""),
      key: "syn",
    });
  }

  const actions = [];
  if (continueIdx >= 0) {
    actions.push({
      type: "ElevatedButton", key: "contBtn", icon: "play",
      labelText: "Continuar · " + (chapters[continueIdx].title || ""),
      labelTextEn: "Continue · " + (chapters[continueIdx].title || ""),
      onPressed: { event: "read", arg: String(continueIdx) },
    });
  } else if (chapters.length) {
    actions.push({
      type: "ElevatedButton", key: "startBtn", icon: "play",
      labelText: "Empezar a leer", labelTextEn: "Start reading",
      onPressed: { event: "read", arg: "0" },
    });
  }
  actions.push({
    type: "ElevatedButton", key: "fav",
    icon: fav ? "heart" : "star",
    labelText: fav ? "Quitar de favoritos" : "Añadir a favoritos",
    labelTextEn: fav ? "Remove favourite" : "Add favourite",
    onPressed: "fav",
  });

  const head = {
    type: "Column", key: "head", padding: 16, gap: 10, children: [
      ...headChildren,
      { type: "Row", gap: 8, wrap: true, children: actions },
    ].filter(Boolean),
  };

  const items = [head];
  items.push({
    type: "Text",
    text: chapters.length + " capítulos",
    textEn: chapters.length + " chapters",
    style: "h3",
    padding: 16,
  });
  if (!chapters.length) {
    items.push({
      type: "Text",
      text: "No se encontraron capítulos en el HTML. Prueba Reintentar o abre la obra en la web.",
      color: "muted",
      padding: 16,
    });
  }
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    items.push({
      type: "ListTile", key: "ch" + i, dense: true,
      title: c.title,
      onTap: { event: "read", arg: String(i) },
      trailing: { type: "Icon", name: "arrow_forward" },
    });
  }
  return { type: "ListView", key: "detailBody", items };
}

let navSeq = 0;

async function readerTree(state) {
  const r = state.reader;
  if (!r) return loadingTree("Cargando páginas…");
  const pages = r.images || [];
  const ch = r.chapters[r.idx];
  const hasNext = r.idx + 1 < r.chapters.length;
  const hasPrev = r.idx > 0;
  const chKey = String(ch ? ch.id || ch.url : r.idx).replace(/[^a-z0-9]/gi, "").slice(-16);
  const scrollKey = "pages-" + r.idx + "-" + chKey + "-" + (r.tk || 0);
  const pageCol = {
    type: "Column", gap: 4, crossAxisAlignment: "center",
    children: pages.flatMap((p, i) => pageNodes(p, i)),
  };
  const body = [];
  body.push({
    type: "SingleChildScrollView", key: scrollKey, flex: 1,
    children: [pageCol],
  });
  body.push({
    type: "Row", gap: 12, padding: 16, mainAxisAlignment: "center", wrap: true, children: [
      {
        type: "ElevatedButton", icon: "arrow_back",
        labelText: "Anterior", labelTextEn: "Previous",
        onPressed: "prevChap", enabled: hasPrev,
      },
      {
        type: "ElevatedButton",
        labelText: hasNext ? "Siguiente" : "Último capítulo",
        labelTextEn: hasNext ? "Next" : "Last chapter",
        icon: "arrow_forward", onPressed: "nextChap", enabled: hasNext,
      },
    ],
  });
  return {
    type: "Scaffold",
    appBar: { title: ch ? ch.title : "Leyendo", actions: [] },
    body: { type: "Column", children: body },
  };
}

function searchTree(state) {
  const q = typeof state.resultsQ === "string" ? state.resultsQ : "";
  const results = Array.isArray(state.results) ? state.results : null;
  return {
    type: "Scaffold",
    appBar: { title: "Buscar obra", titleEn: "Search a work", actions: [] },
    body: {
      type: "SingleChildScrollView", key: "searchBody",
      children: [{
        type: "Column", children: [
          {
            type: "Form", key: "search", onSubmitted: "search", gap: 8, padding: 16, children: [
              {
                type: "TextField", key: "q", kind: "search", value: q,
                labelText: "Título", labelTextEn: "Title",
                hintText: "P. ej. Solo Leveling", hintEn: "e.g. Solo Leveling",
                required: true,
              },
              {
                type: "ElevatedButton", icon: "search",
                labelText: "Buscar", labelTextEn: "Search", submit: true,
              },
            ],
          },
          results
            ? (results.length
                ? titleGridOf(results)
                : { type: "emptyState", icon: "search", title: "Sin resultados.", titleEn: "No results." })
            : {
                type: "Text",
                text: "Escribe un título y pulsa Buscar.",
                textEn: "Type a title and press Search.",
                color: "muted",
                padding: 16,
              },
        ].filter(Boolean),
      }],
    },
  };
}

// --------------------------------------------------------- exports

export async function screen({ state, route }) {
  const r = route || { name: "main" };
  try {
    if (r.name === "detail") {
      const slug = routeSlug(r);
      if (!state.detail || state.detail.slug !== slug) return loadingTree();
      return await detailTree(state);
    }
    if (r.name === "read") return await readerTree(state);
    if (r.name === "search") return searchTree(state);
  } catch (e) {
    return {
      type: "Column", padding: 16, gap: 8, children: [
        { type: "Icon", name: "error", color: "muted" },
        { type: "Text", text: "No se pudo cargar (" + ((e && e.code) || "error") + ").", color: "muted" },
        { type: "ElevatedButton", icon: "refresh", labelText: "Reintentar", labelTextEn: "Retry", onPressed: "retry" },
      ],
    };
  }
  const body = await tabBody(state);
  return {
    type: "Scaffold",
    appBar: {
      title: "ZonaTMO",
      actions: [
        { type: "IconButton", icon: "search", key: "goSearch", labelText: "Buscar", labelTextEn: "Search", onPressed: { event: "goSearch" } },
      ],
      bottom: {
        type: "TabBar", key: "tabs", tabs: TABS,
        value: state.tab || "inicio",
        onChanged: { event: "tab" },
      },
    },
    body,
  };
}

export async function screenEvent(ev) {
  const name = ev && ev.name;
  const state = (ev && ev.state) || {};
  const arg = ev && (ev.arg != null ? ev.arg : ev.value);
  try {
    if (name === "open") {
      syncPull();
      const route = (ev && ev.route) || {};
      const slug = routeSlug(route);
      if (route.name === "detail" && slug) {
        const d = await loadSeries(slug);
        return { state: { detail: d } };
      }
      return null;
    }
    if (name === "tab") {
      return { state: { tab: String(arg || "inicio") } };
    }
    if (name === "libMore") {
      const page = (state.libPage || 1) + 1;
      try {
        const more = await fetchLibrary(page);
        const prev = Array.isArray(state.libItems) ? state.libItems : [];
        return {
          state: {
            libItems: prev.concat(more),
            libPage: page,
            libLoading: false,
            libDone: more.length < 20,
          },
        };
      } catch (e) {
        return { toast: "No se pudieron cargar más obras" };
      }
    }
    if (name === "goSearch") return { route: { push: "search" } };
    if (name === "search") {
      const inputs = (state && state.inputs) || {};
      const q = clean(String(arg || inputs.q || state.resultsQ || ""));
      if (q.length < 2) return { toast: "Escribe al menos 2 caracteres" };
      const seen = {};
      const results = [];
      const addAll = (arr) => {
        for (const it of arr) {
          if (seen[it.slug]) continue;
          seen[it.slug] = true;
          results.push(it);
        }
      };
      // 1) biblioteca con filtro por título
      const queries = [
        "/biblioteca?_title=" + encodeURIComponent(q) + "&filter_by=title",
        "/biblioteca?title=" + encodeURIComponent(q),
        "/biblioteca?q=" + encodeURIComponent(q),
        "/library?_title=" + encodeURIComponent(q) + "&filter_by=title",
      ];
      for (const path of queries) {
        try {
          const html = await getHtml(path);
          addAll(seriesCards(html, 50));
          if (results.length >= 12) break;
        } catch (e) { /* siguiente */ }
      }
      // 2) fallback: home + biblioteca y filtrar local
      if (results.length < 5) {
        try {
          const home = await getHtml("/");
          const all = seriesCards(home, 80);
          const ql = q.toLowerCase();
          const qslug = ql.replace(/\s+/g, "-");
          addAll(all.filter((it) =>
            it.title.toLowerCase().indexOf(ql) >= 0 ||
            it.slug.toLowerCase().indexOf(qslug) >= 0));
        } catch (e) { /* */ }
      }
      if (results.length < 5) {
        try {
          const lib = await getHtml("/biblioteca");
          const all = seriesCards(lib, 80);
          const ql = q.toLowerCase();
          const qslug = ql.replace(/\s+/g, "-");
          addAll(all.filter((it) =>
            it.title.toLowerCase().indexOf(ql) >= 0 ||
            it.slug.toLowerCase().indexOf(qslug) >= 0));
        } catch (e) { /* */ }
      }
      return {
        state: { results, resultsQ: q },
        toast: results.length ? results.length + " resultados" : "Sin resultados",
      };
    }
    if (name === "retry") return { state: { inicioItems: null, libItems: null, _r: Date.now() } };
    if (name === "fav") {
      const d = state.detail;
      if (!d) return null;
      const f = favs();
      const i = f.findIndex((x) => x.slug === d.slug);
      let added = false;
      if (i >= 0) f.splice(i, 1);
      else {
        f.unshift({
          slug: d.slug,
          title: (d.meta && d.meta.title) || d.slug,
          poster: d.meta && d.meta.poster,
        });
        added = true;
      }
      setJson("favs", f);
      syncPush("favs", f);
      return { toast: added ? "Añadida a favoritos" : "Quitada de favoritos" };
    }
    if (name === "read" || name === "nextChap" || name === "prevChap") {
      let chapters, idx, slug, title, poster;
      if (name === "read") {
        const d = state.detail;
        if (!d) return null;
        chapters = d.chapters;
        idx = parseInt(String(arg || "0"), 10) || 0;
        slug = d.slug;
        title = d.meta && d.meta.title;
        poster = d.meta && d.meta.poster;
        if (idx < 0 || idx >= chapters.length) return null;
      } else {
        const r = state.reader;
        if (!r) return null;
        chapters = r.chapters;
        idx = r.idx + (name === "nextChap" ? 1 : -1);
        slug = r.slug; title = r.title; poster = r.poster;
        if (idx < 0 || idx >= chapters.length) return null;
      }
      const ch = chapters[idx];
      let images = readerCache(ch.url);
      if (!images) {
        images = await loadChapterImages(ch);
        if (images.length) readerCachePut(ch.url, images);
      }
      if (!images.length) {
        return { toast: "No se encontraron páginas. El visor de ZonaTMO puede cargar las imágenes solo en el navegador." };
      }
      markRead(slug, title, poster, ch.title, ch.url);
      const reader = { slug, title, poster, chapters, idx, images, tk: ++navSeq };
      if (name === "read") return { state: { reader }, route: { push: "read" } };
      return { state: { reader } };
    }
    if (name === "openSeries") {
      const slug = String(arg || "");
      if (!slug || slug.indexOf("/") < 0) return { toast: "Slug inválido" };
      try { kino.log("openSeries " + slug); } catch (e) {}
      const d = await loadSeries(slug);
      if (!d.chapters.length) {
        return {
          state: { detail: d },
          route: { push: "detail", params: { slug } },
          toast: "Sin capítulos en el HTML (puede cargar por JS en la web).",
        };
      }
      return {
        state: { detail: d },
        route: { push: "detail", params: { slug } },
      };
    }
  } catch (e) {
    return { toast: "Algo falló: " + ((e && e.code) || (e && e.message) || "error") };
  }
  return null;
}
