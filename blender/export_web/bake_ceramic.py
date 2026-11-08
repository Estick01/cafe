"""Hornea la ceramica en el atlas unico que ya traen las UV del archivo del usuario.

Las UV originales no se solapan y reparten las tres piezas en 0..1 (platillo a la derecha,
taza a la izquierda, asa en el centro), asi que las tres comparten imagen. Se hornea con el
material sin recortes: la taza y el asa quedan totalmente opacas.
"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import (  # noqa: E402  (requiere la ruta anterior)
    configure_cycles, empty_scene, new_target, run_bake, script_args, select_only, set_bake_target, socket_as_emission,
)
from ceramic import ceramic_material  # noqa: E402
from lowpoly import build_ceramic_bake_object, build_cup_meshes  # noqa: E402

COLOR_SAMPLES = 16
NORMAL_SAMPLES = 16
ROUGH_SAMPLES = 4


def main():
    preview = "--preview" in script_args()
    full, half = (512, 256) if preview else (2048, 1024)
    stem = "ceramica_prev" if preview else "ceramica"
    scene, collection = empty_scene()
    configure_cycles(scene, COLOR_SAMPLES)
    obj = build_ceramic_bake_object(build_cup_meshes(), collection)
    material = ceramic_material("MAT-ceramica_bake")
    obj.data.materials.append(material)
    select_only(obj)

    color = new_target(f"{stem}_color", full, non_color=False)
    set_bake_target(material, color)
    with socket_as_emission([material], "Base Color"):
        run_bake(f"{stem}_color", color, "EMIT", COLOR_SAMPLES)

    normal = new_target(f"{stem}_normal", full, non_color=True)
    set_bake_target(material, normal)
    run_bake(f"{stem}_normal", normal, "NORMAL", NORMAL_SAMPLES)

    rough = new_target(f"{stem}_rough", half, non_color=True)
    set_bake_target(material, rough)
    with socket_as_emission([material], "Roughness"):
        run_bake(f"{stem}_rough", rough, "EMIT", ROUGH_SAMPLES)


if __name__ == "__main__":
    main()
