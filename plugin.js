// Plugin de Kino para leer obras de zonatmo.org (ZonaTM0)
// Interfaz tipo lector de manga: Inicio, Biblioteca, Favoritos,
// Historial, detalle de obra con lista de capítulos y lector
// webcómic vertical. Basado en la arquitectura del plugin de Yuri
// Online, adaptado al sitio ZonaTM0 (Laravel, clon de TuMangaOnline):
//   - Biblioteca por AJAX: GET /biblioteca?...&page=N  → JSON { html }
//   - Ficha de obra:        /library/<tipo>/<id>/<slug>
//   - Capítulos:            li.upload-link → enlaces /view_uploads/<id>
//   - Lector:               /view_uploads/<id>, imágenes en
//                           storage.zonatmo.org/chapters/<id>/<n>.webp
// Funciona en teléfono y TV desde el mismo árbol de nodos.
//
// v1.1.2 — corregido el lector que se quedaba «Cargando…» para siempre
// en obras con muchos capítulos (>150 aprox., p. ej. Watashi ga
// Motenai...). Causa: el estado de una pantalla de Kino tiene un límite
// de tamaño y al abrir un capítulo se guardaban ahí los capítulos DOS
// veces (detalle + lector) más las imágenes; al pasarse del límite Kino
// descartaba el parche y el lector se quedaba cargando. Siguiendo a
// MangaTrack, lo pesado (capítulos, imágenes) vive en kino.storage y el
// estado de la pantalla queda mínimo (solo índices): nunca se vuelve a
// pasar del límite, por larga que sea la obra.
//
// v1.1.1:
//   - Corregido: al abrir una obra justo después de otra, el
//     «Continuar»/detalle de la anterior (p. ej. Dragon Ball) volvía a
//     aparecer. Un tick del temporizador que aún estaba cargando la
//     obra anterior devolvía su resultado tarde y sobrescribía el
//     detalle nuevo. Ahora el resultado se descarta si mientras tanto
//     se abrió otra obra (guarda por «slug activo») y cada tick
//     autocorrige el detalle si no coincide con la ruta.
//   - Añadido: borrar de «Seguir leyendo»/Historial — botón
//     «Olvidar lo leído» en el detalle, mantén pulsada una entrada del
//     Historial para quitarla, y «Borrar todo el historial» (con
//     confirmación en dos toques) en la pestaña Historial.
//
// v1.1.0 (patrón de MangaTrack): nada bloquea la pantalla.
//   - Abrir una obra empuja el detalle AL INSTANTE (con esqueletos) y
//     los capítulos/metadatos llegan en segundo plano mediante el
//     temporizador «every» de la pantalla (sus ticks no cuentan para
//     el «No responde» de Kino). Nunca más un «Cargando…» eterno.
//   - Inicio y Biblioteca también se pintan al instante (caché o
//     esqueletos) y se rellenan por el temporizador.
//   - Lector sin medir imágenes: fit "width" + aspect "2:3" y Kino da
//     a cada página su proporción real al cargarla (receta MangaTrack);
//     se eliminaron las descargas de cabeceras que eternizaban la
//     apertura en redes lentas.
//   - Tope de 490 capítulos (los más recientes) por pantalla.
//
// Requiere Kino 0.9.74 o superior (apiVersion 14, capability "screen").

const BASE = "https://zonatmo.org";
const MAX_CAPS = 490; // tope de capítulos por pantalla (Kino admite ~600 nodos)
const LIB_MAX = 144; // tope de obras acumuladas en la Biblioteca (estado pequeño)

// ---------------------------------------------------------------- red

// Todas las peticiones llevan timeoutMs: si el sitio no responde, se
// lanza un error que se muestra con «Reintentar». La página de una
// obra puede ser enorme en series largas: 60 s de margen.
async function getHtml(path, timeoutMs) {
  const r = await kino.fetch(BASE + path, {
    headers: { Accept: "text/html", Referer: BASE + "/" },
    timeoutMs: timeoutMs || 20000,
  });
  if (!r.ok) throw kino.error("network", "HTTP " + r.status, {
    userMessage: "No se pudo conectar con ZonaTM0. Inténtalo de nuevo.",
  });
  return r.text();
}

// Biblioteca por AJAX: la rejilla de obras no viene en la página sino en
// un fragmento HTML devuelto como JSON por /biblioteca (con cabeceras
// de XMLHttpRequest). order: "created_at" (últimas) o "likes_count".
async function getLibHtml(page, order, q) {
  const url = BASE + "/biblioteca?title=" + encodeURIComponent(q || "") +
    "&filter_by=title&order_item=" + (order || "likes_count") +
    "&order_dir=desc&_pg=1&page=" + page;
  const r = await kino.fetch(url, {
    timeoutMs: 25000,
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: BASE + "/biblioteca",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!r.ok) throw kino.error("network", "HTTP " + r.status, {
    userMessage: "No se pudo conectar con ZonaTM0. Inténtalo de nuevo.",
  });
  const txt = await r.text();
  let frag = "";
  const j = txt.indexOf("{");
  if (j >= 0) {
    try { frag = JSON.parse(txt.slice(j)).html || ""; } catch (e) { /* abajo */ }
  }
  // Si no llegó JSON (una versión distinta del sitio), se usa lo que sea
  // que haya devuelto: la rejilla completa también sirve.
  return frag || txt;
}

// ------------------------------------------------------------- scraping

function clean(s) {
  return String(s)
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ").trim();
}

function absUrl(u) {
  if (!u) return "";
  u = String(u).trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.indexOf("/") === 0) return BASE + u;
  return u;
}

// Tarjetas de obras: enlaces .../library/<tipo>/<id>/<slug>/
// El slug interno de una obra es "tipo/id/slug" (se valida al usarlo).
// Las novelas (tipo novel/novela) son texto sin páginas: se saltan.
function seriesCards(html, max) {
  const out = [];
  const seen = {};
  const re = /href="(?:https:\/\/zonatmo\.org)?\/library\/([a-z_-]+)\/(\d+)\/([a-z0-9-]+)\/?"/g;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 40)) {
    const type = m[1], id = m[2], name = m[3];
    if (seen[id] || type === "page") continue;
    seen[id] = true;
    if (type === "novel" || type === "novela") continue;
    const slug = type + "/" + id + "/" + name;
    const url = BASE + "/library/" + slug + "/";
    const win = html.slice(m.index, m.index + 3500);
    // título: atributo title del h4 (con el texto completo) o su contenido
    let title = "";
    const th = win.match(/<h4[^>]*\btitle="([^"]{1,200})"/) || win.match(/<h4[^>]*>\s*([^<]{1,200})</);
    if (th) title = clean(th[1]);
    if (!title) title = name.replace(/-/g, " ");
    // portada: img (quizá con lazy-load) o fondo data-bg / style url()
    let poster = "";
    const im = win.match(/<img[^>]+(?:data-src|data-lazy-src|data-original|src)="([^"]+)"/);
    if (im && !/^data:/.test(im[1])) poster = absUrl(im[1]);
    if (!poster) {
      const bg = win.match(/data-bg="([^"]+)"/);
      if (bg) poster = absUrl(bg[1]);
    }
    if (!poster) {
      const st = win.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\s*\)/);
      if (st) poster = absUrl(st[1]);
    }
    out.push({ slug, url, poster, title });
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

// Capítulos: filas li.upload-link con data-chapter-number y uno o más
// enlaces a /view_uploads/<id> (uno por grupo de traducción).
// Devuelve [{ url, id, num, title, scan }] deduplicados por URL.
// Plan B: si el marcado cambia y no hay filas upload-link, se toman los
// enlaces /view_uploads/ sueltos con el número más cercano.
function chapterList(html) {
  const map = new Map();
  const rowRe = /<li[^>]*upload-link[^>]*>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const end = html.indexOf("</li>", m.index);
    const row = html.slice(m.index, end > 0 ? end : m.index + 6000);
    const num = ((row.match(/data-chapter-number="([^"]*)"/) ||
      row.match(/class="chapter-number"[^>]*data-number="([^"]*)"/) || [])[1] || "").trim();
    const numN = (num.match(/\d+(?:\.\d+)?/) || [""])[0];
    const upRe = /href="(?:https:\/\/zonatmo\.org)?\/view_uploads\/(\d+)\/?"/g;
    let u;
    while ((u = upRe.exec(row)) !== null) {
      const url = BASE + "/view_uploads/" + u[1] + "/";
      if (map.has(url)) continue;
      // el grupo de traducción vive junto a su enlace "Leer online"
      const near = row.slice(Math.max(0, u.index - 600), u.index + 600);
      const sm = near.match(/href="[^"]*\/groups\/[^"]*"[^>]*>([^<]{1,60})</);
      const scan = sm ? clean(sm[1]) : "";
      map.set(url, {
        url, id: u[1], num: numN || u[1], scan,
        title: "Capítulo " + (numN || u[1]) + (scan ? " · " + scan : ""),
      });
    }
  }
  if (!map.size) {
    const re = /href="(?:https:\/\/zonatmo\.org)?\/view_uploads\/(\d+)\/?"/g;
    let u;
    while ((u = re.exec(html)) !== null) {
      const url = BASE + "/view_uploads/" + u[1] + "/";
      if (map.has(url)) continue;
      const near = html.slice(Math.max(0, u.index - 500), u.index + 500);
      const numN = (((near.match(/data-chapter-number="([^"]*)"/) ||
        near.match(/Cap[ií]tulo\s*(\d+(?:\.\d+)?)/i) || [])[1] || "").trim()) || u[1];
      map.set(url, { url, id: u[1], num: numN, scan: "", title: "Capítulo " + numN });
    }
  }
  const arr = [...map.values()];
  arr.sort((a, b) => natCmp(a.num, b.num) || (a.scan || "").localeCompare(b.scan || ""));
  return arr;
}

// Metadatos de la página de una obra
function seriesMeta(html, slug) {
  const pick = (re) => { const m = html.match(re); return m ? clean(m[1]) : ""; };
  let poster = "";
  const im = html.match(/<img[^>]*class="[^"]*book-thumbnail[^"]*"[^>]*>/);
  if (im) poster = absUrl((im[0].match(/(?:data-src|src)="([^"]+)"/) || [])[1]);
  if (!poster) poster = pick(/property="og:image"[^>]*content="([^"]+)"/) || pick(/content="([^"]+)"[^>]*property="og:image"/);
  let overview = "";
  const sy = html.match(/id="manga-synopsis"[^>]*>([\s\S]{0,3000}?)<\/(?:p|div)>/);
  if (sy) overview = clean(sy[1].replace(/<[^>]+>/g, " "));
  if (!overview) overview = pick(/property="og:description"[^>]*content="([^"]+)"/);
  // géneros: enlaces a /tag/
  const genres = [];
  const gre = /href="[^"]*\/tag\/[^"]*"[^>]*>([^<]{1,50})</g;
  let g;
  while ((g = gre.exec(html)) !== null && genres.length < 20) {
    const t = clean(g[1]);
    if (t && genres.indexOf(t) < 0) genres.push(t);
  }
  return {
    title: pick(/<h1[^>]*class="[^"]*element-title[^"]*"[^>]*>([^<]{1,200})</) ||
      pick(/property="og:title"[^>]*content="([^"]+)"/) || slug.split("/")[2].replace(/-/g, " "),
    poster,
    // v1.1.2: sinopsis recortada — el meta SÍ viaja en el estado
    overview: overview.slice(0, 600),
    status: tmoLabel(html, "Estado"),
    genres: genres.join(", "),
    type: (slug.split("/")[0] || "").toUpperCase(),
    author: tmoLabel(html, "Autor/es"),
  };
}

// Valor que sigue a un subtítulo <h5 class="element-subtitle">Etiqueta</h5>
function tmoLabel(html, label) {
  const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    "\\s*<\\/h5>\\s*<[^>]*>\\s*([^<]{1,200})", "i");
  const m = html.match(re);
  return m ? clean(m[1]) : labelValue(html, label);
}

function labelValue(html, label) {
  const i = html.indexOf(label);
  if (i < 0) return "";
  const win = html.slice(i + label.length, i + label.length + 600);
  const m = win.match(/>([^<]{1,200})</);
  return m ? clean(m[1]) : "";
}

// Id del lector a partir de la URL del capítulo (/view_uploads/<id>/)
function uploadIdDe(url) {
  const m = String(url || "").match(/view_uploads\/(\d+)/);
  return m ? m[1] : "";
}

// Imágenes de un capítulo: las páginas viven en
// storage.zonatmo.org/chapters/<uploadId>/<n>.webp y se referencian desde
// el lector (etiquetas img y precargas). Se escanea el HTML en bruto
// limitado a las URLs que llevan el id del capítulo, así no se cuelan
// portadas ni banners. Devuelve [{ url }].
function readerImages(html, uploadId) {
  const out = [], seen = {};
  const re = new RegExp("https?:\\/\\/[^\"'\\s>]+\\/chapters\\/" + uploadId +
    "\\/\\d+\\.(?:webp|jpe?g|png|avif|gif)", "g");
  let m;
  while ((m = re.exec(html)) !== null) {
    if (seen[m[0]]) continue;
    seen[m[0]] = true;
    out.push({ url: m[0] });
  }
  // última carta: las img propias del lector (class reader-image)
  if (!out.length) {
    const re2 = /<img[^>]*class="[^"]*reader-image[^"]*"[^>]*>/g;
    let t;
    while ((t = re2.exec(html)) !== null) {
      const src = (t[0].match(/(?:data-src|data-lazy-src|data-original|src)="([^"]+)"/) || [])[1];
      if (!src || seen[src]) continue;
      seen[src] = true;
      out.push({ url: absUrl(src) });
    }
  }
  // orden por número de archivo (…/<n>.webp)
  const num = (u) => parseInt((u.match(/\/(\d+)\.[a-z0-9]+(?:\?|$)/i) || [])[1], 10) || 0;
  out.sort((a, b) => num(a.url) - num(b.url));
  return out;
}

// v1.1.0 (receta de MangaTrack): las páginas ya no se miden. Con
// fit "width" + aspect "2:3", Kino le da a cada página su proporción
// real en cuanto la imagen carga — sin descargar cabeceras.
function pageNodes(p, i) {
  return [{
    type: "Image", key: "p" + i, url: typeof p === "string" ? p : p.url,
    alt: "Página " + (i + 1), altEn: "Page " + (i + 1),
    fill: true, fit: "width", aspect: "2:3",
    fallback: { type: "Column", padding: 16, children: [
      { type: "Text", text: "Página " + (i + 1), textEn: "Page " + (i + 1), color: "muted" } ] },
  }];
}

// Carga una obra: página de detalle + capítulos. En ZonaTM0 todas las
// filas de capítulos (también las antiguas) ya están en el HTML.
// Con caché de 15 minutos (force=true la salta). Tope de MAX_CAPS
// capítulos (los más recientes) para no pasar del límite de nodos.
// Lo pesado se guarda en kino.storage («serie:<slug>»); del estado de
// la pantalla solo viaja el meta (v1.1.2).
async function loadSeries(slug, force) {
  if (!slugValido(slug)) throw kino.error("arguments", "slug");
  const ck = "serie:" + slug;
  if (!force) {
    try {
      const c = getJson(ck, null);
      if (c && c.meta && Array.isArray(c.chapters) && c.chapters.length &&
          Date.now() - (c.ts || 0) < 900000) {
        return { slug, meta: c.meta, chapters: c.chapters };
      }
    } catch (e) { /* caché rota: se recarga */ }
  }
  const html = await getHtml("/library/" + slug + "/", 60000);
  const meta = seriesMeta(html, slug);
  let chapters = chapterList(html);
  let capped = false;
  if (chapters.length > MAX_CAPS) {
    chapters = chapters.slice(chapters.length - MAX_CAPS);
    capped = true;
  }
  if (capped) meta.capped = true;
  if (chapters.length) {
    try {
      setJson(ck, { meta, chapters, ts: Date.now() });
      const ks = kino.storage.keys().filter((k) => k.indexOf("serie:") === 0);
      if (ks.length > 10) for (const k of ks.slice(0, ks.length - 10)) kino.storage.remove(k);
    } catch (e) { kino.log("cache", e.message); }
  }
  return { slug, meta, chapters };
}

// v1.1.2: capítulos de una obra desde kino.storage (sin caducidad: la
// lista completa no viaja nunca en el estado de la pantalla, que tiene
// un límite de tamaño). null si no está en caché.
function chaptersDe(slug) {
  if (!slugValido(slug)) return null;
  const c = getJson("serie:" + slug, null);
  return (c && Array.isArray(c.chapters)) ? c.chapters : null;
}

// Carga la obra para el detalle: si falla (web caída, sin red, tiempo
// límite), deja la obra en estado de error — con botón «Reintentar».
// v1.1.2: al estado solo va el meta — los capítulos quedan en
// kino.storage y detailTree los lee de ahí.
async function cargarDetalle(state, slug, force) {
  const prev = (state.detail && state.detail.slug === slug) ? state.detail : null;
  const meta0 = (prev && prev.meta) || {};
  try {
    const d = await loadSeries(slug, force);
    return { state: { detail: { slug, meta: d.meta } } };
  } catch (e) {
    kino.log("detalle", e.message);
    return { state: { detail: { slug, error: true, meta: meta0 } } };
  }
}

// ------------------------------------------------------------ almacen

function getJson(key, fallback) {
  try {
    const v = kino.storage.get(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}
function setJson(key, val) {
  try { kino.storage.set(key, JSON.stringify(val)); } catch (e) { kino.log("storage", e.message); }
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

// v1.1.1: quita UNA obra de «Seguir leyendo»/Historial
function borrarProgreso(slug) {
  const p = progress();
  if (!p[slug]) return false;
  delete p[slug];
  setJson("prog", p);
  syncPush("prog", p);
  return true;
}

// v1.1.1: vacía todo «Seguir leyendo»/Historial
function borrarTodoProgreso() {
  setJson("prog", {});
  syncPush("prog", {});
}

// ---------------------------------------------- sincronización (kino.shared)

function syncPush(key, val) {
  try {
    if (typeof kino.shared === "object" && kino.shared !== null) kino.shared.set(key, val);
  } catch (e) { kino.log("sync", e.message); }
}

function slugValido(s) {
  return typeof s === "string" && /^[a-z0-9][a-z0-9\/_-]*$/i.test(s) && s.indexOf("..") < 0;
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
        if (!f || typeof f !== "object" || !slugValido(f.slug)) continue;
        if (have[f.slug]) continue;
        local.push({ slug: f.slug, title: String(f.title || f.slug).slice(0, 200),
          poster: typeof f.poster === "string" ? f.poster.slice(0, 500) : "" });
        have[f.slug] = true; changed = true;
      }
      if (changed) { setJson("favs", local); syncPush("favs", local); }
    }
    const sp = kino.shared.get("prog");
    if (sp && typeof sp === "object" && !Array.isArray(sp)) {
      const p = progress();
      let changed = false;
      for (const k of Object.keys(sp).slice(0, 200)) {
        if (!slugValido(k)) continue;
        const e = sp[k];
        if (!e || typeof e !== "object" || typeof e.url !== "string" || typeof e.ts !== "number") continue;
        if (p[k] && (p[k].ts || 0) >= e.ts) continue;
        p[k] = { title: String(e.title || k).slice(0, 200),
          poster: typeof e.poster === "string" ? e.poster.slice(0, 500) : "",
          chTitle: String(e.chTitle || e.url).slice(0, 200),
          url: e.url.slice(0, 500), ts: e.ts };
        changed = true;
      }
      if (changed) { setJson("prog", p); syncPush("prog", p); }
    }
  } catch (e) { kino.log("sync", e.message); }
}

// caché de lector (últimos capítulos abiertos), para no volver a pedir
function readerCache(url) { return getJson("rc:" + url, null); }
function readerCachePut(url, urls) {
  try {
    const keys = kino.storage.keys().filter((k) => k.indexOf("rc:") === 0);
    if (keys.length > 4) for (const k of keys.slice(0, keys.length - 4)) kino.storage.remove(k);
  } catch (e) { /* la app vieja no lista */ }
  setJson("rc:" + url, urls);
}

// v1.1.2: páginas de un capítulo (lista de URLs de imagen) — primero la
// caché de storage, si no la red. Si no hay, [].
async function paginasDe(ch) {
  const upId = uploadIdDe(ch.url);
  const c = readerCache(ch.url);
  if (Array.isArray(c) && c.length) return c;
  const html = await getHtml(ch.url.replace(BASE, ""), 30000);
  const imgs = readerImages(html, upId || ch.id);
  const urls = imgs.map((x) => x.url);
  if (urls.length) readerCachePut(ch.url, urls);
  return urls;
}

// ----------------------------------------------------------- interfaz

const TABS = [
  { value: "inicio", label: "Inicio", labelEn: "Home" },
  { value: "biblioteca", label: "Biblioteca", labelEn: "Library" },
  { value: "favoritos", label: "Favoritos", labelEn: "Favourites" },
  { value: "historial", label: "Historial", labelEn: "History" },
];

// Título partido en dos filas (ver Yuri Online)
function twoLines(t) {
  const s = (t || "").trim();
  if (s.length <= 26) return [s];
  const mid = Math.ceil(s.length / 2);
  let cut = -1, best = 999;
  for (let i = 8; i < s.length - 3; i++) {
    if (s[i] === " ") { const d = Math.abs(i - mid); if (d < best) { best = d; cut = i; } }
  }
  if (cut < 0) cut = mid;
  let a = s.slice(0, cut).trim(), b = s.slice(cut).trim();
  if (a.length > 34) a = a.slice(0, 33).trim() + "…";
  if (b.length > 34) b = b.slice(0, 33).trim() + "…";
  return [a, b];
}

// Título/portada de las tarjetas vistas, para pintar el detalle al
// instante (antes de que llegue la página de la obra).
const CARDINFO = {};
function rememberCard(it) {
  try {
    if (it && it.slug && CARDINFO[it.slug] === undefined) {
      CARDINFO[it.slug] = { title: it.title || "", poster: it.poster || "" };
      const ks = Object.keys(CARDINFO);
      if (ks.length > 300) delete CARDINFO[ks[0]];
    }
  } catch (e) { /* sin memoria */ }
}

function posterCard(it, prefix, rail) {
  rememberCard(it);
  const img = {
    type: "Image", url: it.poster || "", aspect: "2:3",
    alt: it.title, altEn: it.title,
    fallback: { type: "Column", padding: 16, crossAxisAlignment: "center", children: [
      { type: "Icon", name: "list", color: "muted" } ] },
  };
  if (rail) img.width = 120;
  return {
    type: "Card", key: prefix + it.slug.replace(/[^a-z0-9]/gi, "-"), flush: true,
    onTap: { event: "openSeries", arg: it.slug },
    children: [img].concat(twoLines(it.title).map((ln) => (
      { type: "Text", text: ln, textEn: ln, style: "caption", padding: 8 }))),
  };
}

const EMPTY_LIB = { type: "emptyState", icon: "list", title: "Nada por aquí todavía.", titleEn: "Nothing here yet." };
const EMPTY_FAV = { type: "emptyState", icon: "heart", title: "Marca obras con el corazón para verlas aquí.", titleEn: "Mark works with the heart to see them here." };

// Esqueletos (receta MangaTrack): lo que se pinta mientras los datos
// llegan en segundo plano.
let skelSeq = 0;
function skelCard() {
  return { type: "Card", key: "sk" + skelSeq++, flush: true, children: [
    { type: "Skeleton", shape: "block", height: 180 },
    { type: "Skeleton", shape: "line", padding: 8 },
    { type: "Skeleton", shape: "line", padding: 8 },
  ] };
}

function skelGridNode(n) {
  const cards = [];
  for (let i = 0; i < (n || 12); i++) cards.push(skelCard());
  return {
    type: "ListView", key: "skel",
    columns: { compact: 3, medium: 4, expanded: 6 },
    items: cards,
  };
}

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

// v1.1.1: Historial con dos formas de borrar el «Seguir leyendo»:
// mantener pulsada una entrada para quitar solo esa obra, y el botón
// «Borrar todo» (pide confirmar con un segundo toque).
function historyList(state) {
  const p = progress();
  const rows = Object.keys(p).map((slug) => ({ slug, p: p[slug] }))
    .sort((a, b) => b.p.ts - a.p.ts).slice(0, 50);
  const conf = state && state.confBorrar === true;
  if (!rows.length) {
    return { type: "emptyState", icon: "schedule", title: "Todavía no has leído nada.", titleEn: "You have not read anything yet." };
  }
  const items = [{
    type: "Row", key: "histHead", gap: 8, padding: 16,
    children: [
      { type: "Text", text: "Mantén pulsada una obra para quitarla del historial.",
        textEn: "Long-press a work to remove it from history.",
        style: "caption", color: "muted", flex: 1 },
      { type: "ElevatedButton", key: "clearHist", icon: "delete",
        labelText: conf ? "¿Seguro? Toca otra vez" : "Borrar todo",
        labelTextEn: conf ? "Sure? Tap again" : "Clear all",
        onPressed: { event: "clearHist" } },
    ],
  }];
  for (const r of rows) {
    items.push({
      type: "ListTile", key: "h-" + r.slug.replace(/[^a-z0-9]/gi, "-"),
      title: r.p.title || r.slug,
      subtitle: r.p.chTitle || "", subtitleEn: r.p.chTitle || "",
      leading: { type: "CircleAvatar", image: r.p.poster, icon: "list" },
      onTap: { event: "openSeries", arg: r.slug },
      onLongPress: { event: "borrarProg", arg: r.slug },
    });
  }
  return { type: "ListView", key: "hist", items };
}

// v1.1.0: el cuerpo de las pestañas ya NUNCA espera a la red. Pinta lo
// que haya en el estado y, si falta, esqueletos: el temporizador
// «cargarRoot» trae los datos en segundo plano.
function tabBody(state) {
  const tab = state.tab || "inicio";
  if (tab === "favoritos") return titleGridOf(favs(), null, false, true, EMPTY_FAV);
  if (tab === "historial") return historyList(state);
  if (tab === "biblioteca") {
    const items = Array.isArray(state.libItems) ? state.libItems : null;
    if (!items) return skelGridNode(12);
    return titleGridOf(items, "libMore", state.libLoading === true, state.libDone === true);
  }
  // inicio
  const items = Array.isArray(state.inicioItems) ? state.inicioItems : null;
  const rail = (title, titleEn, key, list) => list.length ? [
    { type: "Text", text: title, textEn: titleEn, style: "h3", padding: 16 },
    { type: "SingleChildScrollView", key: key, direction: "horizontal", padding: 16,
      children: [{ type: "Row", gap: 8, children: list.slice(0, 60).map((it) => posterCard(it, key + "-", true)) }] },
  ] : [];
  const prog = progress();
  const leyendo = Object.keys(prog)
    .map((slug) => ({ slug, title: prog[slug].title, poster: prog[slug].poster, ts: prog[slug].ts || 0 }))
    .filter((x) => x.title)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 20);
  if (!items) {
    // esqueletos de «Últimas obras» mientras carga el temporizador
    const sk = [];
    for (let i = 0; i < 8; i++) sk.push({
      type: "Card", key: "skl" + i, flush: true, children: [
        { type: "Skeleton", shape: "block", width: 120, height: 180 }] });
    return {
      type: "SingleChildScrollView", key: "homeSkel", flex: 1,
      children: [{ type: "Column", children: [
        { type: "ListTile", key: "searchTile", leading: { type: "Icon", name: "search" },
          title: "Buscar obra", titleEn: "Search a work",
          subtitle: "Por título, p. ej. Solo Leveling", subtitleEn: "By title, e.g. Solo Leveling",
          trailing: { type: "Icon", name: "arrow_forward" },
          onTap: { event: "goSearch" } },
        { type: "Text", text: "Últimas obras", textEn: "Latest works", style: "h3", padding: 16 },
        { type: "SingleChildScrollView", key: "skelRail", direction: "horizontal", padding: 16,
          children: [{ type: "Row", gap: 8, children: sk }] },
      ].concat(rail("Seguir leyendo", "Continue reading", "leyendo", leyendo))
        .concat(rail("Mis favoritos", "My favourites", "favs", favs())) }],
    };
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
      ].concat(rail("Últimas obras", "Latest works", "latest", items))
        .concat(rail("Seguir leyendo", "Continue reading", "leyendo", leyendo))
        .concat(rail("Mis favoritos", "My favourites", "favs", favs())),
    }],
  };
}

// Biblioteca: las obras más populares (por "me gusta"), paginadas
async function fetchLibrary(page) {
  const html = await getLibHtml(page, "likes_count", "");
  return seriesCards(html, 36);
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

// Pantalla de error con reintentar: para fallos de red con tiempo límite
function errorTree(msg, retryEvent, extra) {
  const children = [
    { type: "Icon", name: "error", color: "muted" },
    { type: "Text", text: msg, textEn: msg, color: "muted", padding: { left: 16, right: 16 } },
    { type: "ElevatedButton", icon: "refresh", labelText: "Reintentar", labelTextEn: "Retry",
      onPressed: { event: retryEvent || "retry" } },
  ];
  if (extra) children.push(extra);
  return { type: "Column", padding: 32, gap: 12, crossAxisAlignment: "center", children };
}

// Detalle mientras la obra llega en segundo plano: esqueletos de los
// capítulos (receta MangaTrack) + temporizador «cargarSerie» + un
// botón «Cargar ahora» por si el Kino del teléfono no tuviera
// temporizadores de pantalla.
function detailLoadingTree(d) {
  const info = CARDINFO[d.slug] || {};
  const title = (d.meta && d.meta.title) || info.title || d.slug;
  const poster = (d.meta && d.meta.poster) || info.poster || "";
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push({ type: "Skeleton", key: "skr" + i, shape: "line", padding: 12 });
  }
  return {
    type: "Scaffold",
    every: { ms: 1000, event: "cargarSerie" },
    appBar: {
      title: title,
      leading: { type: "IconButton", key: "backHome", icon: "arrow_back",
        labelText: "Atrás", labelTextEn: "Back",
        onPressed: { event: "popBack" } },
      actions: [],
    },
    body: { type: "SingleChildScrollView", key: "detailLoading", children: [
      { type: "Column", children: [
        { type: "Row", gap: 16, padding: 16, crossAxisAlignment: "start", stackOnNarrow: true,
          children: [
            poster ? { type: "Image", url: poster, width: { compact: 120, expanded: 160 },
              aspect: "2:3", alt: title, fallback: { type: "Skeleton", shape: "block" } }
              : { type: "Skeleton", shape: "block", width: { compact: 120, expanded: 160 } },
            { type: "Column", gap: 6, flex: 2, crossAxisAlignment: "start", children: [
              { type: "Text", text: title, style: "h2" },
              { type: "Skeleton", shape: "line" },
              { type: "Skeleton", shape: "line" },
              { type: "Skeleton", shape: "line" },
              { type: "Text", text: "Cargando capítulos…", textEn: "Loading chapters…",
                color: "muted", style: "caption" },
              { type: "ElevatedButton", key: "loadNow", icon: "download",
                labelText: "Cargar ahora", labelTextEn: "Load now",
                onPressed: { event: "cargarSerieAhora" } },
            ] },
          ] },
        { type: "Skeleton", shape: "line", padding: 16 },
      ].concat(rows) },
    ] },
  };
}

async function detailTree(state) {
  const d = state.detail;
  if (!d) return loadingTree();
  if (d.loading) return detailLoadingTree(d);
  const fav = isFav(d.slug);
  // la carga falló (web caída, sin red, tiempo límite agotado): se
  // ofrece reintentar en vez del cargado eterno de antes
  if (d.error) {
    return errorTree("No se pudo cargar la obra. Comprueba tu conexión e inténtalo de nuevo.", "reloadSeries",
      { type: "ElevatedButton", icon: "arrow_back", labelText: "Volver", labelTextEn: "Back",
        onPressed: { event: "popBack" } });
  }
  // v1.1.2: la lista de capítulos vive en kino.storage, no en el estado
  // (las obras con muchos capítulos se pasaban del límite de tamaño
  // del estado y rompían el lector).
  const chapters = chaptersDe(d.slug) || [];
  if (!chapters.length) {
    return { type: "Column", padding: 32, gap: 12, crossAxisAlignment: "center", children: [
      { type: "Icon", name: "error", color: "muted" },
      { type: "Text", text: "No se encontraron capítulos para esta obra.", textEn: "No chapters found for this work.", color: "muted" },
      { type: "ElevatedButton", icon: "refresh", labelText: "Reintentar", labelTextEn: "Retry",
        onPressed: { event: "reloadSeries" } },
      { type: "ElevatedButton", icon: "arrow_back", labelText: "Volver", labelTextEn: "Back",
        onPressed: { event: "popBack" } },
    ] };
  }
  const cover = d.meta.poster
    ? { type: "Image", url: d.meta.poster, width: { compact: 120, expanded: 160 },
        aspect: "2:3", alt: d.meta.title,
        fallback: { type: "Icon", name: "list" } }
    : { type: "Icon", name: "list" };
  const pg = progress()[d.slug];
  const pgIdx = pg && typeof pg.url === "string" ? chapters.findIndex((c) => c.url === pg.url) : -1;
  const head = {
    type: "Row", gap: 16, padding: 16, crossAxisAlignment: "start", stackOnNarrow: true,
    children: [
      cover,
      { type: "Column", gap: 6, flex: 2, crossAxisAlignment: "start", children: [
        { type: "Text", text: d.meta.title || d.slug, style: "h2" },
        d.meta.type ? { type: "Text", text: d.meta.type, color: "muted" } : null,
        d.meta.status ? { type: "Badge", text: d.meta.status } : null,
        d.meta.author ? { type: "Text", text: d.meta.author, color: "muted", style: "caption" } : null,
        d.meta.genres ? { type: "Text", text: "Géneros: " + d.meta.genres, textEn: "Genres: " + d.meta.genres, color: "muted", style: "caption" } : null,
        { type: "Text", text: d.meta.overview, style: "p", color: "muted" },
        {
          type: "Row", gap: 8, wrap: true, children: [
            (function () {
              if (pgIdx > 0) {
                const contLabel = ("Continuar: " + (pg.chTitle || chapters[pgIdx].title)).slice(0, 60);
                return { type: "ElevatedButton", key: "cont", icon: "play",
                  labelText: contLabel, labelTextEn: contLabel,
                  onPressed: { event: "read", arg: String(pgIdx) } };
              }
              return { type: "ElevatedButton", key: "start", icon: "play",
                labelText: "Empezar a leer", labelTextEn: "Start reading",
                onPressed: { event: "read", arg: "0" } };
            })(),
            { type: "ElevatedButton", key: "latest", icon: "expand_more",
              labelText: "Leer lo último", labelTextEn: "Read latest",
              onPressed: { event: "read", arg: String(chapters.length - 1) } },
            { type: "ElevatedButton", key: "fav", icon: fav ? "heart" : "star",
              labelText: fav ? "Quitar de favoritos" : "Añadir a favoritos",
              labelTextEn: fav ? "Remove favourite" : "Add favourite",
              onPressed: "fav" },
            // Actualizar: salta el caché y trae los capítulos nuevos
            { type: "ElevatedButton", key: "refresh", icon: "refresh",
              labelText: "Actualizar", labelTextEn: "Refresh",
              onPressed: "reloadSeries" },
          ],
        },
        // v1.1.1: sacar esta obra de «Seguir leyendo»/Historial
        (pg ? { type: "TextButton", key: "olvidar", icon: "delete",
          labelText: "Olvidar lo leído", labelTextEn: "Forget read progress",
          onPressed: { event: "borrarProg", arg: d.slug } } : null),
      ].filter(Boolean) },
    ],
  };
  const items = [head];
  items.push({ type: "Text",
    text: chapters.length + " capítulos" + (d.meta.capped ? " (mostrando los " + MAX_CAPS + " más recientes)" : ""),
    textEn: chapters.length + " chapters", style: "h3", padding: 16 });
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    items.push({
      type: "ListTile", key: "ch" + i, dense: true,
      title: c.title,
      onTap: { event: "read", arg: String(i) },
      trailing: { type: "Icon", name: "arrow_forward" },
    });
  }
  return {
    type: "Scaffold",
    appBar: {
      title: d.meta.title || d.slug,
      leading: { type: "IconButton", key: "backHome", icon: "arrow_back",
        labelText: "Atrás", labelTextEn: "Back",
        onPressed: { event: "popBack" } },
      actions: [],
    },
    body: { type: "ListView", key: "detailBody", items },
  };
}

// contador de navegación entre capítulos
let navSeq = 0;

// Modo páginas (Kino 0.9.81, receta de MangaTrack)
function pagesDisponible() {
  try {
    return typeof kino === "object" && kino !== null &&
      typeof kino.screen === "object" && kino.screen !== null &&
      Array.isArray(kino.screen.widgets) &&
      kino.screen.widgets.indexOf("pages") >= 0;
  } catch (e) { return false; }
}

function modoLectorPref() {
  return getJson("modoLector", "tira") === "paginas" ? "paginas" : "tira";
}

function modoLectorEfectivo(n) {
  const puede = pagesDisponible() && n >= 2 && n <= 250;
  return puede && modoLectorPref() === "paginas" ? "paginas" : "tira";
}

function paginaFit(p, i) {
  return { type: "SingleChildScrollView", key: "z" + i, zoom: true, children: [
    { type: "Image", key: "p" + i, url: typeof p === "string" ? p : p.url,
      alt: "Página " + (i + 1), altEn: "Page " + (i + 1),
      fill: true, fit: "width", aspect: "2:3" } ] };
}

async function readerTree(state) {
  const r = state.reader;
  if (!r) return loadingTree();
  // v1.1.2: el lector en el estado es mínimo (slug, índice y páginas);
  // la lista de capítulos se lee de kino.storage.
  const pages = Array.isArray(r.imgs) ? r.imgs : [];
  const chapters = chaptersDe(r.slug) || [];
  const ch = chapters[r.idx];
  if (!ch || !pages.length) {
    return { type: "Column", padding: 32, gap: 12, crossAxisAlignment: "center", children: [
      { type: "Icon", name: "error", color: "muted" },
      { type: "Text", text: "No se pudieron cargar las páginas de este capítulo.", textEn: "Could not load this chapter's pages.", color: "muted" },
      { type: "ElevatedButton", icon: "arrow_back", labelText: "Volver", labelTextEn: "Back",
        onPressed: { event: "popBack" } },
    ] };
  }
  const hasNext = r.idx + 1 < chapters.length;
  const hasPrev = r.idx > 0;
  const chKey = String(ch.url).replace(/[^a-z0-9]/gi, "").slice(-16);
  const scrollKey = "pages-" + r.idx + "-" + chKey + "-" + (r.tk || 0);
  const modo = modoLectorEfectivo(pages.length);
  const inm = getJson("lectorInm", 0) ? true : false;
  const body = [];
  if (modo === "paginas") {
    body.push({
      type: "pages", key: "pgs", flex: 1, progress: "bar", onPageChanged: "pgChanged",
      children: pages.map((p, i) => paginaFit(p, i)),
    });
  } else {
    body.push({
      type: "SingleChildScrollView", key: scrollKey, flex: 1, zoom: true,
      children: [{
        type: "Column", gap: 4, crossAxisAlignment: "center", fill: true,
        children: pages.flatMap((p, i) => pageNodes(p, i)),
      }],
    });
  }
  // v1.1.2: el menú «Ir a capítulo» solo ofrece los capítulos cercanos
  // al actual (en obras largas, 490 opciones romperían el límite de
  // nodos por pantalla).
  const desde = Math.max(0, Math.min(r.idx - 25, Math.max(0, chapters.length - 60)));
  const opciones = chapters.slice(desde, desde + 60)
    .map((c, k) => ({ value: String(desde + k), label: c.title }));
  if (!inm) body.push({
    type: "Row", gap: 12, padding: 16, mainAxisAlignment: "center", wrap: true, children: [
      { type: "ElevatedButton", icon: "arrow_back", labelText: "Anterior", labelTextEn: "Previous",
        onPressed: "prevChap", enabled: hasPrev },
      { type: "DropdownButton", key: "jumpChap", labelText: "Ir a capítulo", labelTextEn: "Go to chapter",
        value: String(r.idx), onChanged: "jumpChap", options: opciones },
      { type: "ElevatedButton", labelText: hasNext ? "Siguiente" : "Último capítulo",
        labelTextEn: hasNext ? "Next" : "Last chapter",
        icon: "arrow_forward", onPressed: "nextChap", enabled: hasNext },
    ].concat(pagesDisponible() ? [
      { type: "TextButton", key: "btnModo", labelText: modo === "paginas" ? "Modo tira" : "Modo páginas",
        labelTextEn: modo === "paginas" ? "Strip mode" : "Page mode", onPressed: "modoLector" },
    ] : []).concat([
      { type: "TextButton", key: "btnPantalla", icon: "visibility",
        labelText: "Pantalla completa", labelTextEn: "Fullscreen", onPressed: "lectorInm" },
      { type: "Text",
        text: "cap. " + (r.idx + 1) + " de " + chapters.length + " · pellizca para acercar",
        textEn: "ch. " + (r.idx + 1) + " of " + chapters.length, style: "caption", color: "muted" },
    ]),
  });
  const raiz = {
    type: "Scaffold",
    appBar: inm ? undefined : { type: "AppBar", mergeWithKinoBar: true, dense: true, key: "barReader",
      title: ch.title,
      leading: { type: "IconButton", key: "backFromReader", icon: "arrow_back",
        labelText: "Atrás", labelTextEn: "Back",
        onPressed: { event: "popBack" } },
      actions: [
        { type: "IconButton", key: "verBarra", icon: "visibility",
          labelText: "Pantalla completa (ocultar botones)", labelTextEn: "Fullscreen (hide buttons)",
          onPressed: { event: "lectorInm" } },
      ] },
    body: { type: "Column", children: body },
  };
  if (inm) raiz.floatingActionButton = { type: "FloatingActionButton", key: "verBarras",
    icon: "visibility", tooltip: "Mostrar botones", tooltipEn: "Show buttons",
    onPressed: { event: "lectorInm" } };
  return raiz;
}

async function searchTree(state) {
  const q = typeof state.resultsQ === "string" ? state.resultsQ : "";
  const results = Array.isArray(state.results) ? state.results : null;
  return {
    type: "Scaffold",
    appBar: { title: "Buscar obra", titleEn: "Search a work", actions: [] },
    body: {
      type: "SingleChildScrollView", key: "searchBody",
      children: [{
        type: "Column", children: [
          { type: "Form", key: "search", onSubmitted: "search", gap: 8, padding: 16, children: [
            { type: "TextField", key: "q", kind: "search", value: q,
              labelText: "Título", labelTextEn: "Title",
              hintText: "P. ej. Solo Leveling", hintEn: "e.g. Solo Leveling",
              required: true },
            { type: "ElevatedButton", icon: "search", labelText: "Buscar", labelTextEn: "Search", submit: true },
          ] },
          results
            ? (results.length ? titleGridOf(results) : { type: "emptyState", icon: "search", title: "Sin resultados.", titleEn: "No results." })
            : { type: "Text", text: "Escribe un título y pulsa Buscar.", textEn: "Type a title and press Search.", color: "muted", padding: 16 },
        ].filter(Boolean),
      }],
    },
  };
}

// --------------------------------------------------------- los exports

export async function screen({ state, route }) {
  const r = route || { name: "home" };
  try {
    if (r.name === "detail") {
      const slug = routeSlug(r);
      if (!state.detail || state.detail.slug !== slug) {
        // v1.1.1: el detalle del estado no es el de esta ruta; se pinta
        // la vista de esqueletos y el temporizador corrige el estado.
        return detailLoadingTree(detailLoadingDe(slug));
      }
      return await detailTree(state);
    }
    if (r.name === "read") return await readerTree(state);
    if (r.name === "search") return searchTree(state);
  } catch (e) {
    return errorTree("No se pudo cargar (" + (e.code || "error") + ").", "retry");
  }
  // ruta raíz: pestañas. Se pintan AL INSTANTE (caché o esqueletos) y el
  // temporizador «cargarRoot» trae lo que falte en segundo plano.
  return {
    type: "Scaffold",
    every: { ms: 1500, event: "cargarRoot" },
    appBar: {
      title: "ZonaTM0",
      actions: [
        { type: "IconButton", icon: "search", key: "goSearch", labelText: "Buscar", labelTextEn: "Search", onPressed: { event: "goSearch" } },
      ],
      bottom: {
        type: "TabBar", key: "tabs", tabs: TABS,
        value: state.tab || "inicio", onChanged: { event: "tab" },
      },
    },
    body: tabBody(state),
  };
}

// El detalle en carga: arranca en segundo plano y evita que dos cargas
// se pisen (temporizador + botón «Cargar ahora»).
let serieEnCarga = null;

// v1.1.1: la obra que se está viendo AHORA. Un tick del temporizador
// que termine de cargar una obra anterior ya no debe sobrescribir el
// detalle (el bug de «me vuelve a aparecer Dragon Ball»): se compara
// contra esta variable al terminar la carga.
let slugDetalleActivo = null;

function detailLoadingDe(slug) {
  const info = CARDINFO[slug] || {};
  slugDetalleActivo = slug;
  return { slug, loading: true,
    meta: { title: info.title || "", poster: info.poster || "" } };
}

export async function screenEvent(ev) {
  const name = ev.name;
  const state = ev.state || {};
  try {
    if (name === "open") {
      syncPull();
      const r = ev.route || {};
      if (r.name === "detail") {
        const slug = routeSlug(r);
        if (slug && slugValido(slug) && (!state.detail || state.detail.slug !== slug)) {
          // v1.1.0: no se bloquea; el detalle se pinta ya con esqueletos
          // y el temporizador «cargarSerie» trae los capítulos.
          return { state: { detail: detailLoadingDe(slug) } };
        }
      }
      return null;
    }
    if (name === "tab") {
      // v1.1.0: cambiar de pestaña no espera a la red; si falta la
      // lista, el temporizador la trae.
      return { state: { tab: ev.value } };
    }
    // temporizador de la raíz: trae Inicio/Biblioteca en segundo plano
    if (name === "cargarRoot") {
      const tab = state.tab || "inicio";
      if (tab === "biblioteca" && !Array.isArray(state.libItems)) {
        try {
          const items = await fetchLibrary(1);
          return { state: { libItems: items, libPage: 1, libDone: items.length < 36 } };
        } catch (e) { return { state: { libItems: [], libError: true } }; }
      }
      if (tab === "inicio" && !Array.isArray(state.inicioItems)) {
        try {
          const html = await getLibHtml(1, "created_at", "");
          return { state: { inicioItems: seriesCards(html, 30) } };
        } catch (e) { return { state: { inicioItems: [] } }; }
      }
      return null;
    }
    // temporizador del detalle: carga la obra en segundo plano
    if (name === "cargarSerie" || name === "cargarSerieAhora") {
      const d = state.detail;
      if (!d) return null;
      // v1.1.1: autocuración — si el detalle del estado no es el que se
      // está viendo (quedó el de la obra anterior), se corrige aquí y el
      // siguiente tick la carga.
      if (slugDetalleActivo && d.slug !== slugDetalleActivo) {
        return { state: { detail: detailLoadingDe(slugDetalleActivo) } };
      }
      if (!d.loading) return null;
      if (serieEnCarga === d.slug && name === "cargarSerie") return null;
      serieEnCarga = d.slug;
      slugDetalleActivo = d.slug;
      try {
        // refresh=true salta el caché (botón «Actualizar»/«Reintentar»)
        const res = await cargarDetalle(state, d.slug, d.refresh === true);
        // v1.1.1: mientras cargaba esta obra se abrió otra — el
        // resultado ya no vale y NO se aplica (no vuelve a «aparecer»
        // el de antes).
        if (slugDetalleActivo !== d.slug) return null;
        return res;
      } finally {
        serieEnCarga = null;
      }
    }
    if (name === "libMore") {
      const page = (state.libPage || 1) + 1;
      const more = await fetchLibrary(page);
      let merged = (state.libItems || []).concat(more.filter((x) => !(state.libItems || []).some((y) => y.slug === x.slug)));
      if (merged.length > LIB_MAX) merged = merged.slice(0, LIB_MAX);
      return { state: { libItems: merged, libPage: page, libDone: more.length < 36 || merged.length >= LIB_MAX } };
    }
    if (name === "goSearch") return { route: { push: "search" } };
    if (name === "popBack") return { route: { pop: true } };
    if (name === "search") {
      const q = String(ev.value && ev.value.q || "").trim();
      if (!q) return { toast: "Escribe un título." };
      const html = await getLibHtml(1, "likes_count", q);
      const results = seriesCards(html, 40);
      return { state: { results, resultsQ: q },
        toast: results.length ? results.length + " resultados" : "Sin resultados" };
    }
    if (name === "retry") return { state: { _r: Date.now() } };
    // v1.1.1: quitar UNA obra de «Seguir leyendo»/Historial (botón
    // «Olvidar lo leído» del detalle o pulsación larga en Historial)
    if (name === "borrarProg") {
      let slug = String(ev.arg || "");
      if (!slug && state.detail) slug = state.detail.slug;
      if (!slugValido(slug)) return null;
      if (!borrarProgreso(slug)) return null;
      return { state: { _r: Date.now() },
        toast: "Quitada de «Seguir leyendo»" };
    }
    // v1.1.1: vaciar TODO «Seguir leyendo»/Historial (dos toques para
    // confirmar; el primero solo cambia el texto del botón)
    if (name === "clearHist") {
      if (!state.confBorrar) {
        return { state: { confBorrar: true },
          toast: "Toca otra vez para borrar TODO el historial" };
      }
      borrarTodoProgreso();
      return { state: { confBorrar: false },
        toast: "Historial y «Seguir leyendo» borrados" };
    }
    // Reintentar / Actualizar en el detalle: vuelve a la vista de
    // esqueletos (sin bloquear) y el temporizador recarga saltando el
    // caché (refresh=true).
    if (name === "reloadSeries") {
      const d = state.detail;
      if (!d) return null;
      return { state: { detail: { slug: d.slug, loading: true, refresh: true,
        meta: d.meta || {} } } };
    }
    if (name === "fav") {
      const d = state.detail;
      if (!d) return null;
      const f = favs();
      const i = f.findIndex((x) => x.slug === d.slug);
      let added = false;
      if (i >= 0) f.splice(i, 1);
      else { f.unshift({ slug: d.slug, title: d.meta.title || d.slug, poster: d.meta.poster }); added = true; }
      setJson("favs", f);
      syncPush("favs", f);
      return { toast: added ? "Añadida a favoritos" : "Quitada de favoritos" };
    }
    if (name === "read" || name === "nextChap" || name === "prevChap" || name === "jumpChap") {
      // v1.1.2: la lista de capítulos ya no viaja en el estado (era lo
      // que desbordaba el límite en obras largas y dejaba el lector
      // «Cargando…» para siempre); se lee de kino.storage.
      let chapters, idx, slug, title, poster;
      if (name === "read") {
        const d = state.detail;
        if (!d) return null;
        chapters = chaptersDe(d.slug) || [];
        idx = parseInt(String(ev.arg || "0"), 10) || 0;
        slug = d.slug; title = d.meta.title; poster = d.meta.poster;
        if (idx < 0 || idx >= chapters.length) return null;
      } else {
        const r = state.reader;
        if (!r) return null;
        chapters = chaptersDe(r.slug) || [];
        idx = name === "jumpChap"
          ? parseInt(String(ev.value || "0"), 10) || 0
          : r.idx + (name === "nextChap" ? 1 : -1);
        slug = r.slug; title = r.title; poster = r.poster;
        if (idx < 0 || idx >= chapters.length) return null;
      }
      const ch = chapters[idx];
      const images = await paginasDe(ch);
      if (!images.length) return { toast: "No se encontraron páginas en este capítulo." };
      // v1.1.2: estado del lector mínimo — sin lista de capítulos.
      markRead(slug, title, poster, ch.title, ch.url);
      const reader = { slug, title, poster, idx, chUrl: ch.url, imgs: images, tk: ++navSeq };
      const resp = { state: { reader } };
      if (name === "read") resp.route = { push: "read" };
      if (modoLectorEfectivo(images.length) === "paginas") {
        let at = parseInt(getJson("pg:" + ch.url, 0), 10);
        if (!(at >= 0) || at >= images.length) at = 0;
        resp.ui = [{ set: { key: "pgs", value: at } }];
      }
      return resp;
    }
    if (name === "pgChanged") {
      const r = state.reader;
      if (!r || !r.chUrl) return null;
      let at = parseInt(String(ev.value === undefined ? "" : ev.value), 10);
      if (!(at >= 0)) at = 0;
      const ks = [];
      try {
        for (const k of kino.storage.keys()) if (k.indexOf("pg:") === 0) ks.push(k);
      } catch (e) { }
      if (ks.length > 300) for (const k of ks.slice(0, ks.length - 300)) try { kino.storage.remove(k); } catch (e) { }
      try { kino.storage.set("pg:" + r.chUrl, String(at)); } catch (e) { }
      return null;
    }
    if (name === "lectorInm") {
      setJson("lectorInm", getJson("lectorInm", 0) ? 0 : 1);
      return { state: { _r: Date.now() } };
    }
    if (name === "modoLector") {
      if (!pagesDisponible()) return null;
      const nuevo = modoLectorPref() === "paginas" ? "tira" : "paginas";
      setJson("modoLector", nuevo);
      return { state: { _r: Date.now() },
        toast: nuevo === "paginas" ? "Modo páginas" : "Modo tira" };
    }
    if (name === "openSeries") {
      const slug = String(ev.arg || "");
      if (!slugValido(slug)) return null;
      // v1.1.0 (receta MangaTrack): el detalle se abre AL INSTANTE con
      // esqueletos; los capítulos llegan por el temporizador en segundo
      // plano. Nunca más un «Cargando…» colgado al abrir un título.
      return { state: { detail: detailLoadingDe(slug) },
               route: { push: "detail", params: { slug } } };
    }
  } catch (e) {
    return { toast: "Algo falló: " + (e.code || "error") };
  }
  return null;
}
