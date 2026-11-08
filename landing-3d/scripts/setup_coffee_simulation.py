import bpy
import bmesh
from pathlib import Path
from mathutils import Vector

ROOT = Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d')
scene = bpy.context.scene
scene.frame_start, scene.frame_end, scene.render.fps = 1, 240, 24
scene.frame_set(1)
scene.gravity = (0, 0, -9.81)
camera = scene.camera
target = Vector((0.005, 0, 0.04))
camera.location = (0.17, -0.46, 0.285)
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.dof.focus_distance = (target - camera.location).length

stone = bpy.data.materials.new('MAT-pierre-satin')
stone.use_nodes = True
n, l = stone.node_tree.nodes, stone.node_tree.links
p = n.get('Principled BSDF')
p.inputs['Base Color'].default_value = (0.027, 0.022, 0.019, 1)
p.inputs['Roughness'].default_value = 0.52
noise = n.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 230
bump = n.new('ShaderNodeBump')
bump.inputs['Distance'].default_value = 0.00008
bump.inputs['Strength'].default_value = 0.15
l.new(noise.outputs['Fac'], bump.inputs['Height'])
l.new(bump.outputs['Normal'], p.inputs['Normal'])
for name in ('GEO-suelo', 'GEO-pared'):
    bpy.data.objects[name].data.materials.clear()
    bpy.data.objects[name].data.materials.append(stone)

cup = bpy.data.objects['GEO-taza']
bm = bmesh.new()
bm.from_mesh(cup.data)
boundary_count = sum(e.is_boundary for e in bm.edges)
bm.free()
assert boundary_count == 0, f'La taza no esta cerrada: {boundary_count} aristas'
collision = cup.modifiers.new('Colision del cafe', 'FLUID')
collision.fluid_type = 'EFFECTOR'
collision.effector_settings.surface_distance = 0.001

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.091))
domain = bpy.context.object
domain.name = 'GEO-cafe-simulado'
domain.dimensions = (0.128, 0.128, 0.18)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
modifier = domain.modifiers.new('Mantaflow cafe', 'FLUID')
modifier.fluid_type = 'DOMAIN'
settings = modifier.domain_settings
settings.domain_type = 'LIQUID'
settings.resolution_max = 144
settings.cache_type = 'MODULAR'
settings.cache_directory = str(ROOT / 'production' / 'fluid-cache')
settings.cache_frame_start = 1
settings.cache_frame_end = 240
settings.cache_data_format = 'UNI'
settings.use_mesh = True
settings.mesh_scale = 2
settings.mesh_particle_radius = 1.5
settings.timesteps_max = 16
settings.timesteps_min = 1
settings.flip_ratio = 0.85
settings.surface_tension = 0.3
for face in domain.data.polygons:
    face.use_smooth = True

coffee = bpy.data.materials.new('MAT-cafe-absorption')
coffee.use_nodes = True
n, l = coffee.node_tree.nodes, coffee.node_tree.links
p = n.get('Principled BSDF')
p.inputs['Base Color'].default_value = (0.12, 0.042, 0.012, 1)
p.inputs['Roughness'].default_value = 0.095
p.inputs['IOR'].default_value = 1.333
p.inputs['Transmission Weight'].default_value = 0.76
volume = n.new('ShaderNodeVolumeAbsorption')
volume.inputs['Color'].default_value = (0.32, 0.10, 0.02, 1)
volume.inputs['Density'].default_value = 160
l.new(volume.outputs['Volume'], n.get('Material Output').inputs['Volume'])
domain.data.materials.append(coffee)

bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.0031, depth=0.008, location=(-0.009, 0.003, 0.166))
source = bpy.context.object
source.name = 'GEO-emisor-cafe'
source.hide_render = True
flow = source.modifiers.new('Vertido natural', 'FLUID')
flow.fluid_type = 'FLOW'
f = flow.flow_settings
f.flow_type, f.flow_behavior = 'LIQUID', 'INFLOW'
f.use_initial_velocity = True
f.velocity_coord = (0.02, 0, -1.5)
f.surface_distance = 0
for frame, enabled in ((1, False), (48, False), (49, True), (180, True), (181, False), (240, False)):
    f.use_inflow = enabled
    f.keyframe_insert(data_path='use_inflow', frame=frame)
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'production' / 'cafe-natural.blend'))
result = {'closed_cup': boundary_count == 0, 'resolution': settings.resolution_max,
          'cache': settings.cache_directory, 'frames': scene.frame_end}
