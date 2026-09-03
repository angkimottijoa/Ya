"""
Tests for the fork.

Upstream ships none, and the bugs found here were the kind that pass a
casual look: a section index that silently discarded fifteen blocks in
sixteen, an altitude that wrapped instead of clipping, a projection that
was 23% out. Each of those has a test below that fails against the
unfixed code.

Run with:  python -m unittest discover -s plateau2minecraft/tests
"""
import math
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "src"))
sys.path.insert(0, str(_ROOT.parent / "tests"))

from read_world import World

from plateau2minecraft.anvil import Block, EmptyRegion
from plateau2minecraft.anvil.empty_chunk import EmptyChunk
from plateau2minecraft.appearance import Appearances, affine_uv
from plateau2minecraft.blocks import RICH, SIMPLE, BlockMatcher, is_glassy
from plateau2minecraft.converter import Minecraft
from plateau2minecraft.parser import get_surfaces, set_projection_from
from plateau2minecraft.planar_voxels import surface_voxels
from plateau2minecraft.projection import ZONE_ORIGINS, PlaneRectangular, guess_zone
from plateau2minecraft.smoothing import close_pinholes, despeckle, pack, smooth, unpack
from plateau2minecraft.voxelizer import PointCloud


class TestAnvilHeight(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _round_trip(self, min_y, max_y, placed):
        region = EmptyRegion(0, 0, min_y=min_y, max_y=max_y, version=4189)
        stone = Block("minecraft", "stone")
        for x, y, z in placed:
            region.set_block(stone, x, y, z)
        region.save(str(self.tmp / "r.0.0.mca"))
        world = World(self.tmp)
        return [p for p in placed if world.block(*p) != "minecraft:stone"]

    def test_many_blocks_in_one_section_all_survive(self):
        """The regression that mattered most.

        get_block and set_block indexed sections[(y // 16) + 4] -- the
        vanilla offset -- while the constructor sized the list from min_y.
        For y under -64 that index goes negative, which Python reads from
        the end of the list instead of raising, so every set_block missed
        and built a fresh section over the previous one. Fifteen blocks in
        sixteen were silently discarded.
        """
        placed = [(x, -512 + x, 0) for x in range(16)]
        self.assertEqual(self._round_trip(-512, 511, placed), [])

    def test_every_height_range_round_trips(self):
        for min_y, max_y in ((-64, 319), (-512, 511), (-2048, 2047)):
            placed = []
            for base in (min_y, min_y + 16, 0, max_y - 15):
                placed.extend((i, base + i, (i * 3) % 16) for i in range(16))
            with self.subTest(range=(min_y, max_y)):
                self.assertEqual(self._round_trip(min_y, max_y, placed), [])

    def test_bad_ranges_are_refused_where_they_are_configured(self):
        for min_y, max_y in ((-60, 319), (-64, 300), (-64, 2063), (0, 0)):
            with self.subTest(range=(min_y, max_y)):
                with self.assertRaises(ValueError):
                    EmptyRegion(0, 0, min_y=min_y, max_y=max_y)
                with self.assertRaises(ValueError):
                    EmptyChunk(0, 0, min_y=min_y, max_y=max_y)

    def test_chunks_relight_rather_than_loading_black(self):
        chunk = EmptyChunk(0, 0, -64, 319, version=4189)
        chunk.set_block(Block("minecraft", "stone"), 0, 0, 0)
        tags = {tag.name: tag for tag in chunk.save().tags}
        self.assertEqual(tags["isLightOn"].value, 0)
        self.assertEqual(tags["yPos"].value, -4)
        self.assertEqual(tags["Status"].value, "minecraft:full")

    def test_status_follows_the_target_version(self):
        old = EmptyChunk(0, 0, -64, 319, version=3337)
        old.set_block(Block("minecraft", "stone"), 0, 0, 0)
        tags = {tag.name: tag for tag in old.save().tags}
        self.assertEqual(tags["Status"].value, "full")


class TestConverter(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_altitude_is_never_wrapped(self):
        """`vertex % 512` was applied to all three axes, so 634 m became 122."""
        points = np.array([[0.0, 0.0, 634.0], [0.0, 0.0, 520.0], [0.0, 0.0, 300.0]])
        minecraft = Minecraft(PointCloud(points), min_y=-64, max_y=1023,
                              data_version=4189)
        minecraft.build_region(self.tmp)
        self.assertEqual(minecraft.clipped, 0)

        world = World(self.tmp / "world_data" / "region")
        found = {y for x in range(-3, 4) for z in range(-3, 4)
                 for y in (634, 520, 300, 122, 8)
                 if world.block(x, y, z) != "minecraft:air"}
        self.assertIn(634, found)
        self.assertFalse({y for y in found if y < 300})

    def test_what_does_not_fit_is_counted_not_wrapped(self):
        points = np.array([[0.0, 0.0, float(z)] for z in range(0, 700, 7)])
        minecraft = Minecraft(PointCloud(points), min_y=-64, max_y=511)
        minecraft.build_region(self.tmp)
        self.assertGreater(minecraft.clipped, 0)

    def test_a_block_per_voxel(self):
        points = np.array([[0.0, 0.0, 100.0], [1.0, 0.0, 100.0], [2.0, 0.0, 100.0]])
        names = np.array(["minecraft:stone", "minecraft:light_blue_stained_glass",
                          "minecraft:bricks"], dtype=object)
        minecraft = Minecraft(PointCloud(points), min_y=-64, max_y=511,
                              data_version=4189, block_names=names)
        minecraft.build_region(self.tmp)
        world = World(self.tmp / "world_data" / "region")
        seen = {world.block(x, 100, z) for x in range(-4, 5) for z in range(-4, 5)}
        for name in names:
            self.assertIn(name, seen)

    def test_output_folder_is_the_one_written_to(self):
        """Upstream cleared the literal data/output/... and saved elsewhere."""
        points = np.array([[0.0, 0.0, 100.0]])
        Minecraft(PointCloud(points), min_y=-64, max_y=511).build_region(self.tmp)
        region_dir = self.tmp / "world_data" / "region"
        self.assertTrue(region_dir.is_dir())
        self.assertTrue(list(region_dir.glob("*.mca")))
        self.assertFalse((Path("data") / "output").exists())

    def test_blocks_far_from_the_origin_land_in_the_right_region(self):
        # 1500 blocks out is region 2 in x once centred.
        points = np.array([[0.0, 0.0, 100.0], [3000.0, 0.0, 100.0]])
        minecraft = Minecraft(PointCloud(points), min_y=-64, max_y=511,
                              data_version=4189)
        files = minecraft.build_region(self.tmp)
        self.assertGreaterEqual(len(files), 2)
        world = World(self.tmp / "world_data" / "region")
        hits = [(x, z) for x in range(-1600, 1601)
                for z in (0,) if world.block(x, 100, z) != "minecraft:air"]
        self.assertEqual(len(hits), 2, "both points should survive the split")
        self.assertAlmostEqual(abs(hits[0][0] - hits[1][0]), 3000, delta=2)


class TestProjection(unittest.TestCase):
    def test_a_metre_on_the_ground_is_a_block(self):
        """EPSG:3857 made this 1.23 blocks at Tokyo's latitude."""
        projector = PlaneRectangular(9)
        lat, lon = 35.6595, 139.7005
        sin_lat = math.sin(math.radians(lat))
        e2 = 2 / 298.257222101 - (1 / 298.257222101) ** 2
        w = math.sqrt(1 - e2 * sin_lat ** 2)
        per_lat = 6378137.0 * (1 - e2) / w ** 3
        per_lon = 6378137.0 / w * math.cos(math.radians(lat))

        _, north_a = projector(lat, lon)
        _, north_b = projector(lat + math.degrees(1000 / per_lat), lon)
        east_a, _ = projector(lat, lon)
        east_b, _ = projector(lat, lon + math.degrees(1000 / per_lon))
        self.assertAlmostEqual(north_b - north_a, 1000.0, delta=0.2)
        self.assertAlmostEqual(east_b - east_a, 1000.0, delta=0.2)
        self.assertAlmostEqual((east_b - east_a) / (north_b - north_a), 1.0, delta=1e-4)

    def test_each_zone_origin_is_its_own_zero(self):
        for zone, (lat, lon) in ZONE_ORIGINS.items():
            east, north = PlaneRectangular(zone)(lat, lon)
            self.assertAlmostEqual(east, 0.0, delta=0.01, msg=f"zone {zone}")
            self.assertAlmostEqual(north, 0.0, delta=0.01, msg=f"zone {zone}")

    def test_tokyo_lands_in_zone_nine(self):
        self.assertEqual(guess_zone(35.6595, 139.7005), 9)
        self.assertEqual(PlaneRectangular(9).epsg, 6677)


class TestPlanarVoxels(unittest.TestCase):
    def test_a_wall_is_one_voxel_thick(self):
        wall = [np.array([[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]], dtype=float)]
        voxels = surface_voxels(wall)
        self.assertEqual(sorted(set(voxels[:, 1].tolist())), [0])
        self.assertEqual(len(voxels), 121)

    def test_a_window_stays_open(self):
        roof = [np.array([[0, 0, 5], [10, 0, 5], [10, 10, 5], [0, 10, 5]], dtype=float),
                np.array([[3, 3, 5], [7, 3, 5], [7, 7, 5], [3, 7, 5]], dtype=float)]
        voxels = surface_voxels(roof)
        inside = ((voxels[:, 0] >= 4) & (voxels[:, 0] <= 6)
                  & (voxels[:, 1] >= 4) & (voxels[:, 1] <= 6))
        self.assertEqual(inside.sum(), 0)

    def test_a_pitched_surface_has_no_gaps(self):
        slope = [np.array([[0, 0, 0], [10, 0, 0], [10, 10, 10], [0, 10, 10]], dtype=float)]
        columns = {}
        for x, y, z in surface_voxels(slope):
            columns.setdefault((x, y), set()).add(z)
        for (x, y), zs in columns.items():
            self.assertEqual(len(zs), max(zs) - min(zs) + 1, f"gap at {x},{y}")

    def test_a_degenerate_polygon_is_dropped(self):
        line = [np.array([[0, 0, 0], [5, 0, 0], [10, 0, 0]], dtype=float)]
        self.assertEqual(len(surface_voxels(line)), 0)


class TestCleanup(unittest.TestCase):
    def test_keys_round_trip(self):
        voxels = np.array([[0, 0, 0], [-5, 7, 300], [100000, -2048, -99999]],
                          dtype=np.int64)
        self.assertTrue((unpack(pack(voxels)) == voxels).all())

    def test_loose_voxels_go_and_seams_are_patched(self):
        solid = np.array([[x, y, z] for x in range(5) for y in range(5) for z in range(5)],
                         dtype=np.int64)
        noisy = np.vstack([solid, np.array([[50, 50, 50]], dtype=np.int64)])
        kept, _ = despeckle(noisy, np.zeros(len(noisy), dtype=np.int16))
        self.assertEqual(len(kept), len(solid))

        shell = np.array([[x, y, 0] for x in range(5) for y in range(5)], dtype=np.int64)
        holed = shell[~((shell[:, 0] == 2) & (shell[:, 1] == 2))]
        fixed, _ = close_pinholes(holed, np.zeros(len(holed), dtype=np.int16))
        self.assertEqual(len(fixed), len(shell))

    def test_a_window_is_not_patched_shut(self):
        wall = np.array([[x, 0, z] for x in range(9) for z in range(9)], dtype=np.int64)
        window = ~((wall[:, 0] >= 3) & (wall[:, 0] <= 5)
                   & (wall[:, 2] >= 3) & (wall[:, 2] <= 5))
        holed = wall[window]
        fixed, _ = close_pinholes(holed, np.zeros(len(holed), dtype=np.int16))
        self.assertEqual(((fixed[:, 0] == 4) & (fixed[:, 2] == 4)).sum(), 0)

    def test_smoothing_removes_spurs_but_never_a_thin_structure(self):
        angles = np.linspace(0, 2 * np.pi, 600, endpoint=False)
        ring = np.unique(np.column_stack([np.round(20 * np.cos(angles)).astype(int),
                                          np.round(20 * np.sin(angles)).astype(int)]), axis=0)
        cylinder = np.vstack([np.column_stack([ring, np.full(len(ring), z)])
                              for z in range(12)]).astype(np.int64)
        spur = np.array([[25, 0, 5]], dtype=np.int64)
        noisy = np.vstack([cylinder, spur])
        out, _, changed = smooth(noisy, np.zeros(len(noisy), dtype=np.int16), strength=1)
        self.assertGreater(changed, 0)
        self.assertFalse((out == spur[0]).all(axis=1).any())

        line = np.column_stack([np.arange(40), np.zeros(40, int),
                                np.zeros(40, int)]).astype(np.int64)
        kept, _, none_changed = smooth(line, np.zeros(40, dtype=np.int16), strength=3)
        self.assertEqual(len(kept), 40)
        self.assertEqual(none_changed, 0)


class TestBlocks(unittest.TestCase):
    def test_both_palettes_are_distinct_and_neither_is_empty(self):
        rich, simple = BlockMatcher(RICH), BlockMatcher(SIMPLE)
        self.assertGreater(len(rich.opaque_names), len(simple.opaque_names))
        self.assertTrue(simple.opaque_names)

    def test_glazing_is_recognised_and_ordinary_walls_are_not(self):
        for rgb in [(72, 96, 130), (40, 52, 70), (140, 172, 205)]:
            self.assertTrue(bool(is_glassy(rgb)[0]), rgb)
        for rgb in [(205, 205, 200), (214, 196, 160), (150, 95, 80)]:
            self.assertFalse(bool(is_glassy(rgb)[0]), rgb)

    def test_a_glazed_wall_never_picks_up_a_solid_block(self):
        rng = np.random.default_rng(4)
        wall = np.clip(np.array([78, 104, 140]) + rng.normal(0, 30, (600, 1))
                       + rng.normal(0, 8, (600, 3)), 0, 255).astype(int)
        for palette in (RICH, SIMPLE):
            matcher = BlockMatcher(palette)
            self.assertTrue(matcher.surface_is_glazed(wall), palette)
            names = matcher.match(wall, glazed=True)
            self.assertTrue(all("glass" in n for n in names), palette)

    def test_an_ordinary_wall_stays_out_of_the_glass_family(self):
        rng = np.random.default_rng(5)
        wall = np.clip(np.array([198, 194, 186]) + rng.normal(0, 18, (400, 1))
                       + rng.normal(0, 6, (400, 3)), 0, 255).astype(int)
        matcher = BlockMatcher(RICH)
        self.assertFalse(matcher.surface_is_glazed(wall))
        self.assertFalse(any("glass" in n for n in matcher.match(wall, glazed=False)))


class TestAppearances(unittest.TestCase):
    def test_an_affine_uv_recovers_a_known_mapping(self):
        plane = np.array([[0.0, 0.0], [10.0, 0.0], [10.0, 5.0], [0.0, 5.0]])
        uv = np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]])
        transform = affine_uv(plane, uv)
        self.assertIsNotNone(transform)
        got = np.column_stack([plane, np.ones(len(plane))]) @ transform
        np.testing.assert_allclose(got, uv, atol=1e-9)

    def test_a_material_colour_is_read_and_scaled(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            gml = tmp / "x_bldg_6697_2_op.gml"
            gml.write_text(
                '<?xml version="1.0"?>'
                '<core:CityModel xmlns:core="http://www.opengis.net/citygml/2.0"'
                ' xmlns:app="http://www.opengis.net/citygml/appearance/2.0">'
                '<app:X3DMaterial>'
                '<app:diffuseColor>0.5 0.25 1.0</app:diffuseColor>'
                '<app:target>#poly_1</app:target>'
                '</app:X3DMaterial></core:CityModel>', encoding="utf-8")
            appearances = Appearances(tmp).read(gml)
            self.assertEqual(appearances.surface_to_material["poly_1"], (128, 64, 255))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
