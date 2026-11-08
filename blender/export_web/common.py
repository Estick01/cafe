"""Utilidades compartidas del pipeline web: rutas, Cycles en GPU, imagenes y bakes.

Los bakes y renders usan la GPU (OptiX, o CUDA si no hay OptiX) por decision del usuario:
es mas rapido. Solo se cae a CPU si no hay ninguna GPU compatible, y lo avisa.
"""
import json
import os
import sys
import time
from contextlib import contextmanager

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
PROJECT_DIR = os.path.dirname(BLENDER_DIR)
BAKE_DIR = os.path.join(HERE, "_bakes")
MODELS_DIR = os.path.join(PROJECT_DIR, "landing-3d", "assets", "models")
CHECKS_DIR = os.path.join(PROJECT_DIR, "landing-3d", "assets", "_checks")
TIMES_PATH = os.path.join(BAKE_DIR, "tiempos.json")

for path in (BLENDER_DIR, HERE):
    if path not in sys.path:
        sys.path.insert(0, path)
for folder in (BAKE_DIR, MODELS_DIR, CHECKS_DIR):
    os.makedirs(folder, exist_ok=True)

MARGIN_PIXELS = 16
FREE_THREADS = 2  # solo si no hay GPU: deja nucleos libres
GPU_BACKENDS = ("OPTIX", "CUDA")


def script_args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def empty_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new("COL-web")
    scene.collection.children.link(collection)
    return scene, collection


def _enable_gpu():
    """Activa OptiX (o CUDA) en Cycles; devuelve el tipo usado o None si no hay GPU."""
    preferences = bpy.context.preferences.addons["cycles"].preferences
    for backend in GPU_BACKENDS:
        try:
            preferences.compute_device_type = backend
        except TypeError:
            continue
        preferences.get_devices()
        gpus = [device for device in preferences.devices if device.type == backend]
        if gpus:
            for device in preferences.devices:
                device.use = device in gpus
            return backend
    return None


def configure_cycles(scene, samples):
    scene.render.engine = "CYCLES"
    cycles = scene.cycles
    backend = _enable_gpu()
    cycles.device = "GPU" if backend else "CPU"
    if backend is None:
        print("AVISO: no hay GPU compatible con Cycles; se usa la CPU", flush=True)
        scene.render.threads_mode = "FIXED"
        scene.render.threads = max(1, (os.cpu_count() or 4) - FREE_THREADS)
    cycles.samples = samples
    cycles.use_adaptive_sampling = False
    cycles.use_denoising = False
    print(f"CYCLES_DEVICE {cycles.device} {backend or ''}".strip(), flush=True)
    return cycles.device


def bake_path(name):
    return os.path.join(BAKE_DIR, f"{name}.png")


def new_target(name, size, non_color):
    image = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return image


def save_target(image):
    image.filepath_raw = bake_path(image.name)
    image.file_format = "PNG"
    image.save()


def set_bake_target(material, image):
    """Deja un nodo de imagen activo: es donde Cycles escribe el resultado."""
    tree = material.node_tree
    node = tree.nodes.get("BAKE-destino") or tree.nodes.new("ShaderNodeTexImage")
    node.name = "BAKE-destino"
    node.image = image
    tree.nodes.active = node


def _principled(tree):
    return next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")


@contextmanager
def socket_as_emission(materials, socket_name):
    """Enruta una entrada del Principled a emision: es el valor puro, sin luz ni SSS."""
    restore = []
    for material in materials:
        tree = material.node_tree
        output = next(n for n in tree.nodes if n.type == "OUTPUT_MATERIAL")
        original = output.inputs["Surface"].links[0].from_socket
        socket = _principled(tree).inputs[socket_name]
        emission = tree.nodes.new("ShaderNodeEmission")
        if socket.is_linked:
            tree.links.new(socket.links[0].from_socket, emission.inputs["Color"])
        else:
            value = socket.default_value
            emission.inputs["Color"].default_value = tuple(value) if hasattr(value, "__len__") else (value, value, value, 1.0)
        tree.links.new(emission.outputs[0], output.inputs["Surface"])
        restore.append((tree, output, original, emission))
    try:
        yield
    finally:
        for tree, output, original, emission in restore:
            tree.links.new(original, output.inputs["Surface"])
            tree.nodes.remove(emission)


def select_only(active, others=()):
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    for obj in others:
        obj.select_set(True)
    active.select_set(True)
    bpy.context.view_layer.objects.active = active


def record_time(label, seconds, detail):
    times = {}
    if os.path.exists(TIMES_PATH):
        with open(TIMES_PATH, encoding="utf-8") as handle:
            times = json.load(handle)
    updated = {**times, label: {"segundos": round(seconds, 1), "detalle": detail}}
    with open(TIMES_PATH, "w", encoding="utf-8") as handle:
        json.dump(updated, handle, indent=2)
    print(f"BAKE_TIME {label} {seconds:.1f}s {detail}")


def run_bake(label, image, bake_type, samples, cage=None, ray=None):
    """Lanza un bake. Con cage/ray es selected-to-active; el activo debe tener destino."""
    scene = bpy.context.scene
    scene.cycles.samples = samples
    arguments = {
        "type": bake_type,
        "margin": MARGIN_PIXELS,
        "margin_type": "EXTEND",
        "use_clear": True,
        "target": "IMAGE_TEXTURES",
        "use_selected_to_active": cage is not None,
    }
    if cage is not None:
        arguments.update(cage_extrusion=cage, max_ray_distance=ray)
    if bake_type == "NORMAL":
        arguments.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
    start = time.time()
    bpy.ops.object.bake(**arguments)
    save_target(image)
    record_time(label, time.time() - start, f"{image.size[0]}px {samples}spp {bake_type}")
