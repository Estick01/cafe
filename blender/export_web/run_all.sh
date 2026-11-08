#!/bin/sh
# Regenera todos los assets web. Hornea siempre en CPU y de uno en uno; manifest.json va el ultimo.
set -e
cd "$(dirname "$0")"
BLENDER="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
export PYTHONDONTWRITEBYTECODE=1
rm -f ../../landing-3d/assets/models/manifest.json
for script in bake_bean.py bake_ceramic.py bake_stone.py assemble_glb.py verify_glb.py check_render.py; do
  "$BLENDER" --background --factory-startup --disable-autoexec --python-exit-code 1 --python "$script"
done
python write_manifest.py
