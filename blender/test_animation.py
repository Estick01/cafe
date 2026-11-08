"""Pruebas de la linea de tiempo y la geometria. Ejecutar: python test_animation.py"""
import math
import unittest

import cup_attributes
import dimensions
import liquid
import steam
import timeline


class TimelineTests(unittest.TestCase):
    def test_start_has_bean_over_saucer_and_no_cup(self):
        pose = timeline.pose_at(0.0)
        self.assertAlmostEqual(pose.saucer_z, dimensions.PEDESTAL_TOP)
        self.assertLess(pose.reveal, 0.0)
        self.assertFalse(pose.pouring)
        self.assertTrue(pose.pedestal_visible)

    def test_cup_is_complete_before_bean_falls(self):
        pose = timeline.pose_at(4.9)
        self.assertGreater(pose.reveal, dimensions.CUP_TOP)
        self.assertEqual(pose.saucer_z, 0.0)
        self.assertFalse(pose.pedestal_visible)

    def test_bean_clears_cup_rim_until_it_falls(self):
        for step in range(0, 50):
            pose = timeline.pose_at(step / 10)
            visible_top = pose.cup_z + min(max(pose.reveal, 0.0), dimensions.CUP_TOP)
            self.assertGreater(pose.bean_z - dimensions.BEAN_HALF[2], visible_top + 0.001)

    def test_bean_ends_inside_cup_under_coffee(self):
        pose = timeline.pose_at(10.0)
        self.assertLess(pose.bean_z + dimensions.BEAN_HALF[1], pose.coffee_level)

    def test_coffee_rises_without_overflowing(self):
        levels = [timeline.pose_at(t / 2).coffee_level for t in range(0, 21)]
        self.assertEqual(levels, sorted(levels))
        self.assertLess(levels[-1], dimensions.CUP_SEAT + dimensions.CUP_TOP)

    def test_pour_ends_before_final_hold(self):
        self.assertTrue(timeline.pose_at(7.0).pouring)
        self.assertFalse(timeline.pose_at(9.0).pouring)

    def test_single_pour_never_stops_from_first_drop_to_cut(self):
        """Un unico chorro: sin hueco entre formar la taza y llenarla."""
        frames = range(int(1.0 * timeline.FPS) + 1, int(timeline.POUR_END * timeline.FPS))
        for frame in frames:
            pose = timeline.pose_at(frame / timeline.FPS)
            self.assertTrue(pose.pouring, frame)
            self.assertGreater(len(liquid.pour_path(pose)), 1, frame)

    def test_level_rises_monotonically_during_fill(self):
        times = [timeline.FILL_START + step * 0.02 for step in range(int((timeline.POUR_END - timeline.FILL_START) / 0.02))]
        levels = [timeline.pose_at(t).coffee_level for t in times]
        self.assertEqual(levels, sorted(levels))
        self.assertGreater(levels[-1] - levels[0], 0.04)

    def test_coffee_appears_when_the_jet_reaches_the_cup(self):
        before = timeline.pose_at(timeline.FILL_START - 0.01)
        self.assertFalse(before.coffee_visible)
        self.assertLess(before.jet_head, 1.0)
        after = timeline.pose_at(timeline.FILL_START)
        self.assertTrue(after.coffee_visible)
        self.assertEqual(after.jet_head, 1.0)
        tip = liquid.pour_path(after)[-1][0]
        for got, expected in zip(tip, liquid.jet_landing(after)):
            self.assertAlmostEqual(got, expected, places=9)

    def test_ribbon_stops_turning_with_its_end_next_to_the_handle(self):
        angles = [timeline.pose_at(t).ribbon_angle for t in (timeline.SPIN_START + timeline.SPIN_SPAN, 5.0, 6.0)]
        self.assertAlmostEqual(angles[0], angles[1], places=12)
        self.assertAlmostEqual(angles[1], angles[2], places=12)
        self.assertGreater(math.cos(angles[0]), 0.98)  # el asa esta en +X

    def test_stream_lands_where_the_pour_point_is(self):
        for t in (6.5, 7.8, 8.3):
            pose = timeline.pose_at(t)
            x, y, z = liquid.pour_path(pose)[-1][0]
            self.assertAlmostEqual(x, pose.pour_x, places=9)
            self.assertAlmostEqual(y, pose.pour_y, places=9)
            self.assertAlmostEqual(z, pose.coffee_level, places=9)

    def test_out_of_range_time_is_rejected(self):
        with self.assertRaises(ValueError):
            timeline.pose_at(10.5)


class GeometryTests(unittest.TestCase):
    def test_cup_radii_keep_wall_thickness(self):
        for z in (0.01, 0.02, 0.04, 0.06, 0.07):
            self.assertGreater(dimensions.cup_outer_radius(z), dimensions.cup_inner_radius(z))

    def test_tube_faces_reference_existing_vertices(self):
        vertices, faces = liquid.tube_mesh(liquid.pour_path(timeline.pose_at(3.0)))
        self.assertGreater(len(vertices), 0)
        self.assertLess(max(max(face) for face in faces), len(vertices))

    def test_every_frame_generates_valid_liquid(self):
        for frame in range(timeline.TOTAL_FRAMES):
            pose = timeline.pose_at(frame / timeline.FPS)
            for vertices, faces in (
                liquid.tube_mesh(liquid.pour_path(pose)),
                liquid.pool_mesh(pose),
                liquid.coffee_mesh(pose),
            ):
                if faces:
                    self.assertLess(max(max(face) for face in faces), len(vertices))

    def test_filling_stream_keeps_constant_thickness(self):
        """Un anillo volteado colapsaria el tubo entre dos secciones consecutivas."""
        sides = liquid.RING_SIDES
        vertices, _ = liquid.tube_mesh(liquid.pour_path(timeline.pose_at(7.0)))
        rings = [vertices[i:i + sides] for i in range(0, len(vertices), sides)]
        for lower, upper in zip(rings[12:-13], rings[13:-12]):
            for a, b in zip(lower, upper):
                gap = sum((p - q) ** 2 for p, q in zip(a, b)) ** 0.5
                self.assertLess(gap, 0.0065)

    def test_handle_grows_while_cup_forms(self):
        self.assertEqual(timeline.pose_at(2.0).handle_growth, 0.0)
        self.assertEqual(timeline.pose_at(4.5).handle_growth, 1.0)

    def test_handle_starts_growing_once_its_joint_exists(self):
        """El asa no puede brotar de una pared que todavia no se ha revelado."""
        for frame in range(timeline.TOTAL_FRAMES):
            pose = timeline.pose_at(frame / timeline.FPS)
            if pose.handle_growth > 0.0:
                self.assertGreater(pose.reveal, dimensions.HANDLE_BOTTOM_JOINT_Z)

    def test_steam_appears_only_once_coffee_is_filling(self):
        self.assertEqual(steam.steam_mesh(timeline.pose_at(5.0)), ([], [], []))
        self.assertGreater(len(steam.steam_mesh(timeline.pose_at(9.0))[0]), 0)

    def test_steam_mesh_is_valid_on_every_frame(self):
        for frame in range(timeline.TOTAL_FRAMES):
            vertices, faces, densities = steam.steam_mesh(timeline.pose_at(frame / timeline.FPS))
            self.assertEqual(len(vertices), len(densities))
            if faces:
                self.assertLess(max(max(face) for face in faces), len(vertices))
                self.assertGreaterEqual(min(densities), 0.0)
                self.assertLessEqual(max(densities), 1.0)

    def test_steam_rises_from_coffee_and_is_invisible_at_its_ends(self):
        pose = timeline.pose_at(9.5)
        vertices, _, densities = steam.steam_mesh(pose)
        heights = [v[2] for v in vertices]
        self.assertAlmostEqual(min(heights), pose.coffee_level)
        self.assertGreater(max(heights), pose.coffee_level + 0.1)
        for row_start in (0, (steam.ROWS - 1) * steam.COLUMNS):
            self.assertEqual(max(densities[row_start:row_start + steam.COLUMNS]), 0.0)

    def test_steam_drifts_slowly(self):
        """Vapor lento: en un fotograma ningun punto se mueve mas de medio milimetro."""
        first = steam.steam_mesh(timeline.pose_at(9.0))[0]
        second = steam.steam_mesh(timeline.pose_at(9.0 + 1 / timeline.FPS))[0]
        largest = max(sum((p - q) ** 2 for p, q in zip(a, b)) ** 0.5 for a, b in zip(first, second))
        self.assertLess(largest, 0.0005)

    def test_steam_moves_over_time(self):
        first = steam.steam_mesh(timeline.pose_at(9.0))[0]
        second = steam.steam_mesh(timeline.pose_at(9.5))[0]
        self.assertNotEqual(first, second)

    def test_no_liquid_outside_pours(self):
        self.assertEqual(liquid.pour_path(timeline.pose_at(0.5)), [])
        self.assertEqual(liquid.pour_path(timeline.pose_at(timeline.POUR_END)), [])
        self.assertEqual(liquid.pour_path(timeline.pose_at(9.0)), [])

    def test_stream_is_one_continuous_tube(self):
        """Nunca hay dos chorros a la vez: puntos consecutivos siempre cerca (una vez que el
        frente ha llegado al platillo; antes el chorro es tan corto que solo tiene dos puntos)."""
        for frame in range(int(1.5 * timeline.FPS), timeline.TOTAL_FRAMES):
            points = liquid.pour_path(timeline.pose_at(frame / timeline.FPS))
            for (a, *_), (b, *_) in zip(points, points[1:]):
                self.assertLess(math.dist(a, b), 0.015, frame)

    @staticmethod
    def _handle_clearance(x, y, z, cup_z):
        best = 1.0
        for index in range(201):
            hx, hz, radius = liquid._handle_sample(index / 200)
            best = min(best, math.sqrt((x - hx) ** 2 + y * y + (z - cup_z - hz) ** 2) - radius)
        return best

    def test_liquid_never_passes_through_cup_or_handle(self):
        """Con la taza completa, el cafe va por fuera o por dentro, nunca a traves de la ceramica.

        La unica excepcion es el arranque del salto, donde el chorro sale del asa.
        """
        for frame in range(int(4.5 * timeline.FPS), timeline.TOTAL_FRAMES, 2):
            pose = timeline.pose_at(frame / timeline.FPS)
            jx, jz, _, _ = liquid.handle_surface(liquid.STREAK_END, 0.0)
            root = (jx, 0.0, pose.cup_z + jz)
            for point in liquid.pour_path(pose):
                (x, y, z), radial, vertical = point[:3]
                thickness = min(radial, vertical)
                local = z - pose.cup_z
                if 0.0 < local < dimensions.CUP_TOP:
                    radius = math.hypot(x, y)
                    gap = max(dimensions.cup_inner_radius(local) - radius, radius - dimensions.cup_outer_radius(local))
                    self.assertGreater(gap - thickness, -1e-4, (frame, x, y, z))
                if math.dist((x, y, z), root) > 0.012:
                    self.assertGreater(self._handle_clearance(x, y, z, pose.cup_z) - thickness, -1e-4, (frame, x, y, z))

    def test_band_runs_along_the_handle_then_jumps_over_the_rim(self):
        pose = timeline.pose_at(5.0)
        hugging = [p[0] for p in liquid.pour_path(pose) if p[0][0] > dimensions.cup_outer_radius(p[0][2] - pose.cup_z) + 0.004]
        self.assertGreater(len(hugging), 5)
        for x, y, z in hugging:
            self.assertLess(self._handle_clearance(x, y, z, pose.cup_z), 0.004)
        jump = liquid.pour_path(timeline.pose_at(timeline.FILL_START))
        rim = timeline.pose_at(timeline.FILL_START).cup_z + dimensions.CUP_TOP
        self.assertGreater(max(p[0][2] for p in jump), rim + 0.04)

    def test_jet_lands_inside_the_cup_away_from_the_wall(self):
        pose = timeline.pose_at(6.5)
        x, y, z = liquid.pour_path(pose)[-1][0]
        self.assertAlmostEqual(z, pose.coffee_level, places=9)
        self.assertLess(math.hypot(x, y), 0.75 * dimensions.cup_inner_radius(z - pose.cup_z))

    def test_arc_becomes_the_vertical_stream_from_above(self):
        pose = timeline.pose_at(timeline.MORPH[1])
        lx, ly, _ = liquid.jet_landing(pose)
        points = liquid.pour_path(pose)
        self.assertGreater(points[0][0][2], 0.3)
        for (x, y, _z), *_ in points:
            self.assertAlmostEqual(x, lx, places=9)
            self.assertAlmostEqual(y, ly, places=9)

    def test_cut_tail_follows_the_same_path_into_the_cup(self):
        full = liquid.pour_path(timeline.pose_at(timeline.CUT_START))
        for t in (timeline.CUT_START + 0.05, timeline.CUT_START + 0.15, timeline.CUT_START + 0.22):
            points = liquid.pour_path(timeline.pose_at(t))
            self.assertGreater(len(points), 1)
            self.assertLess(len(points), len(full))
            # El final no se mueve: la cola recorre el mismo camino.
            self.assertLess(math.dist(points[-1][0], full[-1][0]), 0.001)

    def test_pool_lies_on_well_floor_inside_the_well(self):
        pose = timeline.pose_at(2.2)
        vertices, _ = liquid.pool_mesh(pose)
        radius = max(math.hypot(v[0], v[1]) for v in vertices)
        self.assertLess(dimensions.saucer_top_height(radius), dimensions.POOL_SURFACE)
        self.assertLess(abs(vertices[0][2] - pose.saucer_z - dimensions.POOL_SURFACE), 0.0005)

    def test_coffee_edge_touches_inner_wall(self):
        pose = timeline.pose_at(9.0)
        vertices, _ = liquid.coffee_mesh(pose)
        radius = max(math.hypot(v[0], v[1]) for v in vertices)
        local = pose.coffee_level - pose.cup_z
        self.assertGreater(radius, dimensions.cup_inner_radius(local))
        self.assertLess(radius, dimensions.cup_outer_radius(local))


class CupAssetTests(unittest.TestCase):
    """Medidas sacadas de la malla del usuario (tabla generada por cup_profile_tool.py)."""

    def test_mouth_is_about_nine_and_a_half_centimetres(self):
        widest = max(r for r, _ in dimensions.CUP_OUTER)
        self.assertAlmostEqual(2.0 * widest, 0.095, delta=0.0005)

    def test_pedestal_keeps_reference_ratio_to_saucer(self):
        widest = max(point[0] for point in dimensions.PEDESTAL_PROFILE)
        self.assertAlmostEqual(widest / dimensions.SAUCER_RADIUS, 1.27, delta=0.01)
        self.assertGreater(widest, dimensions.HANDLE_REACH)

    def test_profile_tables_ascend(self):
        for table in (dimensions.CUP_OUTER, dimensions.CUP_INNER, dimensions.SAUCER_TOP):
            keys = [point[1] for point in table]
            self.assertEqual(keys, sorted(keys))

    def test_cup_seats_on_saucer_well(self):
        self.assertAlmostEqual(dimensions.CUP_SEAT, dimensions.SAUCER_WELL_FLOOR, delta=0.0002)
        self.assertLess(dimensions.CUP_INNER_FLOOR, 0.02)

    def test_cup_foot_clears_saucer_well(self):
        for local_z in (0.0, 0.001, 0.002, 0.003):
            radius = dimensions.cup_outer_radius(local_z)
            self.assertGreater(dimensions.CUP_SEAT + local_z, dimensions.saucer_top_height(radius) - 0.0002)

    def test_glaze_line_is_near_half_cup_height(self):
        self.assertAlmostEqual(dimensions.GLAZE_LINE / dimensions.CUP_TOP, 0.45, delta=0.01)

    def test_bean_settles_above_inner_floor_and_inside_wall(self):
        pose = timeline.pose_at(10.0)
        local = pose.bean_z - pose.cup_z
        self.assertGreater(local - timeline.BEAN_SETTLED_BELOW, dimensions.CUP_INNER_FLOOR)
        self.assertGreater(dimensions.cup_inner_radius(local), dimensions.BEAN_HALF[2])


class CupAttributeTests(unittest.TestCase):
    def test_cup_edge_marks_rim_and_foot_only(self):
        self.assertEqual(cup_attributes.cup_edge(dimensions.CUP_TOP), 1.0)
        self.assertEqual(cup_attributes.cup_edge(0.0), 1.0)
        self.assertEqual(cup_attributes.cup_edge(dimensions.CUP_TOP * 0.5), 0.0)
        self.assertEqual(cup_attributes.cup_edge(dimensions.CUP_INNER_FLOOR), 0.0)

    def test_saucer_edge_marks_rim_and_well_lip(self):
        self.assertEqual(cup_attributes.saucer_edge(dimensions.SAUCER_RADIUS, 0.013), 1.0)
        self.assertEqual(cup_attributes.saucer_edge(cup_attributes.SAUCER_LIP_RADIUS, 0.005), 1.0)
        self.assertEqual(cup_attributes.saucer_edge(0.060, 0.010), 0.0)
        self.assertEqual(cup_attributes.saucer_edge(0.0, dimensions.SAUCER_WELL_FLOOR), 0.0)

    def test_saucer_lip_ignores_the_underside(self):
        self.assertEqual(cup_attributes.saucer_edge(cup_attributes.SAUCER_LIP_RADIUS, 0.002), 0.0)

    def test_band_falloff_is_monotonic(self):
        values = [cup_attributes.band(d / 1000.0, 0.001, 0.002) for d in range(0, 40)]
        self.assertEqual(values, sorted(values, reverse=True))

    def test_arc_progress_goes_from_zero_to_one_by_length(self):
        progress = cup_attributes.arc_progress(((0, 0, 0), (0, 0, 1), (0, 0, 4)))
        self.assertEqual(progress, (0.0, 0.25, 1.0))

    def test_arc_progress_rejects_degenerate_paths(self):
        with self.assertRaises(ValueError):
            cup_attributes.arc_progress(((0, 0, 0), (0, 0, 0)))


class FramingTests(unittest.TestCase):
    """Comprueba que lo importante cae dentro del cuadro 16:9 de cada plano."""

    @staticmethod
    def _project(point, camera, target):
        def normalize(v):
            size = math.sqrt(sum(c * c for c in v))
            return tuple(c / size for c in v)

        forward = normalize(tuple(t - c for t, c in zip(target, camera)))
        right = normalize((forward[1], -forward[0], 0.0))
        up = (
            right[1] * forward[2] - right[2] * forward[1],
            right[2] * forward[0] - right[0] * forward[2],
            right[0] * forward[1] - right[1] * forward[0],
        )
        offset = tuple(p - c for p, c in zip(point, camera))
        depth = sum(a * b for a, b in zip(offset, forward))
        half_width = 18.0 / dimensions.CAMERA_LENS  # sensor de 36 mm
        return (
            sum(a * b for a, b in zip(offset, right)) / depth / half_width,
            sum(a * b for a, b in zip(offset, up)) / depth / (half_width * 9.0 / 16.0),
        )

    def _assert_in_frame(self, shot, points):
        camera, target = shot
        for point in points:
            x, y = self._project(point, camera, target)
            self.assertLess(abs(x), 0.95, point)
            self.assertLess(abs(y), 0.95, point)

    def test_opening_shot_shows_pedestal_saucer_and_bean(self):
        pedestal = max(point[0] for point in dimensions.PEDESTAL_PROFILE)
        top = dimensions.PEDESTAL_TOP
        self._assert_in_frame(timeline.SHOT_BASE, (
            (pedestal, 0.0, 0.0), (-pedestal, 0.0, 0.0), (0.0, -pedestal, 0.0),
            (dimensions.SAUCER_RADIUS, 0.0, top + dimensions.SAUCER_TOP_Z),
            (0.0, 0.0, timeline.BEAN_HOVER_BASE + dimensions.BEAN_HALF[2]),
        ))

    def test_cup_shot_shows_saucer_handle_and_bean(self):
        self._assert_in_frame(timeline.SHOT_CUP, (
            (dimensions.SAUCER_RADIUS, 0.0, 0.01), (-dimensions.SAUCER_RADIUS, 0.0, 0.01),
            (0.0, -dimensions.SAUCER_RADIUS, 0.0),
            (dimensions.HANDLE_REACH, 0.0, dimensions.CUP_SEAT + dimensions.CUP_TOP),
            (0.0, 0.0, timeline.BEAN_HOVER_CUP + dimensions.BEAN_HALF[2]),
        ))

    def test_inside_shot_shows_whole_mouth_and_handle(self):
        rim = dimensions.CUP_SEAT + dimensions.CUP_TOP
        radius = max(r for r, _ in dimensions.CUP_OUTER)
        self._assert_in_frame(timeline.SHOT_INSIDE, (
            (radius, 0.0, rim), (-radius, 0.0, rim), (0.0, radius, rim), (0.0, -radius, rim),
            (dimensions.HANDLE_REACH, 0.0, rim * 0.6),
        ))


if __name__ == "__main__":
    unittest.main()
