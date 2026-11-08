"""Hornea marmol_suelo, marmol_pared y la base de piedra. Uso: ... -- [--preview]"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import (  # noqa: E402  (requiere la ruta anterior)
    configure_cycles, empty_scene, new_target, run_bake, script_args, select_only, set_bake_target, socket_as_emission,
)
from lowpoly import FLOOR_TILE, WALL_TILE, build_bake_plane, build_pedestal_low  # noqa: E402
from stone import FLOOR, PEDESTAL, WALL, stone_material  # noqa: E402

COLOR_SAMPLES = 12
ROUGH_SAMPLES = 4


def bake_surface(obj, material, stem, color_size, rough_size):
    obj.data.materials.append(material)
    select_only(obj)
    color = new_target(f"{stem}_color", color_size, non_color=False)
    set_bake_target(material, color)
    with socket_as_emission([material], "Base Color"):
        run_bake(f"{stem}_color", color, "EMIT", COLOR_SAMPLES)
    rough = new_target(f"{stem}_rough", rough_size, non_color=True)
    set_bake_target(material, rough)
    with socket_as_emission([material], "Roughness"):
        run_bake(f"{stem}_rough", rough, "EMIT", ROUGH_SAMPLES)


def main():
    preview = "--preview" in script_args()
    full, half = (1024, 256) if preview else (2048, 1024)
    marble_rough = half if preview else full
    suffix = "_prev" if preview else ""
    scene, collection = empty_scene()
    configure_cycles(scene, COLOR_SAMPLES)
    bake_surface(build_bake_plane(collection, "BAKE-suelo", FLOOR_TILE["size"]), stone_material("MAT-b_suelo", FLOOR),
                 f"marmol_suelo{suffix}", full, marble_rough)
    bake_surface(build_bake_plane(collection, "BAKE-pared", WALL_TILE["size"]), stone_material("MAT-b_pared", WALL),
                 f"marmol_pared{suffix}", full, marble_rough)
    bake_surface(build_pedestal_low(collection), stone_material("MAT-b_base", PEDESTAL),
                 f"base_piedra{suffix}", full, half)


if __name__ == "__main__":
    main()
