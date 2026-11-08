import bpy
from pathlib import Path
ROOT=Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d')
old=bpy.data.objects['GEO-coffee_bean']
mat=old.data.materials[0]
old_mesh=old.data
bpy.data.objects.remove(old,do_unlink=True)
code=(ROOT/'scripts/create_reference_bean_geometry.py').read_text()
body=code[code.index('# A single closed surface:'):code.index('manifest=')]
env={'bpy':bpy,'collection':bpy.data.collections['COL-coffee_bean']}
import numpy as np
env['np']=np
exec(body,env)
obj=bpy.data.objects['GEO-coffee_bean']; obj.data.materials.append(mat)
if old_mesh.users==0: bpy.data.meshes.remove(old_mesh)
n=mat.node_tree.nodes
bs=n['Principled BSDF']; bs.inputs['Specular IOR Level'].default_value=0.42
bs.inputs['Coat Weight'].default_value=0.08
ramp=next(q for q in n if q.type=='VALTORGB')
for el,col in zip(ramp.color_ramp.elements,[(0.025,0.006,0.0025,1),(0.075,0.023,0.009,1),(0.17,0.067,0.027,1)]): el.color=col
rough=next(q for q in n if q.type=='MAP_RANGE')
rough.inputs['To Min'].default_value=0.26; rough.inputs['To Max'].default_value=0.44
cleft=next(q for q in n if q.type=='MIX_RGB' and q.blend_type=='MIX')
cleft.inputs[2].default_value=(0.018,0.010,0.006,1)
wr=n['Fine irregular skin wrinkles']; wr.inputs['Scale'].default_value=23; wr.inputs['Detail'].default_value=5
mapping=next(q for q in n if q.type=='VECT_MATH'); mapping.inputs[1].default_value=(1,1,1.7)
bumps=[q for q in n if q.type=='BUMP']
bumps[0].inputs['Distance'].default_value=0.035
bumps[1].inputs['Distance'].default_value=0.006
scene=bpy.context.scene
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=0.65
for name in ('LGT-key','LGT-fill','LGT-top'): bpy.data.lights[name].energy*=1.7
floor=bpy.data.materials['MAT-studio_white'].node_tree.nodes['Principled BSDF']
floor.inputs['Base Color'].default_value=(0.95,0.95,0.95,1)
# An emissive white sweep keeps the reference-style background bright without clipping the bean.
floor.inputs['Emission Color'].default_value=(1,1,1,1)
floor.inputs['Emission Strength'].default_value=0.5
scene.render.filepath=str(ROOT/'production/coffee-bean-reference/preview-refined.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'production/coffee-bean-reference/coffee-bean-reference.blend'))
result={'refined':obj.name,'render':scene.render.filepath}
