// Plugin de Kino para leer obras de zonatmo.org
// Interfaz: Inicio, Biblioteca, Favoritos, Historial,
// detalle de obra y lector webcómic vertical.
// Requiere Kino 0.9.74+ (apiVersion 14, capability "screen").
// Adaptado del plugin Yuri Online (estructura de pantallas correcta).

const BASE = "https://zonatmo.org";

// ---------------------------------------------------------------- red

async function getHtml(path) {
  const r = await kino.fetch(BASE + path, {
    headers: { Accept: "text/html,application/xhtml+xml" },
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

function seriesCards(html, max) {
  const out = [];
  const seen = {};
  const re = /href="(?:https:\/\/zonatmo\.org)?(\/library\/(manga|manhwa|manhua|comic|novel|webtoon)\/(\d+)\/([a-z0-9][a-z0-9-]*))"/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 48)) {
    const path = m[1], type = m[2].toLowerCase(), id = m[3], slug = m[4];
    const key = type + "/" + id;
    if (seen[key]) continue;
    seen[key] = true;
    const win = html.slice(Math.max(0, m.index - 200), m.index + 1800);
    let poster = "";
    const im = win.match(/(?:data-src|src)="(https:\/\/[^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/i)
            || win.match(/(?:data-src|src)="(\/[^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/i);
    if (im) poster = im[1].startsWith("http") ? im[1] : BASE + im[1];
    let title = "";
    const tre = win.match(new RegExp(slug.replace(/-/g, "[- ]") + "[^<]{0,5}<[^>]*>([^<]{2,120})", "i"))
             || win.match(/>([^<]{3,100})</);
    if (tre) title = clean(tre[1]);
    if (!title || title.length < 2) title = slug.replace(/-/g, " ");
    out.push({
      slug: type + "/" + id + "/" + slug,
      id, type, path,
      url: BASE + path,
      poster, title,
    });
  }
  return out;
}

function chapterList(html) {
  const map = new Map();
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
  const genres = [];
  const gre = /href="\/tag\/([^"]+)"[^>]*>([^<]+)</gi;
  let gm;
  while ((gm = gre.exec(html)) !== null && genres.length < 12) {
    const g = clean(gm[2]);
    if (g && genres.indexOf(g) < 0) genres.push(g);
  }
  return { title, poster, synopsis, status, genres };
}

function readerImages(html) {
  const out = [];
  const seen = {};
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
      if (/avatar|logo|icon|emoji|badge|button|thumb-sm|favicon/i.test(url)) continue;
      if (seen[url]) continue;
      seen[url] = true;
      out.push({ url });
    }
    if (out.length > 3) break;
  }
  out.sort((a, b) => {
    const na = (a.url.match(/(?:page|p|img)[_-]?(\d+)/i) || [])[1];
    const nb = (b.url.match(/(?:page|p|img)[_-]?(\d+)/i) || [])[1];
    if (na && nb) return parseInt(na, 10) - parseInt(nb, 10);
    return 0;
  });
  return out;
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
  const path = "/library/" + slug + (slug.endsWith("/") ? "" : "/");
  const html = await getHtml(path);
  const meta = seriesMeta(html);
  let chapters = chapterList(html);
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
  if (prog && prog.chUrl) {
    continueIdx = chapters.findIndex((c) => c.url === prog.chUrl || c.path === prog.chUrl);
  }

  const headChildren = [];
  if (meta.poster) {
    headChildren.push({ type: "Image", url: meta.poster, width: 140, height: 200, key: "poster" });
  }
  headChildren.push({ type: "Text", text: meta.title || d.slug, style: "h2", key: "t" });
  if (meta.status) headChildren.push({ type: "Text", text: meta.status, color: "muted", key: "st" });
  if (meta.genres && meta.genres.length) {
    headChildren.push({ type: "Text", text: meta.genres.join(" · "), color: "muted", key: "g" });
  }
  if (meta.synopsis) {
    headChildren.push({
      type: "Text",
      text: meta.synopsis.slice(0, 400) + (meta.synopsis.length > 400 ? "…" : ""),
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
  const chKey = String(ch ? ch.url : r.idx).replace(/[^a-z0-9]/gi, "").slice(-16);
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
  syncPull();
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
        {
          type: "Text",
          text: "No se pudo cargar (" + ((e && e.code) || "error") + ").",
          textEn: "Could not load (" + ((e && e.code) || "error") + ").",
          color: "muted",
        },
        {
          type: "ElevatedButton", icon: "refresh",
          labelText: "Reintentar", labelTextEn: "Retry",
          onPressed: { event: "retry" },
        },
      ],
    };
  }

  const tab = state.tab || "inicio";
  let body;
  try {
    body = await tabBody(state);
  } catch (e) {
    body = {
      type: "Column", padding: 16, gap: 8, children: [
        { type: "Icon", name: "error", color: "muted" },
        {
          type: "Text",
          text: "No se pudo cargar (" + ((e && e.code) || "error") + ").",
          textEn: "Could not load (" + ((e && e.code) || "error") + ").",
          color: "muted",
        },
        {
          type: "ElevatedButton", icon: "refresh",
          labelText: "Reintentar", labelTextEn: "Retry",
          onPressed: { event: "retry" },
        },
      ],
    };
  }
  return {
    type: "Scaffold",
    appBar: {
      title: "ZonaTMO",
      actions: [
        {
          type: "IconButton", icon: "search", key: "goSearch",
          labelText: "Buscar", labelTextEn: "Search",
          onPressed: { event: "goSearch" },
        },
      ],
    },
    body: {
      type: "Column", flex: 1, children: [
        {
          type: "TabBar", key: "tabs", tabs: TABS,
          value: tab,
          onChanged: { event: "tab" },
        },
        { type: "Expanded", child: body },
      ],
    },
  };
}

export async function screenEvent(ev) {
  const name = ev && (ev.name || ev.event) || "";
  const state = (ev && ev.state) || {};
  const arg = ev && (ev.arg != null ? ev.arg : ev.value);
  try {
    if (name === "open") {
      const route = (ev && ev.route) || {};
      const slug = routeSlug(route);
      if (route.name === "detail" && slug) {
        const d = await loadSeries(slug);
        return { state: { detail: d } };
      }
      return null;
    }

    if (name === "tab") {
      const tab = String(arg || "inicio");
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
    if (name === "search" || name === "doSearch") {
      const inputs = (state && state.inputs) || {};
      const q = clean(String(arg || inputs.q || state.resultsQ || ""));
      if (q.length < 2) return { toast: "Escribe al menos 2 caracteres" };
      let results = [];
      try {
        const html = await getHtml("/biblioteca?_title=" + encodeURIComponent(q) + "&filter_by=title");
        results = seriesCards(html, 40);
      } catch (e) { /* fallback abajo */ }
      if (!results.length) {
        try {
          const home = await getHtml("/");
          results = seriesCards(home, 80).filter((it) =>
            it.title.toLowerCase().indexOf(q.toLowerCase()) >= 0 ||
            it.slug.toLowerCase().indexOf(q.toLowerCase().replace(/\s+/g, "-")) >= 0);
        } catch (e2) { /* */ }
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
        chapters = d.chapters;
        idx = parseInt(String(arg || "0"), 10) || 0;
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
        return {
          toast: "No se encontraron páginas en este capítulo. El visor de ZonaTMO carga las imágenes de forma dinámica.",
        };
      }
      markRead(slug, title, poster, ch.title, ch.url);
      const reader = { slug, title, poster, chapters, idx, images, tk: ++navSeq };
      if (name === "read") return { state: { reader }, route: { push: "read" } };
      return { state: { reader } };
    }
    if (name === "openSeries") {
      const slug = String(arg || "");
      if (!slug || slug.indexOf("/") < 0) return { toast: "Slug inválido" };
      const d = await loadSeries(slug);
      return {
        state: { detail: d },
        route: { push: "detail", params: { slug } },
        toast: d.chapters.length ? undefined : "No se encontraron capítulos (puede que la lista se cargue por JS).",
      };
    }
  } catch (e) {
    return { toast: "Algo falló: " + ((e && e.code) || (e && e.message) || "error") };
  }
  return null;
}
