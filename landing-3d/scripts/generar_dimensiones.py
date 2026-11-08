"""Genera src/logic/dimensions.generated.js desde blender/dimensions.py, sin retipear tablas.

Uso (desde landing-3d):  PYTHONDONTWRITEBYTECODE=1 python scripts/generar_dimensiones.py
No abre Blender ni escribe nada en la carpeta blender/.
"""
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "blender"))
OUTPUT = os.path.normpath(os.path.join(HERE, "..", "src", "logic", "dimensions.generated.js"))
sys.path.insert(0, BLENDER_DIR)

import dimensions  # noqa: E402

NAMES = (
    "ASSET_SCALE", "CUP_TOP", "CUP_SEAT", "CUP_INNER_FLOOR", "SAUCER_RADIUS", "SAUCER_TOP_Z",
    "SAUCER_WELL_FLOOR", "HANDLE_REACH", "HANDLE_BOTTOM_JOINT_Z", "CUP_OUTER", "CUP_INNER",
    "SAUCER_TOP", "PEDESTAL_TOP", "PEDESTAL_RADIUS", "PEDESTAL_PROFILE", "POOL_SURFACE",
    "GLAZE_LINE", "BEAN_HALF", "CAMERA_LENS", "HANDLE_PATH",
)


def main():
    lines = ["// GENERADO por scripts/generar_dimensiones.py desde blender/dimensions.py. No editar a mano.", ""]
    for name in NAMES:
        lines.append(f"export const {name} = {json.dumps(getattr(dimensions, name))};")
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines) + "\n")
    print(f"Escrito {OUTPUT}")


if __name__ == "__main__":
    main()
