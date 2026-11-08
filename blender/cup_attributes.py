"""Atributos por vertice de la taza del usuario: franja tostada y avance del asa. Sin Blender.

Valores en metros, en el espacio local de cada pieza (taza y asa con z = 0 en el pie).
"""
import math

from dimensions import CUP_TOP, SAUCER_RADIUS

# Distancias (plena, nula) de cada franja. Coinciden con los anillos de la malla para
# que la transicion quede en un solo anillo de caras y la franja se vea estrecha.
CUP_RIM_BAND = (0.0011, 0.00165)
CUP_FOOT_BAND = (0.0028, 0.0049)
SAUCER_RIM_BAND = (0.0011, 0.0024)
SAUCER_LIP_RADIUS = 0.0394  # labio del pocillo donde se asienta la taza
SAUCER_LIP_BAND = (0.0006, 0.0021)
SAUCER_LIP_MIN_Z = 0.0044  # por debajo esta la cara inferior, al mismo radio


def band(distance, full, zero):
    """1 hasta `full`, 0 desde `zero` y transicion suave entre ambos."""
    if distance <= full:
        return 1.0
    if distance >= zero:
        return 0.0
    ratio = (zero - distance) / (zero - full)
    return ratio * ratio * (3.0 - 2.0 * ratio)


def cup_edge(local_z):
    """Franja de la taza: borde superior y pie, tanto por fuera como por dentro."""
    return max(band(CUP_TOP - local_z, *CUP_RIM_BAND), band(local_z, *CUP_FOOT_BAND))


def saucer_edge(radius, height):
    """Franja del platillo: borde exterior y labio del pocillo."""
    rim = band(SAUCER_RADIUS - radius, *SAUCER_RIM_BAND)
    lip = 0.0
    if height >= SAUCER_LIP_MIN_Z:
        lip = band(abs(radius - SAUCER_LIP_RADIUS), *SAUCER_LIP_BAND)
    return max(rim, lip)


def arc_progress(centers):
    """Avance 0..1 a lo largo de un recorrido de puntos, proporcional a su longitud."""
    lengths = [math.dist(a, b) for a, b in zip(centers, centers[1:])]
    total = sum(lengths)
    if total <= 0.0:
        raise ValueError("El recorrido del asa no tiene longitud")
    progress, travelled = [0.0], 0.0
    for length in lengths:
        travelled += length
        progress.append(travelled / total)
    return tuple(progress)
