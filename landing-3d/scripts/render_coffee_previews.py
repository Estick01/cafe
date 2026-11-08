"""Run after the bake; render review frames before enabling the website sequence."""
import bpy
import json
from pathlib import Path

ROOT = Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d')
scene = bpy.context.scene
domain = bpy.data.objects['GEO-cafe-simulado']
settings = domain.modifiers['Mantaflow cafe'].domain_settings
assert settings.has_cache_baked_data and settings.has_cache_baked_mesh, 'Simulacion incompleta'
frames = []
for frame in (1, 96, 168, 240):
    scene.frame_set(frame)
    scene.render.filepath = str(ROOT / 'production' / f'preview-{frame:04d}.png')
    bpy.ops.render.render(write_still=True)
    frames.append(scene.render.filepath)
report = {'status': 'awaiting_visual_review', 'frames': frames,
          'note': 'No activar la secuencia web sin revisar estos renders.'}
(ROOT / 'production' / 'preview-status.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
result = report
