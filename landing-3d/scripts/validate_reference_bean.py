import bpy, bmesh, json
from pathlib import Path
OUT=Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d/production/coffee-bean-reference')
obj=bpy.data.objects['GEO-coffee_bean']
bm=bmesh.new(); bm.from_mesh(obj.data)
report={'vertices':len(bm.verts),'faces':len(bm.faces),
        'boundary_edges':sum(e.is_boundary for e in bm.edges),
        'non_manifold_edges':sum(not e.is_manifold for e in bm.edges),
        'signed_volume_model_units':bm.calc_volume(signed=True),
        'dimensions_mm':[d*bpy.context.scene.unit_settings.scale_length*1000 for d in obj.dimensions],
        'material_coverage':'Procedural 3D object coordinates, all faces',
        'reference_camera_calibrated':False,
        'fine_details':'Procedural reconstruction; original textures unavailable'}
bm.free()
assert report['non_manifold_edges']==0,report
assert report['signed_volume_model_units']>0,report
(OUT/'validation').mkdir(exist_ok=True)
(OUT/'validation'/'geometry_report.json').write_text(json.dumps(report,indent=2))
result=report
