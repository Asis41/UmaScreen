# UmaScreen

Overlay para PC (Windows) que se muestra encima de un juego con notas, texto e imágenes. No lee datos del juego. La información viene de webs (descarga automática) o la escribe el usuario dentro de la app.

## Stack
- Electron 39 + HTML/CSS/JS sin framework ni bundler.
- `cheerio` para extraer contenido de webs en el proceso main.
- `electron-builder` para generar un `.exe` portable.
- Se eligió Electron por personalización visual (CSS) y click-through con `setIgnoreMouseEvents`; el rendimiento no es prioridad.

## Comandos
- `npm start`: ejecutar en desarrollo.
- `npm test`: self-check del extractor (`test/scrape.test.js`).
- `npm run dist`: genera `dist/UmaScreen.exe` (portable, sin firma).
- Repositorio público: https://github.com/Asis41/UmaScreen (rama `main`). `.exe` para usuarios como Release: subir `version` en `package.json`, `npm run dist`, y `gh release create vX.Y.Z dist/UmaScreen.exe`. `dist/`, `node_modules/` y `graphify-out/` no van al repositorio.
- Mapa del proyecto (graphify) en `graphify-out/`: consultar `graphify-out/GRAPH_REPORT.md` o `graphify query "..."` antes de explorar a mano. Tras cambiar código: `graphify update .` (gratis); tras cambiar docs/imágenes: `/graphify . --update`. `.graphifyignore` excluye `node_modules/` y `dist/`.

## Archivos
- `main.js`: ventana overlay (ocupa toda la pantalla principal, transparente, sin marco, `alwaysOnTop 'screen-saver'`, fuera de la barra de tareas), atajos globales, IPC, guardado y refresco de webs cada 30 min.
- `preload.js`: puente `window.api` (contextIsolation, sin nodeIntegration).
- `scrape.js`: `extract(html, selector, baseURI)` (función pura y testeada) y `scrape(url, selector)`.
- `index.html` / `renderer.js`: lista de tarjetas y un `<dialog>` para editarlas.
- `notes.js`: `parseNotes(text)`, Markdown mínimo para las notas del usuario (`#` títulos, `-`/`1.` listas, `**negrita**`, `*cursiva*`, `` `código` ``). Devuelve tokens; `renderNotes` (renderer) arma el DOM solo con `textContent`. Se carga con `<script>` y también se testea desde Node.
- `style.css`: toda la apariencia; las variables en `:root` son el punto de personalización.

## Modelo de datos
Un único tipo de "tarjeta": `{ title, body, image, url?, section?, selector?, html?, error?, collapsed?, x?, y?, hidden? }`.
- `x`/`y`: posición en px fijada al arrastrar el asa ⠿ (modo edición). Sin ellas, la tarjeta va en la columna de la derecha.
- `skills: true` + `query`: buscador de habilidades. La lista viene de GameTora (la web se pinta con JS; los datos están en `https://gametora.com/data/umamusume/skills.<hash>.json`, con el hash sacado de `data/manifests/umamusume.json`). `fetchSkills`/`skillList` en `scrape.js`; se cachea en `%APPDATA%\umascreen\skills.json` (no en `cards.json`: pesa mucho) y se renueva en segundo plano en cada arranque. El cuadro de búsqueda solo se ve en modo edición; los resultados (máx. 15, todas las palabras deben aparecer en nombre o descripción) se ven siempre.
- `filters: { kind, style, dist, rarity, server }` (tarjeta de habilidades): desplegables Tipo/Estilo/Distancia/Rareza, solo en modo edición. Filtran por `tags` (calculadas en `skillTags`, `scrape.js`): etiquetas de GameTora (`run/ldr/btw/cha` estilo, `sho/mil/med/lng` distancia, `dbf` debuff) + efecto (`spd` 27, `acc` 31, `rec` 9, `grn` 1–5) + rareza (`r1`, `r2`, `uniq` 3–5, `evo` 6) + versión (`glb`, o `jp` si `unreleased` incluye `en`). En estilo y distancia también pasan las habilidades sin etiqueta de ese grupo (valen para cualquiera). Cambiar el formato de `skillList` exige subir la versión del nombre de la caché (`skills-v4.json`).
- Iconos de habilidades: `iconid` → `https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_<id>.png`. Hay ~130 distintos para ~2000 habilidades; `downloadIcons` (main.js) baja cada uno una sola vez a `%APPDATA%/umascreen/skill-icons/<id>.png` y el renderer los usa como `file:///`.
- `detail` (tarjeta de habilidades): nombre de la habilidad con el detalle abierto ("Más", solo uno a la vez; se ve también en modo vista). La caché `skills-v5.json` es `{ skills, conditions }`: cada habilidad lleva `cost`, `groups[{ dur, cond, pre, effects:[[tipo, valor]] }]` y `src` (personajes, eventos, cartas de apoyo, escenario) con nombres ya resueltos desde `character-cards`, `support-cards` y `scenario-names` de GameTora; " · JP" marca lo que no está en `loc.en` (Global). `conditions` = variable → explicación (`static/skill_conditions`). Los textos de efectos se forman en `EFFECTS` (renderer.js), valores ÷10000 (recuperación ÷100 %).
- `favorites: true` + `favs` (nombres): tarjeta "Habilidades favoritas" de la configuración actual. La estrella ☆/★ de cada habilidad (`skillItem`, compartido por la tarjeta de habilidades y la de favoritas) añade o quita; si la tarjeta no existe se crea con la primera estrella. Las favoritas son por configuración (por CM).
- `condViewer: true` + `query` + `skill`: visor de condiciones (réplica del Skill Condition Viewer de GameTora). Lista las ~145 condiciones de `conditions` (`{ desc, example, meaning, note, values, ops }`, armado por `conditionInfo` en `scrape.js` con `static/skill_conditions` + `static/skill_condition_values`); `skill` (nombre exacto, autocompletado con `<datalist id="skill-names">`) muestra sus Triggers y solo sus condiciones. El botón "Ver en visor de condiciones" del detalle de una habilidad rellena `skill` y activa la tarjeta. Caché actual: `skills-v6.json`.
- `w`/`h` (px, opcionales): tamaño fijado arrastrando la esquina inferior derecha (CSS `resize`, en modo edición o si la tarjeta es clicable). Se guarda en `mouseup` leyendo el estilo inline que escribe el navegador. Al pintar, las tarjetas colocadas se limitan a la pantalla (`maxHeight/maxWidth` según su posición) y lo que no cabe se desplaza dentro de la tarjeta. La columna derecha también tiene scroll propio.
- `zoom` (0.7–1.5): tamaño del texto (botones A−/A+). Se aplica con CSS `zoom` solo al `.content` de la tarjeta, no a la tarjeta entera (si no, también escalaría su posición). ↺ borra `w`, `h` y `zoom`.
- `group` + `tab`: tarjetas con el mismo `group` (campo del editor) se pintan como una sola con pestañas. La primera visible del grupo es la "líder": su posición, tamaño, zoom, plegado, `clickable` y `tab` (índice de la pestaña activa) mandan; el contenido y ✎ son de la pestaña activa. `render()` arma el marco y `cardContent(card, box)` pinta el contenido.
- Botón "Recolocar todas" (barra de edición): borra `x`/`y` de todas (vuelven a la columna), conserva tamaño y zoom.
- `clickable`: tarjeta usable fuera del modo edición (casilla 🖱 en el menú "Tarjetas"). En modo vista la ventana usa `setIgnoreMouseEvents(true, { forward: true })`; el renderer escucha `mousemove` y, sobre una `.card.live` (o con el editor abierto), envía `click-through` para recuperar el ratón. Esas tarjetas muestran sus botones/buscadores también en modo vista y llevan un borde fino de acento.
- `hidden`: tarjeta desactivada; no se ve en ningún modo. Se activa/desactiva desde el menú "Tarjetas" (`#panel`, casillas), visible solo en modo edición.
- `collapsed`: tarjeta plegada (solo título). En modo edición, clic en el título pliega/despliega y el botón ✎ abre el editor.
- Sin `url`: nota manual.
- `url` + `section` (texto de un título h1–h4 en la página): se guarda en `html` todo lo que hay hasta el siguiente título, como **HTML saneado por lista blanca** (`sanitize` en `scrape.js`: tablas, texto e imágenes https; sin atributos salvo src/alt/width/height/colspan/rowspan). `body`/`image` quedan como notas del usuario. `selector` es opcional y limita la búsqueda.
- `url` + `selector` (sin `section`): modo antiguo, texto plano en `body` + primera imagen.
- Al refrescar, si falla, se conserva el último contenido y se guarda `error`.

## Fuentes configuradas
- Game8, guía de Champions Meeting (CM23 Pisces Cup): `https://game8.co/games/Umamusume-Pretty-Derby/archives/638136`. Secciones visibles: Race Course Map, Stat Guidelines, Recommended Characters, Green Skills. El resto de secciones de la guía (tier list, fecha, composición, aceleración/velocidad/recuperación/debuff, cartas de apoyo, mazos, recompensas…) están en `defaults.json` con `hidden: true`; el usuario las activa desde el menú "Tarjetas". Las imágenes de Game8 son lazy: la URL real está en `data-src`.
- La URL cambia con cada CM; se detecta sola (ver "Detección de CM nueva").
- Se guardan en `%APPDATA%\umascreen\cards.json` (`app.getPath('userData')`), con escritura atómica (tmp + rename).
- Primer arranque (sin `cards.json`): se cargan las tarjetas de `defaults.json` (incluido en el build; ya sin tarjetas de CM, que van en `defaults-cm.json`). Si `cards.json` existe pero está corrupto, `load()` lanza un error en vez de devolver `[]`, para no sobrescribirlo.

## Configuraciones (una por CM)
- Al arrancar se abre el menú "Elige una configuración" (`<dialog id="profiles">`); también desde el botón "Configuraciones" de la barra de edición y desde la bandeja.
- "Predeterminada" = `cards.json`. Cada configuración con nombre = `%APPDATA%\umascreen\profiles\<nombre>.json`, con sus propias tarjetas, posiciones y tamaños. `STORE` (main.js) apunta a la activa; `load`/`save`/`refreshAll` trabajan siempre sobre ella.
- Crear = copiar otra (o `defaults.json` si no existe) y pasar a usarla. Borrar: no se puede la activa ni la predeterminada. Esc = seguir con la actual.
- El nombre viene del renderer y se usa como nombre de archivo: `cleanName` deja solo letras, números, espacio y `. _ -`. No relajar.
- Reparto inicial (`firstProfiles`, una sola vez, si no existe `profiles/`): la Predeterminada se queda solo con las tarjetas generales y las de Game8 (CM) pasan a la configuración "CM23 Pisces Cup" (conservando posiciones). Copia previa en `cards.before-profiles.json`. Usuario nuevo: Predeterminada = `defaults.json` (sin CM) y la de CM sale de `defaults-cm.json` (incluido en el build).
- El primer `refreshAll` se lanza al elegir configuración (no al arrancar), para refrescar las webs de la elegida.
- Por defecto se pregunta en cada arranque; se puede recordar (ver Ajustes).
- Detección de CM nueva (`detectNewCM`, al arrancar y en la bandeja "Buscar CM nueva en Game8"): `latestCM` (scrape.js) lee el hub de Champions Meeting de Game8 (`archives/541155`), busca enlaces "<Nombre> Cup[ 2] (CM<n>)" (sin "Look Ahead") y se queda con el mayor `n`. Si ninguna configuración empieza por `CM<n>`, crea "CM<n> <Nombre>" copiando la de CM más alta (o `defaults-cm.json`), con la URL de todas las tarjetas de Game8 cambiada a la nueva y `html`/`error` vacíos; el menú lo avisa. Sin conexión no hace nada (timeout 10 s). Las secciones con nombres propios de cada CM (personajes, Grandmasters…) pueden dar "Sección no encontrada" en la nueva.

## Traducción al español (`es.json`)
- Los **nombres** de habilidades se quedan siempre en inglés (decisión del usuario). Se traducen las descripciones y los textos de las condiciones.
- `es.json` (incluido en el build): `{ descs: { "<desc en inglés>": "<español>" }, conditions: { "<nombre>": { desc, meaning, note, values } } }`. Las claves son el texto en inglés, no el id.
- `prepareSkills` (main.js) añade `desc_es` a cada habilidad y `es` a cada condición; el renderer muestra con `skillDesc(s)` / `condText(k, campo)` y cae al inglés si falta.
- Búsqueda: nombre + descripción EN + ES, sin distinguir mayúsculas ni tildes (`plain`).
- Actualizar tras nuevas habilidades: `node tools/i18n.js missing` → `export <dir>` (lotes `batch-NN.json`) → traducir cada lote a `batch-NN.es.json` (array, mismo orden) → `merge <dir>`. `merge` rechaza traducciones vacías o que cambien números, ◎○× o fragmentos de código (`corner!=0`). `tools/` no entra en el build.
- Glosario: velocidad, aceleración, recuperar resistencia, Front/Pace/Late/End (Runner/Leader/Betweener/Chaser también), inicio/mitad/final de carrera (Opening/Middle/Final Leg), sprint final, última curva, recta final, posiciones delanteras/traseras, mitad del grupo, ligeramente/moderadamente/mucho/muchísimo, stats Velocidad/Resistencia/Potencia/Agallas/Inteligencia, Sprint/Milla/Media/Larga, césped/tierra, precipitarse (kakari), duelo (追い比べ). Textos que GameTora da en 2.ª persona (habilidades solo JP) se mantienen en 2.ª persona.

## Ajustes (globales, no por configuración)
- `%APPDATA%\umascreen\settings.json`: `{ remember, display, keys: { edit, toggle, refresh } }`. Diálogo `<dialog id="settings">` (botón "Ajustes" de la barra de edición y bandeja "Ajustes…"); cada cambio se aplica al momento vía `set-settings`, que valida todo en main.
- `remember`: `null` = preguntar al arrancar; `''` = Predeterminada; nombre = esa configuración. También la casilla "Recordar mi elección" del menú de inicio. `startup()` la abre directamente salvo que haya CM nueva (entonces pregunta).
- `display`: id de pantalla (`screen.getAllDisplays()`); si ya no está, la principal. Al cambiar, `win.setBounds(workArea)` y el renderer repinta en `resize`.
- `keys`: aceleradores de Electron, validados con `KEY_RE` (modificador + letra/dígito, o F1–F24), sin duplicados; si otro programa ya usa la combinación se revierte y se avisa. Mientras se edita un atajo, `pause-keys` desactiva los globales.
- Arrancar con Windows: `app.setLoginItemSettings` con la ruta del `.exe` portable (`PORTABLE_EXECUTABLE_FILE`). Solo en el build (`app.isPackaged`); si el usuario mueve el `.exe`, hay que volver a marcarlo.
- Transparencia por tarjeta: `alpha` (botón ◐, ciclo 0.78/0.6/0.4/0.2/0/0.95) en la variable CSS `--alpha`; solo afecta al fondo (`--bg-rgb`), no al texto.

## Robustez
- Una sola instancia (`requestSingleInstanceLock`): dos copias se pisarían `cards.json`. Abrir otra vez solo muestra la ventana existente.
- `removeOldCaches` borra al arrancar los `skills*.json` que no sean el actual (`SKILLS`). Al subir la versión de la caché no hay que limpiar a mano.
- Tarjetas con error: el menú "Tarjetas" las marca con ⚠ (el error en el tooltip) y cuenta cuántas hay. Si `refreshAll` da "Sección no encontrada" en una tarjeta sin contenido previo (caso típico: CM nueva), la oculta una sola vez (`autoHidden`); si el usuario la vuelve a activar, no se oculta otra vez. `autoHidden` se borra al descargar bien. Los fallos de red no ocultan nada.

## Comportamiento clave
- Modo vista: la ventana ignora el ratón (los clics pasan al juego). Modo edición: es interactiva.
- Atajos (por defecto, se cambian en Ajustes): `Ctrl+Shift+E` edición, `Ctrl+Shift+O` mostrar/ocultar, `Ctrl+Shift+R` refrescar webs.
- Icono de bandeja (`icon.png`): clic = mostrar/ocultar; menú con Mostrar/Ocultar, Modo edición, Actualizar webs, Abrir carpeta de datos, Salir. `updateTrayMenu()` se llama tras cambiar visibilidad o modo para mantener las etiquetas al día.
- `refreshAll` descarga primero y después **vuelve a leer** `cards.json` antes de fusionar (por `url+selector`), para no pisar ediciones hechas durante la descarga. Mantener esto si se toca.
- El contenido de las webs se pinta solo con `textContent` (nunca `innerHTML`) y la CSP prohíbe scripts externos. No relajar esto sin sanitizar.
- Las imágenes locales deben ir como `file:///C:/...`.

## Limitaciones conocidas
- El juego debe estar en modo ventana o ventana sin bordes; en pantalla completa exclusiva el overlay no se ve.
- El scraping solo ve HTML estático; las webs que cargan contenido con JS necesitarían una `BrowserWindow` oculta.
- El `.exe` no está firmado: Windows SmartScreen muestra una advertencia.
- Las tarjetas iniciales solo aparecen si el usuario no tiene `cards.json`; cambiar `defaults.json` no afecta a quien ya usó la app.

## Problema de instalación (Node 24)
El postinstall de `electron` (extract-zip) se corta tras el primer archivo con Node 24. Si `npm start` dice "Electron failed to install correctly":
```powershell
Remove-Item -Recurse -Force node_modules/electron/dist
$zip = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter "electron-v*-win32-x64.zip" | Select-Object -First 1
Expand-Archive $zip.FullName node_modules/electron/dist
Set-Content -NoNewline -Encoding ascii node_modules/electron/path.txt 'electron.exe'
```
`electron-builder` no se ve afectado (usa su propio extractor).

## Pendiente / ideas
- En modo vista solo se puede desplazar el contenido de las tarjetas marcadas como clicables (🖱).
- Pendiente: traducir al español las descripciones de habilidades y condiciones.

## Convenciones
- Interfaz y textos en español.
- Mínimas dependencias; nada de framework de UI salvo necesidad real.
