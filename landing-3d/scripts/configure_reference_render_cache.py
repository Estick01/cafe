import bpy, os, tempfile
from pathlib import Path
cache=Path(tempfile.gettempdir())/'codex-coffee-bean-gpu-cache'
for name in ('optix','cuda'):
    (cache/name).mkdir(parents=True,exist_ok=True)
os.environ['OPTIX_CACHE_PATH']=str(cache/'optix')
os.environ['CUDA_CACHE_PATH']=str(cache/'cuda')
bpy.context.scene.render.use_persistent_data=True
result={'optix_cache':os.environ['OPTIX_CACHE_PATH'],'cuda_cache':os.environ['CUDA_CACHE_PATH'],'persistent_render_data':True}
