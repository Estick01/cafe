import bpy
bpy.ops.render.render(write_still=True)
result={'render':bpy.context.scene.render.filepath}
