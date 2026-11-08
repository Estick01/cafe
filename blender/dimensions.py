"""Medidas de la escena en metros. No depende de Blender.

La taza y el platillo salen de assets/coffeecup.blend; sus medidas se generan con
cup_profile_tool.py para que las pruebas funcionen sin abrir Blender.
"""

ASSET_SCALE = 1.357  # boca de 9.5 cm: el modelo original mide 7 cm
# --- INICIO TABLA GENERADA por cup_profile_tool.py ---
CUP_TOP = 0.07462
CUP_SEAT = 0.00217  # el pie apoya en el suelo del pocillo
CUP_INNER_FLOOR = 0.00516
SAUCER_RADIUS = 0.08812
SAUCER_TOP_Z = 0.01438
SAUCER_WELL_FLOOR = 0.00217
HANDLE_REACH = 0.08214
HANDLE_BOTTOM_JOINT_Z = 0.01746
CUP_OUTER = (
    (0.02415, 0.00002), (0.03053, 0.00039), (0.03286, 0.00116), (0.03484, 0.00281),
    (0.03642, 0.00492), (0.03905, 0.01006), (0.04154, 0.01575), (0.04357, 0.02195),
    (0.04509, 0.02848), (0.04610, 0.03504), (0.04670, 0.04089), (0.04699, 0.04556),
    (0.04737, 0.05591), (0.04750, 0.06230), (0.04743, 0.06840), (0.04727, 0.07303),
    (0.04717, 0.07359), (0.04691, 0.07407), (0.04654, 0.07442), (0.04609, 0.07462),
)
CUP_INNER = (
    (0.00000, 0.00516), (0.03036, 0.00516), (0.03324, 0.00904), (0.03560, 0.01375),
    (0.03791, 0.01902), (0.03980, 0.02490), (0.04123, 0.03197), (0.04224, 0.04051),
    (0.04290, 0.04913), (0.04331, 0.05639), (0.04354, 0.06264), (0.04373, 0.07250),
    (0.04383, 0.07309), (0.04407, 0.07364), (0.04444, 0.07410), (0.04488, 0.07443),
    (0.04537, 0.07460),
)
SAUCER_TOP = (
    (0.00217, 0.00000), (0.00220, 0.03645), (0.00227, 0.03700), (0.00251, 0.03747),
    (0.00288, 0.03780), (0.00423, 0.03825), (0.00454, 0.03845), (0.00480, 0.03871),
    (0.00506, 0.03929), (0.00559, 0.04158), (0.00665, 0.04670), (0.00796, 0.05366),
    (0.01042, 0.06804), (0.01155, 0.07393), (0.01414, 0.08577), (0.01438, 0.08708),
    (0.01431, 0.08760), (0.01398, 0.08800), (0.01308, 0.08812),
)
# Linea central del asa en el marco de la taza (z = 0 en el pie): (x, z, radio del tubo).
HANDLE_PATH = (
    (0.04160, 0.01746, 0.00667), (0.04687, 0.02020, 0.00504), (0.05209, 0.02303, 0.00436),
    (0.05722, 0.02602, 0.00427), (0.06228, 0.02914, 0.00424), (0.06720, 0.03246, 0.00420),
    (0.07184, 0.03617, 0.00412), (0.07590, 0.04050, 0.00397), (0.07880, 0.04565, 0.00382),
    (0.07954, 0.05149, 0.00374), (0.07808, 0.05721, 0.00377), (0.07483, 0.06214, 0.00387),
    (0.06993, 0.06538, 0.00400), (0.06409, 0.06625, 0.00412), (0.05824, 0.06534, 0.00420),
    (0.05264, 0.06335, 0.00451), (0.04714, 0.06112, 0.00595),
)
# --- FIN TABLA GENERADA ---

PEDESTAL_TOP = 0.0445
PEDESTAL_RADIUS = round(SAUCER_RADIUS * 1.27, 4)  # proporcion base/platillo de la referencia
# Perfil de revolucion de la base de piedra: (radio, altura).
PEDESTAL_PROFILE = (
    (0.0, 0.0), (PEDESTAL_RADIUS - 0.0035, 0.0), (PEDESTAL_RADIUS - 0.0010, 0.0006),
    (PEDESTAL_RADIUS, 0.003), (PEDESTAL_RADIUS, 0.041), (PEDESTAL_RADIUS - 0.0010, 0.0438),
    (PEDESTAL_RADIUS - 0.0035, PEDESTAL_TOP), (0.0, PEDESTAL_TOP),
)
POOL_SURFACE = SAUCER_WELL_FLOOR + 0.0006  # altura del charco sobre el platillo
GLAZE_LINE = CUP_TOP * 0.45  # altura de la linea que separa los dos tonos del esmalte
BEAN_HALF = (0.0195, 0.0135, 0.0235)  # ancho, fondo, alto
CAMERA_LENS = 55.0


def _interpolate(points, height):
    """Interpola el primer valor segun el segundo, que debe ser ascendente."""
    if height <= points[0][1]:
        return points[0][0]
    for (r_low, z_low), (r_high, z_high) in zip(points, points[1:]):
        if height <= z_high:
            span = z_high - z_low
            ratio = 0.0 if span <= 0.0 else (height - z_low) / span
            return r_low + (r_high - r_low) * ratio
    return points[-1][0]


def cup_outer_radius(local_z):
    return _interpolate(CUP_OUTER, local_z)


def cup_inner_radius(local_z):
    return _interpolate(CUP_INNER, local_z)


def saucer_top_height(radius):
    """Altura local de la cara superior del platillo a un radio dado."""
    return _interpolate(SAUCER_TOP, radius)
