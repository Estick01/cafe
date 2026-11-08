import bpy
obj=bpy.data.objects['GEO-coffee_bean']
mat=bpy.data.materials.new('MAT-coffee_roast_multiscale')
mat.use_nodes=True
n=mat.node_tree.nodes; l=mat.node_tree.links
bs=n.get('Principled BSDF'); bs.location=(800,150)
bs.inputs['IOR'].default_value=1.46
bs.inputs['Specular IOR Level'].default_value=0.32
bs.inputs['Coat Weight'].default_value=0.06
bs.inputs['Coat Roughness'].default_value=0.4
tex=n.new('ShaderNodeTexCoord'); tex.location=(-1100,100)
def noise(name,scale,detail,location):
    q=n.new('ShaderNodeTexNoise'); q.name=name; q.label=name; q.location=location
    q.inputs['Scale'].default_value=scale
    q.inputs['Detail'].default_value=detail
    q.inputs['Roughness'].default_value=0.7
    l.new(tex.outputs['Object'],q.inputs['Vector'])
    return q
roast=noise('Roast mottling',5.8,5,(-850,400))
fine=noise('Fine toasted speckles',83,3,(-850,150))
mix=n.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=0.38; mix.location=(-600,400)
l.new(roast.outputs['Fac'],mix.inputs[1]); l.new(fine.outputs['Fac'],mix.inputs[2])
ramp=n.new('ShaderNodeValToRGB'); ramp.location=(-370,430)
ramp.color_ramp.elements[0].position=0.12; ramp.color_ramp.elements[0].color=(0.035,0.010,0.004,1)
ramp.color_ramp.elements[1].position=0.75; ramp.color_ramp.elements[1].color=(0.245,0.110,0.045,1)
mid=ramp.color_ramp.elements.new(0.44); mid.color=(0.115,0.043,0.016,1)
l.new(mix.outputs[0],ramp.inputs[0])
attr=n.new('ShaderNodeAttribute'); attr.attribute_name='RoastCleft'; attr.location=(-350,170)
cleft=n.new('ShaderNodeMixRGB'); cleft.location=(330,400)
cleft.inputs[2].default_value=(0.012,0.008,0.005,1)
l.new(attr.outputs['Fac'],cleft.inputs[0]); l.new(ramp.outputs['Color'],cleft.inputs[1]); l.new(cleft.outputs[0],bs.inputs['Base Color'])
rough=n.new('ShaderNodeMapRange'); rough.location=(340,170)
rough.inputs['From Min'].default_value=0.15; rough.inputs['From Max'].default_value=0.85
rough.inputs['To Min'].default_value=0.32; rough.inputs['To Max'].default_value=0.56
l.new(roast.outputs['Fac'],rough.inputs['Value']); l.new(rough.outputs['Result'],bs.inputs['Roughness'])
mapping=n.new('ShaderNodeVectorMath'); mapping.operation='MULTIPLY'; mapping.location=(-850,-160); mapping.inputs[1].default_value=(1.0,1.0,2.6)
l.new(tex.outputs['Object'],mapping.inputs[0])
wrinkle=noise('Fine irregular skin wrinkles',38,4,(-610,-150))
l.new(mapping.outputs['Vector'],wrinkle.inputs['Vector'])
wrinkle.inputs['Distortion'].default_value=0.28
bump=n.new('ShaderNodeBump'); bump.location=(70,-100)
bump.inputs['Strength'].default_value=0.48; bump.inputs['Distance'].default_value=0.023
l.new(wrinkle.outputs['Fac'],bump.inputs['Height'])
pore=noise('Micro pores',195,2,(-550,-430))
micro=n.new('ShaderNodeBump'); micro.location=(400,-100)
micro.inputs['Strength'].default_value=0.28; micro.inputs['Distance'].default_value=0.004
l.new(pore.outputs['Fac'],micro.inputs['Height']); l.new(bump.outputs['Normal'],micro.inputs['Normal']); l.new(micro.outputs['Normal'],bs.inputs['Normal'])
obj.data.materials.clear(); obj.data.materials.append(mat)
result={'material':mat.name,'nodes':len(n),'coverage':'3D object coordinates across all front, back, side and cleft surfaces'}
