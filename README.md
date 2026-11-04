# Kino Plugin — ZonaTM0

Plugin de Kino para leer obras de zonatmo.org (ZonaTM0).

*   **Autor**: Hotaru Yume (`hotaruyume`)
*   **Inicio**: últimas obras, **Seguir leyendo** (lo que empezaste, automáticamente) y favoritos; **Biblioteca** (las más populares, paginada), **Favoritos**, **Historial** y **buscador** por título.
*   **Tarjetas propias de lectura** con el título en dos filas; **navegación real** (Atrás retrocede lector → detalle → pestañas).
*   **Detalle de obra**: portada, estado, autor, géneros, sinopsis y capítulos (con su grupo de traducción); botones **«Continuar»** y **«Actualizar»**.
*   **Lector webcómic**: páginas verticales enteras a ancho de pantalla, sin recortes; tira vertical o **modo página a página** (Kino 0.9.81+), con **zoom por pellizco**, **«Ir a capítulo»** y **«Pantalla completa»** que oculta las barras (se recuerda).
*   **Ícono del plugin**: icon.png 96×96 declarado en el manifiesto (`icon` + `screen.iconFile`).
*   **Sincronización entre aparatos** (`shared`): favoritos y progreso entre teléfono y TV vinculados.

Las novelas de texto del catálogo se omiten (no tienen páginas que leer).

## Instalación

Requiere **Kino 0.9.74+** (apiVersion 14). Añade `yumehotaru41-rgb/Kino-plugin-manga-ZonaTM0` en Ajustes ▸ Plugins ▸ + y actualiza a la versión **1.1.2**.

## Cambios en 1.1.2 — lector que se quedaba «Cargando…» en obras largas

*   **Corregido**: en obras con muchos capítulos (>150 aprox., p. ej. *Watashi ga Motenai no wa Dou Kangaetemo Omaera ga Warui!*), la lista de capítulos se veía bien pero al abrir uno el lector se quedaba «Cargando…» para siempre. La causa: el estado de una pantalla de Kino tiene un **límite de tamaño**, y al abrir un capítulo se guardaban ahí los capítulos **dos veces** (detalle + lector) más las imágenes; en cuanto la obra era larga, Kino descartaba el parche de estado y el lector se quedaba colgado.
*   Siguiendo el patrón de MangaTrack, **lo pesado (capítulos, imágenes) vive ahora en `kino.storage`** y el estado de la pantalla viaja mínimo (solo índices): por larga que sea la obra, nunca se vuelve a pasar del límite.
*   El menú **«Ir a capítulo»** ahora solo ofrece los capítulos cercanos al actual (en obras de cientos de capítulos, tantas opciones desbordaban el límite de nodos por pantalla).

## Cambios en 1.1.1

*   **Corregido el «Continuar» mezclado entre obras**: al abrir una obra justo después de otra (p. ej. Dragon Ball y luego otra), volvía a aparecer el capítulo de la primera. La causa: un temporizador que aún cargaba la obra anterior devolvía su resultado tarde y sobrescribía el detalle nuevo. Ahora ese resultado se descarta si mientras tanto se abrió otra obra, y cada tick autocorrige el detalle si no coincide con la obra que se está viendo.
*   **Borrar de «Seguir leyendo»/Historial**, de tres formas:
    *   Botón **«Olvidar lo leído»** en el detalle de la obra (aparece cuando hay progreso guardado).
    *   **Mantén pulsada** una entrada del Historial para quitar solo esa obra.
    *   Botón **«Borrar todo»** al inicio del Historial (pide confirmar con un segundo toque). Los borrados se sincronizan también con tus otros aparatos.

## Cambios en 1.1.0 — nunca más un «Cargando…» eterno

Siguiendo el patrón del plugin oficial **MangaTrack**:

*   **Abrir una obra es instantáneo**: el detalle se abre enseguida con su portada/título y **esqueletos** de capítulos; los datos llegan en **segundo plano** mediante el temporizador de pantalla (`every`), cuyos ticks no cuentan para el aviso «No responde» de Kino. Si tu Kino no tuviera temporizadores, queda el botón **«Cargar ahora»**.
*   **Inicio y Biblioteca también al instante**: se pintan de inmediato (caché o esqueletos) y el temporizador trae lo que falte sin bloquear la pantalla.
*   **Lector sin medir imágenes**: se eliminaron las descargas de cabeceras que eternizaban la apertura en redes lentas; ahora cada página usa `fit: width` y Kino le da su proporción real en cuanto carga (receta de MangaTrack).
*   **Tope de 490 capítulos** (los más recientes) por pantalla, con aviso «mostrando los 490 más recientes» en series muy largas — Kino admite ~600 nodos por pantalla.
*   La página de una obra (que en series largas es enorme) ahora tiene **60 s** de tiempo límite; los capítulos se ordenan y deduplican igual que antes.

## Cómo funciona

*   **Biblioteca** por AJAX (`/biblioteca?...&page=N`, respuesta JSON con el fragmento HTML de la rejilla).
*   **Ficha de obra** en `/library/<tipo>/<id>/<slug>`; capítulos en las filas `li.upload-link` (enlaces `/view_uploads/<id>`).
*   **Lector** en `/view_uploads/<id>`; páginas servidas desde `storage.zonatmo.org/chapters/<id>/<n>.webp`.
