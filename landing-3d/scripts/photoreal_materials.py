import bpy
from pathlib import Path

ROOT = Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d')
material = bpy.data.materials.new('MAT-porcelana-esmaltada')
material.use_nodes = True
nodes, links = material.node_tree.nodes, material.node_tree.links
bsdf = nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = (0.63, 0.57, 0.46, 1)
bsdf.inputs['Roughness'].default_value = 0.23
bsdf.inputs['IOR'].default_value = 1.46
bsdf.inputs['Coat Weight'].default_value = 0.45
bsdf.inputs['Coat Roughness'].default_value = 0.13
bsdf.inputs['Subsurface Weight'].default_value = 0.025
bsdf.inputs['Subsurface Scale'].default_value = 0.001
coords = nodes.new('ShaderNodeTexCoord')
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 1250
noise.inputs['Detail'].default_value = 2
links.new(coords.outputs['Object'], noise.inputs['Vector'])
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = 0.12
bump.inputs['Distance'].default_value = 0.000018
links.new(noise.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
rough = nodes.new('ShaderNodeMapRange')
rough.inputs['To Min'].default_value = 0.19
rough.inputs['To Max'].default_value = 0.26
links.new(noise.outputs['Fac'], rough.inputs['Value'])
links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
for name in ('GEO-taza', 'GEO-platillo', 'GEO-asa'):
    obj = bpy.data.objects[name]
    obj.data.materials.clear()
    obj.data.materials.append(material)
scene = bpy.context.scene
scene.render.filepath = str(ROOT / 'production' / 'preview-empty.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'production' / 'cafe-natural.blend'))
bpy.ops.render.render(write_still=True)
result = {'preview': scene.render.filepath}
