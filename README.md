# Kino Plugin — ZonaTM0

Plugin de Kino para leer obras de zonatmo.org (ZonaTM0).

*   **Autor**: Hotaru Yume (`hotaruyume`)
*   **Inicio**: últimas obras, **Seguir leyendo** (lo que empezaste, automáticamente) y favoritos; **Biblioteca** (las más populares, paginada), **Favoritos**, **Historial** y **buscador** por título.
*   **Tarjetas propias de lectura** con el título en dos filas; **navegación real** (Atrás retrocede lector → detalle → pestañas).
*   **Detalle de obra**: portada, estado, autor, géneros, sinopsis y capítulos (con su grupo de traducción); botón **«Continuar»**.
*   **Lector webcómic**: páginas verticales enteras a ancho de pantalla, sin recortes; tira vertical o **modo página a página** (Kino 0.9.81+), con **zoom por pellizco**, **«Ir a capítulo»** y **«Pantalla completa»** que oculta las barras (se recuerda).
*   **Medición de páginas**: las imágenes `.webp` del lector se miden por descarga parcial de sus cabeceras (JPEG/PNG/GIF/WebP), así ninguna página se recorta.
*   **Ícono del plugin**: icon.png 96×96 declarado en el manifiesto (`icon` + `screen.iconFile`).
*   **Sincronización entre aparatos** (`shared`): favoritos y progreso entre teléfono y TV vinculados.

Las novelas de texto del catálogo se omiten (no tienen páginas que leer).

## Instalación

Requiere **Kino 0.9.74+** (apiVersion 14). Añade `yumehotaru41-rgb/Kino-plugin-manga-ZonaTM0` en Ajustes ▸ Plugins ▸ + y actualiza a la versión **1.0.0**.

## Cómo funciona

*   **Biblioteca** por AJAX (`/biblioteca?...&page=N`, respuesta JSON con el fragmento HTML de la rejilla).
*   **Ficha de obra** en `/library/<tipo>/<id>/<slug>`; capítulos en las filas `li.upload-link` (enlaces `/view_uploads/<id>`).
*   **Lector** en `/view_uploads/<id>`; páginas servidas desde `storage.zonatmo.org/chapters/<id>/<n>.webp`.
