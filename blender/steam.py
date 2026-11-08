"""Vapor del cafe: hilos ondulados que suben mirando a la camara. Sin Blender.

Cada hilo es una lamina fina con una densidad por vertice, que el material usa como
opacidad. Las ondas se desplazan hacia arriba con el tiempo, asi el vapor parece subir.
"""
import math

ROWS = 56
COLUMNS = 12

# (desplazamiento lateral, altura, fase, velocidad, opacidad relativa)
STRANDS = (
    (-0.024, 0.108, 0.3, 0.085, 0.65),
    (-0.008, 0.132, 2.1, 0.110, 1.00),
    (0.007, 0.120, 4.0, 0.095, 0.90),
    (0.022, 0.102, 5.4, 0.080, 0.70),
    (-0.015, 0.085, 1.2, 0.120, 0.55),
    (0.014, 0.092, 3.1, 0.105, 0.60),
)


def _smooth(start, end, value):
    ratio = min(1.0, max(0.0, (value - start) / (end - start)))
    return ratio * ratio * (3.0 - 2.0 * ratio)


def _camera_axes(pose):
    """Ejes horizontales: `right` cruza la vista y `depth` apunta hacia la camara."""
    x, y = (pose.camera_position[0] - pose.camera_target[0], pose.camera_position[1] - pose.camera_target[1])
    length = math.hypot(x, y) or 1.0
    depth = (x / length, y / length)
    return (depth[1], -depth[0]), depth


def _center_offset(height_ratio, phase, speed, time):
    """Ondulacion lateral: crece al subir y viaja hacia arriba."""
    amplitude = 0.0010 + 0.0085 * height_ratio
    slow = math.sin(2.0 * math.pi * (0.85 * height_ratio - speed * time) + phase)
    gentle = 0.25 * math.sin(2.0 * math.pi * (1.7 * height_ratio - speed * 1.3 * time) + phase * 1.7)
    return amplitude * (slow + gentle)


def _strand(pose, strand, index, axes, base):
    """Genera (vertices, densidades) de un hilo; el grosor crece y se disipa al subir."""
    offset, height, phase, speed, strength = strand
    right, depth = axes
    breathing = 0.82 + 0.18 * math.sin(pose.time * speed * 5.0 + phase)
    vertices, densities = [], []
    for row in range(ROWS):
        ratio = row / (ROWS - 1)
        center = offset + _center_offset(ratio, phase, speed, pose.time)
        half_width = 0.0085 + 0.0300 * ratio  # ancho desde abajo: nube suave, no un chorro
        fade = _smooth(0.0, 0.30, ratio) * (1.0 - _smooth(0.32, 1.0, ratio))
        for column in range(COLUMNS):
            across = column / (COLUMNS - 1) * 2.0 - 1.0
            side = center + across * half_width
            front = (index - len(STRANDS) / 2.0) * 0.0035
            vertices.append((
                right[0] * side + depth[0] * front,
                right[1] * side + depth[1] * front,
                base + ratio * height,
            ))
            profile = max(0.0, math.exp(-2.4 * across * across) - math.exp(-2.4))
            densities.append(min(1.0, profile * fade * strength * breathing * pose.steam_amount))
    return vertices, densities


def steam_mesh(pose):
    """Devuelve (vertices, caras, densidades) de todo el vapor; vacio si aun no hay."""
    if pose.steam_amount <= 0.001:
        return [], [], []
    axes = _camera_axes(pose)
    vertices, faces, densities = [], [], []
    for index, strand in enumerate(STRANDS):
        start = len(vertices)
        strand_vertices, strand_densities = _strand(pose, strand, index, axes, pose.coffee_level)
        vertices.extend(strand_vertices)
        densities.extend(strand_densities)
        for row in range(ROWS - 1):
            for column in range(COLUMNS - 1):
                corner = start + row * COLUMNS + column
                faces.append((corner, corner + 1, corner + COLUMNS + 1, corner + COLUMNS))
    return vertices, faces, densities
