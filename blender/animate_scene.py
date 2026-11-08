"""Renderiza la animacion de la taza fotograma a fotograma.

Uso:
  blender --background --factory-startup --python animate_scene.py -- \
      --out CARPETA [--samples N] [--res WxH] [--step N] [--start N] [--end N] [--resume]

El cafe se regenera en cada fotograma desde timeline.py y liquid.py, asi que el
movimiento del liquido vive en estos scripts y no en keyframes del .blend.
"""
import argparse
import os
import sys
import time as clock

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import build_scene  # noqa: E402
import ceramic  # noqa: E402
import liquid  # noqa: E402
import steam  # noqa: E402
import timeline  # noqa: E402

STEAM_OPACITY = 0.20
STEAM_GLOW = 0.55
STEAM_RISE_SPEED = 0.012  # metros por segundo: un ascenso lento, sin presion
# No llamarlo "density": Cycles reserva ese nombre para volumenes y el shader recibe cero.
STEAM_ATTRIBUTE = "vapor_densidad"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--res", default="640x360")
    parser.add_argument("--step", type=int, default=1)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int, default=timeline.TOTAL_FRAMES - 1)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--rest", type=float, default=0.0, help="segundos de descanso entre fotogramas")
    args = parser.parse_args(argv)
    if args.step < 1 or not 0 <= args.start <= args.end < timeline.TOTAL_FRAMES:
        raise ValueError(f"Rango de fotogramas invalido: {args}")
    return args


def coffee_material(name, with_crema=False):
    material, tree, bsdf = build_scene.node_material(name)
    nodes, links = tree.nodes, tree.links
    bsdf.inputs["Base Color"].default_value = (0.026, 0.007, 0.002, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.12
    bsdf.inputs["Coat Weight"].default_value = 0.5
    bsdf.inputs["Coat Roughness"].default_value = 0.05
    if with_crema:
        _add_crema(nodes, links, bsdf)
    return material


def _add_crema(nodes, links, bsdf):
    """Manchas de crema tostada sobre la superficie, deformadas por ruido."""
    coords = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 42.0
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Distortion"].default_value = 1.1
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.52
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (0.020, 0.0055, 0.0016, 1.0)
    mix.inputs["B"].default_value = (0.17, 0.070, 0.022, 1.0)
    links.new(ramp.outputs["Color"], mix.inputs["Factor"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    roughness = nodes.new("ShaderNodeMapRange")
    roughness.inputs["To Min"].default_value = 0.08
    roughness.inputs["To Max"].default_value = 0.42
    links.new(ramp.outputs["Color"], roughness.inputs["Value"])
    links.new(roughness.outputs["Result"], bsdf.inputs["Roughness"])


def steam_material():
    """Opacidad = densidad del hilo x ruido animado, para que no se vea como una lamina."""
    material = bpy.data.materials.new("MAT-vapor")
    material.use_nodes = True
    tree = material.node_tree
    nodes, links = tree.nodes, tree.links
    for node in list(nodes):
        if node.type == "BSDF_PRINCIPLED":
            nodes.remove(node)
    output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    density = nodes.new("ShaderNodeAttribute")
    density.attribute_name = STEAM_ATTRIBUTE
    coords = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.name = "vapor_ruido"
    noise.inputs["Scale"].default_value = 38.0
    noise.inputs["Detail"].default_value = 2.5
    noise.inputs["Distortion"].default_value = 0.35
    # El ruido sube despacio con el vapor, en lugar de quedarse quieto.
    rising = nodes.new("ShaderNodeMapping")
    rising.name = "vapor_subida"
    links.new(coords.outputs["Object"], rising.inputs["Vector"])
    links.new(rising.outputs["Vector"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.22
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    combined = nodes.new("ShaderNodeMath")
    combined.operation = "MULTIPLY"
    links.new(density.outputs["Fac"], combined.inputs[0])
    links.new(ramp.outputs["Color"], combined.inputs[1])
    opacity = nodes.new("ShaderNodeMath")
    opacity.operation = "MULTIPLY"
    opacity.use_clamp = True
    opacity.inputs[1].default_value = STEAM_OPACITY
    links.new(combined.outputs[0], opacity.inputs[0])
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    glow = nodes.new("ShaderNodeEmission")
    glow.inputs["Color"].default_value = (0.95, 0.92, 0.87, 1.0)
    glow.inputs["Strength"].default_value = STEAM_GLOW
    mix_shader = nodes.new("ShaderNodeMixShader")
    links.new(opacity.outputs[0], mix_shader.inputs[0])
    links.new(transparent.outputs[0], mix_shader.inputs[1])
    links.new(glow.outputs[0], mix_shader.inputs[2])
    links.new(mix_shader.outputs[0], output.inputs["Surface"])
    return material


def build_steam(collection):
    """El vapor solo se ve de frente: no proyecta sombras ni aparece en reflejos."""
    obj = add_liquid_object("GEO-vapor", steam_material(), collection)
    obj.visible_shadow = False
    obj.visible_diffuse = False
    obj.visible_glossy = False
    return obj


def update_steam(obj, pose):
    vertices, faces, densities = steam.steam_mesh(pose)
    update_mesh(obj, (vertices, faces))
    if faces:
        attribute = obj.data.attributes.new(STEAM_ATTRIBUTE, "FLOAT", "POINT")
        attribute.data.foreach_set("value", densities)
    nodes = obj.data.materials[0].node_tree.nodes
    nodes["vapor_ruido"].inputs["W"].default_value = pose.time * 0.08
    nodes["vapor_subida"].inputs["Location"].default_value = (0.0, 0.0, -pose.time * STEAM_RISE_SPEED)


def add_liquid_object(name, material, collection):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    return obj


def build_liquids():
    collection = build_scene.new_collection(bpy.context.scene, "COL-cafe")
    stream_material = coffee_material("MAT-cafe_chorro")
    surface_material = coffee_material("MAT-cafe_superficie", with_crema=True)
    return {
        "pour": add_liquid_object("GEO-chorro", stream_material, collection),
        "pool": add_liquid_object("GEO-charco", stream_material, collection),
        "coffee": add_liquid_object("GEO-cafe", surface_material, collection),
        "steam": build_steam(collection),
    }


def update_mesh(obj, geometry):
    """Reemplaza la malla; sin geometria, oculta el objeto para no calcularlo."""
    vertices, faces = geometry
    mesh = obj.data
    mesh.clear_geometry()
    obj.hide_render = not faces
    if faces:
        mesh.from_pydata(vertices, [], faces)
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        mesh.update()


def apply_pose(scene, liquids, pose):
    objects = bpy.data.objects
    objects["GEO-platillo"].location.z = pose.saucer_z
    objects["GEO-base_piedra"].location.z = pose.pedestal_z
    objects["GEO-base_piedra"].hide_render = not pose.pedestal_visible
    objects["GEO-taza"].location.z = pose.cup_z
    handle = objects["GEO-asa"]
    handle.location.z = pose.cup_z
    # El asa crece a lo largo de su arco desde la union inferior (atributo asa_avance).
    clip = bpy.data.materials["MAT-ceramica_asa"].node_tree.nodes[ceramic.HANDLE_CLIP_NODE]
    clip.outputs[0].default_value = ceramic.handle_clip_value(pose.handle_growth)
    handle.hide_render = pose.handle_growth <= 0.001
    objects["GEO-grano"].location = (0.0, 0.0, pose.bean_z)
    objects["GEO-grano"].rotation_euler = pose.bean_rotation
    reveal = bpy.data.materials["MAT-ceramica_taza"].node_tree.nodes["reveal"]
    reveal.outputs[0].default_value = pose.reveal

    update_mesh(liquids["pour"], liquid.tube_mesh(liquid.pour_path(pose)))
    update_mesh(liquids["pool"], liquid.pool_mesh(pose))
    update_mesh(liquids["coffee"], liquid.coffee_mesh(pose))
    liquids["coffee"].rotation_euler.z = pose.time * 0.45
    update_steam(liquids["steam"], pose)

    camera = scene.camera
    camera.location = pose.camera_position
    build_scene.aim_at(camera, pose.camera_target)
    camera.data.dof.focus_distance = (Vector(pose.camera_target) - Vector(pose.camera_position)).length
    bpy.context.view_layer.update()


def main():
    args = parse_args()
    width, height = (int(v) for v in args.res.lower().split("x"))
    scene = build_scene.build_all(args.samples, width, height)
    scene.render.use_persistent_data = True
    scene.render.fps = timeline.FPS
    scene.cycles.transparent_max_bounces = 24  # los hilos de vapor se superponen
    liquids = build_liquids()
    os.makedirs(args.out, exist_ok=True)

    frames = range(args.start, args.end + 1, args.step)
    started = clock.time()
    for done, frame in enumerate(frames, 1):
        path = os.path.join(args.out, f"f_{frame:04d}.png")
        if args.resume and os.path.exists(path):
            continue
        scene.frame_set(frame)
        apply_pose(scene, liquids, timeline.pose_at(frame / timeline.FPS))
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f"FRAME {frame} {done}/{len(frames)} {clock.time() - started:.0f}s", flush=True)
        if args.rest > 0.0:
            clock.sleep(args.rest)  # baja la carga sostenida sobre la GPU y la fuente
    print("ANIMATION_DONE", flush=True)


if __name__ == "__main__":
    main()
