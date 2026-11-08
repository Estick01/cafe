"""Escribe manifest.json a partir de lo medido en el glb. Es el ULTIMO paso del pipeline.

Python normal, sin Blender. Se escribe a un temporal y se renombra: quien espera el archivo
nunca puede leerlo a medias.
"""
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(PROJECT, "landing-3d", "assets", "models")
MEASURES = os.path.join(HERE, "_bakes", "medidas.json")
MANIFEST = os.path.join(MODELS, "manifest.json")
MEGABYTE = 1024 * 1024
BUDGETS = {"GEO-grano": 25000, "GEO-cascarilla": 12000, "GEO-base_piedra": 6000}

MAPS = {
    "MAT-grano_tostado": {"baseColor": "grano_color (2048)", "normal": "grano_normal (2048)", "roughness": "grano_rough (1024)", "clearcoat": 0.28, "clearcoatRoughness": 0.30},
    "MAT-cascarilla": {"baseColor": "cascarilla_color (1024)", "normal": "cascarilla_normal (1024)", "roughness": "constante 0.62"},
    "MAT-ceramica_platillo": {"baseColor": "ceramica_color (2048)", "normal": "ceramica_normal (2048)", "roughness": "ceramica_rough (1024)", "clearcoat": 0.28, "clearcoatRoughness": 0.22},
    "MAT-ceramica_taza": {"sameAs": "MAT-ceramica_platillo"},
    "MAT-ceramica_asa": {"sameAs": "MAT-ceramica_platillo"},
    "MAT-piedra_base": {"baseColor": "base_piedra_color (2048)", "roughness": "base_piedra_rough (1024)", "normal": None},
    "MAT-marmol_suelo": {"baseColor": "marmol_suelo_color.jpg (2048, externo)", "roughness": "marmol_suelo_rough.jpg (2048, externo)", "normal": None},
    "MAT-marmol_pared": {"baseColor": "marmol_pared_color.jpg (2048, externo)", "roughness": "marmol_pared_rough.jpg (2048, externo)", "normal": None},
}


def file_sizes():
    return {name: os.path.getsize(os.path.join(MODELS, name)) for name in sorted(os.listdir(MODELS))
            if name.endswith((".glb", ".jpg"))}


def validate(measures, sizes):
    if "cafe.glb" not in sizes or len(sizes) != 5:
        raise ValueError(f"Faltan archivos en models: {sorted(sizes)}")
    for name, budget in BUDGETS.items():
        if measures["objects"][name]["triangles"] > budget:
            raise ValueError(f"{name} supera su presupuesto de {budget} triangulos")


def object_entry(stats, parent):
    return {
        "triangles": stats["triangles"],
        "vertices": stats["vertices"],
        "parent": parent,
        "material": stats["material"],
        "doubleSided": stats["doubleSided"],
        "attributes": stats["attributes"],
        "exportTranslation": stats["translation"],
        "exportRotationXYZW": stats["rotation_xyzw"],
        "bboxLocal": stats["bbox_local"],
        "bboxWorldAtExportPose": stats["bbox_world_export_pose"],
    }


def build_manifest(measures, sizes):
    objects = {name: object_entry(stats, "GEO-grano" if name == "GEO-cascarilla" else None)
               for name, stats in measures["objects"].items()}
    handle = measures["handle_attribute"]
    total = sum(sizes.values())
    return {
        "status": "ready",
        "glb": "cafe.glb",
        "units": "metros",
        "upAxis": "Y (Three.js). Blender (x, y, z) => Three (x, z, -y). La camara de Blender mira desde -Y: en Three mira desde +Z.",
        "compression": {
            "geometry": "ninguna (sin Draco ni meshopt, no hace falta decoder)",
            "textures": "JPEG embebido; ningun KTX2 ni WebP",
            "extensionsUsed": measures["extensionsUsed"],
            "extensionsRequired": measures["extensionsRequired"],
        },
        "sizeBytes": {"files": sizes, "total": total, "totalMB": round(total / MEGABYTE, 2), "budgetMB": 12},
        "totalTriangles": sum(item["triangles"] for item in objects.values()),
        "objects": objects,
        "placement": {
            "exportPose": "timeline.pose_at(0): grano 0.140, platillo 0.0445, taza y asa 0.04667, base 0, sin vaiven.",
            "rule": "Cada altura de timeline.py va tal cual a position.y del objeto del mismo nombre: saucer_z => GEO-platillo, cup_z => GEO-taza y GEO-asa, pedestal_z => GEO-base_piedra, bean_z => GEO-grano. x y z quedan en 0.",
            "origins": {
                "GEO-platillo": "eje de la taza, y = 0 en la base del platillo",
                "GEO-taza": "eje, y = 0 en el pie (CUP_SEAT = 0.00217 por encima del platillo)",
                "GEO-asa": "mismo marco que GEO-taza: moverlos siempre juntos",
                "GEO-grano": "centro del grano; la cara plana con el surco mira a +Z local",
                "GEO-cascarilla": "hija de GEO-grano con transformacion identidad; no necesita animacion propia",
                "GEO-base_piedra": "eje, y = 0 en su base; arriba y = 0.0445",
                "GEO-suelo": "plano de 3x3 m en y = 0, normal +Y",
                "GEO-pared": "plano de 3x3 m, centro en (0, 1.5, -0.34), normal +Z. Su geometria local esta en el plano XZ: el giro vive en el nodo.",
            },
            "beanRotation": "timeline.bean_rotation = (rx, ry, rz) en radianes, Euler XYZ de Blender. En Three: grano.rotation.set(rx, rz, -ry, 'YZX'). Comprobado contra el cuaternion exportado.",
            "cameraShots": "SHOT_* de timeline.py: convertir posicion y objetivo con (x, z, -y). Lente de 55 mm sobre sensor de 36 mm de ancho.",
        },
        "materials": MAPS,
        "materialNotes": [
            "GLTFLoader asigna todos los mapas, colorSpace y flipY. Los materiales con clearcoat llegan como MeshPhysicalMaterial.",
            "Los mapas de la ceramica son un unico atlas compartido por platillo, taza y asa (las UV originales del archivo del usuario, sin solapes).",
            "Base color sin luz. Los mapas normales son tangentes, convenio OpenGL (+Y), horneados con tangentes MikkTSpace: el glb trae TANGENT, no hay que recalcular nada.",
            "La subsuperficie de la cascarilla y la ceramica no se exporta: se ven un poco mas oscuras que en Cycles con la misma luz.",
            "En roughness el canal valido es G. metallicFactor es 0 en todos, asi que metalnessMap no influye.",
            "JPEG con croma 4:2:0, tambien en los mapas normales: suficiente en los controles, pero un primer plano extremo podria mostrar algun artefacto.",
            "No hay luces ni camara en el glb.",
        ],
        "externalTextures": {
            "files": ["marmol_suelo_color.jpg", "marmol_suelo_rough.jpg", "marmol_pared_color.jpg", "marmol_pared_rough.jpg"],
            "howLoaded": "El glb las referencia por URI relativa: GLTFLoader las carga solo si los .jpg siguen junto a cafe.glb. No hay que cargarlas a mano.",
            "ifLoadedManually": "flipY = false, colorSpace = SRGBColorSpace en color y NoColorSpace en rough, wrapS y wrapT = MirroredRepeatWrapping.",
        },
        "uvQuirks": {
            "GEO-suelo": "Azulejo de 1 m en TEXCOORD_0, U y V fuera de 0..1, sampler MIRRORED_REPEAT. Costuras de espejo en x = +-0.5 y en z = +0.66 y -0.34.",
            "GEO-pared": "Igual: azulejo de 1 m, costuras de espejo en x = +-0.5 y en y = 1.0.",
            "GEO-grano": "Esfera UV propia. Costura en el dorso (-Z local en Three) y polos en las puntas (+-Y local).",
            "GEO-cascarilla": "Tres laminas en tres franjas verticales del atlas. Son mallas abiertas: requieren doubleSided, que ya viene puesto.",
            "GEO-base_piedra": "Atlas propio: tapa arriba-izquierda, fondo arriba-derecha, lateral en la mitad inferior.",
            "ceramica": "Atlas original del archivo del usuario, sin tocar. No hay UV2.",
        },
        "attributes": {
            "_ASA_AVANCE": {
                "object": "GEO-asa",
                "gltfName": "_ASA_AVANCE",
                "threeName": "_asa_avance (GLTFLoader pasa a minusculas los atributos propios)",
                "type": "float por vertice, SCALAR",
                "range": [handle["real_min"], handle["real_max"]],
                "meaning": "0 en la union inferior, 1 en la superior, proporcional a la longitud del arco",
                "verified": handle,
                "clipFromBlender": "Visible donde _asa_avance < -0.001 + 1.002 * handle_growth (ceramic.handle_clip_value).",
            },
            "tazaReveal": "GEO-taza no lleva atributo: el recorte de Blender es por altura local. Visible donde y local < pose.reveal, con y = 0 en el pie.",
        },
        "bakedOpaque": "La taza y el asa se hornearon sin recortes. El recorte de aparicion lo tiene que hacer el shader de la app; ambas ya son doubleSided para que no se vea a traves del corte.",
        "checks": "../_checks/check_*.png: renders Cycles en GPU del propio glb importado en Blender. Sin probar todavia en Three.js.",
    }


def main():
    with open(MEASURES, encoding="utf-8") as handle:
        measures = json.load(handle)
    sizes = file_sizes()
    validate(measures, sizes)
    manifest = build_manifest(measures, sizes)
    temporary = MANIFEST + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
    os.replace(temporary, MANIFEST)
    with open(MANIFEST, encoding="utf-8") as handle:
        json.load(handle)
    print(f"MANIFEST {MANIFEST} total {manifest['sizeBytes']['totalMB']} MB, {manifest['totalTriangles']} triangulos")


if __name__ == "__main__":
    main()
