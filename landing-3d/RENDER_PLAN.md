# Secuencia de cafe con simulacion

Estado: puente oficial conectado; primer render de ceramica generado y revisado;
simulacion Mantaflow en calculo. La secuencia final todavia no esta publicada.

## Objetivo

Reemplazar la transformacion estilizada por un vertido natural renderizado con
Cycles. Conservar HTML, navegacion, scroll nativo reversible y acceso sin animacion.
El usuario aprobo este cambio despues de rechazar el aspecto del liquido procedural.

## Fuentes encontradas

- Escena: `../blender/cafe_escena.blend`.
- Modelo fuente de taza: `../blender/assets/coffeecup.blend`.
- Construccion, materiales y dimensiones: `../blender/build_scene.py`,
  `../blender/ceramic.py`, `../blender/cup_asset.py`, `../blender/dimensions.py`.
- Animacion anterior: `../blender/animate_scene.py`, `../blender/liquid.py`.
  Su chorro y espiral son procedurales; no deben presentarse como simulacion fisica.
- Existe una landing de imagenes en `../landing`; revisar su cargador antes de
  implementar otro.
- Blender 5.2 localizado en `C:/Program Files/Blender Foundation/Blender 5.2`.

## Secuencia propuesta (10 segundos)

1. 0–2 s: taza vacia apoyada en el plato, plano de producto.
2. 2–3 s: inicio de un chorro natural desde fuera del encuadre.
3. 3–7 s: llenado, impacto, ondas y pequenas salpicaduras contenidas.
4. 7–8 s: termina el vertido y caen las ultimas gotas.
5. 8–10 s: se calma la superficie; plano final del cafe servido.

Eliminar la espiral y el crecimiento de la taza. Revisar los textos de los
capitulos para que correspondan a esta nueva secuencia.

## Orden de produccion

1. Trabajar en una copia dentro de `production/`, sin sobrescribir los originales.
2. Inspeccionar malla, escala, grosor y normales de taza/plato; verificar que el
   interior funciona como colisionador cerrado y que la escala de simulacion sea correcta.
3. Preparar Mantaflow: dominio ajustado, taza como colisionador, emisor y gravedad.
   Hornear una prueba de baja resolucion y revisar penetraciones, volumen y tiempos.
4. Ajustar camara y luces de area; ceramica con esmalte y variacion sutil.
   Cafe con absorcion segun profundidad. Evitar aspecto transparente de agua.
5. Renderizar fotogramas de inicio, impacto, llenado y reposo con Cycles.
   Inspeccionar las imagenes antes del render de la secuencia completa.
6. Elegir resolucion y numero de fotogramas segun coste medido de la prueba.
   Preparar WebP y poster, y medir peso total antes de integrarlos.
7. Integrar progreso normalizado a indice de imagen, carga prioritaria del frame
   actual y vecinos, cache acotada y proteccion frente a cargas fuera de orden.
8. Validar scroll adelante/atras, saltos, movil, resize, carga fallida y movimiento
   reducido. Mantener la version actual hasta que los renders nuevos esten listos.

## Backend y trabajo realizado

- Backend seleccionado: oficial, descargado en `tools/blender-mcp`, version de
  paquete 1.0.2; Blender 5.2.3 LTS, RTX 5070 con OptiX.
- Puente de Blender iniciado en 127.0.0.1:9877, usando el codigo CLI del complemento
  oficial. `scripts/blender_bridge_call.py` usa el transporte original de ese
  servidor; no implementa un protocolo alternativo. La consulta inicial de escena
  devolvio status=ok. No se modificaron preferencias globales de Blender/Codex.
- La instalacion del cliente stdio en `tools/blender-mcp-venv` se detuvo al no
  avanzar la descarga de dependencias; no considerarlo instalado. El adaptador de
  transporte oficial funciona con Python y su biblioteca estandar.
- Copia de trabajo: `production/cafe-natural.blend`. Objetos originales conservados
  en una coleccion oculta; taza, asa y plato recuperados del asset del usuario.
- Ceramica nueva, iluminacion Cycles, 64 muestras de prueba, camara de 62 mm.
- `production/preview-empty.png` es una prueba inicial: material revisado, pero
  plato demasiado cerca del borde. Camara corregida y fondo simplificado despues.
- Mantaflow: dominio de 128 x 128 x 180 mm, resolucion 144, malla x2, 240 frames a
  24 fps; taza cerrada comprobada como colisionador, emision de frames 49 a 180.
- Cafe: IOR 1.333, transmision y absorcion volumetrica; no confundir con agua clara.
- Bake iniciado con `scripts/bake_coffee.py`; cache en `production/fluid-cache`.
  El calculo medido tras iniciar el flujo tarda aproximadamente 10–15 s/frame;
  puede aumentar con el volumen. La operacion sigue en el proceso de Blender.
- Revision automatica en cola: `scripts/render_coffee_previews.py`, frames
  1/96/168/240. Al finalizar escribe `production/preview-status.json`.
- Reproductor `src/scene/sequenceStage.js` preparado con cache de 16 imagenes,
  carga concurrente limitada, cancelacion y descarte de resultados atrasados.
  Se activa solo con `?render=sequence` o CONFIG.renderer='sequence'; falta generar
  `assets/sequence/manifest.json` y las imagenes. La web normal conserva Three.js.
- 23 pruebas pasan, incluyendo scroll reversible y cargas fuera de orden.

## Continuacion

1. Comprobar cache y `production/preview-status.json`. No lanzar otro bake si el
   existente sigue activo, ni enviar mutaciones mientras este calculando.
2. Inspeccionar visualmente los cuatro previews nuevos; revisar llenado,
   penetraciones, salpicaduras y material del liquido. Corregir antes de render final.
3. Renderizar/optimizar la secuencia completa; medir peso y verificar todos los
   frames antes de crear manifest con status=ready.
4. Actualizar textos y posters, activar el renderer y validar en navegador.
