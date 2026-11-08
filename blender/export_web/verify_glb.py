"""Lee cafe.glb a mano (sin importador) y vuelca las medidas reales a _bakes/medidas.json.

Se ejecuta con el Python de Blender por numpy. Falla si falta algo de lo prometido.
"""
import json
import os
import struct
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(os.path.dirname(HERE))

import numpy as np  # noqa: E402

GLB_PATH = os.path.join(PROJECT, "landing-3d", "assets", "models", "cafe.glb")
OUT_PATH = os.path.join(HERE, "_bakes", "medidas.json")
COMPONENTS = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
EXPECTED = ("GEO-platillo", "GEO-taza", "GEO-asa", "GEO-grano", "GEO-cascarilla", "GEO-base_piedra", "GEO-suelo", "GEO-pared")
EPSILON = 1e-5


def read_glb(path):
    with open(path, "rb") as handle:
        data = handle.read()
    magic, _, total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or total != len(data):
        raise ValueError("Cabecera de glb invalida")
    json_length, _ = struct.unpack_from("<II", data, 12)
    document = json.loads(data[20:20 + json_length])
    offset = 20 + json_length
    bin_length, _ = struct.unpack_from("<II", data, offset)
    return document, data[offset + 8:offset + 8 + bin_length]


def accessor_array(document, binary, index):
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    dtype = COMPONENTS[accessor["componentType"]]
    width = WIDTHS[accessor["type"]]
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", np.dtype(dtype).itemsize * width)
    if stride != np.dtype(dtype).itemsize * width:
        raise ValueError("Este verificador no admite datos intercalados")
    return np.frombuffer(binary, dtype=dtype, count=accessor["count"] * width, offset=start).reshape(-1, width)


def node_matrix(node):
    matrix = np.eye(4)
    if "matrix" in node:
        return np.array(node["matrix"]).reshape(4, 4).T
    x, y, z, w = node.get("rotation", (0.0, 0.0, 0.0, 1.0))
    matrix[:3, :3] = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]) @ np.diag(node.get("scale", (1.0, 1.0, 1.0)))
    matrix[:3, 3] = node.get("translation", (0.0, 0.0, 0.0))
    return matrix


def world_matrices(document):
    matrices = {}

    def visit(index, parent):
        matrix = parent @ node_matrix(document["nodes"][index])
        matrices[index] = matrix
        for child in document["nodes"][index].get("children", ()):
            visit(child, matrix)

    for root in document["scenes"][document.get("scene", 0)]["nodes"]:
        visit(root, np.eye(4))
    return matrices


def primitive_stats(document, binary, primitive):
    positions = accessor_array(document, binary, primitive["attributes"]["POSITION"]).astype(np.float64)
    triangles = document["accessors"][primitive["indices"]]["count"] // 3 if "indices" in primitive else len(positions) // 3
    return positions, triangles


def round_list(values):
    return [round(float(value), 5) for value in values]


def measure_node(document, binary, index, matrices):
    node = document["nodes"][index]
    mesh = document["meshes"][node["mesh"]]
    all_positions, triangles = [], 0
    for primitive in mesh["primitives"]:
        positions, count = primitive_stats(document, binary, primitive)
        all_positions.append(positions)
        triangles += count
    positions = np.concatenate(all_positions)
    world = (matrices[index][:3, :3] @ positions.T).T + matrices[index][:3, 3]
    primitive = mesh["primitives"][0]
    material = document["materials"][primitive["material"]]
    return {
        "triangles": triangles,
        "vertices": len(positions),
        "attributes": sorted(primitive["attributes"]),
        "material": material["name"],
        "doubleSided": bool(material.get("doubleSided", False)),
        "translation": round_list(node.get("translation", (0, 0, 0))),
        "rotation_xyzw": round_list(node.get("rotation", (0, 0, 0, 1))),
        "bbox_local": {"min": round_list(positions.min(0)), "max": round_list(positions.max(0))},
        "bbox_world_export_pose": {"min": round_list(world.min(0)), "max": round_list(world.max(0))},
    }


def check_handle(document, binary, node):
    primitive = document["meshes"][node["mesh"]]["primitives"][0]
    name = "_ASA_AVANCE"
    if name not in primitive["attributes"]:
        raise ValueError(f"Falta {name} en GEO-asa: {sorted(primitive['attributes'])}")
    index = primitive["attributes"][name]
    values = accessor_array(document, binary, index).ravel()
    heights = accessor_array(document, binary, primitive["attributes"]["POSITION"])[:, 1]
    low_end = float(heights[values <= values.min() + EPSILON].mean())
    high_end = float(heights[values >= values.max() - EPSILON].mean())
    if abs(values.min()) > EPSILON or abs(values.max() - 1.0) > EPSILON:
        raise ValueError(f"Rango de {name} fuera de 0..1: {values.min()}..{values.max()}")
    if low_end >= high_end:
        raise ValueError(f"{name} va al reves: y(0)={low_end} y(1)={high_end}")
    accessor = document["accessors"][index]
    return {
        "accessor": index,
        "componentType": accessor["componentType"],
        "type": accessor["type"],
        "count": accessor["count"],
        "declared_min": accessor.get("min"),
        "declared_max": accessor.get("max"),
        "real_min": float(values.min()),
        "real_max": float(values.max()),
        "local_y_at_0": round(low_end, 5),
        "local_y_at_1": round(high_end, 5),
    }


def image_sizes(document):
    sizes = []
    for image in document.get("images", ()):
        length = document["bufferViews"][image["bufferView"]]["byteLength"] if "bufferView" in image else None
        sizes.append({"name": image.get("name"), "mimeType": image.get("mimeType"), "uri": image.get("uri"), "embedded_bytes": length})
    return sizes


def main():
    document, binary = read_glb(GLB_PATH)
    matrices = world_matrices(document)
    by_name = {node.get("name"): index for index, node in enumerate(document["nodes"])}
    missing = [name for name in EXPECTED if name not in by_name]
    if missing:
        raise ValueError(f"Faltan objetos: {missing}")
    grain = document["nodes"][by_name["GEO-grano"]]
    if by_name["GEO-cascarilla"] not in grain.get("children", ()):
        raise ValueError("GEO-cascarilla no es hija de GEO-grano")
    result = {
        "objects": {name: measure_node(document, binary, by_name[name], matrices) for name in EXPECTED},
        "handle_attribute": check_handle(document, binary, document["nodes"][by_name["GEO-asa"]]),
        "images": image_sizes(document),
        "extensionsUsed": document.get("extensionsUsed", []),
        "extensionsRequired": document.get("extensionsRequired", []),
        "materials": document["materials"],
        "textures": document.get("textures", []),
        "samplers": document.get("samplers", []),
    }
    with open(OUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=1)
    for name, stats in result["objects"].items():
        print("OBJ", name, stats["triangles"], stats["vertices"], stats["attributes"], stats["material"], stats["doubleSided"])
        print("   t", stats["translation"], "r", stats["rotation_xyzw"], "local", stats["bbox_local"])
    print("ASA", result["handle_attribute"])
    print("EXT", result["extensionsUsed"], result["extensionsRequired"])
    for image in result["images"]:
        print("IMG", image)


if __name__ == "__main__":
    main()
