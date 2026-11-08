/* Unico punto de conversion de ejes: Blender (x, y, z) -> Three (x, z, -y). Sin dependencias. */

export const toThree = ([x, y, z]) => [x, z, -y];

/* Version sin asignaciones para los buffers que se reescriben en cada fotograma. */
export function writeThree(buffer, offset, x, y, z) {
  buffer[offset] = x;
  buffer[offset + 1] = z;
  buffer[offset + 2] = -y;
}

function multiply([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/*
 * El modo 'XYZ' de Blender aplica X, luego Y, luego Z: q = qz * qy * qx.
 * Un cambio de ejes propio solo reordena la parte vectorial del cuaternion.
 * Devuelve [x, y, z, w] en ejes de Three.
 */
export function blenderEulerToThreeQuaternion([rx, ry, rz]) {
  const qx = [Math.sin(rx / 2), 0, 0, Math.cos(rx / 2)];
  const qy = [0, Math.sin(ry / 2), 0, Math.cos(ry / 2)];
  const qz = [0, 0, Math.sin(rz / 2), Math.cos(rz / 2)];
  const [x, y, z, w] = multiply(multiply(qz, qy), qx);
  return [...toThree([x, y, z]), w];
}
