"""Grano de cafe modelado a partir de las fotos de referencia del usuario.

Cuerpo caoba de superficie granulada, lobulos asimetricos, surco profundo y una
cascarilla crema arrugada como papel, que es una malla propia hija del grano.
No usa imagenes de referencia como textura: todo es procedural.
"""
import math

import bmesh
import bpy
from mathutils import Vector, noise

from dimensions import BEAN_HALF
from shader_utils import attribute_value, bump, color_ramp, mix_color, node_material, noise_texture

U_SEGMENTS = 420  # basta para el relieve y aligera la memoria y la GPU
V_SEGMENTS = 320
CHAFF_ROWS = 300
CHAFF_COLUMNS = 34
# Forma de las fotos: frente casi plano, volumen detras y silueta alargada (ancho/alto 0.76).
FRONT_HEIGHT = 0.36
BACK_DOME = 1.22
OUTLINE_NARROW = 0.915
GROOVE_DEPTH = 0.50
# (semilla, semiancho, elevacion sobre el fondo del surco)
CHAFF_LAYERS = ((3.0, 0.100, 0.33), (11.0, 0.135, 0.23), (19.0, 0.075, 0.41))


def _smooth(start, end, value):
    ratio = min(1.0, max(0.0, (value - start) / (end - start)))
    return ratio * ratio * (3.0 - 2.0 * ratio)


def _groove_center(z):
    """Linea central del surco: curva suave con desvios irregulares."""
    wander = 0.065 * noise.noise(Vector((0.0, 0.0, z * 4.0)))
    jitter = 0.020 * noise.noise(Vector((2.0, 0.0, z * 13.0)))
    return 0.09 * math.sin(z * 2.2 + 0.4) + wander + jitter


def _surface_detail(x, y, z):
    """Devuelve (relieve, tono): ondulacion ancha muy leve y grano fino tipo cuero."""
    broad = noise.noise(Vector((x * 1.8 + 7.0, y * 1.8, z * 2.6)))
    pebble = noise.fractal(Vector((x * 24.0, y * 24.0, z * 24.0)), 1.0, 2.1, 3)
    relief = 0.026 * broad + 0.0085 * pebble
    return relief, min(1.0, max(0.0, 0.5 + 0.45 * broad + 0.28 * pebble))


def bean_vertex(x, y, z):
    """Deforma un punto de la esfera unidad; devuelve (posicion, surco, tono)."""
    front = max(0.0, -y)
    distance = x - _groove_center(z)
    width = 0.125 * (1.0 + 0.42 * noise.noise(Vector((1.7, 0.0, z * 5.0))))
    width *= 0.72 if distance > 0.0 else 1.0  # la pared derecha cae mas vertical
    ends = max(0.0, 1.0 - abs(z) ** 8.0)
    facing = min(1.0, front * 3.5)
    groove = math.exp(-((distance / width) ** 2)) * ends * facing
    lobes = math.exp(-(((abs(distance) - 0.34) / 0.28) ** 2)) * ends * min(1.0, front * 3.0)
    overlap = _smooth(-0.02, 0.14, distance) * facing * 0.035  # un lobulo monta sobre el otro
    notch = _smooth(0.70, 0.93, z) * math.exp(-((distance / 0.15) ** 2)) * min(1.0, front * 4.0)

    relief, tone = _surface_detail(x, y, z)
    lumps = 1.0 + 0.030 * noise.noise(Vector((x * 1.5 + 3.0, y * 1.5, z * 1.5))) + relief * (1.0 - groove)
    shaped_y = (_flat_front_y(x, z) if y < 0.0 else y * BACK_DOME) * lumps
    position = (
        x * lumps * OUTLINE_NARROW,
        shaped_y + groove * GROOVE_DEPTH + notch * 0.16 - lobes * 0.045 - overlap,
        z * lumps,
    )
    return position, groove, tone


def _flat_front_y(x, z):
    """Cara frontal casi plana: se mantiene alta en el centro y solo cae cerca del borde."""
    radius = min(1.0, math.sqrt(x * x + z * z))
    return -FRONT_HEIGHT * (1.0 - radius ** 5.0) ** 0.4


def _groove_floor(z):
    """Punto (x, y) del fondo del surco a una altura dada, en unidades de la esfera."""
    x = _groove_center(z)
    y = -math.sqrt(max(0.0, 1.0 - x * x - z * z))
    position, _, _ = bean_vertex(x, y, z)
    return position[0], position[1]


def _chaff_vertex(seed, half_width, lift, row_ratio, across, floor):
    """Punto de una lamina de cascarilla: bordes rasgados y pliegues de papel arrugado."""
    z = -0.84 + 1.66 * row_ratio
    center, floor_y = floor
    side = 1.0 if across > 0.0 else -1.0
    tear = _smooth(0.22, 0.86, 0.5 + 0.9 * noise.noise(Vector((seed + side, 2.0, z * 5.5))))
    fringe = 0.5 + 0.5 * noise.noise(Vector((seed + side * 2.0, 5.0, z * 30.0)))
    taper = max(0.0, 1.0 - abs(z / 0.86) ** 6.0)
    span = half_width * (0.06 + 1.55 * tear + 0.42 * fringe) * taper
    wander = 0.060 * noise.noise(Vector((seed, 7.0, z * 4.5)))
    crease = abs(noise.noise(Vector((across * 2.0 + seed, z * 11.0, seed))))
    fold = abs(noise.noise(Vector((across * 4.5, z * 25.0, seed * 1.5))))
    wrinkle = noise.noise(Vector((across * 9.0, z * 60.0, seed * 2.0)))
    rise = lift * (1.0 - 0.45 * across * across) * (0.60 + 0.40 * taper)
    relief = 0.10 * crease + 0.05 * fold + 0.018 * wrinkle
    return (center + wander + across * span * OUTLINE_NARROW, floor_y - rise - relief, z)


def _chaff_layer(seed, half_width, lift):
    vertices = []
    for row in range(CHAFF_ROWS):
        ratio = row / (CHAFF_ROWS - 1)
        floor = _groove_floor(-0.84 + 1.66 * ratio)
        for column in range(CHAFF_COLUMNS):
            across = column / (CHAFF_COLUMNS - 1) * 2.0 - 1.0
            vertices.append(_chaff_vertex(seed, half_width, lift, ratio, across, floor))
    return vertices


def build_chaff(bean, collection):
    """Crea la cascarilla como hija del grano, para que lo siga en toda la animacion."""
    vertices, faces = [], []
    for seed, half_width, lift in CHAFF_LAYERS:
        start = len(vertices)
        layer = _chaff_layer(seed, half_width, lift)
        vertices.extend((x * BEAN_HALF[0], y * BEAN_HALF[1], z * BEAN_HALF[2]) for x, y, z in layer)
        for row in range(CHAFF_ROWS - 1):
            for column in range(CHAFF_COLUMNS - 1):
                corner = start + row * CHAFF_COLUMNS + column
                faces.append((corner, corner + 1, corner + CHAFF_COLUMNS + 1, corner + CHAFF_COLUMNS))
    mesh = bpy.data.meshes.new("GEO-cascarilla")
    mesh.from_pydata(vertices, [], faces)
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    mesh.materials.append(chaff_material())
    obj = bpy.data.objects.new("GEO-cascarilla", mesh)
    collection.objects.link(obj)
    obj.parent = bean
    return obj


def build_bean(collection):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=U_SEGMENTS, v_segments=V_SEGMENTS, radius=1.0)
    groove_layer = bm.verts.layers.float.new("groove")
    tone_layer = bm.verts.layers.float.new("tono")
    for vert in bm.verts:
        (x, y, z), groove, tone = bean_vertex(*vert.co)
        vert.co = (x * BEAN_HALF[0], y * BEAN_HALF[1], z * BEAN_HALF[2])
        vert[groove_layer] = groove
        vert[tone_layer] = tone
    mesh = bpy.data.meshes.new("GEO-grano")
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    obj = bpy.data.objects.new("GEO-grano", mesh)
    collection.objects.link(obj)
    obj.rotation_euler = (math.radians(4.0), math.radians(-16.0), math.radians(6.0))
    build_chaff(obj, collection)
    return obj


def _pale_flecks(tree, coords):
    """Motitas claras de pelicula plateada, pequenas y dispersas."""
    voronoi = tree.nodes.new("ShaderNodeTexVoronoi")
    voronoi.inputs["Scale"].default_value = 900.0
    tree.links.new(coords, voronoi.inputs["Vector"])
    dots = color_ramp(tree, voronoi.outputs["Distance"], 0.0, (1, 1, 1), 0.10, (0, 0, 0))
    sparse = color_ramp(tree, noise_texture(tree, coords, 340.0, detail=2.0), 0.56, (0, 0, 0), 0.66, (0.75, 0.75, 0.75))
    masked = tree.nodes.new("ShaderNodeMath")
    masked.operation = "MULTIPLY"
    tree.links.new(dots, masked.inputs[0])
    tree.links.new(sparse, masked.inputs[1])
    return masked.outputs[0]


def _burnt_tip(tree, coords):
    """Oscurece la punta superior, que en el grano real esta mas quemada."""
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coords, separate.inputs[0])
    tip = tree.nodes.new("ShaderNodeMapRange")
    tip.interpolation_type = "SMOOTHSTEP"
    tip.inputs["From Min"].default_value = BEAN_HALF[2] * 0.68
    tip.inputs["From Max"].default_value = BEAN_HALF[2] * 0.98
    tree.links.new(separate.outputs["Z"], tip.inputs["Value"])
    return tip.outputs["Result"]


def bean_material():
    material, tree, bsdf = node_material("MAT-grano_tostado")
    coords = tree.nodes.new("ShaderNodeTexCoord").outputs["Object"]
    tone = attribute_value(tree, "tono")
    groove = attribute_value(tree, "groove")

    mottled = noise_texture(tree, coords, 420.0, detail=6.0, roughness=0.62)
    base = color_ramp(tree, mottled, 0.34, (0.020, 0.0065, 0.0045), 0.68, (0.098, 0.031, 0.018))
    regional = color_ramp(tree, tone, 0.25, (0.45, 0.45, 0.45), 0.75, (0, 0, 0))
    varied = mix_color(tree, regional, base, (0.022, 0.0075, 0.0050))
    burnt = mix_color(tree, _burnt_tip(tree, coords), varied, (0.012, 0.0065, 0.0055))
    flecked = mix_color(tree, _pale_flecks(tree, coords), burnt, (0.46, 0.34, 0.22))
    groove_mask = color_ramp(tree, groove, 0.10, (0, 0, 0), 0.48, (1, 1, 1))
    final = mix_color(tree, groove_mask, flecked, (0.006, 0.003, 0.002))
    tree.links.new(final, bsdf.inputs["Base Color"])

    gloss = tree.nodes.new("ShaderNodeMapRange")
    gloss.inputs["To Min"].default_value = 0.34
    gloss.inputs["To Max"].default_value = 0.56
    tree.links.new(mottled, gloss.inputs["Value"])
    tree.links.new(gloss.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Coat Weight"].default_value = 0.28
    bsdf.inputs["Coat Roughness"].default_value = 0.30

    pores = noise_texture(tree, coords, 1250.0, detail=6.0, roughness=0.6)
    leather = noise_texture(tree, coords, 520.0, detail=4.0)
    tree.links.new(bump(tree, pores, 0.50, 0.00028, bump(tree, leather, 0.55, 0.00045)), bsdf.inputs["Normal"])
    return material


def chaff_material():
    material, tree, bsdf = node_material("MAT-cascarilla")
    coords = tree.nodes.new("ShaderNodeTexCoord").outputs["Object"]
    stretch = tree.nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (1.0, 1.0, 0.45)
    tree.links.new(coords, stretch.inputs["Vector"])
    fibres = noise_texture(tree, stretch.outputs["Vector"], 1300.0, detail=6.0, roughness=0.6)
    patches = noise_texture(tree, coords, 340.0, detail=4.0)
    paper = color_ramp(tree, fibres, 0.32, (0.44, 0.27, 0.13), 0.66, (0.86, 0.68, 0.44))
    stained = color_ramp(tree, patches, 0.50, (0, 0, 0), 0.72, (0.60, 0.60, 0.60))
    final = mix_color(tree, stained, paper, (0.25, 0.135, 0.065))
    tree.links.new(final, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Subsurface Weight"].default_value = 0.25
    bsdf.inputs["Subsurface Scale"].default_value = 0.0008
    tree.links.new(bump(tree, fibres, 0.55, 0.00018), bsdf.inputs["Normal"])
    return material
