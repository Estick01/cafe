import bpy
result = {
    'objects': [{
        'name': o.name, 'location': list(o.location), 'dimensions': list(o.dimensions),
        'hidden': o.hide_render, 'modifiers': [m.type for m in o.modifiers],
        'materials': [m.name for m in o.data.materials] if hasattr(o.data, 'materials') else [],
    } for o in bpy.context.scene.objects],
    'collections': [(c.name, c.hide_render) for c in bpy.data.collections],
    'camera': bpy.context.scene.camera.name,
    'cycles': bpy.context.scene.cycles.device,
    'devices': [],
}
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.refresh_devices()
result['devices'] = [(d.name, d.type) for d in prefs.devices]
