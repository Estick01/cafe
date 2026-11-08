"""Mide la malla de la taza y reescribe la tabla generada de dimensions.py.

Uso (no renderiza nada, solo geometria):
  blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
      --python cup_profile_tool.py

Hay que volver a ejecutarlo si cambia assets/coffeecup.blend o ASSET_SCALE.
"""
import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import cup_asset  # noqa: E402
import cup_attributes  # noqa: E402

CLUSTER_TOLERANCE = 0.00035  # los anillos de la malla alternan radios a 0.27 mm
SIMPLIFY_TOLERANCE = 0.00003
INNER_CAP_MIN_Z = 0.003
POLE_RADIUS = 0.0001
DIMENSIONS_PATH = os.path.join(HERE, "dimensions.py")
BLOCK_START = "# --- INICIO TABLA GENERADA por cup_profile_tool.py ---"
BLOCK_END = "# --- FIN TABLA GENERADA ---"


def ring_path(mesh, start_key, end_key):
    """Recorre el perfil de revolucion: agrupa vertices en anillos y sigue sus aristas."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    centers, members = [], []
    owner = {}
    for vert in bm.verts:
        point = (math.hypot(vert.co.x, vert.co.y), vert.co.z)
        index = next((i for i, c in enumerate(centers) if math.dist(c, point) < CLUSTER_TOLERANCE), None)
        if index is None:
            centers.append(point)
            members.append([])
            index = len(centers) - 1
        members[index].append(point)
        owner[vert.index] = index
    neighbours = {i: set() for i in range(len(centers))}
    for edge in bm.edges:
        a, b = owner[edge.verts[0].index], owner[edge.verts[1].index]
        if a != b:
            neighbours[a].add(b)
            neighbours[b].add(a)
    bm.free()
    rings = [tuple(sum(p[axis] for p in group) / len(group) for axis in (0, 1)) for group in members]
    start = min(range(len(rings)), key=lambda i: start_key(rings[i]))
    end = min(range(len(rings)), key=lambda i: end_key(rings[i]))
    return [rings[i] for i in _shortest_path(neighbours, start, end)]


def _shortest_path(neighbours, start, end):
    previous = {start: None}
    queue = [start]
    for node in queue:
        for other in neighbours[node]:
            if other not in previous:
                previous[other] = node
                queue.append(other)
    if end not in previous:
        raise ValueError("El perfil de la malla no es continuo")
    path, node = [], end
    while node is not None:
        path.append(node)
        node = previous[node]
    return path[::-1]


def simplify(points, tolerance=SIMPLIFY_TOLERANCE):
    """Douglas-Peucker: quita puntos alineados conservando los extremos."""
    if len(points) < 3:
        return list(points)
    (ax, ay), (bx, by) = points[0], points[-1]
    length = math.hypot(bx - ax, by - ay) or 1.0
    distances = [abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / length for x, y in points[1:-1]]
    worst = max(range(len(distances)), key=distances.__getitem__)
    if distances[worst] <= tolerance:
        return [points[0], points[-1]]
    split = worst + 1
    return simplify(points[:split + 1], tolerance)[:-1] + simplify(points[split:], tolerance)


def body_tables(mesh):
    """Devuelve (exterior, interior, suelo_interior) como (radio, altura) ascendentes."""
    # Tapas centrales: la del fondo exterior queda muy abajo, la del suelo interior mas arriba.
    path = ring_path(mesh, lambda p: (p[1] > INNER_CAP_MIN_Z, p[0]), lambda p: (p[1] < INNER_CAP_MIN_Z, p[0]))
    tallest = max(p[1] for p in path)
    apex = [i for i, p in enumerate(path) if p[1] > tallest - 0.00005]
    foot = min(range(len(path)), key=lambda i: path[i][1])
    outer = path[foot:apex[0] + 1]
    floor_z = path[-1][1]
    floor_edge = max(p[0] for p in path[apex[-1]:] if p[1] < floor_z + 0.00005)
    wall = [p for p in path[apex[-1]:] if p[1] > floor_z + 0.00005][::-1]
    return simplify(outer), [(0.0, floor_z), (floor_edge, floor_z)] + simplify(wall), floor_z


def saucer_table(mesh):
    """Cara superior del platillo como (altura, radio), con radio ascendente."""
    # Los dos polos sobre el eje: abajo el del pie y arriba el del pocillo.
    path = ring_path(mesh, lambda p: (p[0] > POLE_RADIUS, p[1]), lambda p: (p[0] > POLE_RADIUS, -p[1]))
    widest = max(p[0] for p in path)
    rim = max(i for i, p in enumerate(path) if p[0] > widest - 0.00005)
    top_side = path[rim:][::-1]
    return [(z, r) for r, z in simplify(top_side)], widest


def _handle_joint_height(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    centers = [sum(v.co.z for v in loop) / len(loop) for loop in cup_asset.boundary_loops(bm)]
    bm.free()
    return min(centers)


HANDLE_PATH_POINTS = 17


def handle_path(mesh):
    """Linea central del asa: (x, z, radio del tubo) de la union inferior a la superior.

    Se toman los centros de los anillos del tubo (los mismos que dan _asa_avance) y se
    remuestrean a intervalos iguales de longitud de arco.
    """
    bm = bmesh.new()
    bm.from_mesh(mesh)
    rings = cup_asset._handle_rings(bm)
    centers = [cup_asset._center(ring) for ring in rings]
    radii = [sum(math.dist(v.co, c) for v in ring) / len(ring) for ring, c in zip(rings, centers)]
    bm.free()
    if max(abs(c[1]) for c in centers) > 0.002:
        raise ValueError("El asa deberia estar en el plano XZ")
    progress = cup_attributes.arc_progress(centers)
    samples = []
    for index in range(HANDLE_PATH_POINTS):
        target = index / (HANDLE_PATH_POINTS - 1)
        upper = next(i for i, p in enumerate(progress) if p >= target - 1e-12)
        lower = max(0, upper - 1)
        span = progress[upper] - progress[lower]
        ratio = 0.0 if span <= 0.0 else (target - progress[lower]) / span
        point = [centers[lower][a] + (centers[upper][a] - centers[lower][a]) * ratio for a in range(3)]
        radius = radii[lower] + (radii[upper] - radii[lower]) * ratio
        samples.append((point[0], point[2], radius))
    return samples


def _format_triples(name, points):
    lines = [f"{name} = ("]
    for start in range(0, len(points), 3):
        chunk = points[start:start + 3]
        lines.append("    " + " ".join(f"({a:.5f}, {b:.5f}, {c:.5f})," for a, b, c in chunk))
    lines.append(")")
    return lines


def _format_table(name, points):
    lines = [f"{name} = ("]
    for start in range(0, len(points), 4):
        chunk = points[start:start + 4]
        lines.append("    " + " ".join(f"({a:.5f}, {b:.5f})," for a, b in chunk))
    lines.append(")")
    return lines


def generated_block():
    meshes = cup_asset.placed_meshes()
    outer, inner, floor_z = body_tables(meshes["body"])
    saucer_top, saucer_radius = saucer_table(meshes["saucer"])
    saucer_floor = saucer_top[0][0]
    lines = [
        BLOCK_START,
        f"CUP_TOP = {max(p[1] for p in outer):.5f}",
        f"CUP_SEAT = {saucer_floor:.5f}  # el pie apoya en el suelo del pocillo",
        f"CUP_INNER_FLOOR = {floor_z:.5f}",
        f"SAUCER_RADIUS = {saucer_radius:.5f}",
        f"SAUCER_TOP_Z = {max(p[0] for p in saucer_top):.5f}",
        f"SAUCER_WELL_FLOOR = {saucer_floor:.5f}",
        f"HANDLE_REACH = {max(v.co.x for v in meshes['handle'].vertices):.5f}",
        f"HANDLE_BOTTOM_JOINT_Z = {_handle_joint_height(meshes['handle']):.5f}",
        *_format_table("CUP_OUTER", outer),
        *_format_table("CUP_INNER", inner),
        *_format_table("SAUCER_TOP", saucer_top),
        "# Linea central del asa en el marco de la taza (z = 0 en el pie): (x, z, radio del tubo).",
        *_format_triples("HANDLE_PATH", handle_path(meshes["handle"])),
        BLOCK_END,
    ]
    for mesh in meshes.values():
        bpy.data.meshes.remove(mesh)
    return "\n".join(lines)


def rewrite_dimensions(block):
    with open(DIMENSIONS_PATH, encoding="utf-8") as source:
        text = source.read()
    head, marker, rest = text.partition(BLOCK_START)
    _, end_marker, tail = rest.partition(BLOCK_END)
    if not marker or not end_marker:
        raise ValueError("dimensions.py no tiene los marcadores de la tabla generada")
    with open(DIMENSIONS_PATH, "w", encoding="utf-8", newline="\n") as target:
        target.write(head + block + tail)


if __name__ == "__main__":
    table = generated_block()
    rewrite_dimensions(table)
    print(table)
