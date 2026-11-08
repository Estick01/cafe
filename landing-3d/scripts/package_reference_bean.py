import bpy, math
from pathlib import Path
ROOT=Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d')
refs=Path(r'C:/Users/ccsb1/OneDrive/Escritorio/grano de cafe')
collection=bpy.data.collections.new('COL-reference_photos (enable to compare)')
bpy.context.scene.collection.children.link(collection)
collection.hide_render=True; collection.hide_viewport=True
for index,(num,label) in enumerate(((2,'front'),(7,'back'),(11,'side'),(18,'wireframe'))):
    image=bpy.data.images.load(str(refs/f'cafe ({num}).png'),check_existing=True)
    image.pack()
    obj=bpy.data.objects.new('REF-'+label,None); collection.objects.link(obj)
    obj.empty_display_type='IMAGE'; obj.data=image; obj.empty_display_size=3.2
    obj.rotation_euler=(math.pi/2,0,0); obj.location=(4+index*3.3,0,1.62)
    obj.hide_render=True
text=bpy.data.texts.get('LEEME - grano de cafe') or bpy.data.texts.new('LEEME - grano de cafe')
text.clear()
text.write('GRANO DE CAFE - RECONSTRUCCION DESDE REFERENCIAS\n\n'
    'Objeto editable: GEO-coffee_bean.\n'
    'Material procedural: MAT-coffee_roast_multiscale.\n'
    'Camara principal: CAM-hero; alternativas CAM-front, CAM-back y CAM-side.\n'
    'Motor: Cycles GPU. OptiX / RTX 5070 usado para los renders entregados.\n'
    'Las fotos originales de referencia estan empaquetadas en COL-reference_photos.\n'
    'Activa su visibilidad para compararlas. No aparecen en el render.\n'
    'Escala de trabajo: 1 unidad = 4 mm; longitud nominal 12.8 mm.\n'
    'La forma y las texturas son una reconstruccion aproximada, no la malla original.\n')
result={'packed_references':4,'readme':text.name}
