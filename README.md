# Kino Plugin — ZonaTMO

Plugin de [Kino](https://kinotvapp.github.io/kino-plugins/) para leer obras de [zonatmo.org](https://zonatmo.org/).

- **Inicio** (últimas obras + favoritos), **Biblioteca**, **Favoritos** e **Historial**.
- **Detalle de obra**: portada, estado, géneros, sinopsis y lista de capítulos.
- **Lector webcómic vertical** con controles Anterior/Siguiente.
- **Sincronización entre aparatos** (`shared`): favoritos y progreso.

## Contenido 18+

Las obras marcadas como adultas muestran un candado y **no se pueden leer por defecto**.  
Desbloqueo: **Ajustes ▸ Plugins ▸ ZonaTMO ▸ Mostrar contenido 18+**.

## Instalación

Requiere **Kino 0.9.74+** (apiVersion 14).

1. Publica este repositorio en GitHub (público) y añade el topic `kino-plugin`.
2. En Kino: **Ajustes ▸ Plugins ▸ +** e introduce `usuario/repositorio`.

## Notas técnicas

- Host declarado: `zonatmo.org`
- Rutas principales:
  - Series: `/library/{manga|manhwa|manhua|...}/{id}/{slug}`
  - Capítulos: `/view_uploads/{uploadId}`
  - Biblioteca: `/biblioteca`
- El sitio usa Cloudflare; si Kino no puede hacer fetch, comprueba que el host esté aprobado en la hoja de consentimiento del plugin.

## Base

Adaptado del plugin [Yuri Online](https://github.com/yumehotaru41-rgb/Kino-plugin-manga-Yuri-Online) (estructura de pantallas, favoritos, progreso y lector vertical).
