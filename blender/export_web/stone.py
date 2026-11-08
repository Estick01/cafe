"""Piedra casi negra con grietas finas, dispersas y direccionales. Solo para los bakes web.

Las grietas son curvas de nivel de f = K * dot(p, d) + alabeo. Mientras el gradiente del
alabeo sea menor que K, f crece siempre a lo largo de d y sus curvas de nivel no pueden
cerrarse: no salen los lazos tipo linea de costa del ruido |n - 0.5| de build_scene.py.
Cada curva se enciende o no al azar y una mascara a lo largo de ella la corta en tramos.
"""
from shader_utils import color_ramp, mix_color, node_material, noise_texture

FLOOR = {
    "base": ((0.0030, 0.0030, 0.0033), (0.0125, 0.0123, 0.0128)),
    "vein": (0.20, 0.195, 0.185),
    "cloud_scale": 3.2,
    "roughness": (0.30, 0.42),
    "families": (
        {"dir": (0.80, 0.60, 0.0), "tan": (-0.60, 0.80, 0.0), "K": 11.0, "density": 0.42, "width": 0.00085,
         "along": 2.3, "mask": (0.47, 0.57), "warp": ((1.5, 1.7), (0.28, 8.0), (0.025, 55.0)), "seed": 4.0, "gain": 1.0},
        {"dir": (0.93, 0.36, 0.0), "tan": (-0.36, 0.93, 0.0), "K": 17.0, "density": 0.30, "width": 0.00042,
         "along": 5.0, "mask": (0.53, 0.62), "warp": ((2.0, 1.3), (0.30, 11.0), (0.030, 70.0)), "seed": 21.0, "gain": 0.55},
    ),
}
WALL = {
    "base": ((0.0026, 0.0026, 0.0029), (0.0105, 0.0104, 0.0110)),
    "vein": (0.155, 0.152, 0.148),
    "cloud_scale": 2.4,
    "roughness": (0.50, 0.66),
    "families": (
        {"dir": (0.90, -0.44, 0.0), "tan": (0.44, 0.90, 0.0), "K": 9.0, "density": 0.40, "width": 0.00095,
         "along": 2.0, "mask": (0.47, 0.57), "warp": ((1.3, 1.6), (0.24, 7.5), (0.020, 50.0)), "seed": 37.0, "gain": 1.0},
        {"dir": (0.99, -0.12, 0.0), "tan": (0.12, 0.99, 0.0), "K": 15.0, "density": 0.28, "width": 0.00045,
         "along": 4.2, "mask": (0.53, 0.62), "warp": ((1.8, 1.2), (0.34, 10.0), (0.032, 65.0)), "seed": 53.0, "gain": 0.5},
    ),
}
PEDESTAL = {
    "base": ((0.0035, 0.0035, 0.0038), (0.0140, 0.0138, 0.0142)),
    "vein": (0.16, 0.157, 0.150),
    "cloud_scale": 14.0,
    "roughness": (0.46, 0.60),
    "families": (
        {"dir": (0.62, 0.42, 0.66), "tan": (-0.56, 0.83, 0.0), "K": 34.0, "density": 0.42, "width": 0.00042,
         "along": 11.0, "mask": (0.50, 0.60), "warp": ((1.2, 6.0), (0.18, 30.0), (0.020, 180.0)), "seed": 71.0, "gain": 1.0},
        {"dir": (0.80, 0.20, 0.56), "tan": (-0.24, 0.97, 0.0), "K": 55.0, "density": 0.26, "width": 0.00022,
         "along": 18.0, "mask": (0.53, 0.62), "warp": ((1.6, 5.0), (0.22, 40.0), (0.020, 240.0)), "seed": 83.0, "gain": 0.5},
    ),
}


def _math(tree, operation, first, second=None):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = operation
    for index, value in enumerate((first, second)):
        if value is None:
            continue
        if isinstance(value, (int, float)):
            node.inputs[index].default_value = value
        else:
            tree.links.new(value, node.inputs[index])
    return node.outputs[0]


def _dot(tree, coords, direction):
    node = tree.nodes.new("ShaderNodeVectorMath")
    node.operation = "DOT_PRODUCT"
    tree.links.new(coords, node.inputs[0])
    node.inputs[1].default_value = direction
    return node.outputs["Value"]


def _smoothstep(tree, value, low, high):
    node = tree.nodes.new("ShaderNodeMapRange")
    node.interpolation_type = "SMOOTHSTEP"
    node.inputs["From Min"].default_value = low
    node.inputs["From Max"].default_value = high
    tree.links.new(value, node.inputs["Value"])
    return node.outputs["Result"]


def _white(tree, value, offset):
    node = tree.nodes.new("ShaderNodeTexWhiteNoise")
    node.noise_dimensions = "1D"
    tree.links.new(_math(tree, "ADD", value, offset), node.inputs["W"])
    return node.outputs["Value"]


def _shifted(tree, coords, seed):
    node = tree.nodes.new("ShaderNodeMapping")
    node.inputs["Location"].default_value = (seed * 1.37, seed * 2.11, seed * 0.73)
    tree.links.new(coords, node.inputs["Vector"])
    return node.outputs["Vector"]


def _warped_field(tree, coords, family):
    """f = K * dot(p, d) + suma de ruidos centrados."""
    field = _math(tree, "MULTIPLY", _dot(tree, coords, family["dir"]), family["K"])
    for index, (amount, scale) in enumerate(family["warp"]):
        moved = _shifted(tree, coords, family["seed"] + index * 5.0)
        centered = _math(tree, "SUBTRACT", noise_texture(tree, moved, scale, detail=2.0, roughness=0.5), 0.5)
        field = _math(tree, "ADD", field, _math(tree, "MULTIPLY", centered, amount * 2.0))
    return field


def _crack_family(tree, coords, family):
    """Devuelve (linea, halo) de una familia de grietas, ambos 0..1."""
    field = _warped_field(tree, coords, family)
    index = _math(tree, "FLOOR", field)
    offset = _math(tree, "ABSOLUTE", _math(tree, "SUBTRACT", _math(tree, "FRACT", field), 0.5))
    distance = _math(tree, "DIVIDE", offset, family["K"])
    pick = _white(tree, index, family["seed"])
    strength = _white(tree, index, family["seed"] + 0.37)
    visible = _math(tree, "LESS_THAN", pick, family["density"])

    along = tree.nodes.new("ShaderNodeCombineXYZ")
    tree.links.new(_math(tree, "MULTIPLY", _dot(tree, coords, family["tan"]), family["along"]), along.inputs["X"])
    tree.links.new(_math(tree, "MULTIPLY", _math(tree, "ADD", index, family["seed"]), 7.31), along.inputs["Y"])
    stretch = noise_texture(tree, along.outputs[0], 1.0, detail=3.0, roughness=0.55)
    mask = _smoothstep(tree, stretch, *family["mask"])

    varied = _math(tree, "ADD", 0.35, _math(tree, "MULTIPLY", strength, 0.65))
    presence = _math(tree, "MULTIPLY", mask, visible)
    width = _math(tree, "MULTIPLY", _math(tree, "MULTIPLY", varied, family["width"]), presence)
    ratio = _math(tree, "DIVIDE", distance, _math(tree, "MAXIMUM", width, 1e-6))
    tone = _math(tree, "ADD", 0.45, _math(tree, "MULTIPLY", strength, 0.55))
    line = _math(tree, "MULTIPLY", _math(tree, "SUBTRACT", 1.0, _smoothstep(tree, ratio, 0.0, 1.0)),
                 _math(tree, "MULTIPLY", tone, family["gain"]))
    halo_ratio = _math(tree, "DIVIDE", distance, _math(tree, "MAXIMUM", _math(tree, "MULTIPLY", width, 8.0), 1e-6))
    halo = _math(tree, "MULTIPLY", _math(tree, "SUBTRACT", 1.0, _smoothstep(tree, halo_ratio, 0.0, 1.0)),
                 _math(tree, "GREATER_THAN", width, 1e-6))
    return line, _math(tree, "MULTIPLY", halo, family["gain"])


def stone_material(name, spec):
    material, tree, bsdf = node_material(name)
    coords = tree.nodes.new("ShaderNodeTexCoord").outputs["Object"]
    cloud = noise_texture(tree, coords, spec["cloud_scale"], detail=6.0, roughness=0.52)
    grain = noise_texture(tree, coords, spec["cloud_scale"] * 90.0, detail=2.0)
    base = color_ramp(tree, cloud, 0.32, spec["base"][0], 0.70, spec["base"][1])
    speckled = mix_color(tree, _math(tree, "MULTIPLY", grain, 0.16), base, spec["base"][0])

    lines, halos = [], []
    for family in spec["families"]:
        line, halo = _crack_family(tree, coords, family)
        lines.append(line)
        halos.append(halo)
    cracks = _math(tree, "MINIMUM", _math(tree, "ADD", lines[0], lines[1]), 1.0)
    glow = _math(tree, "MINIMUM", _math(tree, "MULTIPLY", _math(tree, "ADD", halos[0], halos[1]), 0.05), 1.0)
    hazy = mix_color(tree, glow, speckled, spec["vein"])
    veined = mix_color(tree, cracks, hazy, spec["vein"])
    tree.links.new(veined, bsdf.inputs["Base Color"])

    gloss = tree.nodes.new("ShaderNodeMapRange")
    gloss.inputs["To Min"].default_value = spec["roughness"][0]
    gloss.inputs["To Max"].default_value = spec["roughness"][1]
    tree.links.new(cloud, gloss.inputs["Value"])
    rough = _math(tree, "MINIMUM", _math(tree, "ADD", gloss.outputs["Result"], _math(tree, "MULTIPLY", cracks, 0.25)), 1.0)
    tree.links.new(rough, bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    return material
