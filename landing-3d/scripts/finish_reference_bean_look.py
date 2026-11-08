import bpy
mat=bpy.data.materials['MAT-coffee_roast_multiscale']
n=mat.node_tree.nodes; l=mat.node_tree.links
ramp=next(q for q in n if q.type=='VALTORGB')
for e in ramp.color_ramp.elements:
    c=e.color[:]; e.color=(c[0]*0.60,c[1]*0.45,c[2]*0.40,1)
n['Principled BSDF'].inputs['Specular IOR Level'].default_value=0.28
n['Principled BSDF'].inputs['Coat Weight'].default_value=0.03
# Add shallow, irregular cell edges beneath the fine pores.
tex=next(q for q in n if q.type=='TEX_COORD')
vor=n.new('ShaderNodeTexVoronoi'); vor.name='Roasted skin cellular relief'; vor.feature='DISTANCE_TO_EDGE'; vor.location=(-520,-660)
vor.inputs['Scale'].default_value=48
l.new(tex.outputs['Object'],vor.inputs['Vector'])
relief=n.new('ShaderNodeBump'); relief.name='Shallow cellular creases'; relief.location=(-40,-330)
relief.inputs['Strength'].default_value=0.18; relief.inputs['Distance'].default_value=0.014
l.new(vor.outputs['Distance'],relief.inputs['Height'])
bumps=[q for q in n if q.type=='BUMP' and q!=relief]
l.new(bumps[0].outputs['Normal'],relief.inputs['Normal'])
l.new(relief.outputs['Normal'],bumps[1].inputs['Normal'])
result={'look':'darker warmer roast, restrained specular and shallow cellular relief'}
