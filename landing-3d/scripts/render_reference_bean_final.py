import bpy, json, os
from pathlib import Path
OUT=Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d/production/coffee-bean-reference')
scene=bpy.context.scene
scene.cycles.samples=192
scene.cycles.adaptive_threshold=0.012
scene.render.resolution_x=1600; scene.render.resolution_y=1900
scene.camera=bpy.data.objects['CAM-hero']
scene.render.filepath=str(OUT/'coffee-bean-hero.png')
obj=bpy.data.objects['GEO-coffee_bean']
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active=obj
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.shading.type='MATERIAL'; space.shading.use_scene_lights=True; space.shading.use_scene_world=True
            space.region_3d.view_distance=6.0
            space.region_3d.view_location=(0,0,1.62)
            space.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'coffee-bean-reference.blend'))
bpy.ops.render.render(write_still=True)
outputs=[str(OUT/'coffee-bean-hero.png')]
scene.cycles.samples=96
scene.render.resolution_x=900; scene.render.resolution_y=1100
for view in ('front','back','side'):
    scene.camera=bpy.data.objects['CAM-'+view]
    scene.render.filepath=str(OUT/f'coffee-bean-{view}.png')
    bpy.ops.render.render(write_still=True)
    outputs.append(scene.render.filepath)
scene.camera=bpy.data.objects['CAM-hero']
scene.render.resolution_x=1600; scene.render.resolution_y=1900
scene.cycles.samples=192; scene.render.filepath=str(OUT/'coffee-bean-hero.png')
result={'renders':outputs,'saved_blend':bpy.data.filepath}
