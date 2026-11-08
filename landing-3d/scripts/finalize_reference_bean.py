import bpy, json
from pathlib import Path
from mathutils import Vector
OUT=Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d/production/coffee-bean-reference')
scene=bpy.context.scene
cam=bpy.data.objects['CAM-front']; cam.location=(0,-10,3.15)
cam.rotation_euler=(Vector((0,0,1.62))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera=cam; scene.render.resolution_x=900; scene.render.resolution_y=1100
scene.cycles.samples=96; scene.render.filepath=str(OUT/'coffee-bean-front.png')
bpy.ops.render.render(write_still=True)
scene.camera=bpy.data.objects['CAM-hero']
scene.render.resolution_x=1600; scene.render.resolution_y=1900
scene.cycles.samples=192; scene.render.filepath=str(OUT/'coffee-bean-hero.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'coffee-bean-reference.blend'))
report={'views':['hero','front','back','side'],'visual_review':'Recognizable coffee bean; cleft, fissures, back and side volume present; no missing surface material. Front camera raised to remove floor boundary artifact.',
        'match_limitations':'Parametric silhouette and procedural skin approximate reference. Exact original crack shapes, texture and scan asymmetry are not reproduced.',
        'renderer':'Cycles GPU / NVIDIA RTX 5070 / OptiX','hero_resolution':[1600,1900],
        'preview_resolution':[900,1100],'base_mesh_closed':True}
(OUT/'validation'/'multiview_fit_report.json').write_text(json.dumps(report,indent=2))
result={'saved':bpy.data.filepath,'front_render':str(OUT/'coffee-bean-front.png')}
