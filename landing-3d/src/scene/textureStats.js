/*
 * Valor medio de una textura ya cargada, reduciendola a pocos pixeles en un lienzo 2D.
 * Se usa una vez al cargar, para el color comun de la union suelo-pared.
 */
const SAMPLE_SIZE = 64;

const srgbToLinear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/* Devuelve [r, g, b] en 0..1 (sRGB tal cual esta en la imagen) o null si no se puede leer. */
function averagePixels(image) {
  if (!image || !image.width) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const sum = [0, 0, 0];
    for (let index = 0; index < data.length; index += 4) {
      sum[0] += data[index];
      sum[1] += data[index + 1];
      sum[2] += data[index + 2];
    }
    const count = (data.length / 4) * 255;
    return sum.map((value) => value / count);
  } catch (error) {
    console.warn('[vetamora] No se pudo promediar una textura', error);
    return null;
  }
}

export function averageColorLinear(texture, fallback) {
  const average = averagePixels(texture?.image);
  return average ? average.map(srgbToLinear) : fallback;
}

/* La rugosidad util esta en el canal G y es lineal. */
export function averageRoughness(texture, fallback) {
  const average = averagePixels(texture?.image);
  return average ? average[1] : fallback;
}
