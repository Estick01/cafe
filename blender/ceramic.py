"""Ceramica de la taza y el plato, copiada de cafe_taza.mp4.

Esmalte satinado de dos tonos (mas gris arriba, mas crema abajo), con franja tostada
en los bordes, marcas suaves de torno y ligeras variaciones de color.
"""
from dimensions import GLAZE_LINE
from shader_utils import attribute_value, bump, color_ramp, mix_color, node_material, noise_texture

HANDLE_ATTRIBUTE = "asa_avance"  # avance 0..1 a lo largo del arco del asa
HANDLE_CLIP_NODE = "asa_crecimiento"


def handle_clip_value(growth):
    """Valor del nodo de recorte: con growth = 1 el ultimo anillo (avance 1.0) ya se ve."""
    return -0.001 + 1.002 * growth


def _add_clip(tree, bsdf, source, node_name):
    """Hace transparente todo donde `source` no quede por debajo del nodo de valor `node_name`."""
    nodes, links = tree.nodes, tree.links
    output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    limit = nodes.new("ShaderNodeValue")
    limit.name = node_name
    limit.outputs[0].default_value = 1.001
    below = nodes.new("ShaderNodeMath")
    below.operation = "LESS_THAN"
    links.new(source, below.inputs[0])
    links.new(limit.outputs[0], below.inputs[1])
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix_shader = nodes.new("ShaderNodeMixShader")
    links.new(below.outputs[0], mix_shader.inputs[0])
    links.new(transparent.outputs[0], mix_shader.inputs[1])
    links.new(bsdf.outputs[0], mix_shader.inputs[2])
    links.new(mix_shader.outputs[0], output.inputs["Surface"])


def add_reveal_clip(tree, bsdf):
    """Recorte de la taza por altura local: el marco local tiene z = 0 en el pie."""
    coords = tree.nodes.new("ShaderNodeTexCoord")
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coords.outputs["Object"], separate.inputs[0])
    _add_clip(tree, bsdf, separate.outputs["Z"], "reveal")


def add_handle_clip(tree, bsdf):
    """Recorte del asa a lo largo de su arco, no por un plano horizontal."""
    _add_clip(tree, bsdf, attribute_value(tree, HANDLE_ATTRIBUTE), HANDLE_CLIP_NODE)


def _glaze_line_mask(tree, coords):
    """Devuelve 0 bajo la linea del esmalte y 1 encima, con un borde algo irregular."""
    nodes, links = tree.nodes, tree.links
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords, separate.inputs[0])
    wander = noise_texture(tree, coords, 28.0, detail=2.0)
    scaled = nodes.new("ShaderNodeMath")
    scaled.operation = "MULTIPLY"
    scaled.inputs[1].default_value = 0.004
    links.new(wander, scaled.inputs[0])
    height = nodes.new("ShaderNodeMath")
    height.operation = "ADD"
    links.new(separate.outputs["Z"], height.inputs[0])
    links.new(scaled.outputs[0], height.inputs[1])
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.interpolation_type = "SMOOTHSTEP"
    ramp.inputs["From Min"].default_value = GLAZE_LINE - 0.0012
    ramp.inputs["From Max"].default_value = GLAZE_LINE + 0.0018
    links.new(height.outputs[0], ramp.inputs["Value"])
    return ramp.outputs["Result"]


def _throwing_marks(tree, coords):
    """Marcas horizontales de torno: ruido estirado alrededor de la pieza."""
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (14.0, 14.0, 300.0)
    tree.links.new(coords, mapping.inputs["Vector"])
    return noise_texture(tree, mapping.outputs["Vector"], 1.0, detail=3.0, roughness=0.45)


def _glaze_color(tree, coords, marks):
    variation = noise_texture(tree, coords, 16.0, detail=4.0)
    lower = color_ramp(tree, variation, 0.36, (0.72, 0.625, 0.47), 0.66, (0.79, 0.70, 0.55))
    upper = color_ramp(tree, variation, 0.36, (0.555, 0.505, 0.425), 0.66, (0.625, 0.57, 0.48))
    two_tone = mix_color(tree, _glaze_line_mask(tree, coords), lower, upper)
    mark_mask = color_ramp(tree, marks, 0.44, (0, 0, 0), 0.68, (0.22, 0.22, 0.22))
    return mix_color(tree, mark_mask, two_tone, (0.47, 0.39, 0.28))


def _speckles(tree, coords):
    """Motas de hierro muy discretas, tipicas del gres; solo se notan de cerca."""
    voronoi = tree.nodes.new("ShaderNodeTexVoronoi")
    voronoi.inputs["Scale"].default_value = 520.0
    tree.links.new(coords, voronoi.inputs["Vector"])
    dots = color_ramp(tree, voronoi.outputs["Distance"], 0.0, (1, 1, 1), 0.085, (0, 0, 0))
    patches = color_ramp(tree, noise_texture(tree, coords, 55.0, detail=2.0), 0.50, (0, 0, 0), 0.64, (0.7, 0.7, 0.7))
    masked = tree.nodes.new("ShaderNodeMath")
    masked.operation = "MULTIPLY"
    tree.links.new(dots, masked.inputs[0])
    tree.links.new(patches, masked.inputs[1])
    return masked.outputs[0]


def _edge_band(tree, coords):
    """Franja tostada de los bordes, con desgaste irregular."""
    edge = attribute_value(tree, "edge")
    wear = noise_texture(tree, coords, 90.0, detail=2.0)
    worn = tree.nodes.new("ShaderNodeMath")
    worn.operation = "MULTIPLY"
    tree.links.new(edge, worn.inputs[0])
    tree.links.new(color_ramp(tree, wear, 0.25, (0.62, 0.62, 0.62), 0.70, (0.92, 0.92, 0.92)), worn.inputs[1])
    return worn.outputs[0]


def ceramic_material(name="MAT-ceramica_crema", with_reveal=False, with_handle_clip=False):
    material, tree, bsdf = node_material(name)
    coords = tree.nodes.new("ShaderNodeTexCoord").outputs["Object"]
    marks = _throwing_marks(tree, coords)

    glazed = mix_color(tree, _speckles(tree, coords), _glaze_color(tree, coords, marks), (0.15, 0.09, 0.05))
    final = mix_color(tree, _edge_band(tree, coords), glazed, (0.36, 0.225, 0.115))
    tree.links.new(final, bsdf.inputs["Base Color"])

    gloss = tree.nodes.new("ShaderNodeMapRange")
    gloss.inputs["To Min"].default_value = 0.30
    gloss.inputs["To Max"].default_value = 0.48
    tree.links.new(noise_texture(tree, coords, 42.0, detail=3.0), gloss.inputs["Value"])
    tree.links.new(gloss.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Coat Weight"].default_value = 0.28
    bsdf.inputs["Coat Roughness"].default_value = 0.22
    bsdf.inputs["Subsurface Weight"].default_value = 0.12
    bsdf.inputs["Subsurface Scale"].default_value = 0.004

    marks_normal = bump(tree, marks, 0.10, 0.0005)
    ripples = noise_texture(tree, coords, 70.0, detail=4.0)
    tree.links.new(bump(tree, ripples, 0.05, 0.0005, marks_normal), bsdf.inputs["Normal"])
    if with_reveal:
        add_reveal_clip(tree, bsdf)
    if with_handle_clip:
        add_handle_clip(tree, bsdf)
    return material
