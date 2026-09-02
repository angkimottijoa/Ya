"""
End-to-end tests for the PLATEAU -> Java world pipeline.

Run with:  python -m unittest discover -s tests
"""
import math
import random
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import make_fixture
from read_world import World

from plateau2mc.anvil import ChunkBuilder, RegionWriter, _pack_indices
from plateau2mc.citygml import read_buildings
from plateau2mc.cli import main
from plateau2mc.jgd2011 import ZONE_ORIGINS, PlaneRectangular, guess_zone
from plateau2mc.heightfit import MODE_COMPRESS, MODE_NONE, HeightFit
from plateau2mc.voxel import Materials, TerrainField, rasterize


# GRS80 radii of curvature, used to turn a small step in degrees into true
# ground metres. Over the ~1 km steps below this is exact to well under a
# millimetre, which is what lets the scale tests avoid depending on pyproj.
_GRS80_A = 6378137.0
_GRS80_E2 = 2 / 298.257222101 - (1 / 298.257222101) ** 2


def _ground_metres_per_radian(lat_deg):
    """(north-south, east-west) ground metres per radian at a latitude."""
    sin_lat = math.sin(math.radians(lat_deg))
    w = math.sqrt(1 - _GRS80_E2 * sin_lat ** 2)
    meridian = _GRS80_A * (1 - _GRS80_E2) / w ** 3
    prime_vertical = _GRS80_A / w
    return meridian, prime_vertical * math.cos(math.radians(lat_deg))


class TestProjection(unittest.TestCase):
    def test_origin_maps_to_zero(self):
        for zone, (lat0, lon0) in ZONE_ORIGINS.items():
            east, north = PlaneRectangular(zone)(lat0, lon0)
            # The n^5 series leaves a few millimetres at the origin; that is
            # the projection's documented accuracy, not a placement error.
            self.assertAlmostEqual(east, 0.0, delta=0.01, msg=f"zone {zone}")
            self.assertAlmostEqual(north, 0.0, delta=0.01, msg=f"zone {zone}")

    def test_one_unit_is_one_metre(self):
        """A 1 km step on the ground must measure 1 km in blocks."""
        projector = PlaneRectangular(9)
        lat, lon = 35.6595, 139.7005
        per_lat_rad, _ = _ground_metres_per_radian(lat)
        step = math.degrees(1000.0 / per_lat_rad)

        _, north_a = projector(lat, lon)
        _, north_b = projector(lat + step, lon)
        # Zone IX runs at scale factor 0.9999 on its central meridian,
        # rising slightly away from it -- so 1 km of ground is 999.9 m of
        # grid here, a 0.01% error that no block grid can even represent.
        self.assertAlmostEqual(north_b - north_a, 1000.0, delta=0.2)

    def test_no_mercator_stretch(self):
        """East-west and north-south scale must match.

        Web Mercator would inflate the east-west span by 1/cos(35.66), about
        23%, which is the single most common way a real-world Minecraft
        build comes out wrong. A conformal zone projection keeps the two
        scales equal.
        """
        projector = PlaneRectangular(9)
        lat, lon = 35.6595, 139.7005
        per_lat_rad, per_lon_rad = _ground_metres_per_radian(lat)

        _, north_a = projector(lat, lon)
        _, north_b = projector(lat + math.degrees(1000.0 / per_lat_rad), lon)
        east_a, _ = projector(lat, lon)
        east_b, _ = projector(lat, lon + math.degrees(1000.0 / per_lon_rad))

        north_scale = north_b - north_a
        east_scale = east_b - east_a
        self.assertAlmostEqual(east_scale, 1000.0, delta=0.2)
        self.assertAlmostEqual(east_scale / north_scale, 1.0, delta=1e-4)

    def test_matches_pyproj_when_available(self):
        try:
            from pyproj import Transformer
        except ImportError:
            self.skipTest("pyproj not installed")
        random.seed(20240902)
        for zone, (lat0, lon0) in ZONE_ORIGINS.items():
            transformer = Transformer.from_crs(6668, 6668 + zone, always_xy=True)
            projector = PlaneRectangular(zone)
            for _ in range(50):
                lat = lat0 + random.uniform(-1.5, 1.5)
                lon = lon0 + random.uniform(-1.5, 1.5)
                mine = projector(lat, lon)
                theirs = transformer.transform(lon, lat)
                self.assertLess(math.dist(mine, theirs), 0.01,
                                f"zone {zone} at {lat},{lon}")

    def test_tokyo_falls_in_zone_nine(self):
        self.assertEqual(guess_zone(35.6595, 139.7005), 9)
        self.assertEqual(PlaneRectangular(9).epsg, 6677)


class TestCityGML(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.gml = make_fixture.build(cls.tmp / "53393599_bldg_6697_op.gml")
        cls.buildings = list(read_buildings(cls.tmp))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_reads_every_building(self):
        self.assertEqual(len(self.buildings), 37)

    def test_heights_come_from_measured_height(self):
        heights = sorted({round(b.height) for b in self.buildings})
        self.assertEqual(heights, [8, 22, 45, 120, 333])

    def test_only_the_ground_face_becomes_the_footprint(self):
        """An LOD1 solid has 6+ faces; only the flat bottom is a footprint."""
        for building in self.buildings:
            exteriors = [ring for is_ext, ring in building.rings if is_ext]
            self.assertEqual(len(exteriors), 1, building.gml_id)
            altitudes = {round(point[2], 3) for point in exteriors[0]}
            self.assertEqual(len(altitudes), 1, "footprint should be flat")
            self.assertAlmostEqual(altitudes.pop(), building.base_alt, places=3)

    def test_coordinates_are_latitude_first(self):
        """EPSG:6697 is lat/lon; a lon/lat misread would land off Japan."""
        for building in self.buildings:
            lat, lon = building.centroid()
            self.assertTrue(20 < lat < 46, f"latitude out of Japan: {lat}")
            self.assertTrue(122 < lon < 155, f"longitude out of Japan: {lon}")


class TestRasterizer(unittest.TestCase):
    def _square(self, size):
        from plateau2mc.voxel import Footprint
        ring = np.array([[0.0, 0.0], [size, 0.0], [size, size], [0.0, size]])
        return Footprint([(True, ring)], 0.0, 10.0).compute_bounds()

    def test_area_is_preserved(self):
        mask = rasterize(self._square(10), 0, 0, 16, 16)
        self.assertEqual(mask.sum(), 100)

    def test_courtyard_is_hollow(self):
        from plateau2mc.voxel import Footprint
        outer = np.array([[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]])
        inner = np.array([[3.0, 3.0], [7.0, 3.0], [7.0, 7.0], [3.0, 7.0]])
        footprint = Footprint([(True, outer), (False, inner)], 0.0, 10.0).compute_bounds()
        mask = rasterize(footprint, 0, 0, 16, 16)
        self.assertEqual(mask.sum(), 100 - 16)
        self.assertFalse(mask[5, 5])
        self.assertTrue(mask[1, 1])

    def test_overlapping_parts_do_not_cancel(self):
        """Two exterior rings must union, not XOR each other away."""
        from plateau2mc.voxel import Footprint
        a = np.array([[0.0, 0.0], [8.0, 0.0], [8.0, 8.0], [0.0, 8.0]])
        b = np.array([[4.0, 4.0], [12.0, 4.0], [12.0, 12.0], [4.0, 12.0]])
        footprint = Footprint([(True, a), (True, b)], 0.0, 10.0).compute_bounds()
        mask = rasterize(footprint, 0, 0, 16, 16)
        self.assertTrue(mask[5, 5], "overlap region was erased")
        self.assertEqual(mask.sum(), 64 + 64 - 16)


class TestAnvil(unittest.TestCase):
    def test_pack_round_trip(self):
        for bits in (4, 5, 6, 9, 12):
            values = np.arange(4096) % (1 << bits)
            packed = _pack_indices(values, bits)
            per_long = 64 // bits
            mask = (1 << bits) - 1
            out = []
            for word in packed:
                word &= 0xFFFFFFFFFFFFFFFF
                for slot in range(per_long):
                    if len(out) < len(values):
                        out.append((word >> (slot * bits)) & mask)
            self.assertEqual(out, values.tolist(), f"bits={bits}")

    def test_rejects_unaligned_height(self):
        with self.assertRaises(ValueError):
            ChunkBuilder(0, 0, -60, 319)
        with self.assertRaises(ValueError):
            ChunkBuilder(0, 0, -64, 300)

    def test_rejects_height_beyond_signed_byte_sections(self):
        with self.assertRaises(ValueError):
            ChunkBuilder(0, 0, -64, 2063)

    def test_second_run_keeps_earlier_chunks(self):
        """Two passes over the same region must not drop the first's chunks."""
        tmp = Path(tempfile.mkdtemp())
        try:
            for chunk_x in (0, 1):
                chunk = ChunkBuilder(chunk_x, 0, -64, 319)
                chunk.blocks[:, 0, :] = chunk.block_id("minecraft:bedrock")
                writer = RegionWriter(tmp)
                writer.add(chunk)
                writer.flush()
            world = World(tmp)
            self.assertEqual(world.block(0, -64, 0), "minecraft:bedrock")
            self.assertEqual(world.block(16, -64, 0), "minecraft:bedrock")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class TestTerrain(unittest.TestCase):
    def test_slope_is_reconstructed_from_building_bases(self):
        from plateau2mc.voxel import Footprint
        footprints = []
        for step in range(10):
            x = step * 40.0
            ring = np.array([[x, 0.0], [x + 20, 0.0], [x + 20, 20.0], [x, 20.0]])
            footprints.append(Footprint([(True, ring)], step * 2.0, 10.0).compute_bounds())
        terrain = TerrainField(footprints, cell_size=32, smoothing=1)
        west = terrain.sample(np.array([10.0]), np.array([10.0]))[0]
        east = terrain.sample(np.array([370.0]), np.array([10.0]))[0]
        self.assertGreater(east - west, 8.0, "east end should sit clearly higher")


class TestHeightFit(unittest.TestCase):
    # Ground relief and heights roughly matching Tokyo's 23 wards: the flats
    # of Koto at sea level up to the Nerima/Setagaya uplands, and the real
    # landmark heights.
    TOKYO = [(0.0, 8.0), (12.0, 15.0), (30.0, 22.0), (55.0, 45.0),
             (18.0, 243.0), (2.0, 333.0), (1.0, 634.0)]

    def test_default_keeps_every_height_untouched(self):
        """The default must not rescale anything -- the data goes in as-is."""
        fit = HeightFit(-64, 319, self.TOKYO, mode=MODE_NONE, sea_level=62)
        for altitude, height in self.TOKYO:
            self.assertEqual(fit.building_height(height), height)
            self.assertEqual(fit.ground_y(altitude), 62 + altitude)

    def test_default_reports_rather_than_hides_overflow(self):
        fit = HeightFit(-64, 319, self.TOKYO, mode=MODE_NONE, sea_level=62)
        over = fit.overflow(self.TOKYO)
        self.assertTrue(over, "Skytree cannot fit under y=319 at 1:1")
        self.assertEqual(len(over), 3)  # Tocho, Tokyo Tower, Skytree

    def test_java_with_a_height_datapack_needs_no_fitting(self):
        fit = HeightFit(-64, 1023, self.TOKYO, mode=MODE_NONE, sea_level=62)
        self.assertEqual(fit.overflow(self.TOKYO), [])

    def test_compress_loses_nothing_off_the_top(self):
        fit = HeightFit(-64, 319, self.TOKYO, mode=MODE_COMPRESS)
        self.assertEqual(fit.overflow(self.TOKYO), [])
        for altitude, height in self.TOKYO:
            self.assertLessEqual(fit.top_y(altitude, height), 319)

    def test_compress_leaves_ordinary_buildings_at_true_scale(self):
        fit = HeightFit(-64, 319, self.TOKYO, mode=MODE_COMPRESS, knee=60.0)
        for _, height in self.TOKYO:
            if height <= 60.0:
                self.assertEqual(fit.building_height(height), height)

    def test_compress_is_a_no_op_when_everything_already_fits(self):
        low = [(0.0, 8.0), (10.0, 45.0), (20.0, 120.0)]
        fit = HeightFit(-64, 319, low, mode=MODE_COMPRESS)
        for _, height in low:
            self.assertEqual(fit.building_height(height), height)


class TestEndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.source = cls.tmp / "src"
        make_fixture.build(cls.source / "53393599_bldg_6697_op.gml")
        cls.world = cls.tmp / "world"
        (cls.world / "region").mkdir(parents=True)
        exit_code = main([str(cls.source), "--center", "shibuya", "--radius", "200",
                          "--world", str(cls.world), "--max-y", "1023"])
        assert exit_code == 0
        cls.blocks = World(cls.world / "region")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_ground_is_built(self):
        column = dict(((low, high), name) for low, high, name in
                      [(a, b, n) for a, b, n in self.blocks.column(150, 150, -64, 90)])
        names = [name for name in column.values()]
        self.assertIn("minecraft:bedrock", names)
        self.assertIn("minecraft:stone", names)
        self.assertIn("minecraft:grass_block", names)

    def test_tall_tower_reaches_its_real_height(self):
        """The 333 m tower must stand 333 blocks, not be clipped to 320."""
        column = self.blocks.column(0, 0, 60, 410)
        roof = [low for low, _, name in column if name == "minecraft:smooth_quartz"]
        self.assertTrue(roof, "no roof found on the tower")
        self.assertEqual(roof[-1], 401, "roof should sit at base 68 + 333")

    def test_walls_are_continuous_across_chunk_boundaries(self):
        """A wall running along x=-30 crosses chunk edges at z=-16 and z=0."""
        for z in range(-20, 4):
            column = self.blocks.column(-30, z, 68, 401)
            glass = [(low, high) for low, high, name in column
                     if name == "minecraft:light_blue_stained_glass"]
            self.assertEqual(glass, [(68, 400)], f"gap in the wall at z={z}")

    def test_buildings_are_hollow(self):
        """Inside the tower, well above the low-rise, there should be air."""
        self.assertEqual(self.blocks.block(0, 300, 0), "minecraft:air")
        self.assertEqual(self.blocks.block(-30, 300, 0),
                         "minecraft:light_blue_stained_glass")

    def test_material_tiers_track_height(self):
        materials = Materials()
        self.assertEqual(materials.for_height(8)[0], "minecraft:light_gray_concrete")
        self.assertEqual(materials.for_height(22)[0], "minecraft:white_concrete")
        self.assertEqual(materials.for_height(45)[0], "minecraft:smooth_quartz")
        self.assertEqual(materials.for_height(333)[0], "minecraft:light_blue_stained_glass")


if __name__ == "__main__":
    unittest.main()
