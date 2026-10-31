// Plugin de Kino para leer obras de zonatmo.org
// Interfaz tipo lector de manga: Inicio, Biblioteca,
// Favoritos, Historial, detalle de obra y lector webcómic vertical.
// Funciona en teléfono y TV desde el mismo árbol de nodos.
//
// Requiere Kino 0.9.74 o superior (apiVersion 14, capability "screen").
// Adaptado del plugin Yuri Online.

const BASE = "https://zonatmo.org";

// ---------------------------------------------------------------- red

async function getHtml(path) {
  const r = await kino.fetch(BASE + path, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; KinoPlugin/1.0)",
    },
  });
  if (!r.ok) throw kino.error("network", "HTTP " + r.status, {
    userMessage: "No se pudo conectar con ZonaTMO. Inténtalo de nuevo.",
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

// Tarjetas de obras desde /library/{tipo}/{id}/{slug}
function seriesCards(html, max) {
  const out = [];
  const seen = {};
  // enlaces del estilo /library/manga/30537/mairimashita-iruma-kun
  const re = /href="(?:https:\/\/zonatmo\.org)?(\/library\/(manga|manhwa|manhua|comic|novel|webtoon)\/(\d+)\/([a-z0-9][a-z0-9-]*))"/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 48)) {
    const path = m[1], type = m[2].toLowerCase(), id = m[3], slug = m[4];
    const key = type + "/" + id;
    if (seen[key]) continue;
    seen[key] = true;
    const win = html.slice(Math.max(0, m.index - 200), m.index + 1800);
    // poster
    let poster = "";
    const im = win.match(/(?:data-src|src)="(https:\/\/[^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/i)
            || win.match(/(?:data-src|src)="(\/[^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/i);
    if (im) poster = im[1].startsWith("http") ? im[1] : BASE + im[1];
    // 18+
    const adult = /\+18|18\+|adulto|nsfw|mature/i.test(win.slice(0, 600));
    // título: suele estar cerca del enlace
    let title = "";
    const tre = win.match(new RegExp(slug.replace(/-/g, "[- ]") + "[^<]{0,5}<[^>]*>([^<]{2,120})", "i"))
             || win.match(/>([^<]{3,100})</);
    if (tre) title = clean(tre[1]);
    if (!title || title.length < 2) title = slug.replace(/-/g, " ");
    out.push({
      slug: type + "/" + id + "/" + slug,
      id, type, path,
      url: BASE + path,
      poster, title, adult,
    });
  }
  return out;
}

// Lista de capítulos desde la página de detalle.
// Enlaces típicos: /view_uploads/1094485  junto a "Capítulo N"
function chapterList(html) {
  const map = new Map();
  // "Capítulo 464" ... /view_uploads/1094485
  const re = /Cap[ií]tulo\s+([0-9]+(?:\.[0-9]+)?)\s*[\s\S]{0,400}?href="(?:https:\/\/zonatmo\.org)?(\/view_uploads\/(\d+))"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const num = m[1], path = m[2], uid = m[3];
    if (map.has(uid)) continue;
    map.set(uid, {
      url: BASE + path,
      path,
      id: uid,
      tail: num,
      title: "Capítulo " + num,
    });
  }
  // fallback más permisivo
  if (map.size === 0) {
    const re2 = /href="(?:https:\/\/zonatmo\.org)?(\/view_uploads\/(\d+))"[^>]*>[\s\S]{0,80}?Cap[ií]tulo\s+([0-9]+(?:\.[0-9]+)?)/gi;
    while ((m = re2.exec(html)) !== null) {
      const path = m[1], uid = m[2], num = m[3];
      if (map.has(uid)) continue;
      map.set(uid, { url: BASE + path, path, id: uid, tail: num, title: "Capítulo " + num });
    }
  }
  const arr = [...map.values()];
  arr.sort((a, b) => natCmp(a.tail, b.tail));
  return arr;
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

function adultAllowed() {
  try { return kino.config.get("adulto") === true; } catch (e) { return false; }
}

function seriesMeta(html) {
  const pick = (re) => { const m = html.match(re); return m ? clean(m[1]) : ""; };
  const title = pick(/<h1[^>]*>([^<]{1,200})</i)
             || pick(/property="og:title"[^>]*content="([^"]+)"/i)
             || pick(/content="([^"]+)"[^>]*property="og:title"/i)
             || "";
  let poster = pick(/property="og:image"[^>]*content="([^"]+)"/i)
            || pick(/content="(https:\/\/[^"]+\.(?:jpe?g|png|webp))"[^>]*property="og:image"/i);
  if (poster && !poster.startsWith("http")) poster = BASE + poster;
  const synopsis = pick(/Descripci[oó]n[\s\S]{0,80}?>([\s\S]{20,600}?)</i)
                || pick(/property="og:description"[^>]*content="([^"]+)"/i)
                || "";
  const status = /Public[aá]ndose|En emisi[oó]n/i.test(html) ? "En emisión"
               : /Finalizado/i.test(html) ? "Finalizado"
               : /Pausado|Cancelado/i.test(html) ? "Pausado/Cancelado" : "";
  const adult = /\+18|18\+|NSFW|adulto/i.test(html.slice(0, 4000));
  // géneros
  const genres = [];
  const gre = /href="\/tag\/([^"]+)"[^>]*>([^<]+)</gi;
  let gm;
  while ((gm = gre.exec(html)) !== null && genres.length < 12) {
    const g = clean(gm[2]);
    if (g && genres.indexOf(g) < 0) genres.push(g);
  }
  return { title, poster, synopsis, status, genres, adult };
}

// Imágenes del lector (/view_uploads/ID)
function readerImages(html) {
  const out = [];
  const seen = {};
  // patrones comunes de imágenes de página
  const patterns = [
    /(?:data-src|src)="(https:\/\/[^"]*zonatmo\.org[^"]*\/(?:uploads|images|pages|media|storage)[^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/gi,
    /(?:data-src|src)="(https:\/\/[^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/gi,
    /(?:data-src|src)="(\/[^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      let url = m[1];
      if (!url.startsWith("http")) url = BASE + url;
      // filtrar iconos, logos, avatares pequeños
      if (/avatar|logo|icon|emoji|badge|button|thumb-sm|favicon/i.test(url)) continue;
      if (seen[url]) continue;
      seen[url] = true;
      out.push({ url });
    }
    if (out.length > 3) break;
  }
  // orden aproximado: si hay números de página en la URL, ordenar
  out.sort((a, b) => {
    const na = (a.url.match(/(?:page|p|img)[_-]?(\d+)/i) || [])[1];
    const nb = (b.url.match(/(?:page|p|img)[_-]?(\d+)/i) || [])[1];
    if (na && nb) return parseInt(na, 10) - parseInt(nb, 10);
    return 0;
  });
  return out;
}

// Caja (dp) para una página de proporción r = alto/ancho
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
  const path = "/library/" + slug + (slug.endsWith("/") ? "" : "/");
  const html = await getHtml(path);
  const meta = seriesMeta(html);
  let chapters = chapterList(html);
  // si no hay capítulos, intentar sin barra final
  if (!chapters.length && path.endsWith("/")) {
    try {
      const html2 = await getHtml(path.slice(0, -1));
      chapters = chapterList(html2);
      if (!meta.title) Object.assign(meta, seriesMeta(html2));
    } catch (e) { /* ignore */ }
  }
  return { slug, meta, chapters, path };
}

// ----------------------------------------------------------- storage / shared

function getJson(key, def) {
  try {
    const v = kino.storage.get(key);
    if (v == null || v === "") return def;
    return JSON.parse(v);
  } catch (e) { return def; }
}
function setJson(key, val) {
  try { kino.storage.set(key, JSON.stringify(val)); } catch (e) { /* */ }
}

function favs() { return getJson("favs", []); }
function isFav(slug) { return favs().some((x) => x.slug === slug); }

function progress() { return getJson("progress", {}); }
function markRead(slug, title, poster, chTitle, chUrl) {
  const p = progress();
  p[slug] = { title, poster, chTitle, chUrl, ts: Date.now() };
  setJson("progress", p);
  syncPush("progress", p);
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
    if (typeof kino.shared !== "undefined" && kino.shared && kino.shared.set) {
      kino.shared.set(key, val);
    }
  } catch (e) { /* */ }
}

function syncPull() {
  try {
    if (typeof kino.shared === "undefined" || !kino.shared || !kino.shared.get) return;
    const sf = kino.shared.get("favs");
    if (sf && Array.isArray(sf)) setJson("favs", sf);
    const sp = kino.shared.get("progress");
    if (sp && typeof sp === "object") setJson("progress", sp);
  } catch (e) { /* */ }
}

// ----------------------------------------------------------- interfaz

const TABS = [
  { value: "inicio", label: "Inicio", labelEn: "Home" },
  { value: "biblioteca", label: "Biblioteca", labelEn: "Library" },
  { value: "favoritos", label: "Favoritos", labelEn: "Favourites" },
  { value: "historial", label: "Historial", labelEn: "History" },
];

function kinoItem(it) {
  const item = {
    id: "tmo-" + it.slug.replace(/\//g, "-"),
    ref: it.slug,
    title: it.title,
    kind: "movie",
    open: { screen: { route: "detail", args: { slug: it.slug } } },
  };
  if (it.poster) item.poster = it.poster;
  return item;
}

const EMPTY_LIB = { type: "emptyState", icon: "list", title: "Nada por aquí todavía.", titleEn: "Nothing here yet." };
const EMPTY_FAV = { type: "emptyState", icon: "heart", title: "Marca obras con el corazón para verlas aquí.", titleEn: "Mark works with the heart to see them here." };

function titleGridOf(items, eventMore, loading, done, emptyNode) {
  if (!items || !items.length) return emptyNode || EMPTY_LIB;
  const grid = {
    type: "titleGrid", key: "grid",
    columns: { compact: 3, medium: 4, expanded: 6 },
    items: items.map(kinoItem),
  };
  if (eventMore && !done) {
    grid.onEndReached = { event: eventMore };
    grid.loadingMore = loading === true;
  } else {
    grid.done = true;
  }
  return grid;
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

async function tabBody(state) {
  const tab = state.tab || "inicio";
  if (tab === "favoritos") return titleGridOf(favs(), null, false, true, EMPTY_FAV);
  if (tab === "historial") return historyList();
  if (tab === "biblioteca") {
    const items = Array.isArray(state.libItems) ? state.libItems : await fetchLibrary(1);
    return titleGridOf(items, "libMore", state.libLoading === true, state.libDone === true);
  }
  return await homeBody(state);
}

async function fetchLibrary(page) {
  // la biblioteca de ZonaTMO usa ?page=N
  const path = page <= 1 ? "/biblioteca" : "/biblioteca?page=" + page;
  const html = await getHtml(path);
  return seriesCards(html, 40);
}

async function homeBody(state) {
  let items = Array.isArray(state.inicioItems) ? state.inicioItems : null;
  if (!items) {
    const html = await getHtml("/");
    items = seriesCards(html, 30);
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
        { type: "titleRail", key: "latest", title: "Últimas obras", titleEn: "Latest works",
          size: "small", done: true, items: items.map(kinoItem) },
        favs().length ? { type: "titleRail", key: "favRail", title: "Mis favoritos", titleEn: "My favourites",
          size: "small", done: true, items: favs().map(kinoItem) } : null,
      ].filter(Boolean),
    }],
  };
}

// ------------------------------------------------------------- rutas

function routeSlug(r) {
  if (!r) return "";
  return String((r.args && r.args.slug) || (r.params && r.params.slug) || r.slug || "");
}

function loadingTree(msg) {
  return { type: "Column", padding: 32, gap: 12, crossAxisAlignment: "center", children: [
    { type: "CircularProgressIndicator" },
    { type: "Text", text: msg || "Cargando…", textEn: "Loading…", color: "muted" },
  ] };
}

async function detailTree(state) {
  const d = state.detail;
  if (!d) return loadingTree();
  const fav = isFav(d.slug);
  if (d.meta && d.meta.adult && !adultAllowed()) {
    return {
      type: "Column", padding: 24, gap: 16, crossAxisAlignment: "center", children: [
        { type: "Icon", name: "lock", size: 48 },
        { type: "Text", text: "Contenido 18+", style: "titleMedium" },
        { type: "Text", text: "Activa «Mostrar contenido 18+» en los ajustes del plugin para leer esta obra.",
          textEn: "Enable «Show 18+ content» in the plugin settings to read this work.",
          color: "muted", textAlign: "center" },
      ],
    };
  }
  const meta = d.meta || {};
  const chapters = d.chapters || [];
  const prog = progress()[d.slug];
  let continueIdx = -1;
  if (prog && prog.chUrl) {
    continueIdx = chapters.findIndex((c) => c.url === prog.chUrl || c.path === prog.chUrl);
  }

  const headerChildren = [
    meta.poster ? { type: "Image", url: meta.poster, width: 160, height: 220, key: "poster" } : null,
    { type: "Text", text: meta.title || d.slug, style: "titleLarge", key: "t" },
    meta.status ? { type: "Text", text: meta.status, color: "muted", key: "st" } : null,
    meta.genres && meta.genres.length
      ? { type: "Text", text: meta.genres.join(" · "), color: "muted", key: "g" } : null,
    meta.synopsis
      ? { type: "Text", text: meta.synopsis.slice(0, 400) + (meta.synopsis.length > 400 ? "…" : ""), key: "syn" } : null,
  ].filter(Boolean);

  const actions = [
    { type: "FilledButton", key: "favBtn",
      label: fav ? "Quitar de favoritos" : "Añadir a favoritos",
      labelEn: fav ? "Remove from favourites" : "Add to favourites",
      icon: fav ? "favorite" : "favorite_border",
      onTap: { event: "fav" } },
  ];
  if (continueIdx >= 0) {
    actions.unshift({
      type: "FilledButton", key: "contBtn",
      label: "Continuar · " + (chapters[continueIdx].title || ""),
      labelEn: "Continue · " + (chapters[continueIdx].title || ""),
      icon: "play_arrow",
      onTap: { event: "read", arg: String(continueIdx) },
    });
  } else if (chapters.length) {
    actions.unshift({
      type: "FilledButton", key: "startBtn",
      label: "Empezar a leer",
      labelEn: "Start reading",
      icon: "play_arrow",
      onTap: { event: "read", arg: "0" },
    });
  }

  const chItems = chapters.map((ch, i) => ({
    type: "ListTile",
    key: "ch-" + ch.id,
    title: ch.title,
    trailing: { type: "Icon", name: "chevron_right" },
    onTap: { event: "read", arg: String(i) },
  }));

  return {
    type: "SingleChildScrollView", key: "detail", flex: 1,
    children: [{
      type: "Column", padding: 16, gap: 12, children: [
        ...headerChildren,
        { type: "Row", gap: 8, children: actions },
        { type: "Text", text: "Capítulos (" + chapters.length + ")", style: "titleMedium", key: "chh" },
        chapters.length
          ? { type: "ListView", key: "chs", shrinkWrap: true, items: chItems }
          : { type: "Text", text: "No se encontraron capítulos.", color: "muted" },
      ],
    }],
  };
}

function readerTree(state) {
  const r = state.reader;
  if (!r) return loadingTree("Cargando páginas…");
  const images = r.images || [];
  const pages = [];
  for (let i = 0; i < images.length; i++) {
    pages.push(...pageNodes(images[i], i));
  }
  const nav = {
    type: "Row", key: "nav", mainAxisAlignment: "spaceBetween", padding: 8, children: [
      { type: "FilledButton", key: "prev", label: "Anterior", labelEn: "Previous",
        enabled: r.idx > 0, onTap: { event: "prevChap" } },
      { type: "Text", text: (r.chapters[r.idx] && r.chapters[r.idx].title) || ("Cap. " + (r.idx + 1)),
        key: "ct" },
      { type: "FilledButton", key: "next", label: "Siguiente", labelEn: "Next",
        enabled: r.idx < r.chapters.length - 1, onTap: { event: "nextChap" } },
    ],
  };
  return {
    type: "Column", key: "reader", flex: 1, children: [
      nav,
      { type: "SingleChildScrollView", key: "pages", flex: 1,
        children: [{ type: "Column", crossAxisAlignment: "center", gap: 8, children: pages }] },
      nav,
    ],
  };
}

function searchTree(state) {
  const results = state.results;
  return {
    type: "Column", key: "search", flex: 1, children: [
      { type: "TextField", key: "q",
        label: "Buscar", labelEn: "Search",
        value: state.resultsQ || "",
        onSubmitted: { event: "doSearch" },
        autofocus: true },
      results
        ? titleGridOf(results, null, false, true,
            { type: "emptyState", icon: "search", title: "Sin resultados", titleEn: "No results" })
        : { type: "Text", text: "Escribe un título y pulsa buscar.", color: "muted", padding: 16 },
    ],
  };
}

// ------------------------------------------------------------- screen API

let navSeq = 0;

export async function screen(ctx) {
  syncPull();
  const route = (ctx && ctx.route) || { name: "main" };
  const state = (ctx && ctx.state) || {};
  const name = route.name || route.route || "main";

  if (name === "detail") {
    const slug = routeSlug(route) || state.detail && state.detail.slug;
    if (!state.detail || state.detail.slug !== slug) {
      // se carga en open / openSeries
      return {
        title: "Cargando…",
        body: loadingTree(),
      };
    }
    return {
      title: (state.detail.meta && state.detail.meta.title) || "Obra",
      body: await detailTree(state),
      actions: [{ icon: "favorite", event: "fav" }],
    };
  }

  if (name === "read") {
    return {
      title: (state.reader && state.reader.title) || "Lector",
      body: readerTree(state),
    };
  }

  if (name === "search") {
    return {
      title: "Buscar",
      titleEn: "Search",
      body: searchTree(state),
    };
  }

  // main
  const tab = state.tab || "inicio";
  return {
    title: "ZonaTMO",
    body: {
      type: "Column", flex: 1, children: [
        { type: "SegmentedButton", key: "tabs",
          segments: TABS, value: tab,
          onChanged: { event: "tab" } },
        { type: "Expanded", child: await tabBody(state) },
      ],
    },
  };
}

export async function screenEvent(ctx) {
  const ev = (ctx && ctx.event) || {};
  const name = ev.name || ev.event || "";
  const state = (ctx && ctx.state) || {};
  try {
    if (name === "tab") {
      const tab = String(ev.arg || ev.value || "inicio");
      return { state: { tab } };
    }
    if (name === "libMore") {
      const page = (state.libPage || 1) + 1;
      const more = await fetchLibrary(page);
      const prev = Array.isArray(state.libItems) ? state.libItems : [];
      const items = prev.concat(more);
      return {
        state: {
          libItems: items,
          libPage: page,
          libLoading: false,
          libDone: more.length < 20,
        },
      };
    }
    if (name === "goSearch") {
      return { route: { push: "search" }, state: { results: null, resultsQ: "" } };
    }
    if (name === "doSearch") {
      const q = clean(String(ev.arg || ev.value || state.resultsQ || ""));
      if (q.length < 2) return { toast: "Escribe al menos 2 caracteres" };
      // búsqueda vía biblioteca con query
      const html = await getHtml("/biblioteca?_title=" + encodeURIComponent(q) + "&filter_by=title");
      // fallback: página de inicio + filtrado local
      let results = seriesCards(html, 40);
      if (!results.length) {
        const home = await getHtml("/");
        results = seriesCards(home, 80).filter((it) =>
          it.title.toLowerCase().indexOf(q.toLowerCase()) >= 0 ||
          it.slug.toLowerCase().indexOf(q.toLowerCase().replace(/\s+/g, "-")) >= 0);
      }
      return {
        state: { results, resultsQ: q },
        toast: results.length ? results.length + " resultados" : "Sin resultados",
      };
    }
    if (name === "retry") return { state: { _r: Date.now() } };
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
        if (d.meta && d.meta.adult && !adultAllowed()) return null;
        chapters = d.chapters;
        idx = parseInt(String(ev.arg || "0"), 10) || 0;
        slug = d.slug;
        title = d.meta && d.meta.title;
        poster = d.meta && d.meta.poster;
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
        const html = await getHtml(ch.path || ch.url.replace(BASE, ""));
        images = readerImages(html);
        if (images.length) readerCachePut(ch.url, images);
      }
      if (!images.length) {
        return { toast: "No se encontraron páginas en este capítulo. El visor de ZonaTMO carga las imágenes de forma dinámica." };
      }
      markRead(slug, title, poster, ch.title, ch.url);
      const reader = { slug, title, poster, chapters, idx, images, tk: ++navSeq };
      if (name === "read") return { state: { reader }, route: { push: "read" } };
      return { state: { reader } };
    }
    if (name === "openSeries" || name === "open") {
      const slug = String(ev.arg || routeSlug(ctx && ctx.route) || "");
      if (!slug || slug.indexOf("/") < 0) return { toast: "Slug inválido" };
      const d = await loadSeries(slug);
      if (!d.chapters.length) {
        return {
          state: { detail: d },
          route: { push: "detail", params: { slug } },
          toast: "No se encontraron capítulos (puede que la lista se cargue por JS).",
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
