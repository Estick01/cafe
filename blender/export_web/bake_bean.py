"""Hornea grano y cascarilla de alta a baja (selected-to-active). Uso: ... -- [--preview]"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import (  # noqa: E402  (requiere la ruta anterior)
    configure_cycles, empty_scene, new_target, run_bake, script_args, select_only, set_bake_target, socket_as_emission,
)
from shader_utils import node_material  # noqa: E402
from lowpoly import build_bean_low, build_chaff_low  # noqa: E402
from bean_model import bean_material, build_bean  # noqa: E402

COLOR_SAMPLES = 16
NORMAL_SAMPLES = 16
ROUGH_SAMPLES = 4
BEAN_CAGE, BEAN_RAY = 0.0005, 0.0016  # metros: la baja se aparta menos de ~0.3 mm de la alta
CHAFF_CAGE, CHAFF_RAY = 0.0004, 0.0010  # las laminas distan > 1 mm: evita pisar otra capa


def bake_set(high, low, stem, sizes, cage, ray, with_rough):
    target, _, _ = node_material(f"MAT-destino_{stem}")
    low.data.materials.append(target)
    select_only(low, [high])
    high_materials = list(high.data.materials)

    color = new_target(f"{stem}_color", sizes[0], non_color=False)
    set_bake_target(target, color)
    with socket_as_emission(high_materials, "Base Color"):
        run_bake(f"{stem}_color", color, "EMIT", COLOR_SAMPLES, cage, ray)

    normal = new_target(f"{stem}_normal", sizes[0], non_color=True)
    set_bake_target(target, normal)
    run_bake(f"{stem}_normal", normal, "NORMAL", NORMAL_SAMPLES, cage, ray)

    if with_rough:
        rough = new_target(f"{stem}_rough", sizes[1], non_color=True)
        set_bake_target(target, rough)
        with socket_as_emission(high_materials, "Roughness"):
            run_bake(f"{stem}_rough", rough, "EMIT", ROUGH_SAMPLES, cage, ray)


def main():
    preview = "--preview" in script_args()
    bean_sizes = (512, 256) if preview else (2048, 1024)
    chaff_sizes = (512, 256) if preview else (1024, 512)
    suffix = "_prev" if preview else ""
    scene, collection = empty_scene()
    configure_cycles(scene, COLOR_SAMPLES)
    high_bean = build_bean(collection)
    high_bean.data.materials.append(bean_material())
    high_chaff = high_bean.children[0]
    high_bean.rotation_euler = (0.0, 0.0, 0.0)  # los dos juegos deben coincidir en el espacio
    scene.view_layers[0].update()
    bake_set(high_bean, build_bean_low(collection), f"grano{suffix}", bean_sizes, BEAN_CAGE, BEAN_RAY, True)
    bake_set(high_chaff, build_chaff_low(collection), f"cascarilla{suffix}", chaff_sizes, CHAFF_CAGE, CHAFF_RAY, False)


if __name__ == "__main__":
    main()
