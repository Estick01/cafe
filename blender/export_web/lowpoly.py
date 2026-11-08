"""Mallas ligeras con UV para la web. Reutiliza las funciones de forma de bean_model.py."""
import math

import bmesh
import bpy

from bean_model import CHAFF_LAYERS, _chaff_vertex, _groove_floor, bean_vertex
from build_scene import lathe_object
from ceramic import HANDLE_ATTRIBUTE
from cup_asset import _check_tables, _finish_meshes, placed_meshes
from dimensions import BEAN_HALF, PEDESTAL_PROFILE, PEDESTAL_RADIUS, PEDESTAL_TOP

BEAN_U = 128  # 2 * 128 * 94 + 2 * 128 = 24 320 triangulos
BEAN_V = 96
CHAFF_ROWS = 130  # 3 * 129 * 15 * 2 = 11 610 triangulos
CHAFF_COLUMNS = 16
CHAFF_GUTTER = 0.015  # separacion entre laminas en el atlas
PEDESTAL_SEGMENTS = 96
PEDESTAL_SUBSURF = 1  # el original usa 2 pero pasaria de 6000 triangulos
HANDLE_EXPORT_ATTRIBUTE = "_ASA_AVANCE"
# Azulejo de la textura de marmol, en metros. Se repite en espejo fuera del encuadre.
FLOOR_TILE = {"size": 1.0, "x0": -0.5, "y0": -0.66}
WALL_TILE = {"size": 1.0, "x0": -0.5, "z0": 0.0}
SET_PLANE_SIZE = 3.0
WALL_Y = 0.34


def _mesh_with_uv(name, vertices, faces, face_uvs):
    """Crea una malla con UV por esquina. `face_uvs` va en paralelo a `faces`."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    layer = mesh.uv_layers.new(name="UVMap")
    flat = [value for uvs in face_uvs for uv in uvs for value in uv]
    layer.data.foreach_set("uv", flat)
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    return mesh


def _unit_sphere_point(u_ratio, polar):
    """La costura (u = 0 y 1) cae en +Y, el dorso; u = 0.5 mira a la camara (-Y) sin espejar."""
    angle = 2.0 * math.pi * u_ratio
    return (-math.sin(polar) * math.sin(angle), math.sin(polar) * math.cos(angle), math.cos(polar))


def _bean_position(point):
    (x, y, z), _, _ = bean_vertex(*point)
    return (x * BEAN_HALF[0], y * BEAN_HALF[1], z * BEAN_HALF[2])


def build_bean_low(collection):
    vertices = [_bean_position((0.0, 0.0, 1.0))]
    for ring in range(1, BEAN_V):
        polar = math.pi * ring / BEAN_V
        vertices.extend(_bean_position(_unit_sphere_point(col / BEAN_U, polar)) for col in range(BEAN_U))
    south = len(vertices)
    vertices.append(_bean_position((0.0, 0.0, -1.0)))

    def vertex(ring, col):
        return 1 + (ring - 1) * BEAN_U + col % BEAN_U

    faces, face_uvs = [], []
    top_v, bottom_v = 1.0 - 1.0 / BEAN_V, 1.0 / BEAN_V
    for col in range(BEAN_U):
        left, right = col / BEAN_U, (col + 1) / BEAN_U
        faces.append((0, vertex(1, col), vertex(1, col + 1)))
        face_uvs.append((((left + right) / 2.0, 1.0), (left, top_v), (right, top_v)))
        faces.append((south, vertex(BEAN_V - 1, col + 1), vertex(BEAN_V - 1, col)))
        face_uvs.append((((left + right) / 2.0, 0.0), (right, bottom_v), (left, bottom_v)))
        for ring in range(1, BEAN_V - 1):
            upper_v, lower_v = 1.0 - ring / BEAN_V, 1.0 - (ring + 1) / BEAN_V
            faces.append((vertex(ring, col), vertex(ring + 1, col), vertex(ring + 1, col + 1), vertex(ring, col + 1)))
            face_uvs.append(((left, upper_v), (left, lower_v), (right, lower_v), (right, upper_v)))
    mesh = _mesh_with_uv("GEO-grano", vertices, faces, face_uvs)
    obj = bpy.data.objects.new("GEO-grano", mesh)
    collection.objects.link(obj)
    return obj


def _chaff_uv(layer, row, col):
    slot = 1.0 / len(CHAFF_LAYERS)
    across = col / (CHAFF_COLUMNS - 1)
    return (slot * layer + CHAFF_GUTTER + across * (slot - 2.0 * CHAFF_GUTTER),
            CHAFF_GUTTER + row / (CHAFF_ROWS - 1) * (1.0 - 2.0 * CHAFF_GUTTER))


def build_chaff_low(collection):
    """Tres laminas, cada una en su franja vertical del atlas."""
    vertices, faces, face_uvs = [], [], []
    for layer, (seed, half_width, lift) in enumerate(CHAFF_LAYERS):
        start = len(vertices)
        for row in range(CHAFF_ROWS):
            ratio = row / (CHAFF_ROWS - 1)
            floor = _groove_floor(-0.84 + 1.66 * ratio)
            for col in range(CHAFF_COLUMNS):
                across = col / (CHAFF_COLUMNS - 1) * 2.0 - 1.0
                x, y, z = _chaff_vertex(seed, half_width, lift, ratio, across, floor)
                vertices.append((x * BEAN_HALF[0], y * BEAN_HALF[1], z * BEAN_HALF[2]))
        for row in range(CHAFF_ROWS - 1):
            for col in range(CHAFF_COLUMNS - 1):
                corner = start + row * CHAFF_COLUMNS + col
                faces.append((corner, corner + 1, corner + CHAFF_COLUMNS + 1, corner + CHAFF_COLUMNS))
                face_uvs.append((_chaff_uv(layer, row, col), _chaff_uv(layer, row, col + 1),
                                 _chaff_uv(layer, row + 1, col + 1), _chaff_uv(layer, row + 1, col)))
    mesh = _mesh_with_uv("GEO-cascarilla", vertices, faces, face_uvs)
    obj = bpy.data.objects.new("GEO-cascarilla", mesh)
    collection.objects.link(obj)
    return obj


def build_cup_meshes():
    """Mallas originales {saucer, body, handle} con sus UV y el atributo `edge`."""
    meshes = placed_meshes()
    _check_tables(meshes)
    _finish_meshes(meshes)
    for mesh in meshes.values():
        _triangulate_ngons(mesh)
    return meshes


def _triangulate_ngons(mesh):
    """El exportador no calcula tangentes si hay n-gonos. Conserva UV, atributos y aristas vivas."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    ngons = [face for face in bm.faces if len(face.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons, quad_method="BEAUTY", ngon_method="BEAUTY")
        bm.to_mesh(mesh)
    bm.free()


def build_ceramic_bake_object(meshes, collection):
    """Une las tres piezas (cada una en su marco local) solo para hornear el atlas comun."""
    bm = bmesh.new()
    for mesh in meshes.values():
        bm.from_mesh(mesh)
    joined = bpy.data.meshes.new("BAKE-ceramica")
    bm.to_mesh(joined)
    bm.free()
    obj = bpy.data.objects.new("BAKE-ceramica", joined)
    collection.objects.link(obj)
    return obj


def copy_handle_attribute(mesh):
    """El exportador solo escribe atributos cuyo nombre empieza por guion bajo."""
    source = mesh.attributes[HANDLE_ATTRIBUTE]
    values = [item.value for item in source.data]
    target = mesh.attributes.new(HANDLE_EXPORT_ATTRIBUTE, "FLOAT", "POINT")
    target.data.foreach_set("value", values)


def _pedestal_side_uv(cos):
    """UV del lateral: angulo en U y recorrido del perfil en V."""
    span_low, span_high = -0.0035, PEDESTAL_TOP + 0.0035
    angles = [math.atan2(co.y, co.x) for co in cos]
    uvs = []
    for co, angle in zip(cos, angles):
        while angle - angles[0] > math.pi:
            angle -= 2.0 * math.pi
        while angle - angles[0] < -math.pi:
            angle += 2.0 * math.pi
        inset = PEDESTAL_RADIUS - math.hypot(co.x, co.y)
        span = co.z + inset if co.z > PEDESTAL_TOP / 2.0 else co.z - inset
        uvs.append((0.01 + (angle + math.pi) / (2.0 * math.pi) * 0.98, 0.01 + (span - span_low) / (span_high - span_low) * 0.46))
    return uvs


def _pedestal_uvs(mesh):
    """Atlas: tapa arriba-izquierda, fondo arriba-derecha, lateral en la franja inferior."""
    layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        cos = [mesh.vertices[mesh.loops[i].vertex_index].co for i in loops]
        if abs(polygon.normal.z) > 0.85:
            center_x = 0.25 if polygon.normal.z > 0.0 else 0.75
            flip = 1.0 if polygon.normal.z > 0.0 else -1.0
            uvs = [(center_x + flip * co.x / PEDESTAL_RADIUS * 0.235, 0.75 + co.y / PEDESTAL_RADIUS * 0.235) for co in cos]
        else:
            uvs = _pedestal_side_uv(cos)
        for loop, uv in zip(loops, uvs):
            layer.data[loop].uv = uv


def build_pedestal_low(collection):
    source = lathe_object("TMP-base", PEDESTAL_PROFILE, collection, segments=PEDESTAL_SEGMENTS, subsurf=PEDESTAL_SUBSURF)
    bpy.context.view_layer.update()
    mesh = bpy.data.meshes.new_from_object(source.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(source)
    mesh.name = "GEO-base_piedra"
    _pedestal_uvs(mesh)
    mesh.shade_smooth()
    obj = bpy.data.objects.new("GEO-base_piedra", mesh)
    collection.objects.link(obj)
    return obj


def _set_plane(name, collection, uv_of):
    half = SET_PLANE_SIZE / 2.0
    corners = [(-half, -half, 0.0), (half, -half, 0.0), (half, half, 0.0), (-half, half, 0.0)]
    mesh = _mesh_with_uv(name, corners, [(0, 1, 2, 3)], [[uv_of(x, y) for x, y, _ in corners]])
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def build_set_planes(collection):
    """Mismo tamano y posicion que build_set() de build_scene.py; solo cambian las UV."""
    floor = _set_plane("GEO-suelo", collection,
                       lambda x, y: ((x - FLOOR_TILE["x0"]) / FLOOR_TILE["size"], (y - FLOOR_TILE["y0"]) / FLOOR_TILE["size"]))
    wall = _set_plane("GEO-pared", collection,
                      lambda x, y: ((x - WALL_TILE["x0"]) / WALL_TILE["size"], (y + SET_PLANE_SIZE / 2.0 - WALL_TILE["z0"]) / WALL_TILE["size"]))
    wall.location = (0.0, WALL_Y, SET_PLANE_SIZE / 2.0)
    wall.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    return floor, wall


def build_bake_plane(collection, name, size):
    """Lamina de horneado del marmol: UV 0..1 sobre un cuadrado de `size` metros."""
    half = size / 2.0
    corners = [(-half, -half, 0.0), (half, -half, 0.0), (half, half, 0.0), (-half, half, 0.0)]
    mesh = _mesh_with_uv(name, corners, [(0, 1, 2, 3)], [[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]])
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj
