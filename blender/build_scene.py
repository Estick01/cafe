"""Escena de cafe: grano, base de piedra, platillo y taza (unidades en metros).

Uso:
  blender --background --factory-startup --python build_scene.py -- [--samples N] [--res WxH]

Genera cafe_escena.blend y dos renders de prueba:
  renders/estado_base.png  -> grano sobre platillo y base de piedra
  renders/estado_taza.png  -> grano sobre la taza terminada
"""
import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from bean_model import bean_material, build_bean  # noqa: E402  (requiere la ruta anterior)
from ceramic import ceramic_material  # noqa: E402
from cup_asset import build_cup_parts  # noqa: E402
from dimensions import CAMERA_LENS, PEDESTAL_PROFILE, PEDESTAL_TOP  # noqa: E402
from shader_utils import node_material  # noqa: E402
from timeline import BEAN_HOVER_BASE, BEAN_HOVER_CUP, SHOT_BASE, SHOT_CUP  # noqa: E402

SEGMENTS = 96

STATES = {
    "base": {
        "saucer_z": PEDESTAL_TOP,
        "bean_z": BEAN_HOVER_BASE,
        "camera": SHOT_BASE,
        "hide": ("COL-taza",),
    },
    "taza": {
        "saucer_z": 0.0,
        "bean_z": BEAN_HOVER_CUP,
        "camera": SHOT_CUP,
        "hide": ("COL-base",),
    },
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=96)
    parser.add_argument("--res", default="1280x720")
    args = parser.parse_args(argv)
    width, height = (int(v) for v in args.res.lower().split("x"))
    if args.samples < 1 or width < 16 or height < 16:
        raise ValueError(f"Parametros invalidos: {args}")
    return args.samples, width, height


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new("WLD-estudio")
    return scene


def new_collection(scene, name):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    return collection


def lathe_object(name, profile, collection, segments=SEGMENTS, subsurf=2):
    """Revoluciona un perfil (radio, altura) alrededor de Z."""
    bm = bmesh.new()
    rings = []
    for radius, height in profile:
        count = 1 if radius == 0.0 else segments
        rings.append([
            bm.verts.new((radius * math.cos(2.0 * math.pi * i / count), radius * math.sin(2.0 * math.pi * i / count), height))
            for i in range(count)
        ])
    for lower, upper in zip(rings, rings[1:]):
        _bridge_rings(bm, lower, upper, segments)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    if subsurf:
        modifier = obj.modifiers.new("SUB-suave", "SUBSURF")
        modifier.levels = subsurf
        modifier.render_levels = subsurf
    return obj


def _bridge_rings(bm, lower, upper, segments):
    for index in range(segments):
        next_index = (index + 1) % segments
        if len(lower) == 1:
            bm.faces.new((lower[0], upper[index], upper[next_index]))
        elif len(upper) == 1:
            bm.faces.new((lower[index], lower[next_index], upper[0]))
        else:
            bm.faces.new((lower[index], lower[next_index], upper[next_index], upper[index]))


def build_set(collection):
    bpy.ops.mesh.primitive_plane_add(size=3.0, location=(0.0, 0.0, 0.0))
    floor = bpy.context.active_object
    floor.name = "GEO-suelo"
    bpy.ops.mesh.primitive_plane_add(size=3.0, location=(0.0, 0.34, 1.5), rotation=(math.pi / 2, 0, 0))
    wall = bpy.context.active_object
    wall.name = "GEO-pared"
    for obj in (floor, wall):
        for owner in obj.users_collection:
            owner.objects.unlink(obj)
        collection.objects.link(obj)
    return floor, wall


def stone_veins(tree, scale, seed, width):
    """Devuelve un socket 0..1 con vetas finas a partir de ruido distorsionado."""
    nodes, links = tree.nodes, tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["W"].default_value = seed
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 7.0
    noise.inputs["Roughness"].default_value = 0.55
    noise.inputs["Distortion"].default_value = 1.3
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    centered = nodes.new("ShaderNodeMath")
    centered.operation = "SUBTRACT"
    centered.inputs[1].default_value = 0.5
    links.new(noise.outputs["Fac"], centered.inputs[0])
    absolute = nodes.new("ShaderNodeMath")
    absolute.operation = "ABSOLUTE"
    links.new(centered.outputs[0], absolute.inputs[0])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    ramp.color_ramp.elements[1].position = width
    ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
    links.new(absolute.outputs[0], ramp.inputs["Fac"])
    # Mascara de baja frecuencia: solo algunas zonas muestran vetas, como en piedra real.
    patches = nodes.new("ShaderNodeTexNoise")
    patches.noise_dimensions = "4D"
    patches.inputs["W"].default_value = seed + 3.0
    patches.inputs["Scale"].default_value = scale * 0.55
    patches.inputs["Detail"].default_value = 2.0
    links.new(coords.outputs["Object"], patches.inputs["Vector"])
    patch_ramp = nodes.new("ShaderNodeValToRGB")
    patch_ramp.color_ramp.elements[0].position = 0.46
    patch_ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    patch_ramp.color_ramp.elements[1].position = 0.60
    patch_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    links.new(patches.outputs["Fac"], patch_ramp.inputs["Fac"])
    masked = nodes.new("ShaderNodeMath")
    masked.operation = "MULTIPLY"
    links.new(ramp.outputs["Color"], masked.inputs[0])
    links.new(patch_ramp.outputs["Color"], masked.inputs[1])
    return masked.outputs[0]


def dark_stone_material(name, scale, seed, roughness, vein_color):
    material, tree, bsdf = node_material(name)
    nodes, links = tree.nodes, tree.links
    veins = stone_veins(tree, scale, seed, 0.0045)
    coords = nodes.new("ShaderNodeTexCoord")
    mottling = nodes.new("ShaderNodeTexNoise")
    mottling.inputs["Scale"].default_value = scale * 2.5
    mottling.inputs["Detail"].default_value = 9.0
    links.new(coords.outputs["Object"], mottling.inputs["Vector"])
    base_ramp = nodes.new("ShaderNodeValToRGB")
    base_ramp.color_ramp.elements[0].position = 0.35
    base_ramp.color_ramp.elements[0].color = (0.005, 0.005, 0.0055, 1)
    base_ramp.color_ramp.elements[1].position = 0.68
    base_ramp.color_ramp.elements[1].color = (0.020, 0.020, 0.021, 1)
    links.new(mottling.outputs["Fac"], base_ramp.inputs["Fac"])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    links.new(veins, mix.inputs["Factor"])
    links.new(base_ramp.outputs["Color"], mix.inputs["A"])
    mix.inputs["B"].default_value = vein_color
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.002
    links.new(mottling.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def assign(material, *objects):
    for obj in objects:
        obj.data.materials.append(material)


def add_area_light(collection, name, location, target, size, power, color):
    light = bpy.data.lights.new(name, "AREA")
    light.size = size
    light.energy = power
    light.color = color
    obj = bpy.data.objects.new(name, light)
    collection.objects.link(obj)
    obj.location = location
    aim_at(obj, target)
    return obj


def aim_at(obj, target):
    direction = Vector(target) - Vector(obj.location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_lights(collection):
    add_area_light(collection, "LGT-principal", (-0.42, -0.36, 0.52), (0, 0, 0.07), 0.55, 9.0, (1.0, 0.93, 0.84))
    add_area_light(collection, "LGT-relleno", (0.55, -0.42, 0.20), (0, 0, 0.06), 0.70, 1.0, (0.86, 0.92, 1.0))
    add_area_light(collection, "LGT-contra", (0.26, 0.28, 0.46), (0, 0, 0.08), 0.32, 5.0, (1.0, 0.86, 0.70))
    add_area_light(collection, "LGT-pared", (0.0, -0.06, 0.82), (0, 0.34, 0.26), 0.9, 0.6, (1.0, 0.96, 0.9))


def build_world(scene):
    world = scene.world
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.04, 0.04, 0.045, 1.0)
    background.inputs["Strength"].default_value = 0.06


def build_camera(scene, collection):
    camera = bpy.data.cameras.new("CAM-principal")
    camera.lens = CAMERA_LENS
    camera.dof.use_dof = True
    camera.dof.aperture_fstop = 5.6
    obj = bpy.data.objects.new("CAM-principal", camera)
    collection.objects.link(obj)
    scene.camera = obj
    return obj


def configure_render(scene, samples, width, height):
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.image_settings.file_format = "PNG"
    cycles = scene.cycles
    cycles.samples = samples
    cycles.use_denoising = True
    cycles.max_bounces = 8
    preferences = bpy.context.preferences.addons["cycles"].preferences
    preferences.compute_device_type = "OPTIX"
    preferences.get_devices()
    gpus = [d for d in preferences.devices if d.type == "OPTIX"]
    for device in preferences.devices:
        device.use = device in gpus
    cycles.device = "GPU" if gpus else "CPU"
    cycles.denoiser = "OPTIX" if gpus else "OPENIMAGEDENOISE"
    print(f"RENDER_DEVICE {cycles.device} {[d.name for d in gpus]}")


def apply_state(scene, state_name):
    state = STATES[state_name]
    objects = bpy.data.objects
    objects["GEO-platillo"].location.z = state["saucer_z"]
    objects["GEO-grano"].location = (0.0, 0.0, state["bean_z"])
    for collection in ("COL-base", "COL-taza"):
        bpy.data.collections[collection].hide_render = collection in state["hide"]
        bpy.data.collections[collection].hide_viewport = collection in state["hide"]
    position, target = state["camera"]
    camera = scene.camera
    camera.location = position
    aim_at(camera, target)
    camera.data.dof.focus_distance = (Vector(target) - Vector(position)).length
    bpy.context.view_layer.update()


def render_state(scene, state_name):
    apply_state(scene, state_name)
    path = os.path.join(HERE, "renders", f"estado_{state_name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {path} {os.path.getsize(path)} bytes")


def report_scene():
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            size = obj.dimensions
            print(f"OBJ {obj.name} verts={len(obj.data.vertices)} "
                  f"size_cm=({size.x * 100:.1f},{size.y * 100:.1f},{size.z * 100:.1f})")


def build_all(samples, width, height):
    """Construye la escena completa y la deja lista para renderizar."""
    scene = reset_scene()
    shared = new_collection(scene, "COL-compartido")
    base = new_collection(scene, "COL-base")
    cup_set = new_collection(scene, "COL-taza")
    stage = new_collection(scene, "COL-escenario")

    pedestal = lathe_object("GEO-base_piedra", PEDESTAL_PROFILE, base)
    saucer, cup, handle = build_cup_parts(shared, cup_set)
    bean = build_bean(shared)
    floor, wall = build_set(stage)

    assign(ceramic_material(), saucer)
    assign(ceramic_material("MAT-ceramica_taza", with_reveal=True), cup)
    assign(ceramic_material("MAT-ceramica_asa", with_handle_clip=True), handle)
    assign(dark_stone_material("MAT-piedra_base", 11.0, 2.4, 0.62, (0.10, 0.10, 0.105, 1)), pedestal)
    assign(dark_stone_material("MAT-marmol_suelo", 5.0, 7.1, 0.5, (0.12, 0.12, 0.125, 1)), floor)
    assign(dark_stone_material("MAT-marmol_pared", 3.6, 11.3, 0.72, (0.09, 0.09, 0.095, 1)), wall)
    assign(bean_material(), bean)

    build_lights(stage)
    build_world(scene)
    build_camera(scene, stage)
    configure_render(scene, samples, width, height)
    return scene


def main():
    samples, width, height = parse_args()
    scene = build_all(samples, width, height)
    for state_name in STATES:
        render_state(scene, state_name)
    report_scene()

    blend_path = os.path.join(HERE, "cafe_escena.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"SAVED {blend_path}")


if __name__ == "__main__":
    main()
