"""Linea de tiempo de la animacion: convierte segundos en una pose inmutable. Sin Blender.

Fases (segundos):
  0.0-1.0   el grano flota sobre el platillo y la base de piedra
  1.0-2.3   cae el chorro y se forma un charco en el platillo
  1.9-2.5   la base se hunde y el platillo baja al suelo
  2.4-4.2   la taza crece desde abajo, con una cinta de cafe en el borde de crecimiento
  4.2-4.6   la cola del chorro de arriba cae en la cinta; la cinta frena con su extremo en el asa
  4.5-4.8   la cinta baja por fuera de la taza hasta la mitad inferior
  4.75-5.15 el cafe recorre el asa pegado a ella, por fuera
  5.15-5.6  un chorro sale de lo alto del asa, describe un arco y cae dentro de la taza
  5.0-5.6   el grano cae dentro de la taza y salpica el cafe
  5.6-8.4   la taza se llena de cafe solo
  5.75-6.5  el origen del arco se levanta y se convierte en el chorro vertical de arriba
  5.8-8.0   la camara se acerca y mira hacia dentro
  8.4-8.75  se corta el chorro arriba y la cola cae en la taza en gotas
  6.8-8.6   aparece el vapor, que sigue subiendo hasta el final
  8.75-10.0 plano final: la superficie se calma
"""
import math
from dataclasses import dataclass

from dimensions import CUP_INNER_FLOOR, CUP_SEAT, CUP_TOP, PEDESTAL_TOP, POOL_SURFACE

DURATION = 10.0
FPS = 24
TOTAL_FRAMES = int(DURATION * FPS)

POUR_TOP = 0.42  # altura desde la que cae el chorro, fuera de cuadro
COFFEE_START = CUP_INNER_FLOOR + 0.0065  # alturas locales de la taza
COFFEE_FULL = CUP_TOP - 0.0107  # deja el mismo margen bajo el borde que la referencia
POOL_MAX_RADIUS = 0.034  # cabe en el suelo plano del pocillo

# Tras formar la taza: la cinta baja por fuera, recorre el asa y salta dentro de la taza.
RIBBON_SPIN = 6.5  # rad/s mientras la taza crece
RIBBON_TURNS = 1.55
RIBBON_GATHER_TURNS = 0.8  # la cinta se recoge hacia el asa: menos de una vuelta
SPIN_START = 4.2
# La cinta frena con su extremo justo delante de la union inferior del asa (angulo 0): la
# integral de (1 - smooth) vale la mitad del tramo, asi que el angulo final es el inicial
# menos SPIN * tramo / 2.
RIBBON_END_ANGLE = -6.0 * math.pi - 0.2
_SPIN_ANGLE_AT_START = -RIBBON_SPIN * SPIN_START + 2.0 * math.pi * RIBBON_TURNS
SPIN_SPAN = 2.0 * (_SPIN_ANGLE_AT_START - RIBBON_END_ANGLE) / RIBBON_SPIN
RIBBON_DROP = (4.5, 4.8)  # la cinta baja por fuera de la taza
RIBBON_LOW = 0.024  # altura local final del principio de la cinta
TAIL_FALL = (4.2, 4.5)  # la cola del chorro de arriba cae hasta la cinta
FEED_TAIL = 0.75  # fraccion del recorrido previo al salto que se lleva esa caida
FEED_END = 5.75  # para entonces la cinta y el asa ya han pasado al chorro
STREAK = (4.75, 5.15)  # el cafe sube por el asa
JET = (5.15, 5.6)  # el chorro sale del asa y llega a la taza
MORPH = (5.75, 6.5)  # el origen del arco se convierte en el chorro de arriba
FILL_START = JET[1]
FILL_END = 8.5
CUT_START = 8.4
POUR_END = 8.75  # la cola llega a la taza: no queda chorro

# Punto de caida en la taza (ejes de Blender): a la izquierda del grano y algo por detras.
POUR_LANDING = (-0.026, 0.012)

BEAN_BOB = 0.0016
BEAN_HOVER_BASE = 0.140
# El grano flota con su base 3 mm por encima del borde, incluso en lo mas bajo de su vaiven.
BEAN_HOVER_CUP = 0.105
# Distancia del origen del grano a su punto mas bajo ya tumbado (cara plana abajo).
# Medida en Blender con bean_model.py: volver a medir si cambia la forma del grano.
BEAN_SETTLED_BELOW = 0.0087
BEAN_SETTLED = CUP_SEAT + CUP_INNER_FLOOR + BEAN_SETTLED_BELOW + 0.0025

# Planos de camara: (posicion, objetivo).
SHOT_BASE = ((0.0, -0.74, 0.172), (0.0, 0.0, 0.080))
SHOT_CUP = ((0.0, -0.535, 0.137), (0.010, 0.0, 0.058))
SHOT_INSIDE = ((0.012, -0.25, 0.266), (0.006, 0.0, 0.049))

_CAMERA_KEYS = (
    (0.0, *SHOT_BASE),
    (1.9, *SHOT_BASE),
    (4.4, *SHOT_CUP),
    (5.8, *SHOT_CUP),
    (8.0, *SHOT_INSIDE),
    (10.0, *SHOT_INSIDE),
)


@dataclass(frozen=True)
class Pose:
    time: float
    saucer_z: float
    pedestal_z: float
    pedestal_visible: bool
    cup_z: float
    reveal: float
    handle_growth: float
    bean_z: float
    bean_rotation: tuple
    camera_position: tuple
    camera_target: tuple
    pouring: bool
    pour_head_z: float
    feed_cut: float
    pour_cut: float
    helix_blend: float
    helix_turns: float
    ribbon_z: float
    ribbon_angle: float
    ribbon_outside: float
    streak: float
    jet_head: float
    jet_morph: float
    pool_radius: float
    coffee_level: float
    coffee_visible: bool
    pour_x: float
    pour_y: float
    steam_amount: float


def smooth(start, end, value):
    """Interpolacion suave de 0 a 1 entre start y end."""
    if end <= start:
        return 1.0 if value >= end else 0.0
    ratio = min(1.0, max(0.0, (value - start) / (end - start)))
    return ratio * ratio * (3.0 - 2.0 * ratio)


def mix(low, high, ratio):
    return low + (high - low) * ratio


def _mix_tuple(low, high, ratio):
    return tuple(mix(a, b, ratio) for a, b in zip(low, high))


def _camera(time):
    for (t_low, pos_low, tgt_low), (t_high, pos_high, tgt_high) in zip(_CAMERA_KEYS, _CAMERA_KEYS[1:]):
        if time <= t_high:
            ratio = smooth(t_low, t_high, time)
            return _mix_tuple(pos_low, pos_high, ratio), _mix_tuple(tgt_low, tgt_high, ratio)
    return _CAMERA_KEYS[-1][1], _CAMERA_KEYS[-1][2]


def _bean(time):
    """Altura y rotacion del grano: flota, baja con el platillo y cae en la taza."""
    hover = mix(BEAN_HOVER_BASE, BEAN_HOVER_CUP, smooth(1.9, 2.6, time))
    bob = BEAN_BOB * math.sin(2.0 * math.pi * time / 2.6) * (1.0 - smooth(4.8, 5.0, time))
    fall = min(1.0, max(0.0, (time - 5.0) / 0.55)) ** 2  # caida acelerada
    height = mix(hover + bob, BEAN_SETTLED, fall)
    sway = math.radians(9.0) * math.sin(2.0 * math.pi * time / 4.3)
    lie_down = smooth(5.0, 5.6, time)
    rotation = (
        math.radians(mix(4.0, 82.0, lie_down)),
        math.radians(-14.0),
        math.radians(6.0) + sway * (1.0 - lie_down),
    )
    return height, rotation


def _clamp01(value):
    return min(1.0, max(0.0, value))


def _ribbon_angle(time):
    """Angulo del extremo de la cinta: gira con la taza y frena hasta quedar en el asa."""
    span = SPIN_SPAN
    if time <= SPIN_START:
        travelled = time
    else:
        u = _clamp01((time - SPIN_START) / span)
        # Integral de (1 - smooth): la velocidad cae a cero sin saltos.
        travelled = SPIN_START + (min(time, SPIN_START + span) - SPIN_START) - span * (u ** 3 - 0.5 * u ** 4)
    return -RIBBON_SPIN * travelled + 2.0 * math.pi * RIBBON_TURNS


def _feed_cut(time):
    """Fraccion del recorrido previo al salto (chorro de arriba, cinta y asa) que ya se ha ido."""
    fall = _clamp01((time - TAIL_FALL[0]) / (TAIL_FALL[1] - TAIL_FALL[0]))
    return FEED_TAIL * fall * fall + (1.0 - FEED_TAIL) * smooth(TAIL_FALL[1], FEED_END, time)


def pose_at(time):
    if not 0.0 <= time <= DURATION:
        raise ValueError(f"Tiempo fuera de rango: {time}")
    saucer_z = PEDESTAL_TOP * (1.0 - smooth(1.9, 2.5, time))
    cup_z = saucer_z + CUP_SEAT
    reveal = mix(-0.001, CUP_TOP + 0.002, smooth(2.4, 4.2, time))
    coffee_level = mix(COFFEE_START, COFFEE_FULL, smooth(FILL_START, FILL_END, time)) + CUP_SEAT
    pool_surface = saucer_z + POOL_SURFACE
    head_z = mix(POUR_TOP, pool_surface, _clamp01((time - 1.0) / 0.45) ** 2)
    ribbon_z = mix(cup_z + max(reveal, 0.0), cup_z + RIBBON_LOW, smooth(*RIBBON_DROP, time))
    bean_z, bean_rotation = _bean(time)
    camera_position, camera_target = _camera(time)
    return Pose(
        time=time,
        saucer_z=saucer_z,
        pedestal_z=saucer_z - PEDESTAL_TOP - 0.003 * smooth(2.3, 2.5, time),
        pedestal_visible=time < 2.55,
        cup_z=cup_z,
        reveal=reveal,
        handle_growth=smooth(3.0, 4.15, time),
        bean_z=bean_z,
        bean_rotation=bean_rotation,
        camera_position=camera_position,
        camera_target=camera_target,
        pouring=1.0 <= time < POUR_END,
        pour_head_z=head_z,
        feed_cut=_feed_cut(time),
        # Fraccion del chorro final que ya ha dejado atras la cola tras el corte.
        pour_cut=_clamp01((time - CUT_START) / (POUR_END - CUT_START)) ** 2,
        helix_blend=smooth(2.25, 2.6, time),
        helix_turns=mix(RIBBON_TURNS, RIBBON_GATHER_TURNS, smooth(4.2, 4.5, time)),
        ribbon_z=ribbon_z,
        ribbon_angle=_ribbon_angle(time),
        ribbon_outside=smooth(4.2, 4.45, time),
        streak=smooth(*STREAK, time),
        jet_head=_clamp01((time - JET[0]) / (JET[1] - JET[0])) ** 1.5,
        jet_morph=smooth(*MORPH, time),
        pool_radius=POOL_MAX_RADIUS * smooth(1.42, 2.2, time) * (1.0 - 0.3 * smooth(2.5, 2.95, time)),
        coffee_level=coffee_level,
        coffee_visible=time >= FILL_START,
        pour_x=POUR_LANDING[0],
        pour_y=POUR_LANDING[1],
        steam_amount=smooth(6.8, 8.6, time),
    )
