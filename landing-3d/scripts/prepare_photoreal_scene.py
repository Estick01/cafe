import bpy
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d')
OUT = ROOT / 'production'
OUT.mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT.parent / 'blender'))
from cup_asset import build_cup_parts

scene = bpy.context.scene
# Preserve the original objects in this working copy, hidden from the new shot.
archive = bpy.data.collections.new('COL-original-archived')
scene.collection.children.link(archive)
for name in ('GEO-taza', 'GEO-asa', 'GEO-platillo', 'GEO-grano', 'GEO-base_piedra'):
    obj = bpy.data.objects[name]
    obj.name = name + '-original'
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    archive.objects.link(obj)
archive.hide_render = True
archive.hide_viewport = True
collection = bpy.data.collections.new('COL-producto-realista')
scene.collection.children.link(collection)
saucer, cup, handle = build_cup_parts(collection, collection)
for obj in (saucer, cup, handle):
    sub = obj.modifiers.new('Acabado de ceramica', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 2

world = bpy.data.worlds.new('WORLD-estudio-realista')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.24, 0.25, 0.28, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.18
scene.world = world
camera = scene.camera
camera.location = (0.145, -0.40, 0.245)
target = Vector((0.005, 0, 0.052))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 62
camera.data.dof.use_dof = True
camera.data.dof.focus_distance = (target - camera.location).length
camera.data.dof.aperture_fstop = 8
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.refresh_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
scene.cycles.device = 'GPU'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.035
scene.cycles.max_bounces = 10
scene.cycles.transmission_bounces = 8
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.color_depth = '8'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'cafe-natural.blend'))
result = {'file': bpy.data.filepath, 'camera': camera.name, 'source': 'assets/coffeecup.blend'}
