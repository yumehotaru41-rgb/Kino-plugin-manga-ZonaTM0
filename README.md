# Kino-plugin-manga-ZonaTM0

Plugin de [Kino](https://kinotvapp.github.io/kino-plugins/) para leer manga y webcómics de **zonatmo.org** (ZonaTM0) en el teléfono y en la TV desde el mismo código.

## Qué incluye

- **Inicio** — últimas obras, «Seguir leyendo» (continúa donde lo dejaste) y tus favoritos.
- **Biblioteca** — las obras más populares de ZonaTM0, con scroll infinito.
- **Favoritos** — marca obras con el corazón y sincroniza entre dispositivos.
- **Historial** — todo lo que has leído, con pulsación larga para quitar una entrada y «Borrar todo» (con confirmación en dos toques).
- **Buscar** — por título.
- **Detalle de obra** — portada, estado, autor, géneros y sinopsis (las sinopsis muy largas se recortan y se extienden con «Ver toda la sinopsis»). Botones en dos filas sin huecos: Continuar/Empezar · Leer lo último, y Favoritos · Actualizar · Olvidar lo leído.
- **Lector** — tira vertical con zoom o modo páginas (si tu Kino lo admite). El panel inferior muestra «Anterior» y «Siguiente» SIEMPRE visibles y activos (con aviso al llegar al primer/último capítulo), el modo de lectura, la pantalla completa y «Capítulo X de N».

## Rendimiento (desde 1.1.0, receta de MangaTrack)

Nada bloquea la pantalla: el detalle, el Inicio y la Biblioteca se pintan al instante (caché o esqueletos) y los datos llegan en segundo plano con temporizadores. Las páginas del lector no se miden: Kino les da su proporción real al cargar (fit "width" + aspect "2:3"). Tope de 490 capítulos por pantalla (los más recientes) y de 15 minutos de caché por obra. Desde 1.1.2 lo pesado (capítulos e imágenes) vive en `kino.storage`, no en el estado de la pantalla: arregla el lector que se quedaba «Cargando…» para siempre en obras con más de ~150 capítulos.

## Cambios en 1.1.4 — botones siempre activos y sinopsis plegable

- «Anterior» y «Siguiente» SIEMPRE visibles y activos en el lector: aunque estés en el primer o último capítulo, el botón responde y avisa con un toast («Ya estás en el último capítulo»). Ya no desaparece ni se deshabilita «Siguiente» al terminar un capítulo.
- Detalle: sinopsis larga recortada con «Ver toda la sinopsis» y «Menos» para volver a plegarla.
- Botones del detalle reorganizados en dos filas sin espacios vacíos (Continuar/Empezar · Leer lo último arriba; Favoritos · Actualizar · Olvidar lo leído abajo).

## Cambios en 1.1.3 — panel inferior del lector

- Rediseño del panel inferior como tarjeta compacta.
- Eliminado el desplegable «Ir a capítulo».

## Cambios en 1.1.2 — lector arreglado en obras largas

- Corregido el «Cargando…» eterno al abrir capítulos de obras con muchos capítulos (p. ej. *Watashi ga Motenai no wa Dou Kangaetemo Omaera ga Warui!*): el estado de la pantalla tiene un límite de tamaño y ahora lo pesado vive en `kino.storage`.

## Cambios en 1.1.1 — «Continuar» fiable y borrado

- Corregido: al abrir una obra justo después de otra, reaparecía el «Continuar»/detalle de la anterior (p. ej. Dragon Ball).
- Añadido «Olvidar lo leído» en el detalle, quitar entradas sueltas del Historial y «Borrar todo el historial».

## Instalación (Kino 0.9.74 o superior)

1. Abre Kino → Ajustes → Plugins.
2. Añade el repositorio `yumehotaru41-rgb/Kino-plugin-manga-ZonaTM0` (o la URL de este repo en raw).
3. Instala **ZonaTM0 v1.1.4**.
4. Aparece en el menú lateral / buscador de Kino como «ZonaTM0».

> Nota: añade el topic `kino-plugin` al repo en GitHub para que aparezca en el listado oficial de plugins de Kino.

## Estructura del sitio que usa

- Biblioteca AJAX: `GET /biblioteca?title=…&filter_by=title&order_item=likes_count|created_at&order_dir=desc&page=N` → JSON `{ html }`.
- Ficha: `/library/<tipo>/<id>/<slug>/` (novelas descartadas).
- Capítulos: `li.upload-link` → `/view_uploads/<id>`.
- Lector: imágenes en `storage.zonatmo.org/chapters/<id>/<n>.webp`.
