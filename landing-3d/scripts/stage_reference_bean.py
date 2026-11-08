import bpy, json
from pathlib import Path
from mathutils import Vector
import os, tempfile
cache=Path(tempfile.gettempdir())/'codex-coffee-bean-gpu-cache'
for cache_name in ('optix','cuda'): (cache/cache_name).mkdir(parents=True,exist_ok=True)
os.environ['OPTIX_CACHE_PATH']=str(cache/'optix')
os.environ['CUDA_CACHE_PATH']=str(cache/'cuda')
OUT=Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d/production/coffee-bean-reference')
scene=bpy.context.scene
world=bpy.data.worlds.new('World-neutral_studio'); scene.world=world; world.use_nodes=True
world.node_tree.nodes.clear()
bg=world.node_tree.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value=(0.8,0.8,0.8,1); bg.inputs['Strength'].default_value=0.35
out=world.node_tree.nodes.new('ShaderNodeOutputWorld'); world.node_tree.links.new(bg.outputs[0],out.inputs[0])
studio=bpy.data.collections.new('COL-studio'); scene.collection.children.link(studio)
def link(o): studio.objects.link(o); return o
def aim(o): o.rotation_euler=(Vector((0,0,1.62))-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,pos,energy,size):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    o=link(bpy.data.objects.new(name,data)); o.location=pos; aim(o)
area('LGT-key',(-3.6,-4.0,6.0),420,4.0)
area('LGT-fill',(4,-2.2,3.8),150,3.0)
area('LGT-top',(0.6,2.8,6),240,3.0)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0.015))
floor=bpy.context.object; floor.name='GEO-studio_floor'
for c in list(floor.users_collection): c.objects.unlink(floor)
studio.objects.link(floor)
mat=bpy.data.materials.new('MAT-studio_white'); mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.82,0.82,0.82,1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=0.8
floor.data.materials.append(mat)
views={'hero':(1.4,-9,3.5),'front':(0,-10,1.75),'back':(-0.8,10,2.8),'side':(9,-2,2.8)}
for name,pos in views.items():
    data=bpy.data.cameras.new('CAM-'+name); data.type='ORTHO'; data.ortho_scale=4.3; data.lens=85
    cam=link(bpy.data.objects.new('CAM-'+name,data)); cam.location=pos; aim(cam)
scene.camera=bpy.data.objects['CAM-hero']
scene.render.engine='CYCLES'
scene.render.use_persistent_data=True
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX'; prefs.refresh_devices()
for device in prefs.devices: device.use=device.type=='OPTIX'
assert any(d.type=='OPTIX' and d.use for d in prefs.devices),'OptiX GPU unavailable'
scene.cycles.device='GPU'; scene.cycles.samples=64
scene.cycles.use_denoising=True; scene.cycles.denoiser='OPTIX'
scene.cycles.use_adaptive_sampling=True; scene.cycles.adaptive_threshold=0.025
scene.cycles.max_bounces=8
scene.render.resolution_x=900; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.render.filepath=str(OUT/'preview-hero.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'coffee-bean-reference.blend'))
result={'blend':bpy.data.filepath,'devices':[(d.name,d.type,d.use) for d in prefs.devices],'camera':scene.camera.name}
