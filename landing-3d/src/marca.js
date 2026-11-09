/*
 * Datos de marca y catalogo: lo UNICO que hay que editar para cambiar textos, lotes y precios.
 *
 * Fuentes: perfil publico de Instagram @co2coffeelab y fotos de la bolsa real que paso el cliente
 * (cafe-3d/img_productos, 9 de noviembre de 2026):
 *   - "Cafe de Especialidad, tostadores y Laboratorio de cafe", Pasto (Narino), cafes colombianos
 *     de origen, lotes exclusivos.
 *   - Bolsa real: stand-up de fondo cuadrado AZUL rey, con valvula atras. Etiqueta frontal
 *     vertical: bloque superior VERDE con "Tostado por:" y la taza de linea blanca "Coffee Lab";
 *     debajo, bloque de color del lote con el nombre en grande vertical (p. ej. PAPAYO en rojo,
 *     BOURBON AMARILLO en amarillo), la linea "Exotic Colombian coffee varieties!" y un dibujo
 *     botanico tenue. Al dorso, etiqueta crema con origen, beneficio, proceso, tueste y perfil.
 *
 * El cliente pidio productos GENERICOS en ese diseno: los lotes de abajo son de muestra
 * (`ejemplo: true`), la web los marca como "Muestra" y lo avisa en el pie. Precios sin confirmar.
 */
export const MARCA = Object.freeze({
  nombre: 'CO2 Coffee Lab',
  nombreCorto: 'CO2',
  lema: 'Laboratorio de café de especialidad',
  descripcion: 'Descubrimos y tostamos cafés colombianos de origen. Lotes exclusivos.',
  ciudad: 'Pasto, Nariño',
  pais: 'Colombia',
  instagram: 'https://www.instagram.com/co2coffeelab/',
  /* WhatsApp de pedidos en formato internacional, sin "+" ni espacios. */
  whatsapp: '573152292036',
  moneda: 'COP',
  /* Logo: taza de linea (usa currentColor; blanco sobre el bloque verde de la etiqueta). */
  logo: 'assets/marca/logo-taza.svg',
  /* Fotos reales de referencia de la bolsa (no se publican; solo guia de diseno). */
  referenciaBolsa: '../img_productos/',

  colores: Object.freeze({
    fondo: '#0a0a0a',
    crema: '#f4f1ec',
    acento: '#d6362c',
    caramelo: '#c9935f',
  }),

  /* Diseno comun de la bolsa real: se aplica a todos los lotes. */
  bolsa: Object.freeze({
    color: '#1f3fa0',        // azul rey del empaque
    franjaSuperior: '#1f7a5a', // verde del bloque "Tostado por:"
    textoFranja: 'Tostado por:',
    lema: 'Exotic Colombian coffee varieties!',
    presentacion: '250 g',
  }),

  /*
   * Lotes genericos en el diseno de la bolsa. `etiqueta` es el color del bloque del lote y
   * `textoEtiqueta` el del nombre vertical. `notas` son ilustrativas mientras `ejemplo` sea true.
   */
  lotes: Object.freeze([
    Object.freeze({
      id: 'papayo',
      nombre: 'Papayo',
      origen: 'Colombia',
      finca: null,
      variedad: 'Papayo',
      proceso: 'Natural',
      tueste: 'Medio',
      altitud: null,
      notas: Object.freeze(['Frutas tropicales', 'Panela', 'Cacao']),
      presentacion: '250 g',
      precio: null,
      etiqueta: '#e2412f',
      textoEtiqueta: '#ffffff',
      ejemplo: true,
    }),
    Object.freeze({
      id: 'bourbon-amarillo',
      nombre: 'Bourbon Amarillo',
      origen: 'Colombia',
      finca: null,
      variedad: 'Bourbon Amarillo',
      proceso: 'Natural',
      tueste: 'Medio',
      altitud: null,
      notas: Object.freeze(['Miel', 'Durazno', 'Caramelo']),
      presentacion: '250 g',
      precio: null,
      etiqueta: '#e7b928',
      textoEtiqueta: '#1f3fa0',
      ejemplo: true,
    }),
    Object.freeze({
      id: 'pacamara-rojo',
      nombre: 'Pacamara Rojo',
      origen: 'Colombia',
      finca: null,
      variedad: 'Pacamara',
      proceso: 'Lavado',
      tueste: 'Medio claro',
      altitud: null,
      notas: Object.freeze(['Frutos rojos', 'Chocolate', 'Floral']),
      presentacion: '250 g',
      precio: null,
      etiqueta: '#9e1b32',
      textoEtiqueta: '#ffffff',
      ejemplo: true,
    }),
    Object.freeze({
      id: 'geisha',
      nombre: 'Geisha',
      origen: 'Colombia',
      finca: null,
      variedad: 'Geisha',
      proceso: 'Lavado',
      tueste: 'Claro',
      altitud: null,
      notas: Object.freeze(['Jazmín', 'Bergamota', 'Té negro']),
      presentacion: '250 g',
      precio: null,
      etiqueta: '#7d4fb3',
      textoEtiqueta: '#ffffff',
      ejemplo: true,
    }),
  ]),
});

/* Hay contenido provisional mientras algun lote siga siendo de muestra. */
export const HAY_CONTENIDO_DE_EJEMPLO = MARCA.lotes.some((lote) => lote.ejemplo);

/* Texto corto para etiquetas: notas si las hay; si no, variedad y proceso. */
export function resumenLote(lote) {
  return lote.notas.length ? lote.notas.join(' · ') : `${lote.variedad} · ${lote.proceso}`;
}

/* Enlace de pedido: WhatsApp si hay numero; si no, el Instagram de la marca. */
export function enlacePedido(lote) {
  if (MARCA.whatsapp) {
    const texto = `Hola, quiero pedir el café ${lote.nombre} (${lote.presentacion}).`;
    return `https://wa.me/${MARCA.whatsapp}?text=${encodeURIComponent(texto)}`;
  }
  return MARCA.instagram;
}
