"""Geometria del cafe generada por pose: chorro, cinta en espiral y superficies. Sin Blender.

Todas las funciones devuelven datos nuevos: (vertices, caras) listos para from_pydata.
"""
import math

from dimensions import CUP_TOP, HANDLE_PATH, POOL_SURFACE, cup_inner_radius, cup_outer_radius
from timeline import POUR_TOP, smooth

STREAM_RADIUS = 0.0031
STREAM_BACK_Y = 0.023  # el chorro pasa por detras del grano (dorso a 1.65 cm del origen)
HELIX_PITCH = 0.0075
# Fuera de la taza la cinta cuelga un poco por su peso y se acumula al final, donde se recoge.
HELIX_SAG = 0.0012
HELIX_POOL = 0.35
HELIX_POINTS = 150
RING_SIDES = 14
DISC_RINGS = 36
DISC_SIDES = 72

# Cafe que recorre el asa por fuera: lamina pegada a la cara exterior del tubo del asa.
STREAK_POINTS = 20
STREAK_END = 0.58  # fraccion del asa (0 union inferior, 1 superior) desde la que salta el chorro
STREAK_CLEARANCE = 0.0005
STREAK_WIDTH = 0.0030  # semiancho, a lo largo de y
STREAK_THICK = 0.0016  # semigrosor, hacia fuera del asa
# Chorro que salta del asa a la taza: curva de Bezier que se convierte en el chorro de arriba.
JET_POINTS = 64
JET_BLEND_POINTS = 8  # puntos en los que la lamina del asa se vuelve redonda
JET_APEX = 0.09  # altura de la cima de la parabola sobre el borde
# Adelgazamiento por gravedad: con caudal constante, radio ~ (v0 / v) ^ 1/2 y v^2 = v0^2 + 2 g h.
GRAVITY = 9.81
FALL_V0 = 0.8  # velocidad (m/s) del chorro en POUR_TOP, fuera de cuadro
FALL_REFERENCE_Z = 0.2  # a esta altura el chorro tiene STREAM_RADIUS
JET_THINNING = 0.125  # exponente suavizado del arco: el salto es corto y no debe quedar en hilo
Y_AXIS = (0.0, 1.0, 0.0)  # eje de referencia del anillo: el chorro nunca va paralelo a y


def _wobble(z, time):
    return 0.0011 * math.sin(14.0 * z + 7.0 * time) * min(1.0, abs(z) * 18.0)


def fall_scale(z):
    """Factor del radio de un chorro en caida libre desde POUR_TOP: 1 en FALL_REFERENCE_Z."""
    reference = FALL_V0 * FALL_V0 + 2.0 * GRAVITY * (POUR_TOP - FALL_REFERENCE_Z)
    speed = FALL_V0 * FALL_V0 + 2.0 * GRAVITY * max(0.0, POUR_TOP - z)
    return (reference / speed) ** 0.25


def _straight(top_z, bottom_z, start_y, end_y, time):
    """Tramo vertical del chorro entre dos alturas; se adelgaza al acelerar."""
    if top_z <= bottom_z:
        return []
    count = max(2, int((top_z - bottom_z) / 0.004))
    points = []
    for index in range(count + 1):
        ratio = index / count
        z = top_z + (bottom_z - top_z) * ratio
        y = start_y + (end_y - start_y) * ratio ** 3
        radius = STREAM_RADIUS * fall_scale(z)
        points.append(((_wobble(z, time), y, z), radius, radius))
    return points


def _helix(pose, start_point):
    """Cinta alrededor de la taza; las primeras vueltas se unen al chorro central.

    El angulo se mide desde el extremo final de la cinta, que frena hasta quedar en el asa.
    """
    points = []
    for index in range(HELIX_POINTS):
        ratio = index / (HELIX_POINTS - 1)
        angle = pose.ribbon_angle - (1.0 - ratio) * 2.0 * math.pi * pose.helix_turns
        hanging = pose.ribbon_outside
        z = pose.ribbon_z - ratio * HELIX_PITCH - HELIX_SAG * math.sin(math.pi * ratio) * hanging
        local_z = z - pose.cup_z
        outer = cup_outer_radius(local_z)
        # Primero tapa el borde de crecimiento (pared de 3.8 mm); despues se pega por fuera.
        center = outer + (-0.0016 + (0.0020 + 0.0016) * pose.ribbon_outside)
        half_radial = 0.0042 + (0.0017 - 0.0042) * pose.ribbon_outside
        half_height = 0.0048 + (0.0034 - 0.0048) * pose.ribbon_outside
        half_height *= 1.0 + HELIX_POOL * ratio ** 3 * hanging
        join = min(1.0, ratio / 0.26)
        radius = center * pose.helix_blend
        position = (radius * math.cos(angle), radius * math.sin(angle), z)
        blended = tuple(s + (p - s) * join for s, p in zip(start_point, position))
        stream = STREAM_RADIUS * fall_scale(start_point[2])
        radial = stream + (half_radial - stream) * join
        vertical = stream + (half_height - stream) * join
        points.append((blended, radial, vertical))
    return points


def _handle_sample(fraction):
    """Punto (x, z, radio) de la linea central del asa; la tabla esta a pasos de arco iguales."""
    last = len(HANDLE_PATH) - 1
    position = min(1.0, max(0.0, fraction)) * last
    index = min(last - 1, int(position))
    ratio = position - index
    a, b = HANDLE_PATH[index], HANDLE_PATH[index + 1]
    return tuple(a[k] + (b[k] - a[k]) * ratio for k in range(3))


def handle_surface(fraction, gap):
    """Punto a `gap` metros por fuera de la superficie del asa, en el marco de la taza (x, z).

    El asa se recorre en sentido antihorario en el plano XZ, asi que la normal exterior es
    (tz, -tx). Devuelve tambien la direccion tangente.
    """
    x, z, radius = _handle_sample(fraction)
    ax, az, _ = _handle_sample(fraction - 0.02)
    bx, bz, _ = _handle_sample(fraction + 0.02)
    length = math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
    tx, tz = (bx - ax) / length, (bz - az) / length
    offset = radius + gap
    return x + tz * offset, z - tx * offset, tx, tz


def _streak(pose):
    """Lamina de cafe que sube pegada a la cara exterior del asa."""
    if pose.streak <= 0.0:
        return []
    end = STREAK_END * pose.streak
    points = []
    for index in range(STREAK_POINTS + 1):
        x, z, _, _ = handle_surface(end * index / STREAK_POINTS, STREAK_CLEARANCE + STREAK_THICK)
        points.append(((x, 0.0, pose.cup_z + z), STREAK_WIDTH, STREAK_THICK, Y_AXIS))
    return points


def jet_landing(pose):
    """Punto (ejes de Blender) donde el chorro entra en el cafe."""
    return (pose.pour_x, pose.pour_y, pose.coffee_level)


def _jet_root(pose):
    x, z, _, _ = handle_surface(STREAK_END, STREAK_CLEARANCE + STREAK_THICK)
    return (x, 0.0, pose.cup_z + z)


def _jet_point(pose, root, tip, u):
    """Punto u del salto: parabola balistica desde el asa mezclada con el chorro vertical.

    En la parabola la velocidad horizontal es constante, asi que v^2 / c^2 = 1 + (dz/dx)^2 y el
    radio sigue (c / v) ^ (2 * JET_THINNING). Devuelve (posicion, radio).
    """
    (rx, ry, rz), (tx, ty, tz) = root, tip
    apex = pose.cup_z + CUP_TOP + JET_APEX
    bulge = apex - 0.5 * (rz + tz)
    arc_z = (1.0 - u) * rz + u * tz + 4.0 * bulge * u * (1.0 - u)
    arc = (rx + (tx - rx) * u, ry + (ty - ry) * u, arc_z)
    span = math.sqrt((tx - rx) ** 2 + (ty - ry) ** 2)
    slope = ((tz - rz) + 4.0 * bulge * (1.0 - 2.0 * u)) / span
    arc_radius = STREAM_RADIUS * (1.0 + slope * slope) ** (-JET_THINNING)
    vertical_z = POUR_TOP + (tz - POUR_TOP) * u
    vertical_radius = STREAM_RADIUS * fall_scale(vertical_z)
    m = pose.jet_morph
    position = (arc[0] + (tx - arc[0]) * m, arc[1] + (ty - arc[1]) * m, arc[2] + (vertical_z - arc[2]) * m)
    return position, arc_radius + (vertical_radius - arc_radius) * m


def _jet(pose):
    """Salto desde lo alto del asa hasta la taza; crece desde su origen hasta tocar el cafe."""
    if pose.jet_head <= 0.0:
        return []
    root = _jet_root(pose)
    tip = jet_landing(pose)
    points = []
    for index in range(JET_POINTS + 1):
        position, radius = _jet_point(pose, root, tip, pose.jet_head * index / JET_POINTS)
        # Junto al asa conserva la forma plana de la lamina; despues es redondo.
        round_ = min(1.0, index / JET_BLEND_POINTS + pose.jet_morph)
        radial = STREAK_WIDTH + (radius - STREAK_WIDTH) * round_
        vertical = STREAK_THICK + (radius - STREAK_THICK) * round_
        points.append((position, radial, vertical, Y_AXIS))
    return points


def _cut(points, fraction):
    """Quita la parte del recorrido que la cola ya ha dejado atras, con el corte interpolado."""
    if fraction <= 0.0 or len(points) < 2:
        return points
    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.sqrt(sum((p - q) ** 2 for p, q in zip(a[0], b[0]))))
    target = fraction * lengths[-1]
    if target >= lengths[-1]:
        return []
    index = next(i for i, length in enumerate(lengths) if length > target)
    span = lengths[index] - lengths[index - 1]
    ratio = (target - lengths[index - 1]) / span if span > 0.0 else 0.0
    a, b = points[index - 1], points[index]
    first = (
        tuple(p + (q - p) * ratio for p, q in zip(a[0], b[0])),
        a[1] + (b[1] - a[1]) * ratio,
        a[2] + (b[2] - a[2]) * ratio,
    ) + tuple(b[3:])
    rest = [first] + points[index:]
    return rest if len(rest) >= 2 else []


def _taper_ends(points, length=10):
    """Afina los extremos del tubo para cerrarlo sin tapas visibles."""
    total = len(points)
    tapered = []
    for index, point in enumerate(points):
        edge = min(index, total - 1 - index)
        factor = math.sqrt(max(0.0, min(1.0, (edge + 0.15) / length)))
        tapered.append((point[0], point[1] * factor, point[2] * factor) + tuple(point[3:]))
    return tapered


def pour_path(pose):
    """Puntos del chorro: lista de (posicion, semieje_radial, semieje_vertical[, eje_referencia]).

    Cae desde arriba y se enrosca en el borde mientras crece la taza. Despues la cinta baja por
    fuera, recorre el asa y salta dentro de la taza; el origen de ese salto sube hasta
    convertirse en el chorro vertical que la llena.
    """
    if not pose.pouring:
        return []
    if pose.helix_blend <= 0.0:
        points = _straight(POUR_TOP, pose.pour_head_z, STREAM_BACK_Y, 0.0, pose.time)
    else:
        start_z = pose.ribbon_z + 0.012
        start_point = (0.0, STREAM_BACK_Y, start_z)
        feed = _straight(POUR_TOP, start_z, STREAM_BACK_Y, STREAM_BACK_Y, pose.time) + _helix(pose, start_point)
        points = _cut(feed + _streak(pose), pose.feed_cut) + _jet(pose)
    return _taper_ends(_cut(points, pose.pour_cut))


def _normalize(vector):
    length = math.sqrt(sum(c * c for c in vector))
    return vector if length < 1e-9 else tuple(c / length for c in vector)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _ring(point, tangent, sides):
    """Seccion eliptica: un eje apunta hacia fuera del eje Z y el otro sigue la tangente cruzada."""
    (x, y, _z), radial_half, vertical_half = point[:3]
    # Una seccion redonda no necesita orientarse: un eje fijo evita que el anillo se voltee
    # cuando la ondulacion cruza el centro y el tubo se estrangule. Los tramos que no van en
    # vertical (asa y salto) traen su propio eje de referencia.
    is_round = abs(radial_half - vertical_half) < 1e-7
    if len(point) > 3:
        outward = point[3]
    elif is_round or x * x + y * y <= 1e-8:
        outward = (1.0, 0.0, 0.0)
    else:
        outward = _normalize((x, y, 0.0))
    binormal = _normalize(_cross(tangent, outward))
    normal = _normalize(_cross(binormal, tangent))
    ring = []
    for side in range(sides):
        angle = 2.0 * math.pi * side / sides
        a, b = radial_half * math.cos(angle), vertical_half * math.sin(angle)
        ring.append(tuple(p + normal[i] * a + binormal[i] * b for i, p in enumerate(point[0])))
    return ring


def tube_mesh(points, sides=RING_SIDES):
    """Convierte un recorrido en una malla de tubo. Devuelve (vertices, caras)."""
    if len(points) < 2:
        return [], []
    vertices = []
    total = len(points)
    for index, point in enumerate(points):
        before = points[max(index - 1, 0)][0]
        after = points[min(index + 1, total - 1)][0]
        tangent = _normalize(tuple(a - b for a, b in zip(after, before)))
        vertices.extend(_ring(point, tangent, sides))
    faces = []
    for ring in range(total - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            faces.append((
                ring * sides + side,
                ring * sides + next_side,
                (ring + 1) * sides + next_side,
                (ring + 1) * sides + side,
            ))
    return vertices, faces


def disc_mesh(height, radius, ripple, time, rings=DISC_RINGS, sides=DISC_SIDES):
    """Disco con ondas concentricas. Devuelve (vertices, caras)."""
    vertices = [(0.0, 0.0, height + ripple)]
    for ring in range(1, rings + 1):
        distance = radius * ring / rings
        wave = ripple * math.cos(distance * 620.0 - time * 16.0) * math.exp(-distance * 42.0)
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            vertices.append((distance * math.cos(angle), distance * math.sin(angle), height + wave))
    faces = [(0, 1 + side, 1 + (side + 1) % sides) for side in range(sides)]
    for ring in range(rings - 1):
        start = 1 + ring * sides
        for side in range(sides):
            next_side = (side + 1) % sides
            faces.append((
                start + side,
                start + sides + side,
                start + sides + next_side,
                start + next_side,
            ))
    return vertices, faces


def pool_mesh(pose):
    """Charco sobre el platillo mientras cae el primer chorro."""
    if pose.pool_radius <= 0.0005 or pose.time > 3.2:
        return [], []
    return disc_mesh(pose.saucer_z + POOL_SURFACE, pose.pool_radius, 0.00022, pose.time)


def coffee_mesh(pose):
    """Superficie del cafe dentro de la taza; el borde se apoya en la pared interior."""
    if not pose.coffee_visible:
        return [], []
    radius = cup_inner_radius(pose.coffee_level - pose.cup_z) + 0.0004
    ripple = 0.0009 if pose.pouring else 0.00012
    return disc_mesh(pose.coffee_level, radius, ripple, pose.time)
