# Continuidad de la landing 3D — 9 de noviembre de 2026

## Estado actual

Integración local completada sobre los archivos que dejó Claude. La landing de CO2 Coffee Lab arranca con la vitrina de cuatro lotes, historia de la taza, inmersión y tienda. No se ha publicado esta actualización ni creado un commit.

Vista local: http://localhost:5192/ (el servidor que ya estaba activo se ha reutilizado).
Para levantarlo si está apagado: `npm.cmd start`.

## Cambios de integración

- `src/app.js` conecta el mapa de historia, Lenis, director y eventos de interfaz. La entrada automática entrega el control al scroll en G=2.4 sin volver al principio. El final queda quieto y se puede recorrer hacia atrás.
- `src/scene/vitrina/index.js` reúne las bolsas azules, etiquetas, tazas, luces y anillo; selección sincronizada con las fichas y WhatsApp.
- Completadas las hojas de estilos de vitrina, historia, tienda y laboratorio. Sustituida la hoja de escena anterior para el escenario compartido.
- Ajustados encuadres de escritorio/móvil y permanencia de los textos por sección. La ficha de tienda se desplaza internamente en pantallas pequeñas para que el pedido sea accesible.
- Reparados radio de platillo ausente, mapas de transparencia (canal verde), selección de calidad baja de inmersión y profundidad del posprocesado. El render target de profundidad usa samples=0: con MSAA se ocultaban las bolsas en Edge.
- El tiempo de movimiento y grano del posprocesado depende del scroll. Resolución adaptativa conservada; sin render continuo cuando la imagen está quieta.
- Movimiento reducido evita cargar la escena; catálogo y pedidos siguen disponibles. Fallos de descarga muestran reintento/salida estática.

## Verificación

- `npm.cmd test`: 101 pruebas aprobadas. Incluye dos nuevas comprobaciones de dependencias y estilos ausentes.
- `python scripts/check-browser.py`: Playwright con Edge instalado. Comprueba arranque de los tres módulos, autoplay sin reinicio, recorrido completo y reversible, selección de Geisha, URL de WhatsApp, buscador, anchos 390/768/1440, botón de pedido dentro de pantalla, movimiento reducido y salida estática tras fallo de carga.
- Capturas y reporte local en `debug/` (PNG y verification.json ignorados por Git).
- El sandbox bloquea el controlador de Playwright: la ejecución de esta revisión requirió permiso para ejecutarse fuera del sandbox.

## Decisiones del usuario recuperadas

Origen: conversación local de Claude `479e44b7-3229-4a7a-bf10-5345ed24fc35`, proyecto `C--Users-ccsb1-OneDrive-Escritorio-Hospital`. Claude se detuvo por límite de uso el 9 de noviembre a las 09:43 aproximadamente.

- Promover CO2 Coffee Lab, de Pasto, con referencia `Escritorio/cafe.mp4`.
- Productos genéricos basados en `../img_productos`: bolsa azul rey, bloque verde, etiqueta vertical de color.
- WhatsApp actualizado por el usuario a +57 3152292036; logo provisional de taza.
- Cuatro lotes de muestra: Papayo, Bourbon Amarillo, Pacamara Rojo y Geisha. Notas ilustrativas y precio por consultar.
- Mantener GitHub Pages como alojamiento y revisar visualmente antes de publicar.
- `RENDER_PLAN.md` es una dirección anterior con Mantaflow. El rumbo posterior elegido fue Three.js en tiempo real y movimiento determinista, sin simulación de fluidos.

## Próximo paso

### Versionado y zoom

- `npm.cmd run build` prepara `.pages/`. En GitHub Actions, `scripts/build-pages.mjs` usa `GITHUB_SHA` y genera rutas `releases/<commit>/` para CSS, módulos JS (incluidos imports dinámicos), modelos, posters y logo. El HTML raíz apunta a esa versión; enlaces internos y WhatsApp se conservan. `version.json` permite identificar el despliegue. No se borran los datos del navegador ni se fuerza una recarga de una pestaña abierta.
- El workflow incluye ahora `assets/marca`, ausente del paquete anterior. El versionado entra en vigor cuando se publique el workflow actualizado; el servidor de desarrollo sigue usando rutas normales.
- Zoom de bolsa mediante rueda, pellizco, teclas +/− y botones de tienda; Centrar restaura tamaño y giro. Disponible también mediante gestos y teclado en el visor de exploración.
- En móvil y tablet la bolsa ocupa una zona propia entre selector y ficha. La cámara sigue esa zona al desplazar la ficha y deja espacio para los controles. Los granos siguen cayendo.
- 106 pruebas unitarias aprobadas. El recorrido `--shop` verifica el paquete versionado, giro, zoom, selección única y acceso al pedido en 1440, 768, 390 y 360 px.

Actualización de tienda: se muestra una sola bolsa y se puede girar directamente con ratón, tacto o teclado. El cambio de lote completa una vuelta y sustituye el producto a mitad del giro. Los granos caen en bucle con un reloj independiente del scroll mientras la tienda está visible, incluido el final del recorrido. Esta sección es la excepción al render bajo demanda descrito arriba.

Verificación actual: 104 pruebas aprobadas con `npm.cmd test`. `python scripts/check-browser.py --shop` verifica una sola bolsa, giro de transición, arrastre, granos continuos y exploración en escritorio (1440px) y móvil (390px).

Revisión visual del usuario y ajustes que solicite. Los datos comerciales y el logo siguen siendo provisionales según sus instrucciones. Publicación pendiente.


## Exploraci?n de producto y acabado visual

- Clic/tap real sobre las bolsas mediante raycasting, o bot?n ?Tomar y explorar la bolsa? en la ficha.
- La bolsa se aproxima desde su posici?n proyectada hacia primer plano. Ya no aparece un cuadro modal: una secci?n de exploraci?n ocupa el escenario con el fondo de la vitrina, bolsa libre y ficha flotante al lado.
- Arrastre con rat?n/tacto y flechas del teclado para girar; botones frente/reverso, apertura/cierre del sello y granos modelados dentro. La ficha textual y WhatsApp permanecen disponibles.
- Tarjetas de compra y controles con vidrio transl?cido, desenfoque, saturaci?n y reflejos de borde. Respeta movimiento reducido y transparencia reducida.
- Al salir, vuelve a la posici?n original de scroll y libera el visor. El lienzo se renueva para permitir abrir otros lotes sin reutilizar un contexto perdido.
- Brillo: exposici?n 0.88; bloom 0.09 con umbral 1.15; menos clearcoat/reflejo en cer?mica y menos grano de imagen.
- Bordes: pase de antialias de pantalla despu?s del tone mapping; visor con MSAA nativo y DPR entre 1.5 y 2. Se conserva la profundidad sin MSAA para evitar las oclusiones anteriores.
- `python scripts/check-browser.py --product` comprueba raycast real, giro, reverso, apertura/cierre, Escape, conservaci?n del scroll y cambio de lote en 1440px y 390px. Capturas `debug/product-*.png`, luz `debug/lighting-soft.png` y reporte `debug/product-verification.json`.
