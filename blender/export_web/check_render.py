"""Importa cafe.glb tal cual y renderiza vistas de control en GPU (32 muestras, 800x800)."""
import math
import os
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from common import CHECKS_DIR, MODELS_DIR, configure_cycles, record_time  # noqa: E402
from build_scene import add_area_light, aim_at, build_lights  # noqa: E402
from timeline import SHOT_BASE, SHOT_CUP, SHOT_INSIDE  # noqa: E402

SAMPLES = 32
SIZE = 800
BEAN_VIEWS = {
    "check_grano_frente": math.radians(0.0),
    "check_grano_tres_cuartos": math.radians(35.0),
    "check_grano_lado": math.radians(90.0),
    "check_grano_dorso": math.radians(180.0),
}
BEAN_DISTANCE = 0.095


def set_world(scene, grey, strength):
    world = bpy.data.worlds.new("WLD-control")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (grey, grey, grey, 1.0)
    background.inputs["Strength"].default_value = strength


def make_camera(scene):
    data = bpy.data.cameras.new("CAM-control")
    data.lens = 55.0
    data.clip_start = 0.01
    camera = bpy.data.objects.new("CAM-control", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def render(scene, name):
    scene.render.filepath = os.path.join(CHECKS_DIR, f"{name}.png")
    start = time.time()
    bpy.ops.render.render(write_still=True)
    record_time(f"render_{name}", time.time() - start, f"{SIZE}px {SAMPLES}spp {scene.cycles.device}")


def hide_all_but(names):
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            hidden = obj.name not in names
            obj.hide_render = hidden
            obj.hide_viewport = hidden


def bean_views(scene, camera):
    """Mismo planteamiento que renders/grano_vistas.png: fondo gris y el grano en el origen."""
    hide_all_but({"GEO-grano", "GEO-cascarilla"})
    bean = bpy.data.objects["GEO-grano"]
    bean.location = (0.0, 0.0, 0.0)
    bean.rotation_mode = "XYZ"
    set_world(scene, 0.13, 1.0)
    lights = bpy.data.collections.new("COL-luz_grano")
    scene.collection.children.link(lights)
    add_area_light(lights, "LGT-a", (-0.16, -0.20, 0.20), (0, 0, 0), 0.16, 1.1, (1.0, 0.96, 0.92))
    add_area_light(lights, "LGT-b", (0.20, -0.12, 0.02), (0, 0, 0), 0.18, 0.35, (0.92, 0.95, 1.0))
    for name, turn in BEAN_VIEWS.items():
        bean.rotation_euler = (0.0, 0.0, turn)
        camera.location = (0.0, -BEAN_DISTANCE, 0.0)
        aim_at(camera, (0.0, 0.0, 0.0))
        render(scene, name)
    # Puntas: los polos de la esfera UV y la muesca son donde mas se notaria un fallo.
    bean.rotation_euler = (0.0, 0.0, 0.0)
    for name, position in (("check_grano_punta_sup", (0.0, -0.055, 0.075)), ("check_grano_punta_inf", (0.0, -0.055, -0.075))):
        camera.location = position
        aim_at(camera, (0.0, 0.0, 0.0))
        render(scene, name)
    bpy.data.batch_remove(list(lights.objects))
    bpy.data.collections.remove(lights)


def stage_shot(scene, camera, name, shot, visible, overrides):
    hide_all_but(visible)
    for object_name, z_value in overrides.items():
        bpy.data.objects[object_name].location.z = z_value
    position, target = shot
    camera.location = position
    aim_at(camera, target)
    render(scene, name)


def stage_views(scene, camera):
    set_world(scene, 0.04, 0.06)
    bean = bpy.data.objects["GEO-grano"]
    bean.rotation_euler = (math.radians(4.0), math.radians(-14.0), math.radians(6.0))
    bean.location = (0.0, 0.0, 0.140)
    lights = bpy.data.collections.new("COL-luz_escena")
    scene.collection.children.link(lights)
    build_lights(lights)
    for light in lights.objects:
        light.visible_camera = False  # en el control solo importan los assets
    stage = {"GEO-suelo", "GEO-pared"}
    stage_shot(scene, camera, "check_escena_base", SHOT_BASE,
               stage | {"GEO-base_piedra", "GEO-platillo", "GEO-grano", "GEO-cascarilla"}, {"GEO-platillo": 0.0445})
    bean.location.z = 0.105
    stage_shot(scene, camera, "check_escena_taza", SHOT_CUP,
               stage | {"GEO-platillo", "GEO-taza", "GEO-asa", "GEO-grano", "GEO-cascarilla"},
               {"GEO-platillo": 0.0, "GEO-taza": 0.00217, "GEO-asa": 0.00217})
    stage_shot(scene, camera, "check_taza_cerca", SHOT_INSIDE,
               stage | {"GEO-platillo", "GEO-taza", "GEO-asa"}, {})


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    configure_cycles(scene, SAMPLES)
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS_DIR, "cafe.glb"))
    scene.view_settings.view_transform = "AgX"  # el mismo de los renders aprobados
    camera = make_camera(scene)
    bean_views(scene, camera)
    stage_views(scene, camera)
    print("CHECK_OBJECTS", sorted(o.name for o in bpy.data.objects if o.type == "MESH"))


if __name__ == "__main__":
    main()
