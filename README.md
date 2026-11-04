# Kino-plugin-manga-ZonaTM0

Plugin de [Kino](https://kinotvapp.github.io/kino-plugins/) para leer manga y webcómics de **zonatmo.org** (ZonaTM0) en el teléfono y en la TV desde el mismo código.

## Qué incluye

- **Inicio** — últimas obras, «Seguir leyendo» (continúa donde lo dejaste) y tus favoritos.
- **Biblioteca** — las obras más populares de ZonaTM0, con scroll infinito.
- **Favoritos** — marca obras con el corazón y sincroniza entre dispositivos.
- **Historial** — todo lo que has leído, con pulsación larga para quitar una entrada y «Borrar todo» (con confirmación en dos toques).
- **Buscar** — por título.
- **Detalle de obra** — portada, estado, autor, géneros y sinopsis (las sinopsis muy largas se recortan y se extienden con «Ver toda la sinopsis»). Fila de lectura con «Continuar · Cap. N» y «Leer lo último»; debajo, Favoritos · Actualizar · Olvidar lo leído como iconos compactos.
- **Lector** — tira vertical con zoom, siempre en pantalla completa. Al terminar cada capítulo, una tarjeta con «Volver al detalle», «Capítulo X de N», «Anterior» y «Siguiente» (siempre activos; en los extremos avisan con un toast) y el cambio de modo si tu Kino admite el modo páginas.

## Rendimiento (desde 1.1.0, receta de MangaTrack)

Nada bloquea la pantalla: el detalle, el Inicio y la Biblioteca se pintan al instante (caché o esqueletos) y los datos llegan en segundo plano con temporizadores. Las páginas del lector no se miden: Kino les da su proporción real al cargar (fit "width" + aspect "2:3"). Tope de 490 capítulos por pantalla (los más recientes) y de 15 minutos de caché por obra. Lo pesado (capítulos e imágenes) vive en `kino.storage`, no en el estado de la pantalla (v1.1.2).

## Cambios en 1.1.6 — lector siempre a pantalla completa

- El lector arranca SIEMPRE en pantalla completa: sin barra de botones propia ni botón flotante del ojo (obstruía la página).
- «Anterior» y «Siguiente» aparecen UNA sola vez, en la tarjeta del final del capítulo (antes salían duplicados: panel inferior + final de tira).
- La tarjeta del final añade «Volver al detalle» y el cambio de modo (tira/páginas) si tu Kino lo admite.
- En modo páginas queda una barra fina inferior (Volver · Anterior · Siguiente), sin duplicados.

## Cambios en 1.1.5 — textos e iconos

- «Continuar» con texto corto («Continuar · Cap. N»): ya no se corta el título largo del capítulo dentro del botón.
- Favoritos · Actualizar · Olvidar lo leído pasan a ser solo iconos (sin texto), en una fila compacta.
- Corregido el «Siguiente» que desaparecía en el lector: los botones usaban `fill`, una propiedad que Kino no admite en botones y que descartaba el nodo entero. Ahora usan solo `flex`.
- Tarjeta «Anterior / Siguiente» al final de la tira (v1.1.6 la convierte en la única barra de navegación del lector).

## Cambios en 1.1.4 — botones siempre activos y sinopsis plegable

- «Anterior» y «Siguiente» SIEMPRE visibles y activos en el lector: aunque estés en el primer o último capítulo, el botón responde y avisa con un toast.
- Detalle: sinopsis larga recortada con «Ver toda la sinopsis» y «Menos» para volver a plegarla.
- Botones del detalle reorganizados en dos filas sin espacios vacíos.

## Cambios en 1.1.3 — panel inferior del lector

- Rediseño del panel inferior como tarjeta compacta.
- Eliminado el desplegable «Ir a capítulo».

## Cambios en 1.1.2 — lector arreglado en obras largas

- Corregido el «Cargando…» eterno al abrir capítulos de obras con muchos capítulos: el estado de la pantalla tiene un límite de tamaño y ahora lo pesado vive en `kino.storage`.

## Cambios en 1.1.1 — «Continuar» fiable y borrado

- Corregido: al abrir una obra justo después de otra, reaparecía el «Continuar»/detalle de la anterior.
- Añadido «Olvidar lo leído» en el detalle, quitar entradas sueltas del Historial y «Borrar todo el historial».

## Instalación (Kino 0.9.74 o superior)

1. Abre Kino → Ajustes → Plugins.
2. Añade el repositorio `yumehotaru41-rgb/Kino-plugin-manga-ZonaTM0` (o la URL de este repo en raw).
3. Instala **ZonaTM0 v1.1.6**.
4. Aparece en el menú lateral / franja de Inicio de Kino como «ZonaTM0» (y un botón «Abrir pantalla» en su página de ajustes).

> Nota: añade el topic `kino-plugin` al repo en GitHub para que aparezca en el listado oficial de plugins de Kino.

## Estructura del sitio que usa

- Biblioteca AJAX: `GET /biblioteca?title=…&filter_by=title&order_item=likes_count|created_at&order_dir=desc&page=N` → JSON `{ html }`.
- Ficha: `/library/<tipo>/<id>/<slug>/` (novelas descartadas).
- Capítulos: `li.upload-link` → `/view_uploads/<id>`.
- Lector: imágenes en `storage.zonatmo.org/chapters/<id>/<n>.webp`.
