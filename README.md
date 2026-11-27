# UmaScreen

Overlay para Windows que se muestra encima de Umamusume con notas, guías de Game8 y la lista de habilidades de GameTora (descripciones en español). No lee datos del juego.

## Descargar

Descarga `UmaScreen.exe` desde [Releases](../../releases/latest). Es portable: no necesita instalación.

- Windows puede avisar "Windows protegió su PC" porque el `.exe` no está firmado: **Más información → Ejecutar de todas formas**.
- El juego debe estar en modo **ventana** o **ventana sin bordes**.

## Uso

- `Ctrl+Shift+E`: modo edición (mover, redimensionar, activar/desactivar tarjetas).
- `Ctrl+Shift+O`: mostrar / ocultar.
- `Ctrl+Shift+R`: actualizar webs.
- Icono rosa junto al reloj: configuraciones, ajustes (atajos, pantalla, arrancar con Windows) y salir.

Al arrancar eliges una configuración (una por Champions Meeting). Cuando sale una CM nueva en Game8, la app crea su configuración sola.

## Desarrollo

```
npm install
npm start      # ejecutar
npm test       # pruebas
npm run dist   # genera dist/UmaScreen.exe
```

Detalles técnicos en [CLAUDE.md](CLAUDE.md). Datos de [Game8](https://game8.co) y [GameTora](https://gametora.com); este proyecto no está afiliado a ellos.
