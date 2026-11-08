"""Ayudas compartidas para crear materiales de nodos en Blender."""
import bpy


def node_material(name):
    """Crea un material con nodos y devuelve (material, arbol, principled)."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    return material, tree, bsdf


def color_ramp(tree, source, low_position, low_color, high_position, high_color):
    """Crea una rampa de dos colores alimentada por `source` y devuelve su salida."""
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = low_position
    ramp.color_ramp.elements[0].color = (*low_color, 1.0)
    ramp.color_ramp.elements[1].position = high_position
    ramp.color_ramp.elements[1].color = (*high_color, 1.0)
    tree.links.new(source, ramp.inputs["Fac"])
    return ramp.outputs["Color"]


def mix_color(tree, factor, color_a, color_b):
    """Mezcla dos colores; cada uno puede ser un socket o una tupla RGB."""
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    tree.links.new(factor, mix.inputs["Factor"])
    for socket_name, color in (("A", color_a), ("B", color_b)):
        if isinstance(color, tuple):
            mix.inputs[socket_name].default_value = (*color, 1.0)
        else:
            tree.links.new(color, mix.inputs[socket_name])
    return mix.outputs["Result"]


def noise_texture(tree, vector, scale, detail=4.0, roughness=0.5, distortion=0.0):
    """Crea ruido sobre `vector` y devuelve su salida Fac."""
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    noise.inputs["Roughness"].default_value = roughness
    noise.inputs["Distortion"].default_value = distortion
    tree.links.new(vector, noise.inputs["Vector"])
    return noise.outputs["Fac"]


def bump(tree, height, strength, distance, normal=None):
    """Crea un relieve encadenable y devuelve su normal."""
    node = tree.nodes.new("ShaderNodeBump")
    node.inputs["Strength"].default_value = strength
    node.inputs["Distance"].default_value = distance
    tree.links.new(height, node.inputs["Height"])
    if normal is not None:
        tree.links.new(normal, node.inputs["Normal"])
    return node.outputs["Normal"]


def attribute_value(tree, name):
    """Lee un atributo de la malla como valor."""
    node = tree.nodes.new("ShaderNodeAttribute")
    node.attribute_name = name
    return node.outputs["Fac"]
