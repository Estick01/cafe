# Vetamora: landing con animación 3D guiada por scroll

HTML, CSS y JS sin dependencias ni paso de compilación. El scroll nativo decide el frame: se avanza y se retrocede sin secuestrar la rueda. Vetamora es una marca ficticia.

## Verla en local

Con Node instalado, desde esta carpeta:

```
node scripts/servidor.js
```

Luego abre http://localhost:5191/. Sirve cualquier servidor estático.

## Cambiar el video

```
node scripts/generar-frames.js "..\blender\renders\final.mp4" --width 1280 --quality 75
```

| Opción | Por defecto | Uso |
|---|---|---|
| `--width` | ancho del video, máximo 1920 | Ancho de los frames. Se recomienda 960 a 1280: cada frame decodificado ocupa memoria. |
| `--quality` | 75 | Calidad WebP, de 1 a 100. |
| `--step` | 1 | Conserva 1 de cada N frames, para aligerar la secuencia. |
| `--ffmpeg` | `FFMPEG_PATH` o la copia local de ffmpeg-static | Ruta a ffmpeg. |

El script usa solo la CPU. Reemplaza `assets/frames/` y los dos pósteres únicamente cuando la extracción termina bien, reescribe `js/frames-config.js` e informa del peso total. No hay que tocar nada más para que la secuencia funcione.

Si cambia la duración o el ritmo del video, ajusta los tiempos en `js/config.js`: están en segundos del video.

## Dónde se ajusta cada cosa

- `js/frames-config.js`: la fuente de frames (ruta, cantidad, tamaño, duración). Lo genera el script.
- `js/config.js`: distancia de scroll, carga, encuadre por tiempo, capítulos y fundidos.
- `index.html`: los textos de cada capítulo. Los `id` deben coincidir con `chapters` en la configuración.
- `css/estilos.css`: colores y tipografías en `:root`. La media query de la distribución lateral debe coincidir con `sideLayoutQuery`.

## Cómo funciona

- **Render:** secuencia WebP dibujada en `<canvas>`. Saltar a cualquier imagen ya decodificada es inmediato, algo que `currentTime` en H.264 no garantiza.
- **Carga:** primero el fotograma actual y sus vecinos, luego una pasada gruesa por toda la secuencia y al final los huecos. Mientras falta un frame se dibuja el más cercano disponible, y el póster se ve hasta que se pinta el primero.
- **Encuadre:** con texto lateral, el frame se aparta durante el acercamiento de la cámara para que el texto no tape la taza. Con texto inferior, el frame ocupa la zona superior. Lo que el frame no cubre se rellena con un tono sacado de su propio mármol, con bordes fundidos.
- **Movimiento reducido o sin JS:** imagen fija final y capítulos como texto normal.
- **Fallo de carga:** los frames sueltos se reintentan una vez y se sustituyen por el más cercano. Si falla más del 15 % de la secuencia, la página pasa a la forma estática con un aviso y un botón para reintentar.

## Estructura

```
index.html
css/estilos.css
js/frames-config.js     generado
js/config.js
js/secuencia.js         carga de frames y dibujo en canvas
js/app.js               scroll, capítulos, puntos, menú y modos
scripts/generar-frames.js
scripts/servidor.js
assets/poster-inicio.webp, poster-final.webp, frames/
```
