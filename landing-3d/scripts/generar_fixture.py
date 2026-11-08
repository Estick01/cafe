"""Genera test/fixtures/parity.json con la verdad de los modulos Python de blender/.

Uso (desde landing-3d):  PYTHONDONTWRITEBYTECODE=1 python scripts/generar_fixture.py
Importa timeline, liquid, steam y dimensions, que no dependen de Blender.
"""
import dataclasses
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "blender"))
OUTPUT = os.path.normpath(os.path.join(HERE, "..", "test", "fixtures", "parity.json"))
sys.path.insert(0, BLENDER_DIR)

import dimensions  # noqa: E402
import liquid  # noqa: E402
import steam  # noqa: E402
import timeline  # noqa: E402

# Instantes alrededor de cada cambio de fase, ademas de la rejilla de 24 fps.
EDGE_TIMES = (
    1.0, 1.42, 1.45, 1.9, 2.25, 2.3, 2.5, 2.55, 2.6, 3.0, 3.2, 4.15, 4.2, 4.25, 4.3, 4.4, 4.45, 4.5,
    4.6, 4.75, 4.8, 4.95, 5.0, 5.15, 5.2, 5.4, 5.55, 5.5999, 5.6, 5.75, 5.8, 6.1, 6.5, 6.8, 8.0, 8.3,
    8.0, 8.3, 8.4, 8.5, 8.6, 8.7, 8.7499, 8.75, 8.8,
)
PATH_STEP = 0.125
MESH_TIMES = (1.2, 2.0, 2.4, 3.5, 4.3, 4.6, 5.0, 5.4, 6.1, 7.0, 8.55)
DISC_TIMES = (1.6, 2.2, 3.0, 5.7, 6.2, 7.0, 8.5, 9.5)
STEAM_TIMES = (6.9, 7.5, 8.6, 9.8, 10.0)
SAMPLE_EVERY = 97  # submuestreo para que el fixture no pese demasiado


def all_times():
    grid = [frame / timeline.FPS for frame in range(timeline.TOTAL_FRAMES)]
    return sorted(set(grid + list(EDGE_TIMES) + [timeline.DURATION]))


def flat(vertices):
    return [component for vertex in vertices for component in vertex]


def sampled(vertices):
    return {str(index): list(vertices[index]) for index in range(0, len(vertices), SAMPLE_EVERY)}


def pose_record(pose):
    return dataclasses.asdict(pose)


def path_record(time):
    points = liquid.pour_path(timeline.pose_at(time))
    return {"time": time, "points": [[list(point[0]), point[1], point[2]] for point in points]}


def tube_record(time):
    points = liquid.pour_path(timeline.pose_at(time))
    vertices, faces = liquid.tube_mesh(points)
    return {"time": time, "vertices": flat(vertices), "faces": len(faces), "firstFaces": faces[:3], "lastFace": faces[-1] if faces else None}


def disc_record(time):
    pose = timeline.pose_at(time)
    pool_vertices, pool_faces = liquid.pool_mesh(pose)
    coffee_vertices, coffee_faces = liquid.coffee_mesh(pose)
    return {
        "time": time,
        "pool": {"count": len(pool_vertices), "faces": len(pool_faces), "samples": sampled(pool_vertices)},
        "coffee": {"count": len(coffee_vertices), "faces": len(coffee_faces), "samples": sampled(coffee_vertices)},
    }


def steam_record(time):
    vertices, faces, densities = steam.steam_mesh(timeline.pose_at(time))
    return {
        "time": time,
        "count": len(vertices),
        "faces": len(faces),
        "samples": sampled(vertices),
        "densities": {str(i): densities[i] for i in range(0, len(densities), SAMPLE_EVERY)},
    }


def radius_samples():
    heights = [index * 0.0008 for index in range(-2, 100)]
    radii = [index * 0.001 for index in range(0, 92)]
    return {
        "heights": heights,
        "outer": [dimensions.cup_outer_radius(h) for h in heights],
        "inner": [dimensions.cup_inner_radius(h) for h in heights],
        "radii": radii,
        "saucer": [dimensions.saucer_top_height(r) for r in radii],
    }


def main():
    path_times = sorted({index * PATH_STEP for index in range(int(timeline.DURATION / PATH_STEP) + 1)} | set(EDGE_TIMES))
    fixture = {
        "poses": [pose_record(timeline.pose_at(t)) for t in all_times()],
        "paths": [path_record(t) for t in path_times],
        "tubes": [tube_record(t) for t in MESH_TIMES],
        "discs": [disc_record(t) for t in DISC_TIMES],
        "steam": [steam_record(t) for t in STEAM_TIMES],
        "radii": radius_samples(),
        "outOfRange": [-0.01, timeline.DURATION + 0.01],
    }
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(fixture, handle, separators=(",", ":"))
    print(f"Escrito {OUTPUT}: {os.path.getsize(OUTPUT)} bytes, {len(fixture['poses'])} poses")


if __name__ == "__main__":
    main()
