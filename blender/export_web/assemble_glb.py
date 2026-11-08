"""Monta la escena ligera con los mapas horneados y exporta cafe.glb (sin Draco ni meshopt).

Pose exportada: la de timeline.pose_at(0). Los mapas van embebidos en JPEG, salvo el marmol,
que se escribe como JPEG aparte y queda referenciado por URI relativa dentro del glb.
"""
import json
import os
import struct
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from common import MODELS_DIR, bake_path, empty_scene  # noqa: E402
from lowpoly import (  # noqa: E402
    build_bean_low, build_chaff_low, build_cup_meshes, build_pedestal_low, build_set_planes, copy_handle_attribute,
)
from shader_utils import node_material  # noqa: E402
from timeline import pose_at  # noqa: E402

GLB_PATH = os.path.join(MODELS_DIR, "cafe.glb")
EMBEDDED_JPEG_QUALITY = 94
MARBLE_JPEG_QUALITY = 97
GLTF_MIRRORED_REPEAT = 33648
GLTF_LINEAR = 9729
GLTF_LINEAR_MIPMAP_LINEAR = 9987
MARBLE = {"MAT-marmol_suelo": "marmol_suelo", "MAT-marmol_pared": "marmol_pared"}
JSON_CHUNK = 0x4E4F534A


def _load(name, non_color):
    image = bpy.data.images.load(bake_path(name), check_existing=True)
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return image


def _image_node(tree, name, non_color):
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = _load(name, non_color)
    return node


def pbr_material(name, stem, roughness=None, coat=None, double_sided=False, has_normal=True):
    """Principled simple con los mapas horneados. El exportador lo traduce tal cual."""
    material, tree, bsdf = node_material(name)
    tree.links.new(_image_node(tree, f"{stem}_color", False).outputs["Color"], bsdf.inputs["Base Color"])
    if roughness is None:
        tree.links.new(_image_node(tree, f"{stem}_rough", True).outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = roughness
    if has_normal:
        normal = tree.nodes.new("ShaderNodeNormalMap")
        tree.links.new(_image_node(tree, f"{stem}_normal", True).outputs["Color"], normal.inputs["Color"])
        tree.links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    if coat is not None:
        bsdf.inputs["Coat Weight"].default_value = coat[0]
        bsdf.inputs["Coat Roughness"].default_value = coat[1]
    bsdf.inputs["Metallic"].default_value = 0.0
    material.use_backface_culling = not double_sided
    return material


def plain_material(name):
    """Marmol: el glb se parchea despues para apuntar a los JPEG externos."""
    material, _, bsdf = node_material(name)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Base Color"].default_value = (0.01, 0.01, 0.01, 1.0)
    material.use_backface_culling = True
    return material


def _link(collection, name, mesh):
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def build_scene_objects(collection):
    pose = pose_at(0.0)
    meshes = build_cup_meshes()
    copy_handle_attribute(meshes["handle"])
    saucer = _link(collection, "GEO-platillo", meshes["saucer"])
    cup = _link(collection, "GEO-taza", meshes["body"])
    handle = _link(collection, "GEO-asa", meshes["handle"])
    saucer.location.z = pose.saucer_z
    cup.location.z = pose.cup_z
    handle.location.z = pose.cup_z
    glaze = (0.28, 0.22)  # capa de esmalte de ceramic.py
    saucer.data.materials.append(pbr_material("MAT-ceramica_platillo", "ceramica", coat=glaze))
    cup.data.materials.append(pbr_material("MAT-ceramica_taza", "ceramica", coat=glaze, double_sided=True))
    handle.data.materials.append(pbr_material("MAT-ceramica_asa", "ceramica", coat=glaze, double_sided=True))

    bean = build_bean_low(collection)
    bean.location = (0.0, 0.0, pose.bean_z)
    bean.rotation_euler = pose.bean_rotation
    bean.data.materials.append(pbr_material("MAT-grano_tostado", "grano", coat=(0.28, 0.30)))
    chaff = build_chaff_low(collection)
    chaff.parent = bean
    chaff.data.materials.append(pbr_material("MAT-cascarilla", "cascarilla", roughness=0.62, double_sided=True))

    pedestal = build_pedestal_low(collection)
    pedestal.location.z = pose.pedestal_z
    pedestal.data.materials.append(pbr_material("MAT-piedra_base", "base_piedra", has_normal=False))

    floor, wall = build_set_planes(collection)
    floor.data.materials.append(plain_material("MAT-marmol_suelo"))
    wall.data.materials.append(plain_material("MAT-marmol_pared"))


def write_jpeg(source, path):
    """Copia los pixeles a una imagen nueva: guardar el original solo copiaria su PNG."""
    width, height = source.size
    pixels = [0.0] * (width * height * 4)
    source.pixels.foreach_get(pixels)
    target = bpy.data.images.new("TMP-jpeg", width, height, alpha=False)
    target.colorspace_settings.name = "Non-Color"
    target.pixels.foreach_set(pixels)
    target.file_format = "JPEG"
    target.filepath_raw = path
    target.save(quality=MARBLE_JPEG_QUALITY)
    bpy.data.images.remove(target)
    with open(path, "rb") as handle:
        if handle.read(2) != bytes((0xFF, 0xD8)):
            raise ValueError(f"{path} no es un JPEG")


def write_marble_files():
    for stem in MARBLE.values():
        for channel, non_color in (("color", False), ("rough", True)):
            write_jpeg(_load(f"{stem}_{channel}", non_color), os.path.join(MODELS_DIR, f"{stem}_{channel}.jpg"))


def export_glb():
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_attributes=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_image_quality=EMBEDDED_JPEG_QUALITY,
        export_draco_mesh_compression_enable=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
    )


def _marble_material_patch(document, stem):
    """Crea image, texture y material PBR para una textura de marmol externa."""
    samplers = document.setdefault("samplers", [])
    samplers.append({"magFilter": GLTF_LINEAR, "minFilter": GLTF_LINEAR_MIPMAP_LINEAR,
                     "wrapS": GLTF_MIRRORED_REPEAT, "wrapT": GLTF_MIRRORED_REPEAT, "name": f"espejo_{stem}"})
    sampler = len(samplers) - 1
    images, textures = document.setdefault("images", []), document.setdefault("textures", [])

    def texture_for(channel):
        images.append({"uri": f"{stem}_{channel}.jpg", "mimeType": "image/jpeg", "name": f"{stem}_{channel}"})
        textures.append({"source": len(images) - 1, "sampler": sampler})
        return {"index": len(textures) - 1}

    return {
        "baseColorTexture": texture_for("color"),
        "metallicRoughnessTexture": texture_for("rough"),
        "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
        "metallicFactor": 0.0,
        "roughnessFactor": 1.0,
    }


def patch_marble_uris():
    with open(GLB_PATH, "rb") as handle:
        data = handle.read()
    json_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != JSON_CHUNK:
        raise ValueError("El primer bloque del glb no es JSON")
    document = json.loads(data[20:20 + json_length])
    rest = data[20 + json_length:]
    for material in document["materials"]:
        if material["name"] in MARBLE:
            material["pbrMetallicRoughness"] = _marble_material_patch(document, MARBLE[material["name"]])
    text = json.dumps(document, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + len(rest)
    with open(GLB_PATH, "wb") as handle:
        handle.write(struct.pack("<III", 0x46546C67, 2, total))
        handle.write(struct.pack("<II", len(text), JSON_CHUNK))
        handle.write(text)
        handle.write(rest)


def main():
    _, collection = empty_scene()
    build_scene_objects(collection)
    write_marble_files()
    export_glb()
    patch_marble_uris()
    print(f"GLB_SIZE {os.path.getsize(GLB_PATH)}")


if __name__ == "__main__":
    main()
