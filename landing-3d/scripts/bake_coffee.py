import bpy
from pathlib import Path
ROOT = Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d')
domain = bpy.data.objects['GEO-cafe-simulado']
bpy.ops.object.select_all(action='DESELECT')
domain.select_set(True)
bpy.context.view_layer.objects.active = domain
bpy.context.scene.frame_set(1)
data_result = bpy.ops.fluid.bake_data()
assert 'FINISHED' in data_result, str(data_result)
mesh_result = bpy.ops.fluid.bake_mesh()
assert 'FINISHED' in mesh_result, str(mesh_result)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'production' / 'cafe-natural.blend'))
result = {'data': list(data_result), 'mesh': list(mesh_result)}
