# Kino Plugin — ZonaTM0

Plugin de Kino para leer obras de zonatmo.org (ZonaTM0).

*   **Autor**: Hotaru Yume (`hotaruyume`)
*   **Inicio**: últimas obras, **Seguir leyendo** (lo que empezaste, automáticamente) y favoritos; **Biblioteca** (las más populares, paginada), **Favoritos**, **Historial** y **buscador** por título.
*   **Tarjetas propias de lectura** con el título en dos filas; **navegación real** (Atrás retrocede lector → detalle → pestañas).
*   **Detalle de obra**: portada, estado, autor, géneros, sinopsis y capítulos (con su grupo de traducción); botones **«Continuar»** y **«Actualizar»**.
*   **Lector webcómic**: páginas verticales enteras a ancho de pantalla, sin recortes; tira vertical o **modo página a página** (Kino 0.9.81+), con **zoom por pellizco**, **«Ir a capítulo»** y **«Pantalla completa»** que oculta las barras (se recuerda).
*   **Medición de páginas**: las imágenes `.webp` del lector se miden por descarga parcial de sus cabeceras (JPEG/PNG/GIF/WebP), así ninguna página se recorta.
*   **Ícono del plugin**: icon.png 96×96 declarado en el manifiesto (`icon` + `screen.iconFile`).
*   **Sincronización entre aparatos** (`shared`): favoritos y progreso entre teléfono y TV vinculados.

Las novelas de texto del catálogo se omiten (no tienen páginas que leer).

## Instalación

Requiere **Kino 0.9.74+** (apiVersion 14). Añade `yumehotaru41-rgb/Kino-plugin-manga-ZonaTM0` en Ajustes ▸ Plugins ▸ + y actualiza a la versión **1.0.1**.

## Cambios en 1.0.1

*   **Nunca más un «Cargando…» eterno**: todas las peticiones tienen tiempo límite (15–20 s). Si la web no responde, se ve el error con botón **Reintentar**.
*   **Caché de obras (15 min)**: reabrir una obra ya vista es inmediato; el botón **«Actualizar»** del detalle salta el caché y trae los capítulos nuevos.
*   La pantalla de pestañas (Inicio/Biblioteca) también captura errores de red y ofrece reintentar.
*   Obtención de capítulos más robusta: si el sitio cambia su marcado, hay un plan B que recoge los enlaces `view_uploads` sueltos.

## Cómo funciona

*   **Biblioteca** por AJAX (`/biblioteca?...&page=N`, respuesta JSON con el fragmento HTML de la rejilla).
*   **Ficha de obra** en `/library/<tipo>/<id>/<slug>`; capítulos en las filas `li.upload-link` (enlaces `/view_uploads/<id>`).
*   **Lector** en `/view_uploads/<id>`; páginas servidas desde `storage.zonatmo.org/chapters/<id>/<n>.webp`.
