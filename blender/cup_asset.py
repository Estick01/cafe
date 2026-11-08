"""Taza y platillo del usuario: carga la malla de assets/coffeecup.blend y la separa.

La malla original trae tres piezas sueltas en un solo objeto. Aqui se escala, se gira
para que el asa quede en +X y se separa en GEO-platillo, GEO-taza y GEO-asa. La taza y
el asa comparten marco local: z = 0 en el pie, sobre el eje de la taza.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix

import cup_attributes
from ceramic import HANDLE_ATTRIBUTE
from dimensions import ASSET_SCALE, CUP_SEAT, CUP_TOP, SAUCER_RADIUS

ASSET_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "coffeecup.blend")
ASSET_OBJECT = "cup+saucer"
HANDLE_TURN = math.pi / 2.0  # el asa original apunta a -Y; la camara mira desde -Y
SHARP_ANGLE = math.radians(60.0)  # solo la arista del pie del platillo supera este angulo
TABLE_TOLERANCE = 0.0001
EDGE_ATTRIBUTE = "edge"


def load_source_mesh():
    """Anexa la malla (sin ejecutar nada del archivo) y descarta objeto y materiales ajenos."""
    if not os.path.exists(ASSET_PATH):
        raise FileNotFoundError(f"Falta el modelo de la taza: {ASSET_PATH}")
    with bpy.data.libraries.load(ASSET_PATH, link=False) as (source, target):
        if ASSET_OBJECT not in source.objects:
            raise ValueError(f"{ASSET_PATH} no contiene el objeto {ASSET_OBJECT}")
        target.objects = [ASSET_OBJECT]
    obj = target.objects[0]
    mesh = obj.data
    materials = [slot for slot in mesh.materials if slot is not None]
    bpy.data.objects.remove(obj)
    mesh.materials.clear()
    for material in materials:
        if material.users == 0:
            bpy.data.materials.remove(material)
    _forget_library()
    return mesh


def _forget_library():
    """Lo anexado ya es local: sin esto el .blend guardado apuntaria al archivo de origen."""
    for library in list(bpy.data.libraries):
        if os.path.basename(library.filepath) == os.path.basename(ASSET_PATH):
            bpy.data.libraries.remove(library)


def _connected_parts(bm):
    """Devuelve las piezas sueltas como listas de indices de vertice."""
    bm.verts.ensure_lookup_table()
    seen, parts = set(), []
    for start in bm.verts:
        if start.index in seen:
            continue
        seen.add(start.index)
        stack, part = [start], []
        while stack:
            vert = stack.pop()
            part.append(vert.index)
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        parts.append(part)
    return parts


def _classify_parts(bm, parts):
    """Identifica las piezas por su forma, sin depender del orden dentro del archivo."""
    if len(parts) != 3:
        raise ValueError(f"Se esperaban 3 piezas sueltas y hay {len(parts)}")

    def top(part):
        return max(bm.verts[i].co.z for i in part)

    def off_axis(part):
        x = sum(bm.verts[i].co.x for i in part) / len(part)
        y = sum(bm.verts[i].co.y for i in part) / len(part)
        return math.hypot(x, y)

    saucer = min(parts, key=top)
    handle = max(parts, key=off_axis)
    body = next(part for part in parts if part is not saucer and part is not handle)
    return {"saucer": saucer, "body": body, "handle": handle}


def _extract_part(bm, keep, name):
    """Copia una pieza a una malla nueva, dejando intacto el bmesh de origen."""
    copy = bm.copy()
    copy.verts.ensure_lookup_table()
    keep_set = set(keep)
    doomed = [vert for vert in copy.verts if vert.index not in keep_set]
    bmesh.ops.delete(copy, geom=doomed, context="VERTS")
    mesh = bpy.data.meshes.new(name)
    copy.to_mesh(mesh)
    copy.free()
    return mesh


def placed_meshes():
    """Mallas {saucer, body, handle} ya escaladas, giradas y en su marco local."""
    source = load_source_mesh()
    source.transform(Matrix.Rotation(HANDLE_TURN, 4, "Z") @ Matrix.Scale(ASSET_SCALE, 4))
    bm = bmesh.new()
    bm.from_mesh(source)
    # La malla trae una arista suelta dentro de un hexagono del pie del platillo.
    loose = [edge for edge in bm.edges if edge.is_wire]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="EDGES")
    bm.verts.index_update()
    parts = _classify_parts(bm, _connected_parts(bm))
    seat = min(bm.verts[i].co.z for i in parts["body"])
    meshes = {
        "saucer": _extract_part(bm, parts["saucer"], "GEO-platillo"),
        "body": _extract_part(bm, parts["body"], "GEO-taza"),
        "handle": _extract_part(bm, parts["handle"], "GEO-asa"),
    }
    bm.free()
    bpy.data.meshes.remove(source)
    drop_to_foot = Matrix.Translation((0.0, 0.0, -seat))
    meshes["body"].transform(drop_to_foot)
    meshes["handle"].transform(drop_to_foot)
    return meshes


def boundary_loops(bm):
    """Agrupa los vertices de borde abierto en lazos: las dos uniones del asa."""
    pending = {vert for edge in bm.edges if edge.is_boundary for vert in edge.verts}
    loops = []
    while pending:
        stack = [pending.pop()]
        loop = list(stack)
        while stack:
            vert = stack.pop()
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if edge.is_boundary and other in pending:
                    pending.remove(other)
                    stack.append(other)
                    loop.append(other)
        loops.append(loop)
    return loops


def _center(verts):
    return tuple(sum(v.co[axis] for v in verts) / len(verts) for axis in range(3))


def _handle_rings(bm):
    """Anillos del tubo del asa, ordenados de la union inferior a la superior."""
    loops = boundary_loops(bm)
    if len(loops) != 2:
        raise ValueError(f"El asa deberia tener 2 uniones abiertas y tiene {len(loops)}")
    current = min(loops, key=lambda loop: _center(loop)[2])
    rings, seen = [], set(current)
    while current:
        if len(current) != len(loops[0]):
            raise ValueError("El asa no es un tubo regular: un anillo tiene otro tamano")
        rings.append(current)
        following = {e.other_vert(v) for v in current for e in v.link_edges} - seen
        seen |= following
        current = list(following)
    return rings


def handle_progress(mesh):
    """Avance a lo largo del arco del asa por vertice: 0 abajo y 1 arriba."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    rings = _handle_rings(bm)
    progress = cup_attributes.arc_progress([_center(ring) for ring in rings])
    values = [0.0] * len(bm.verts)
    for ring, value in zip(rings, progress):
        for vert in ring:
            values[vert.index] = value
    bm.free()
    return values


def _write_float(mesh, name, values):
    attribute = mesh.attributes.new(name, "FLOAT", "POINT")
    attribute.data.foreach_set("value", values)


def _radius_height(vertex):
    return math.hypot(vertex.co.x, vertex.co.y), vertex.co.z


def _finish_meshes(meshes):
    """Suaviza respetando aristas vivas y escribe los atributos que usa el material."""
    for mesh in meshes.values():
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=SHARP_ANGLE)
    saucer, body, handle = meshes["saucer"], meshes["body"], meshes["handle"]
    _write_float(saucer, EDGE_ATTRIBUTE, [cup_attributes.saucer_edge(*_radius_height(v)) for v in saucer.vertices])
    _write_float(body, EDGE_ATTRIBUTE, [cup_attributes.cup_edge(v.co.z) for v in body.vertices])
    _write_float(handle, EDGE_ATTRIBUTE, [0.0] * len(handle.vertices))
    _write_float(handle, HANDLE_ATTRIBUTE, handle_progress(handle))


def _check_tables(meshes):
    """Si la malla y la tabla de dimensions.py discrepan, hay que regenerar la tabla."""
    measured_top = max(v.co.z for v in meshes["body"].vertices)
    measured_radius = max(_radius_height(v)[0] for v in meshes["saucer"].vertices)
    if abs(measured_top - CUP_TOP) > TABLE_TOLERANCE or abs(measured_radius - SAUCER_RADIUS) > TABLE_TOLERANCE:
        raise ValueError("dimensions.py no coincide con la malla: ejecuta cup_profile_tool.py")


def build_cup_parts(saucer_collection, cup_collection):
    """Crea los tres objetos y devuelve (platillo, taza, asa). La taza queda asentada."""
    meshes = placed_meshes()
    _check_tables(meshes)
    _finish_meshes(meshes)
    saucer = bpy.data.objects.new("GEO-platillo", meshes["saucer"])
    body = bpy.data.objects.new("GEO-taza", meshes["body"])
    handle = bpy.data.objects.new("GEO-asa", meshes["handle"])
    saucer_collection.objects.link(saucer)
    cup_collection.objects.link(body)
    cup_collection.objects.link(handle)
    body.location.z = CUP_SEAT
    handle.location.z = CUP_SEAT
    return saucer, body, handle
